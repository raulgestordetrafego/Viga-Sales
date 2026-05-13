import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { v4 as uuidv4 } from 'uuid';
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

// Routes
import contactRoutes from "./server/routes/contacts.js";
import conversationRoutes from "./server/routes/conversations.js";
import broadcastRoutes from "./server/routes/broadcasts.js";
import prospectingRoutes from "./server/routes/prospecting.js";
import { handleWebhook } from "./server/webhook/handler.js";
import evolutionApi from "./server/services/evolutionApi.js";
import { initDb, queryOne, run, query, hashPwd } from "./server/db/database.js";
import crypto from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("STARTING SERVER...");
  const app = express();
  const server = http.createServer(app);
  const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
    ? ['https://vigasales.shop', 'https://www.vigasales.shop', 'https://vigasales.com.br', 'https://www.vigasales.com.br']
    : ['http://localhost:3000', 'http://localhost:5173'];

  const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGINS, credentials: true },
  });

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const IS_PROD = process.env.NODE_ENV === 'production';

  // ── Trust proxy (Traefik / nginx) ────────────────────────────────────────
  app.set('trust proxy', 1);

  // ── Segurança: HTTPS redirect em produção ─────────────────────────────────
  if (IS_PROD) {
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      next();
    });
  }

  // ── Helmet: headers de segurança ──────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false, // Vite SPA precisa de CSP flexível
    crossOriginEmbedderPolicy: false,
  }));

  // Middlewares
  app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-N8N-AUTH'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 300,
    message: { error: 'Muitas requisições. Aguarde um momento.' },
    skip: (req) => !IS_PROD, // só em produção
  });
  app.use('/api', apiLimiter);

  // In-memory logs for debugging
  const n8nLogs = [];
  const webhookLogs = [];
  
  const addN8nLog = (data) => {
    n8nLogs.unshift({ timestamp: new Date().toISOString(), ...data });
    if (n8nLogs.length > 20) n8nLogs.pop();
  };

  const addWebhookLog = (data) => {
    webhookLogs.unshift({ timestamp: new Date().toISOString(), ...data });
    if (webhookLogs.length > 20) webhookLogs.pop();
  };

  // Request Logging & Proxy Bypass Detection
  app.use((req, res, next) => {
    const isN8n = req.headers['x-n8n-auth'] === 'viga-sales-crm' || req.url.includes('n8n');
    const isWebhook = req.url.includes('/webhook/evolution');
    
    if (isN8n) {
      console.log(`[N8N ATTEMPT] ${req.method} ${req.url}`);
    }
    if (isWebhook) {
      console.log(`[WEBHOOK ATTEMPT] ${req.method} ${req.url}`);
    }
    next();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const SESSION_TTL_MS      = 8 * 60 * 60 * 1000;  // 8 horas
  const INACTIVITY_TTL_MS   = 30 * 60 * 1000;       // 30 min sem atividade

  interface SessionData {
    userId: string; name: string; email: string; role: string;
    expiresAt: number;   // timestamp absoluto (8h)
    lastActivity: number; // timestamp da última requisição
  }
  const sessions = new Map<string, SessionData>();

  const getToken = (req: any) => (req.headers.authorization || '').replace('Bearer ', '');
  const getSession = (req: any): SessionData | undefined => {
    const token = getToken(req);
    const s = sessions.get(token);
    if (!s) return undefined;
    const now = Date.now();
    if (now > s.expiresAt || now - s.lastActivity > INACTIVITY_TTL_MS) {
      sessions.delete(token);
      return undefined;
    }
    s.lastActivity = now; // renova atividade
    return s;
  };

  // Limpeza periódica de sessões expiradas (a cada 15 min)
  setInterval(() => {
    const now = Date.now();
    for (const [token, s] of sessions.entries()) {
      if (now > s.expiresAt || now - s.lastActivity > INACTIVITY_TTL_MS) {
        sessions.delete(token);
      }
    }
  }, 15 * 60 * 1000);

  // ── Audit Log ─────────────────────────────────────────────────────────────
  async function auditLog(action: string, userId: string | null, req: any, meta: object = {}) {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
      await run(
        `INSERT INTO audit_log (id, action, user_id, ip, meta, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [uuidv4(), action, userId || null, ip, JSON.stringify(meta)]
      );
    } catch (_) { /* não bloqueia a operação principal */ }
  }

  app.get("/api/ping", (req, res) => res.send("pong"));

  // ── Helpers de senha ──────────────────────────────────────────────────────
  const BCRYPT_ROUNDS = 12;
  const sha256Legacy  = (pwd: string) => crypto.createHash('sha256').update(pwd + 'viga-salt-2024').digest('hex');
  const isBcryptHash  = (h: string) => h.startsWith('$2b$') || h.startsWith('$2a$');

  // Login
  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

      const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
      if (!user) {
        await bcrypt.compare('dummy', '$2b$12$dummydummydummydummydudummydummydummydummydum'); // timing-safe
        return res.status(401).json({ error: 'Email ou senha incorretos' });
      }

      // Suporte a hash legado SHA-256 + migração automática para bcrypt
      let passwordOk = false;
      if (isBcryptHash(user.password_hash)) {
        passwordOk = await bcrypt.compare(password, user.password_hash);
      } else {
        // Hash antigo SHA-256 — verifica e migra
        passwordOk = (sha256Legacy(password) === user.password_hash);
        if (passwordOk) {
          const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
          await run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
          console.log(`[Auth] Senha de ${email} migrada SHA-256 → bcrypt`);
        }
      }

      if (!passwordOk) return res.status(401).json({ error: 'Email ou senha incorretos' });
      if (user.status === 'pending')   return res.status(403).json({ error: 'pending',    message: 'Sua conta aguarda aprovação do administrador' });
      if (user.status === 'suspended') return res.status(403).json({ error: 'suspended',  message: 'Sua conta foi suspensa. Contate o administrador.' });

      const token = uuidv4();
      const now = Date.now();
      sessions.set(token, { userId: user.id, name: user.name, email: user.email, role: user.role, expiresAt: now + SESSION_TTL_MS, lastActivity: now });
      await auditLog('login', user.id, req, { email });
      res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Register (self-signup → pending)
  app.post("/api/auth/register", loginLimiter, async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha obrigatórios' });
      if (password.length < 8) return res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres' });
      const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) return res.status(409).json({ error: 'Este email já está cadastrado' });
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const id = uuidv4();
      await run(`INSERT INTO users (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'user', 'pending')`, [id, name, email, hash]);
      await auditLog('register', id, req, { email });
      res.json({ ok: true, message: 'Cadastro enviado! Aguarde a aprovação do administrador.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req: any, res) => {
    const s = getSession(req);
    if (s) auditLog('logout', s.userId, req, {});
    sessions.delete(getToken(req));
    res.json({ ok: true });
  });

  // Logout de todos os dispositivos (master only)
  app.post("/api/auth/logout-all", (req: any, res) => {
    const session = getSession(req);
    if (!session || session.role !== 'master') return res.status(403).json({ error: 'Sem permissão' });
    sessions.clear();
    io.emit('force_logout');
    auditLog('logout_all', session.userId, req, {});
    res.json({ ok: true });
  });

  // Verify
  app.get("/api/auth/verify", (req, res) => {
    const session = getSession(req);
    if (session) return res.json({ valid: true, user: session });
    return res.status(401).json({ valid: false });
  });

  // Auth middleware (TEMPORARIAMENTE DESATIVADO)
  app.use('/api', (req: any, res, next) => {
    next();
  });

  // ── User management (admin/master) ────────────────────────────────────────
  app.get("/api/users", async (req: any, res) => {
    const session = getSession(req);
    if (!session || !['master','admin'].includes(session.role)) return res.status(403).json({ error: 'Sem permissão' });
    const users = await query('SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC');
    res.json(users);
  });

  app.patch("/api/users/:id/status", async (req: any, res) => {
    const session = getSession(req);
    if (!session || !['master','admin'].includes(session.role)) return res.status(403).json({ error: 'Sem permissão' });
    const { status } = req.body;
    await run('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
    res.json({ ok: true });
  });

  app.patch("/api/users/:id/role", async (req: any, res) => {
    const session = getSession(req);
    if (!session || session.role !== 'master') return res.status(403).json({ error: 'Apenas o admin master pode alterar funções' });
    const { role } = req.body;
    await run('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [role, req.params.id]);
    res.json({ ok: true });
  });

  app.patch("/api/users/:id/password", async (req: any, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Não autenticado' });
    // Usuário só pode trocar a própria senha; master pode trocar de qualquer um
    if (session.userId !== req.params.id && session.role !== 'master') return res.status(403).json({ error: 'Sem permissão' });
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    const hashed = await bcrypt.hash(password, 12);
    await run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hashed, req.params.id]);
    res.json({ ok: true });
  });

  app.delete("/api/users/:id", async (req: any, res) => {
    const session = getSession(req);
    if (session?.role !== 'master') return res.status(403).json({ error: 'Apenas o admin master pode remover usuários' });
    await run('DELETE FROM users WHERE id = ?', [req.params.id]);
    await auditLog('delete_user', session?.userId || null, req, { targetId: req.params.id });
    res.json({ ok: true });
  });

  // ── Audit Log (somente master) ────────────────────────────────────────────
  app.get("/api/audit-log", async (req: any, res) => {
    const session = getSession(req);
    if (session?.role !== 'master') return res.status(403).json({ error: 'Sem permissão' });
    try {
      const logs = await query(`
        SELECT al.*, u.name as user_name, u.email as user_email
        FROM audit_log al
        LEFT JOIN users u ON u.id = al.user_id
        ORDER BY al.created_at DESC LIMIT 200
      `);
      res.json(logs);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── Follow-up: contatos inativos ─────────────────────────────────────────
  app.get("/api/followup/inactive", async (req: any, res) => {
    try {
      const days = parseInt(String(req.query.days || '3'));
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const contacts = await query(`
        SELECT * FROM contacts
        WHERE status != 'inactive'
          AND (last_interaction IS NULL OR last_interaction < ?)
        ORDER BY pipeline_stage DESC, last_interaction ASC
        LIMIT 20
      `, [cutoff]);
      res.json({ contacts });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── AI Suggestions ───────────────────────────────────────────────────────
  app.post("/api/ai/suggest", async (req: any, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[AI] GEMINI_API_KEY não configurada');
      return res.status(503).json({ error: 'GEMINI_API_KEY não configurada no servidor' });
    }
    try {
      const { contactName, phone, company, stage, notes } = req.body;
      const stageLabels: Record<string,string> = {
        stage_lead:'Lead', stage_contact:'Contato Feito', stage_proposal:'Proposta',
        stage_negotiation:'Negociação', stage_won:'Ganho', stage_lost:'Perdido',
      };
      const prompt = `Você é um assistente de vendas consultivo. Escreva uma mensagem de WhatsApp natural, amigável e personalizada para fazer follow-up com o contato abaixo. A mensagem deve ser curta (3-5 linhas), informal mas profissional, em português.

Contato: ${contactName}
Empresa: ${company || 'não informada'}
Etapa no pipeline: ${stageLabels[stage] || stage}
Notas: ${notes || 'sem notas'}

Escreva apenas a mensagem, sem aspas, sem prefixo, sem explicações.`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
        }),
      });
      if (!geminiRes.ok) {
        const err = await geminiRes.json();
        throw new Error(`Gemini error: ${err.error?.message || geminiRes.statusText}`);
      }
      const data = await geminiRes.json();
      const suggestion = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      console.log(`[AI] Suggestion generated for ${contactName}`);
      res.json({ suggestion });
    } catch (err: any) {
      console.error('[AI] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Helper: salva mensagem enviada no banco e emite socket
  async function saveOutboundMessage(contactId: string, phone: string, content: string) {
    try {
      const now = new Date().toISOString();
      let conv = await queryOne(`SELECT * FROM conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1`, [contactId]);
      if (!conv) {
        const convId = uuidv4();
        await run(`INSERT INTO conversations (id, contact_id, whatsapp_chat_id, status, last_message, last_message_at, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`,
          [convId, contactId, phone + '@s.whatsapp.net', content, now, now, now]);
        conv = await queryOne(`SELECT * FROM conversations WHERE id = ?`, [convId]);
      } else {
        await run(`UPDATE conversations SET last_message = ?, last_message_at = ?, updated_at = ? WHERE id = ?`, [content, now, now, conv.id]);
      }
      const msgId = uuidv4();
      await run(`INSERT INTO messages (id, conversation_id, whatsapp_message_id, direction, type, content, status, timestamp) VALUES (?, ?, ?, 'outbound', 'text', ?, 'sent', ?)`,
        [msgId, conv.id, 'reminder-' + msgId, content, now]);
      const updatedConv = await queryOne(`SELECT c.*, ct.name as contact_name, ct.phone as contact_phone FROM conversations c JOIN contacts ct ON c.contact_id = ct.id WHERE c.id = ?`, [conv.id]);
      io.emit('new_message', { conversation: updatedConv, message: { id: msgId, conversation_id: conv.id, direction: 'outbound', type: 'text', content, timestamp: now } });
    } catch(e: any) { console.error('[Reminder] Erro ao salvar mensagem:', e.message); }
  }

  // ── Reminders ────────────────────────────────────────────────────────────
  app.get("/api/reminders", async (req: any, res) => {
    try {
      const reminders = await query(`
        SELECT r.*, c.name as contact_name, c.phone as contact_phone
        FROM reminders r LEFT JOIN contacts c ON r.contact_id = c.id
        ORDER BY r.scheduled_at ASC
      `);
      res.json(reminders);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/reminders", async (req: any, res) => {
    try {
      const { contactId, phone, message, scheduledAt, sendNow } = req.body;
      if (!phone || !message) return res.status(400).json({ error: 'phone e message são obrigatórios' });
      const id = uuidv4();
      const schedAt = scheduledAt || new Date().toISOString();

      if (sendNow || new Date(schedAt) <= new Date()) {
        // Envia imediatamente
        try {
          await evolutionApi.sendTextMessage(phone, message);
          await run(`INSERT INTO reminders (id, contact_id, phone, message, scheduled_at, status, sent_at) VALUES (?, ?, ?, ?, ?, 'sent', datetime('now'))`,
            [id, contactId || null, phone, message, schedAt]);
          if (contactId) await saveOutboundMessage(contactId, phone, message);
          return res.json({ ok: true, id, sent: true });
        } catch (e: any) {
          console.error('[Reminder] Falha ao enviar imediatamente:', e.message);
          await run(`INSERT INTO reminders (id, contact_id, phone, message, scheduled_at, status) VALUES (?, ?, ?, ?, ?, 'failed')`,
            [id, contactId || null, phone, message, schedAt]);
          return res.status(500).json({ error: 'Falha ao enviar pelo WhatsApp: ' + e.message });
        }
      }

      await run(`INSERT INTO reminders (id, contact_id, phone, message, scheduled_at, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
        [id, contactId || null, phone, message, schedAt]);
      res.json({ ok: true, id, sent: false });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/reminders/:id", async (req: any, res) => {
    try {
      await run(`UPDATE reminders SET status = 'cancelled' WHERE id = ?`, [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Scheduler: check pending reminders every 60s
  setInterval(async () => {
    try {
      const now = new Date().toISOString();
      const due = await query(`SELECT * FROM reminders WHERE status = 'pending' AND scheduled_at <= ?`, [now]);
      for (const r of due as any[]) {
        try {
          await evolutionApi.sendTextMessage(r.phone, r.message);
          await run(`UPDATE reminders SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?`, [r.id]);
          if (r.contact_id) await saveOutboundMessage(r.contact_id, r.phone, r.message);
          console.log(`[Reminder] Sent to ${r.phone}`);
        } catch (e: any) {
          await run(`UPDATE reminders SET status = 'failed' WHERE id = ?`, [r.id]);
          console.error(`[Reminder] Failed for ${r.phone}:`, e.message);
        }
      }
    } catch (e: any) {
      console.error('[Reminder] Scheduler error:', e.message);
    }
  }, 60000);

  // DEBUG: View DB Content (somente em desenvolvimento)
  app.get("/api/debug/db", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Não disponível em produção" });
    }
    try {
      const contacts = await query("SELECT * FROM contacts LIMIT 10");
      const convs = await query("SELECT * FROM conversations LIMIT 10");
      const messages = await query("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 20");
      const rawWebhooks = await query("SELECT * FROM raw_webhooks ORDER BY created_at DESC LIMIT 10");
      res.json({ contacts, convs, messages, webhookLogs, rawWebhooks });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Initialize DB before starting to listen
  try {
    console.log("Starting database initialization...");
    await initDb();
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("CRITICAL: Database initialization failed:", err.message);
  }

  // ── Landing Lead ─────────────────────────────────────────────────────────
  app.post("/api/landing/lead", async (req, res) => {
    try {
      const { nome, empresa, cargo, whatsapp, faturamento, origem } = req.body;
      if (!nome || !whatsapp) return res.status(400).json({ error: 'nome e whatsapp são obrigatórios' });

      let phone = String(whatsapp).replace(/\D/g, '');
      if (phone.length === 11 && !phone.startsWith('55')) phone = '55' + phone;
      else if (phone.length === 10 && !phone.startsWith('55')) phone = '55' + phone;

      const notes = [
        cargo ? `Cargo: ${cargo}` : '',
        faturamento ? `Faturamento: ${faturamento}` : '',
        origem ? `Origem: ${origem}` : '',
      ].filter(Boolean).join(' | ');

      let contact = await queryOne('SELECT * FROM contacts WHERE phone = ?', [phone]);
      if (!contact) {
        const id = uuidv4();
        await run(
          `INSERT INTO contacts (id, name, phone, company, notes, status, pipeline_stage, last_interaction)
           VALUES (?, ?, ?, ?, ?, 'active', 'stage_lead', CURRENT_TIMESTAMP)`,
          [id, nome, phone, empresa || null, notes]
        );
        contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
      } else {
        await run(
          `UPDATE contacts SET name = ?, company = ?, notes = ?, last_interaction = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [nome, empresa || contact.company, notes, contact.id]
        );
      }

      // Notifica via n8n webhook (configurar N8N_LEAD_WEBHOOK_URL no .env)
      const webhookUrl = process.env.N8N_LEAD_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, empresa, cargo, whatsapp: phone, faturamento, origem, contactId: contact.id }),
        }).catch(e => console.error('[Landing Lead] n8n webhook error:', e.message));
      }

      console.log(`[Landing Lead] ${nome} (${phone}) | ${empresa || '-'} | ${faturamento || '-'}`);
      res.json({ ok: true });
    } catch (err: any) {
      console.error('[Landing Lead] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // n8n Integration Endpoint
  app.get("/api/n8n/message", (req, res) => {
    res.json({ status: "online", message: "Endpoint pronto para receber POST do n8n" });
  });

  app.post("/api/n8n/message", async (req, res) => {
    const auth = req.headers['x-n8n-auth'];
    if (!auth || auth !== 'viga-sales-crm') {
      console.warn(`[n8n API] Unauthorized request - Auth: ${auth}`);
      return res.status(401).json({ error: "Unauthorized. Header X-N8N-AUTH obrigatório." });
    }
    console.log(`[n8n API] Received request - Auth: ${auth}, Body: ${JSON.stringify(req.body).substring(0, 200)}`);
    
    addN8nLog({ 
      method: 'POST', 
      body: req.body, 
      headers: { 'accept': req.headers['accept'], 'x-n8n-auth': auth } 
    });

    try {
      const phone = req.body.phone || req.body.phoneNumber || req.body.number || req.body.sender;
      const content = req.body.content || req.body.message || req.body.text || req.body.body;
      const name = req.body.name || req.body.pushName || req.body.contactName;
      const type = req.body.type || 'text';
      const direction = req.body.direction || 'inbound';
      
      if (!phone || !content) {
        console.warn("[n8n API] Missing phone or content. Received:", { phone, content });
        return res.status(400).json({ error: "Phone and content are required" });
      }

      let cleanPhone = String(phone).replace(/\D/g, '');
      // Brazilian number normalization (add 55 if missing, handle 9th digit)
      if (cleanPhone.length === 11 && !cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      } else if (cleanPhone.length === 10 && !cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      }
      
      console.log(`[n8n API] Processing message for ${cleanPhone} (${direction})`);
      
      // 1) Handle Contact
      let contact = await queryOne('SELECT * FROM contacts WHERE phone = ?', [cleanPhone]);
      if (!contact) {
        console.log(`[n8n API] Contact not found, creating: ${cleanPhone}`);
        const id = uuidv4();
        await run(`
          INSERT INTO contacts (id, name, phone, status, pipeline_stage, last_interaction)
          VALUES (?, ?, ?, 'active', 'stage_lead', CURRENT_TIMESTAMP)
        `, [id, name || cleanPhone, cleanPhone]);
        contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
      } else {
        console.log(`[n8n API] Found contact: ${contact.id}`);
        await run("UPDATE contacts SET last_interaction = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [contact.id]);
      }

      // 2) Handle Conversation
      let conv = await queryOne('SELECT * FROM conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1', [contact.id]);
      if (!conv) {
        console.log(`[n8n API] Conversation not found, creating for contact ${contact.id}`);
        const id = uuidv4();
        await run(`
          INSERT INTO conversations (id, contact_id, status, last_message, last_message_at)
          VALUES (?, ?, 'open', ?, CURRENT_TIMESTAMP)
        `, [id, contact.id, content]);
        conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [id]);
      } else {
        console.log(`[n8n API] Found conversation: ${conv.id}`);
        await run(`
          UPDATE conversations SET last_message = ?, last_message_at = CURRENT_TIMESTAMP, unread_count = unread_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [content, conv.id]);
      }

      // 3) Save Message
      const msgId = uuidv4();
      const timestamp = new Date().toISOString();
      console.log(`[n8n API] Saving message ${msgId}`);
      await run(`
        INSERT INTO messages (id, conversation_id, direction, type, content, status, timestamp)
        VALUES (?, ?, ?, ?, ?, 'delivered', ?)
      `, [msgId, conv.id, direction, type, content, timestamp]);

      // 4) Socket Emit
      if (io) {
        console.log("[n8n API] Emitting to socket...");
        const fullContact = { ...contact, tags: JSON.parse(typeof contact.tags === 'string' ? contact.tags : '[]') };
        const updatedConv = await queryOne(`
          SELECT c.*, ct.name as contact_name, ct.phone as contact_phone, ct.avatar as contact_avatar
          FROM conversations c
          JOIN contacts ct ON c.contact_id = ct.id
          WHERE c.id = ?
        `, [conv.id]);
        
        io.emit('new_message', {
          conversation: updatedConv,
          contact: fullContact,
          message: {
            id: msgId,
            conversation_id: conv.id,
            direction: direction,
            type: type,
            content: content,
            timestamp: timestamp,
          },
        });
      }

      console.log("[n8n API] Success");
      res.json({ success: true, messageId: msgId });
    } catch (err) {
      console.error("[n8n API] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Uploads estáticos — acessíveis via /uploads E /api/uploads (para bypassar prefixo Traefik)
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));
  app.use('/api/uploads', express.static(uploadsDir));

  // Áudios de prospecção — servidos em /api/audio para a Evolution API baixar e enviar como PTT
  const audioDir = path.join(__dirname, 'public', 'audio');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  app.use('/api/audio', express.static(audioDir));

  // API Routes
  app.use("/api/contacts", contactRoutes);
  app.use("/api/conversations", conversationRoutes);
  app.use("/api/broadcasts", broadcastRoutes);
  app.use("/api/prospects", prospectingRoutes);
  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack 
    });
  });

  // ── Stats extras ────────────────────────────────────────────────────────────
  app.get("/api/stats/daily", async (req: any, res) => {
    try {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.','');
        const row = await queryOne("SELECT COUNT(*) as count FROM messages WHERE timestamp LIKE ?", [`${dateStr}%`]).catch(() => ({ count: 0 }));
        days.push({ date: dateStr, label, count: parseInt((row as any)?.count || 0) });
      }
      res.json(days);
    } catch (err) { res.status(500).json({ error: 'Erro' }); }
  });

  app.get("/api/stats/recent-contacts", async (req: any, res) => {
    try {
      const rows = await query(`
        SELECT c.id, c.name, c.phone, c.pipeline_stage, MAX(m.timestamp) as last_msg
        FROM contacts c
        LEFT JOIN conversations cv ON cv.contact_id = c.id
        LEFT JOIN messages m ON m.conversation_id = cv.id
        GROUP BY c.id
        ORDER BY CASE WHEN MAX(m.timestamp) IS NULL THEN 1 ELSE 0 END, MAX(m.timestamp) DESC
        LIMIT 6
      `);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Erro' }); }
  });

  app.get("/api/search", async (req: any, res) => {
    try {
      const q = `%${(req.query.q as string) || ''}%`;
      const [contacts, convs] = await Promise.all([
        query("SELECT id, name, phone, company, pipeline_stage FROM contacts WHERE name LIKE ? OR phone LIKE ? OR company LIKE ? LIMIT 6", [q, q, q]).catch(() => []),
        query(`SELECT cv.id, c.name as contact_name, c.phone, c.id as contact_id FROM conversations cv JOIN contacts c ON c.id = cv.contact_id WHERE c.name LIKE ? OR c.phone LIKE ? LIMIT 4`, [q, q]).catch(() => []),
      ]);
      res.json({ contacts, conversations: convs });
    } catch (err) { res.status(500).json({ error: 'Erro' }); }
  });

  app.put("/api/conversations/:id/unread", async (req: any, res) => {
    try {
      await run("UPDATE conversations SET unread_count = COALESCE(unread_count, 0) + 1 WHERE id = ?", [req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Erro' }); }
  });

  // Stats & WhatsApp
  app.get("/api/stats", async (req, res) => {
    try {
      const contactsData = await queryOne("SELECT COUNT(*) as count FROM contacts");
      const convsData = await queryOne("SELECT COUNT(*) as count FROM conversations WHERE status = 'open'");
      const messagesData = await queryOne("SELECT COUNT(*) as count FROM messages");
      
      const contacts = parseInt(contactsData?.count || 0);
      const convs = parseInt(convsData?.count || 0);
      const messages = parseInt(messagesData?.count || 0);
      
      let todayMessages = 0;
      try {
        const today = new Date().toISOString().split('T')[0];
        const todayData = await queryOne("SELECT COUNT(*) as count FROM messages WHERE timestamp LIKE ?", [`${today}%`]);
        todayMessages = parseInt(todayData?.count || 0);
      } catch (e) {
        console.warn("Failed to get today's messages count:", e.message);
      }

      res.json({ 
        totalContacts: contacts, 
        openConvs: convs, 
        totalMessages: messages,
        todayMessages: todayMessages
      });
    } catch (err) {
      console.error("Stats Error:", err);
      res.status(500).json({ error: "Erro ao carregar estatísticas: " + err.message });
    }
  });

  app.get("/api/whatsapp/status", async (req, res) => {
    try {
      const status = await evolutionApi.getInstanceStatus();
      res.json(status);
    } catch (err) {
      console.error("WhatsApp Status Error:", err.message);
      res.json({ instance: { state: 'error', message: err.message } });
    }
  });

  app.get("/api/whatsapp/qrcode", async (req, res) => {
    try {
      const qr = await evolutionApi.getQRCode();
      res.json(qr);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/pipeline/stages", async (req, res) => {
    try {
      const stages = await query("SELECT * FROM pipeline_stages ORDER BY position");
      res.json(stages);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/whatsapp/config", (req, res) => {
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const rawKey = process.env.EVOLUTION_API_KEY || '';
    res.json({
      webhook_url: `${appUrl}/webhook/evolution`,
      n8n_url: `${appUrl}/api/n8n/message`,
      instance: process.env.EVOLUTION_INSTANCE || 'default',
      api_url: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
      // Nunca expõe a chave inteira — mostra apenas últimos 4 caracteres
      api_key_hint: rawKey ? `****${rawKey.slice(-4)}` : '',
      forward_url: process.env.FORWARD_WEBHOOK_URL || '',
      n8n_logs: n8nLogs,
      webhook_logs: webhookLogs
    });
  });

  app.post("/api/whatsapp/test-webhook", async (req, res) => {
    try {
      const testPayload = {
        event: "messages.upsert",
        instance: process.env.EVOLUTION_INSTANCE || 'default',
        data: {
          messages: [{
            key: {
              remoteJid: "5511999999999@s.whatsapp.net",
              fromMe: false,
              id: "TEST_" + Date.now()
            },
            pushName: "Teste Webhook",
            message: { conversation: "Esta é uma mensagem de teste do sistema." },
            messageTimestamp: Math.floor(Date.now() / 1000)
          }]
        }
      };
      
      await handleWebhook(testPayload, io);
      res.json({ success: true, message: "Payload de teste enviado ao webhook interno." });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save WhatsApp Config
  app.post("/api/whatsapp/config", async (req, res) => {
    try {
      const { instance, api_url, api_key } = req.body;
      if (instance) process.env.EVOLUTION_INSTANCE = instance;
      if (api_url) process.env.EVOLUTION_API_URL = api_url;
      if (api_key) process.env.EVOLUTION_API_KEY = api_key;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Configure Webhook on Evolution API
  app.post("/api/whatsapp/setup-webhook", async (req, res) => {
    try {
      const appUrl = process.env.APP_URL || process.env.VITE_APP_URL;
      if (!appUrl) {
        throw new Error("URL do App não encontrada no ambiente.");
      }
      const webhookUrl = `${appUrl}/webhook/evolution`;
      console.log(`[Setup] Configuring Evolution Webhook to: ${webhookUrl}`);
      const result = await evolutionApi.configureWebhook(webhookUrl);
      res.json({ success: true, result });
    } catch (err) {
      console.error("Setup Webhook Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Webhook Evolution API
  app.post("/webhook/evolution", async (req, res) => {
    try {
      // Validação de segredo do webhook (se WEBHOOK_SECRET estiver configurado)
      const webhookSecret = process.env.WEBHOOK_SECRET;
      if (webhookSecret) {
        const incomingSecret = req.headers['x-webhook-secret'] || req.headers['apikey'];
        if (!incomingSecret || incomingSecret !== webhookSecret) {
          console.warn(`[Webhook] Acesso negado — secret inválido. IP: ${req.socket?.remoteAddress}`);
          return res.status(401).send('Unauthorized');
        }
      }

      const payload = req.body;

      // Save to raw logs for deep debugging
      try {
        await run("INSERT INTO raw_webhooks (payload) VALUES (?)", [JSON.stringify(payload)]);
      } catch (e) {
        console.error("Error saving raw webhook:", e);
      }

      addWebhookLog({ 
        event: payload.event || payload.type || 'unknown',
        messageId: payload.data?.key?.id || payload.body?.key?.id || 'N/A',
        summary: JSON.stringify(payload).substring(0, 100) + '...'
      });
      
      console.log("RAW WEBHOOK PAYLOAD RECEIVED");
      await handleWebhook(payload, io);
      res.status(200).send("OK");
    } catch (err) {
      console.error("Webhook Error:", err);
      addWebhookLog({ error: err.message });
      res.status(500).send("Error");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", async () => {
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Expected Webhook URL for Evolution API: ${appUrl}/webhook/evolution`);

    // Auto-register webhook with Evolution API on every startup
    // Uses EVOLUTION_WEBHOOK_URL if set (e.g. n8n), otherwise falls back to local CRM endpoint
    if (process.env.APP_URL) {
      try {
        const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL || `${process.env.APP_URL}/webhook/evolution`;
        console.log(`[Startup] Auto-registering webhook: ${webhookUrl}`);
        const result = await evolutionApi.configureWebhook(webhookUrl);
        console.log(`[Startup] Webhook registered successfully:`, JSON.stringify(result));
      } catch (err: any) {
        console.warn(`[Startup] Webhook auto-register failed (non-fatal):`, err.message);
      }
    }
  });
}

startServer();
