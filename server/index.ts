import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { v4 as uuidv4 } from 'uuid';
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import jwt from "jsonwebtoken";

// Routes
import contactRoutes from "./routes/contacts.js";
import conversationRoutes from "./routes/conversations.js";
import broadcastRoutes from "./routes/broadcasts.js";
import prospectingRoutes from "./routes/prospecting.js";
import emailRoutes from "./routes/email.js";
import equipeRoutes from "./routes/equipe.js";
import blogRoutes from "./routes/blog.js";
import { handleWebhook } from "./webhook/handler.js";
import evolutionApi from "./services/evolutionApi.js";
import * as emailService from "./services/emailService.js";
import { startEmailDispatcher } from "./services/emailDispatcher.js";
import * as metaApi from "./services/metaWhatsapp.js";
import { startMetaDispatcher } from "./services/metaDispatcher.js";
import { startCommunityAgent } from "./services/communityAgent.js";
import { startBlogAgent } from "./services/blogAgent.js";
import { startInsightsAgent } from "./services/insightsAgent.js";
import { startIdeaAgent } from "./services/ideaAgent.js";
import { startMediaAgent } from "./services/mediaAgent.js";
import { startStrategyAgent } from "./services/strategyAgent.js";
import { startSecurityAgent, runSecurityAgent } from "./services/securityAgent.js";
import { startFocusAgent } from "./services/focusAgent.js";
import { startTrafficAgent } from "./services/trafficAgent.js";
import { startChiefAgent } from "./services/chiefAgent.js";
import { initDb, queryOne, run, query, hashPwd } from "./db/database.js";
import { handleBossCommand, transcribeAudio } from "./services/bossMode.js";
import crypto from "crypto";
import axios from "axios";

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
    max: 20,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: IS_PROD ? 300 : 3000, // mais permissivo em dev
    message: { error: 'Muitas requisições. Aguarde um momento.' },
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

  // ── Auth (JWT — sobrevive a reinicializações do container) ───────────────
  if (!process.env.JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET não definido no .env. O servidor não pode iniciar sem ele.');
    process.exit(1);
  }
  const JWT_SECRET = process.env.JWT_SECRET;
  const JWT_TTL    = '8h';

  interface SessionData {
    userId: string; name: string; email: string; role: string;
  }

  // Para logout-all: armazena timestamp mínimo de emissão válida por usuário
  const revokedBefore = new Map<string, number>(); // userId -> timestamp ms

  const getToken = (req: any) => (req.headers.authorization || '').replace('Bearer ', '');
  const getSession = (req: any): SessionData | undefined => {
    const token = getToken(req);
    if (!token) return undefined;
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      // Checa se token foi emitido antes de um logout-all global ou individual
      const globalRevoke = revokedBefore.get('*');
      const userRevoke   = revokedBefore.get(payload.userId);
      const minIat = Math.max(globalRevoke || 0, userRevoke || 0);
      if (minIat && payload.iat * 1000 < minIat) return undefined;
      return { userId: payload.userId, name: payload.name, email: payload.email, role: payload.role };
    } catch {
      return undefined;
    }
  };

  // Socket.IO authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      const globalRevoke = revokedBefore.get('*');
      const userRevoke = revokedBefore.get(payload.userId);
      const minIat = Math.max(globalRevoke || 0, userRevoke || 0);
      if (minIat && payload.iat * 1000 < minIat) return next(new Error('Token revoked'));
      (socket as any).userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

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

      const rawPerms = user.permissions || '{}';
      const permissions = typeof rawPerms === 'string' ? (() => { try { return JSON.parse(rawPerms); } catch { return {}; } })() : rawPerms;
      const token = jwt.sign(
        { userId: user.id, name: user.name, email: user.email, role: user.role, permissions },
        JWT_SECRET,
        { expiresIn: JWT_TTL }
      );
      await auditLog('login', user.id, req, { email });
      res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions } });
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

  // Logout (JWT é stateless — só precisamos avisar o frontend)
  app.post("/api/auth/logout", (req: any, res) => {
    const s = getSession(req);
    if (s) auditLog('logout', s.userId, req, {});
    res.json({ ok: true });
  });

  // Logout de todos os dispositivos (master only)
  app.post("/api/auth/logout-all", (req: any, res) => {
    const session = getSession(req);
    if (!session || session.role !== 'master') return res.status(403).json({ error: 'Sem permissão' });
    // Invalida todos os tokens emitidos antes de agora para todos os usuários
    revokedBefore.set('*', Date.now());
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
  // Injeta req.user em todas as rotas /api
  app.use('/api', (req: any, _res, next) => {
    req.user = getSession(req) || null;
    next();
  });

  // ── User management (admin/master) ────────────────────────────────────────
  app.get("/api/users", async (req: any, res) => {
    const session = getSession(req);
    if (!session || !['master','admin'].includes(session.role)) return res.status(403).json({ error: 'Sem permissão' });
    const users = await query('SELECT id, name, email, role, status, permissions, created_at FROM users ORDER BY created_at DESC');
    const parsed = (users as any[]).map(u => ({
      ...u,
      permissions: (() => { try { return JSON.parse(u.permissions || '{}'); } catch { return {}; } })(),
    }));
    res.json(parsed);
  });

  app.patch("/api/users/:id/permissions", async (req: any, res) => {
    const session = getSession(req);
    if (!session || session.role !== 'master') return res.status(403).json({ error: 'Apenas o admin master pode alterar permissões' });
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') return res.status(400).json({ error: 'Permissões inválidas' });
    await run('UPDATE users SET permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(permissions), req.params.id]);
    res.json({ ok: true });
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

  app.post("/api/users/create", async (req: any, res) => {
    const session = getSession(req);
    if (!session || !['master','admin'].includes(session.role)) return res.status(403).json({ error: 'Sem permissão' });
    const { name, email, password, role = 'user' } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'E-mail já cadastrado' });
    const hash = await bcrypt.hash(password, 12);
    await run(
      `INSERT INTO users (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'active')`,
      [uuidv4(), name.trim(), email.trim().toLowerCase(), hash, role]
    );
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

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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

  // Email dispatcher: processa fila de campanhas a cada 90s
  startEmailDispatcher();

  // IMAP reply checker: every 5 minutes (first run after 30s)
  const runImapChecker = async () => {
    try {
      const { matched } = await emailService.checkImapReplies();
      if (matched > 0) console.log(`[EmailWorker] ${matched} replies detected via IMAP`);
    } catch (err) { console.error('[IMAP Worker] Error:', err?.message || err); }
  };
  setTimeout(runImapChecker, 30_000);
  setInterval(runImapChecker, 300_000);

  // Meta WhatsApp dispatcher: prospecção via API oficial
  if (metaApi.isConfigured()) {
    console.log('[MetaDispatch] Meta API configurada — iniciando dispatcher');
    startMetaDispatcher();
    startCommunityAgent();
    startBlogAgent();
    startInsightsAgent();
    startIdeaAgent();
    startMediaAgent();
    startStrategyAgent();

    // Sincronizador: espelha respostas do agente n8n (banco agente) → CRM
    const AGENTE_DB_URL = process.env.DATABASE_AGENTE_URL || 'postgresql://agente:AgentViga2024!@postgres-agente:5432/agente?sslmode=disable';
    setInterval(async () => {
      try {
        const { default: pgAgent } = await import('pg');
        const agentDb = new pgAgent.Pool({ connectionString: AGENTE_DB_URL, max: 1, connectionTimeoutMillis: 5000 });
        
        const msgs = await agentDb.query(
          "SELECT id, phone, message, created_at FROM messages WHERE synced_to_crm = false AND message IS NOT NULL AND message != '' ORDER BY created_at ASC LIMIT 20"
        );
        
        for (const msg of msgs.rows) {
          try {
            const cleanedPhone = String(msg.phone).replace(/\D/g, '');
            let contact = await queryOne("SELECT * FROM contacts WHERE phone = $1", [cleanedPhone]);
            if (!contact && cleanedPhone.length >= 10) {
              contact = await queryOne("SELECT * FROM contacts WHERE REPLACE(phone, '55', '') LIKE $1", [`%${cleanedPhone.replace(/^55/, '').slice(-8)}`]);
            }
            if (contact) {
              let conv = await queryOne("SELECT * FROM conversations WHERE contact_id = $1 ORDER BY updated_at DESC LIMIT 1", [contact.id]);
              if (conv) {
                const msgId = uuidv4();
                const now = new Date().toISOString();
                await run(
                  "INSERT INTO messages (id, conversation_id, direction, type, content, status, timestamp) VALUES ($1, $2, 'outbound', 'text', $3, 'sent', $4) ON CONFLICT DO NOTHING",
                  [msgId, conv.id, msg.message, now]
                );
                await run("UPDATE conversations SET last_message = $1, last_message_at = $2, updated_at = $3 WHERE id = $4",
                  [msg.message.substring(0, 500), now, now, conv.id]);
                console.log(`[AgentSync] Synced to CRM: ${contact.name} — "${msg.message.substring(0, 40)}..."`);
              }
            }
          } catch (_) {}
          await agentDb.query("UPDATE messages SET synced_to_crm = true WHERE id = $1", [msg.id]);
        }
        await agentDb.end();
      } catch (_) {}
    }, 30_000);
  } else {
    console.log('[MetaDispatch] META_ACCESS_TOKEN ou META_PHONE_NUMBER_ID não configurados — dispatcher desativado');
  }

  // Security Agent: roda sempre, independente de Meta API
  console.log('[Security] Iniciando agente de seguranca 24/7...');
  startSecurityAgent();

  // Focus Agent: cutuca o Raul a cada 30min pra focar em prospeccao
  console.log('[Foco] Iniciando agente de foco...');
  startFocusAgent();

  // Chief Agent: CEO autonomo — briefings 8h/20h + planejamento semanal dom 20h (v4)
  console.log('[Chief] Iniciando CEO autonomo...');
  startChiefAgent();

  // Traffic Agent: cérebro especialista em tráfego pago com atualização semanal
  console.log('[Traffic] Iniciando agente especialista de tráfego...');
  const GROUP_COMANDO = process.env.GROUP_COMANDO_ID || '';
  startTrafficAgent(evolutionApi, GROUP_COMANDO);

  // LinkedIn Outreach — carrega dinamicamente (depende de Playwright, opcional)
  try {
    const { startLinkedInOutreach } = await import("./services/linkedinOutreach.js");
    console.log('[LinkedIn] Iniciando worker de prospecção...');
    startLinkedInOutreach();
  } catch (err) {
    console.log('[LinkedIn] Worker não iniciado (playwright não disponível):', err.message);
  }

  // Instagram Outreach — mesma estratégia multi-toque
  try {
    const { startInstagramOutreach } = await import("./services/instagramOutreach.js");
    console.log('[Instagram] Iniciando worker de prospecção...');
    startInstagramOutreach();
  } catch (err) {
    console.log('[Instagram] Worker não iniciado:', err.message);
  }

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

  // ── WhatsApp Instances ───────────────────────────────────────────────────────
  app.get("/api/whatsapp/instances", async (req: any, res) => {
    try {
      const session = getSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado' });
      const instances = await query('SELECT id, name, instance_name, api_url, is_active, created_at FROM whatsapp_instances ORDER BY created_at');
      // Para cada instância, buscar usuários atribuídos
      const result = await Promise.all((instances as any[]).map(async (inst: any) => {
        const users = await query(
          `SELECT u.id, u.name, u.email, u.role FROM user_instance_permissions p JOIN users u ON p.user_id = u.id WHERE p.instance_id = ?`,
          [inst.id]
        );
        return { ...inst, users };
      }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/whatsapp/instances", async (req: any, res) => {
    try {
      const session = getSession(req);
      if (session?.role !== 'master') return res.status(403).json({ error: 'Apenas master' });
      const { name, instance_name, api_url, api_key } = req.body;
      if (!name || !instance_name) return res.status(400).json({ error: 'name e instance_name obrigatórios' });
      const id = uuidv4();
      await run('INSERT INTO whatsapp_instances (id, name, instance_name, api_url, api_key, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [id, name, instance_name, api_url || '', api_key || '']);
      const inst = await queryOne('SELECT id, name, instance_name, api_url, is_active FROM whatsapp_instances WHERE id = ?', [id]);
      res.json({ ...inst, users: [] });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put("/api/whatsapp/instances/:id", async (req: any, res) => {
    try {
      const session = getSession(req);
      if (session?.role !== 'master') return res.status(403).json({ error: 'Apenas master' });
      const { name, instance_name, api_url, api_key, is_active } = req.body;
      await run('UPDATE whatsapp_instances SET name=?, instance_name=?, api_url=?, api_key=?, is_active=? WHERE id=?',
        [name, instance_name, api_url || '', api_key || '', is_active ?? 1, req.params.id]);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/whatsapp/instances/:id", async (req: any, res) => {
    try {
      const session = getSession(req);
      if (session?.role !== 'master') return res.status(403).json({ error: 'Apenas master' });
      if (req.params.id === 'instance_default') return res.status(400).json({ error: 'Não é possível remover a instância padrão' });
      await run('DELETE FROM user_instance_permissions WHERE instance_id = ?', [req.params.id]);
      await run('DELETE FROM whatsapp_instances WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Atribuir / remover usuário de instância
  app.post("/api/whatsapp/instances/:id/users", async (req: any, res) => {
    try {
      const session = getSession(req);
      if (session?.role !== 'master') return res.status(403).json({ error: 'Apenas master' });
      const { user_id } = req.body;
      if (session?.userId === user_id) return res.status(400).json({ error: 'Master sempre tem acesso a tudo' });
      await run('INSERT OR IGNORE INTO user_instance_permissions (user_id, instance_id) VALUES (?, ?)', [user_id, req.params.id]);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/whatsapp/instances/:id/users/:userId", async (req: any, res) => {
    try {
      const session = getSession(req);
      if (session?.role !== 'master') return res.status(403).json({ error: 'Apenas master' });
      await run('DELETE FROM user_instance_permissions WHERE instance_id = ? AND user_id = ?', [req.params.id, req.params.userId]);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── Custom Fields ────────────────────────────────────────────────────────────
  app.get("/api/custom-fields", async (_req, res) => {
    try {
      const fields = await query('SELECT * FROM custom_fields ORDER BY position, created_at');
      res.json(fields);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/custom-fields", async (req: any, res) => {
    try {
      const { name, field_key, type = 'text', options, position = 0 } = req.body;
      if (!name || !field_key) return res.status(400).json({ error: 'name e field_key obrigatórios' });
      const id = uuidv4();
      await run('INSERT INTO custom_fields (id, name, field_key, type, options, position) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, field_key, type, options ? JSON.stringify(options) : null, position]);
      const field = await queryOne('SELECT * FROM custom_fields WHERE id = ?', [id]);
      res.json(field);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put("/api/custom-fields/:id", async (req: any, res) => {
    try {
      const { name, field_key, type, options, position } = req.body;
      await run('UPDATE custom_fields SET name=?, field_key=?, type=?, options=?, position=? WHERE id=?',
        [name, field_key, type || 'text', options ? JSON.stringify(options) : null, position ?? 0, req.params.id]);
      const field = await queryOne('SELECT * FROM custom_fields WHERE id = ?', [req.params.id]);
      res.json(field);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/custom-fields/:id", async (req: any, res) => {
    try {
      await run('DELETE FROM contact_custom_values WHERE field_id = ?', [req.params.id]);
      await run('DELETE FROM custom_fields WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Contact custom values
  app.get("/api/contacts/:id/custom-values", async (req, res) => {
    try {
      const rows = await query('SELECT field_id, value FROM contact_custom_values WHERE contact_id = ?', [req.params.id]);
      const result: any = {};
      (rows as any[]).forEach((r: any) => { result[r.field_id] = r.value; });
      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.put("/api/contacts/:id/custom-values", async (req: any, res) => {
    try {
      const { values } = req.body;
      for (const [field_id, value] of Object.entries(values as Record<string, any>)) {
        await run('DELETE FROM contact_custom_values WHERE contact_id = ? AND field_id = ?', [req.params.id, field_id]);
        if (value !== null && value !== undefined && value !== '') {
          await run('INSERT INTO contact_custom_values (contact_id, field_id, value) VALUES (?, ?, ?)',
            [req.params.id, field_id, String(value)]);
        }
      }
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
      
      // Notifica Raul via Evolution API (WhatsApp)
      try {
        const msg = `🆕 NOVO LEAD da Landing Page!\n\n👤 ${nome}\n📱 ${phone}\n🏢 ${empresa || '-'}\n💼 ${cargo || '-'}\n💰 ${faturamento || '-'}\n📎 ${origem || '-'}`;
        await evolutionApi.sendTextMessage('61981362382', msg);
        console.log('[Landing Lead] WhatsApp enviado para Raul');
      } catch (e: any) {
        console.error('[Landing Lead] Erro WhatsApp:', e.message);
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
    const expected = process.env.N8N_AUTH_TOKEN;
    if (!expected) {
      console.error('[FATAL] N8N_AUTH_TOKEN não definido no .env');
      return res.status(500).json({ error: "Server misconfiguration" });
    }
    if (!auth || auth !== expected) {
      console.warn(`[n8n API] Unauthorized request - Auth: ${auth ? 'presente' : 'ausente'}`);
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
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));
  app.use('/api/uploads', express.static(uploadsDir));

  // ═══ SEGURANÇA: bloqueia acesso a arquivos sensíveis ═══
  app.use((req, res, next) => {
    const blocked = ['.env', '.git', 'server.ts', 'package.json', 'package-lock.json', 'docker-compose.yml', 'Dockerfile', 'node_modules', 'db/crm.sqlite'];
    const path = req.path.toLowerCase();
    if (blocked.some(b => path.includes(b))) {
      return res.status(404).send('Not found');
    }
    // Headers de segurança para todas as respostas
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.vigasales.shop https://*.vigasales.com.br; connect-src 'self' https://*.vigasales.shop wss://*.vigasales.shop; frame-src 'none'; object-src 'none'");
    next();
  });

  // ═══ SEGURANÇA: protege endpoints sensíveis ═══
  const requireAuth = (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    // Token interno (n8n, agentes)
    if (token === process.env.VIGA_INTERNAL_TOKEN) return next();
    if (req.query.token === process.env.VIGA_INTERNAL_TOKEN) return next();
    // JWT do usuário (frontend CRM)
    if (getSession(req)) return next();
    res.status(401).json({ error: 'Unauthorized' });
  };

  // Protege endpoints sensíveis
  app.use('/api/equipe/chief/run', requireAuth);
  app.use('/api/equipe/chief/tasks', requireAuth);
  app.use('/api/equipe/status', requireAuth);

  // Protege todos os endpoints de API
  app.use('/api', (req, res, next) => {
    // Rotas públicas: ping, auth, webhook, blog
    if (req.path === '/ping' || req.path.startsWith('/auth') || req.path.startsWith('/whatsapp/webhook') || req.path.startsWith('/blog') || req.path.startsWith('/landing')) {
      return next();
    }
    requireAuth(req, res, next);
  });

  // Rate limiting simples no login (5 tentativas por IP em 15min)
  const loginAttempts = new Map();
  app.use('/api/auth/login', (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = ip;
    const now = Date.now();
    const attempts = loginAttempts.get(key) || [];
    // Limpa tentativas antigas (>15min)
    const recent = attempts.filter(t => now - t < 900000);
    if (recent.length >= 5) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
    }
    recent.push(now);
    loginAttempts.set(key, recent);
    next();
  });

  // Templates de imagem — acessíveis via /templates
  const templatesDir = path.join(__dirname, '..', 'public', 'templates');
  if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });
  app.use('/templates', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  }, express.static(templatesDir));

  // Imagens e assets públicos — acessíveis via /public (cross-origin para landing em vigasales.com.br)
  app.use('/public', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  }, express.static(path.join(__dirname, '..', 'public')));

  // Áudios de prospecção — servidos em /api/audio para a Evolution API baixar e enviar como PTT
  const audioDir = path.join(__dirname, '..', 'public', 'audio');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  app.use('/api/audio', express.static(audioDir));

  // Case study / portfolio — página de caso de sucesso
  app.get('/case-construtora', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'case-construtora.html'));
  });

  // ── Meta WhatsApp Cloud API Webhook ──────────────────────────────────────────
  const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || '';
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
  const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';

  // Webhook verification (GET) — Meta valida o endpoint
  app.get('/api/whatsapp/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      console.log('[Meta Webhook] Verification successful');
      return res.status(200).send(challenge);
    }
    console.warn('[Meta Webhook] Verification failed — token mismatch');
    return res.sendStatus(403);
  });

  // Incoming messages / status updates (POST)
  app.post('/api/whatsapp/webhook', (req, res) => {
    const body = req.body;

    res.sendStatus(200); // Meta exige 200 OK rápido

    // Processa mensagens recebidas
    try {
      const entries = body?.entry || [];
      for (const entry of entries) {
        const changes = entry?.changes || [];
        for (const change of changes) {
          const value = change?.value || {};
          const messages = value?.messages || [];
          const contacts = value?.contacts || [];
          const metadata = value?.metadata || {};

          for (const msg of messages) {
            handleMetaIncomingMessage(msg, contacts, metadata).catch(err =>
              console.error('[Meta Inbound] Error processing:', err.message)
            );
          }

          // Processa status de entrega (delivered, read, failed)
          const statuses = value?.statuses || [];
          for (const st of statuses) {
            handleMetaDeliveryStatus(st).catch(err =>
              console.error('[Meta Delivery] Error:', err.message)
            );
          }
        }
      }
    } catch (err) {
      console.error('[Meta Webhook] Parse error:', err.message);
    }
  });

  // Analisa imagem com OpenAI Vision
  async function analyzeMediaWithIA(imageUrl, type, caption) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return null;

      // Lê o arquivo do disco e converte pra base64 (OpenAI rejeita URL externa)
      const urlPath = new URL(imageUrl).pathname;
      const filename = path.basename(urlPath);
      const localPath = path.join(__dirname, '..', 'uploads', filename);
      let imageData;
      try {
        const buf = fs.readFileSync(localPath);
        const mime = type === 'image' ? 'image/jpeg' : 'video/mp4';
        imageData = `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        // fallback: tenta usar URL direta
        imageData = imageUrl;
      }

      const prompt = caption && caption !== '[Imagem]' && caption !== '[Vídeo]'
        ? `Descreva esta imagem em 1-2 frases em português. Contexto: "${caption}"`
        : 'Descreva esta imagem em 1-2 frases em português. Se houver texto, leia. Se for print, explique o que mostra.';

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageData } },
            ],
          }],
          max_tokens: 200,
        }),
      });
      const data = await res.json();
      return data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      console.error('[Meta Vision] Error:', err.message);
      return null;
    }
  }

  // Download de mídia da Meta API
  async function downloadMetaMedia(mediaId) {
    try {
      const token = process.env.META_ACCESS_TOKEN;
      if (!token) return null;

      // Pega URL da mídia
      const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const metaData = await metaRes.json();
      const mediaUrl = metaData?.url;
      if (!mediaUrl) return null;

      // Baixa o arquivo
      const fileRes = await fetch(mediaUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const mimeType = metaData?.mime_type || 'image/jpeg';
      const ext = mimeType.split('/')[1] || 'bin';
      const filename = `${uuidv4()}.${ext}`;

      const uploadsDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);

      const appUrl = process.env.APP_URL || 'https://vigasales.shop';
      return `${appUrl}/uploads/${filename}`;
    } catch (err) {
      console.error('[Meta Media] Download error:', err.message);
      return null;
    }
  }

  // Alerta: notifica Raul quando um prospect responde
  const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
  const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
  const AGENTS_GROUP = process.env.AGENTS_GROUP_ID || '120363428115495870@g.us';
  async function notifyRaulOfResponse(prospect, content) {
    const name = prospect.name || 'Lead';
    const phone = prospect.phone ? prospect.phone.replace(/^55/, '') : '?';
    const company = prospect.company || '';
    const segment = prospect.segment || '';
    const city = prospect.city || '';
    const email = prospect.email || '';
    const website = prospect.website || '';
    const instagram = prospect.instagram || '';
    const rating = prospect.rating || '';

    let msg = `🔔 *${name} respondeu!*\n`;
    msg += `📞 +55 ${phone}\n`;
    if (company) msg += `🏢 ${company}\n`;
    if (segment) msg += `📐 ${segment}\n`;
    if (city) msg += `📍 ${city}\n`;
    if (email) msg += `📧 ${email}\n`;
    if (website) msg += `🌐 ${website}\n`;
    if (instagram) msg += `📷 ${instagram}\n`;
    if (rating) msg += `⭐ ${rating}\n`;
    msg += `\n💬 _${content.substring(0, 300)}_`;

    try {
      await axios.post(`${EVO_URL}/message/sendText/Raul%20Santos`, {
        number: AGENTS_GROUP,
        text: msg,
        delay: 1200,
      }, {
        headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      console.log(`[Notify] Alerta enviado para Raul: ${name}`);
    } catch (e) {
      console.error(`[Notify] Falha ao notificar Raul:`, e.response?.status || e.message);
    }
  }

  // Atualiza status de entrega (delivered, read, failed) via webhook da Meta
  async function handleMetaDeliveryStatus(status) {
    const wamid = status?.id;
    const deliveryStatus = status?.status; // sent, delivered, read, failed
    const phone = status?.recipient_id;
    if (!wamid) return;

    try {
      if (deliveryStatus === 'delivered') {
        await run(
          "UPDATE meta_template_logs SET status = 'delivered', delivered_at = datetime('now') WHERE wamid = ? AND status = 'sent'",
          [wamid]
        );
      } else if (deliveryStatus === 'read') {
        await run(
          "UPDATE meta_template_logs SET status = 'read', read_at = datetime('now') WHERE wamid = ?",
          [wamid]
        );
      } else if (deliveryStatus === 'failed') {
        const errorMsg = status?.errors?.[0]?.message || 'unknown';
        await run(
          "UPDATE meta_template_logs SET status = 'failed', error = ? WHERE wamid = ?",
          [errorMsg, wamid]
        );
        const logEntry = await queryOne(
          "SELECT template_id, phone FROM meta_template_logs WHERE wamid = ?", [wamid]
        );
        if (logEntry) {
          await run(
            "UPDATE meta_templates SET sent_count = GREATEST(sent_count - 1, 0), paused = 0, updated_at = datetime('now') WHERE id = ?",
            [logEntry.template_id]
          );
        }
        if (phone) {
          const cleanedPhone = phone.replace(/\D/g, '');
          const isPermanent = /undeliverable|invalid|not found|nonexistent/i.test(errorMsg);
          if (isPermanent) {
            await run("UPDATE prospects SET status = 'descartado', updated_at = datetime('now') WHERE phone = ? AND status = 'enviado'",
              [cleanedPhone]);
          } else {
            const attempts = await queryOne(
              "SELECT COUNT(*) as cnt FROM meta_template_logs WHERE phone = ? AND status = 'failed' AND date(created_at) = date('now')",
              [cleanedPhone]
            );
            if (attempts && attempts.cnt >= 3) {
              await run("UPDATE prospects SET status = 'descartado', updated_at = datetime('now') WHERE phone = ? AND status = 'enviado'",
                [cleanedPhone]);
            } else {
              await run("UPDATE prospects SET status = 'novo', updated_at = datetime('now') WHERE phone = ? AND status = 'enviado'",
                [cleanedPhone]);
            }
          }
        }
      }
      console.log(`[Meta Delivery] ${wamid}: ${deliveryStatus}`);
    } catch (err) {
      console.error('[Meta Delivery] DB error:', err.message);
    }
  }

  // Processa mensagem recebida do Meta
  async function handleMetaIncomingMessage(msg, contacts, metadata) {
    const phone = String(msg.from).replace(/\D/g, '');
    const contactInfo = contacts.find(c => c.wa_id === msg.from) || {};
    const name = contactInfo?.profile?.name || phone;
    const msgId = msg.id;
    const now = new Date().toISOString();

    console.log(`[Meta Inbound] ${name} (${phone}): ${msg.type}`);

    // Encontra/cria contato no CRM
    let contact = await queryOne(
      "SELECT * FROM contacts WHERE phone = ?",
      [phone]
    );
    // Tenta match pelos ultimos 8 digitos apenas se nao encontrou exato
    if (!contact && phone.length >= 10) {
      contact = await queryOne(
        "SELECT * FROM contacts WHERE REPLACE(phone, '55', '') LIKE ?",
        [`%${phone.replace(/^55/, '').slice(-8)}`]
      );
    }
    if (!contact) {
      const id = uuidv4();
      await run(
        `INSERT INTO contacts (id, name, phone, tags, status, pipeline_stage, last_interaction, created_at, updated_at)
         VALUES (?, ?, ?, '["whatsapp_meta"]', 'active', 'stage_lead', ?, ?, ?)`,
        [id, name, phone, now, now, now]
      );
      contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
    } else {
      await run(
        "UPDATE contacts SET last_interaction = ?, updated_at = ? WHERE id = ?",
        [now, now, contact.id]
      );
    }

    // Encontra/cria conversa
    let conv = await queryOne(
      "SELECT * FROM conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1",
      [contact.id]
    );
    if (!conv) {
      const convId = uuidv4();
      await run(
        `INSERT INTO conversations (id, contact_id, whatsapp_chat_id, status, last_message, last_message_at, created_at, updated_at)
         VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`,
        [convId, contact.id, phone + '@s.whatsapp.net', '', now, now, now]
      );
      conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [convId]);
    }

    // Extrai conteúdo e baixa mídia
    let content = '';
    let mediaUrl = null;
    if (msg.type === 'text') {
      content = msg.text?.body || '';
    } else if (msg.type === 'audio') {
      content = '[Áudio]';
      if (msg.audio?.id) mediaUrl = await downloadMetaMedia(msg.audio.id);
    } else if (msg.type === 'image') {
      content = msg.image?.caption || '[Imagem]';
      if (msg.image?.id) mediaUrl = await downloadMetaMedia(msg.image.id);
    } else if (msg.type === 'video') {
      content = msg.video?.caption || '[Vídeo]';
      if (msg.video?.id) mediaUrl = await downloadMetaMedia(msg.video.id);
    } else if (msg.type === 'document') {
      content = msg.document?.caption || '[Documento]';
      if (msg.document?.id) mediaUrl = await downloadMetaMedia(msg.document.id);
    } else if (msg.type === 'button') {
      content = msg.button?.text || '[Botão]';
    } else if (msg.type === 'interactive') {
      content = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Interativo]';
    } else if (msg.type === 'sticker') {
      content = '[Figurinha]';
      if (msg.sticker?.id) mediaUrl = await downloadMetaMedia(msg.sticker.id);
    } else if (msg.type === 'location') {
      content = msg.location?.name || `📍 ${msg.location?.latitude}, ${msg.location?.longitude}`;
    } else {
      content = `[${msg.type}]`;
    }

    // ═══ BOSS MODE ═══
    const BOSS_PHONES = (process.env.BOSS_PHONES || '').split(',').filter(Boolean);
    if (BOSS_PHONES.includes(phone) && (content || msg.type === 'audio' || msg.type === 'image')) {
      let bossCmd = content;
      if (msg.type === 'audio' && mediaUrl) {
        const text = await transcribeAudio(mediaUrl, process.env.META_ACCESS_TOKEN);
        if (text) bossCmd = text;
      }
      const bossImageUrl = msg.type === 'image' ? mediaUrl : null;
      await handleBossCommand(phone, bossCmd || '[mídia]', name, metaApi, bossImageUrl);
      return; // não salva no CRM, não forward pro n8n
    }

    // Salva mensagem
    const messageId = uuidv4();
    await run(
      `INSERT INTO messages (id, conversation_id, whatsapp_message_id, direction, type, content, media_url, status, timestamp)
       VALUES (?, ?, ?, 'inbound', ?, ?, ?, 'delivered', ?)`,
      [messageId, conv.id, msgId, msg.type, content, mediaUrl, now]
    );

    // Atualiza conversa
    await run(
      `UPDATE conversations SET last_message = ?, last_message_at = ?, unread_count = COALESCE(unread_count, 0) + 1, updated_at = ? WHERE id = ?`,
      [content.substring(0, 300), now, now, conv.id]
    );

    // Verifica se é resposta de prospect → atualiza status (CRM + Leads DB)
    try {
      // Busca no CRM
      let prospect = await queryOne(
        "SELECT id, name FROM prospects WHERE phone = ? AND status = 'enviado' LIMIT 1",
        [phone]
      );
      if (prospect) {
        await run(
          "UPDATE prospects SET status = 'respondeu', responded_at = datetime('now'), notes = COALESCE(notes,'') || ? WHERE id = ?",
          [`\nResposta: ${content.substring(0, 200)}`, prospect.id]
        );
        console.log(`[Meta Inbound] Prospect ${prospect.name} respondeu!`);
        notifyRaulOfResponse(prospect, content).catch(e => console.error('[Notify] Erro:', e.message));
      }

      // Também atualiza no banco de leads
      try {
        const { default: pg } = await import('pg');
        const leadsDb = new pg.Pool({ connectionString: process.env.DATABASE_LEADS_URL, max: 1 });
        const leadsProspect = await leadsDb.query(
          "SELECT id, name FROM prospects WHERE phone = $1 AND status = 'enviado' LIMIT 1",
          [phone]
        );
        if (leadsProspect.rows.length > 0) {
          await leadsDb.query(
            "UPDATE prospects SET status = 'respondeu', responded_at = NOW(), notes = COALESCE(notes,'') || $1 WHERE id = $2",
            [`\nResposta: ${content.substring(0, 200)}`, leadsProspect.rows[0].id]
          );
          console.log(`[Meta Inbound] Prospect ${leadsProspect.rows[0].name} respondeu (leads DB)!`);
        }
        await leadsDb.end();
      } catch (_) {}
    } catch (_) {}

      // Forward pro n8n agente SDR (formato Evolution compatível)
    try {
      const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
      const n8nPayload = {
        event: 'messages.upsert',
        instance: 'meta_oficial',
        data: {
          key: { remoteJid: jid, id: msgId, fromMe: false },
          pushName: name,
          messageType: ({ text: 'conversation', audio: 'audioMessage', image: 'imageMessage', video: 'videoMessage', document: 'documentMessage', sticker: 'stickerMessage' })[msg.type] || msg.type,
          message: msg.type === 'text' ? { conversation: content } : (msg.type === 'audio' ? { audioMessage: { ptt: true, url: mediaUrl } } : { imageMessage: { url: mediaUrl } }),
        },
        destination: 'https://n8n.vigasales.shop/webhook/agente_mestre',
        date_time: new Date().toISOString(),
        sender: jid,
        server_url: 'https://evolution.vigasales.shop',
        apikey: 'migrated-to-meta',
      };
      fetch('https://n8n.vigasales.shop/webhook/agente_mestre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n8nPayload),
      }).catch(() => {});
    } catch (_) {}

    // Emite socket
    if (io) {
      const updatedConv = await queryOne(
        `SELECT c.*, ct.name as contact_name, ct.phone as contact_phone, ct.avatar as contact_avatar
         FROM conversations c JOIN contacts ct ON c.contact_id = ct.id WHERE c.id = ?`,
        [conv.id]
      );
      io.emit('new_message', {
        conversation: updatedConv,
        contact: { ...contact, tags: JSON.parse(typeof contact.tags === 'string' ? contact.tags : '[]') },
        message: { id: messageId, conversation_id: conv.id, direction: 'inbound', type: msg.type, content, timestamp: now },
      });
    }
  }

  // API Routes
  app.use("/api/contacts", contactRoutes);
  app.use("/api/conversations", conversationRoutes);
  app.use("/api/broadcasts", broadcastRoutes);
  app.use("/api/prospects", prospectingRoutes);
  app.use("/api/email", emailRoutes);
  app.use("/api/equipe", equipeRoutes);
  app.use("/", blogRoutes);
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
      const rows: any[] = await query(
        `SELECT created_at::date as date, COUNT(*) as count
         FROM messages
         WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
         GROUP BY created_at::date`
      ).catch(() => []);
      const map: Record<string, number> = {};
      rows.forEach(r => {
        const dateStr = typeof r.date === 'string' ? r.date.split('T')[0] : r.date?.toISOString?.()?.split('T')[0] || '';
        map[dateStr] = parseInt(r.count);
      });
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.','');
        days.push({ date: dateStr, label, count: map[dateStr] || 0 });
      }
      res.json(days);
    } catch (err) { res.status(500).json({ error: 'Erro' }); }
  });

  app.get("/api/stats/recent-contacts", async (req: any, res) => {
    try {
      const rows = await query(`
        SELECT c.id, c.name, c.phone, c.pipeline_stage, cv.last_message_at as last_msg
        FROM contacts c
        LEFT JOIN conversations cv ON cv.contact_id = c.id
        ORDER BY CASE WHEN cv.last_message_at IS NULL THEN 1 ELSE 0 END, cv.last_message_at DESC
        LIMIT 6
      `);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Erro' }); }
  });

  // Dashboard unificado — uma requisição carrega tudo
  let dashCache: any = null;
  let dashCacheAt = 0;
  app.get("/api/dashboard", async (req, res) => {
    try {
      const now = Date.now();
      if (dashCache && now - dashCacheAt < 30_000) return res.json(dashCache);

      const today = new Date().toISOString().split('T')[0];
      const [statsRow, convsRow, todayRow, totalMsgRow, recentContacts, dailyRows, pipelineStages, pipelineCounts] = await Promise.all([
        queryOne("SELECT COUNT(*) as count FROM contacts"),
        queryOne("SELECT COUNT(*) as count FROM conversations WHERE status='open' AND EXISTS (SELECT 1 FROM messages WHERE conversation_id = conversations.id AND direction = 'inbound')"),
        queryOne("SELECT COUNT(*) as count FROM messages WHERE created_at::date = CURRENT_DATE"),
        queryOne("SELECT COUNT(*) as count FROM messages"),
        query(`SELECT c.id, c.name, c.phone, c.pipeline_stage, cv.last_message_at as last_msg
               FROM contacts c LEFT JOIN conversations cv ON cv.contact_id = c.id
               ORDER BY CASE WHEN cv.last_message_at IS NULL THEN 1 ELSE 0 END, cv.last_message_at DESC LIMIT 6`),
        query(`SELECT created_at::date as date, COUNT(*) as count FROM messages
               WHERE created_at >= CURRENT_DATE - INTERVAL '6 days' GROUP BY created_at::date`).catch(()=>[]),
        query("SELECT * FROM pipeline_stages ORDER BY funnel_id, position"),
        query("SELECT pipeline_stage, COUNT(*) as count, SUM(pipeline_value) as value FROM contacts GROUP BY pipeline_stage"),
      ]);

      const dailyMap: Record<string, number> = {};
      (dailyRows as any[]).forEach(r => {
        const dateStr = typeof r.date === 'string' ? r.date.split('T')[0] : r.date?.toISOString?.()?.split('T')[0] || '';
        dailyMap[dateStr] = parseInt(r.count);
      });
      const daily = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        daily.push({ date: dateStr, label: d.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.',''), count: dailyMap[dateStr]||0 });
      }

      const countMap: Record<string, any> = {};
      (pipelineCounts as any[]).forEach((r: any) => { countMap[r.pipeline_stage] = { count: parseInt(r.count||0), value: parseFloat(r.value||0) }; });
      const pipeline = (pipelineStages as any[]).map((s: any) => ({ ...s, count: countMap[s.id]?.count||0, value: countMap[s.id]?.value||0 }));

      dashCache = {
        stats: { totalContacts: parseInt((statsRow as any)?.count||0), openConvs: parseInt((convsRow as any)?.count||0), todayMessages: parseInt((todayRow as any)?.count||0), totalMessages: parseInt((totalMsgRow as any)?.count||0) },
        recentContacts,
        daily,
        pipeline,
      };
      dashCacheAt = now;
      res.json(dashCache);
    } catch (err) {
      res.status(500).json({ error: (err as any).message });
    }
  });

  // Dashboard de Prospecção: email + Meta WhatsApp + templates (fonte: CRM)
  app.get("/api/dashboard/prospecting", async (req: any, res) => {
    try {
      const { date } = req.query;
      const filterDate = date || new Date().toISOString().split('T')[0];

      // ── Email stats ───────────────────────────────────────────────
      const emailSent = await queryOne(
        "SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'sent' AND DATE(sent_at) = $1",
        [filterDate]
      );
      const emailOpened = await queryOne(
        "SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'opened' AND DATE(opened_at) = $1",
        [filterDate]
      );
      const emailReplied = await queryOne(
        "SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'replied' AND DATE(replied_at) = $1",
        [filterDate]
      );
      const emailClicked = await queryOne(
        "SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'clicked' AND DATE(clicked_at) = $1",
        [filterDate]
      );

      // ── Meta WhatsApp stats (fonte: prospects + meta_template_logs) ─
      const metaSent = await queryOne(
        `SELECT COUNT(*) as cnt FROM meta_template_logs 
         WHERE status = 'sent' AND created_at::date = $1`,
        [filterDate]
      );
      const metaResponses = await queryOne(
        `SELECT COUNT(*) as cnt FROM prospects 
         WHERE status = 'respondeu' AND date(responded_at) = $1`,
        [filterDate]
      );

      // ── Templates: stats detalhado ────────────────────────────────
      const templates = await query(
        `SELECT t.id, t.name, t.max_sends, t.sent_count, t.paused,
          (SELECT COUNT(*) FROM meta_template_logs l 
           WHERE l.template_id = t.id AND l.status = 'sent' AND l.created_at::date = $1) as sent_today,
          (SELECT COUNT(*) FROM meta_template_logs l 
           WHERE l.template_id = t.id AND l.status = 'sent') as total_sent
         FROM meta_templates t
         ORDER BY t.sent_count DESC`,
        [filterDate]
      );

      // ── Funil de prospecção (tabela prospects como fonte única) ─
      const totalProspects = await queryOne(
        "SELECT COUNT(*) as cnt FROM prospects"
      ).catch(() => ({ cnt: 0 }));
      const sentProspects = await queryOne(
        "SELECT COUNT(*) as cnt FROM prospects WHERE status = 'enviado'"
      ).catch(() => ({ cnt: 0 }));
      const respondedContacts = await queryOne(
        "SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu'"
      );
      const queueProspects = await queryOne(
        "SELECT COUNT(*) as cnt FROM prospects WHERE status = 'novo'"
      );
      const respondedToday = parseInt(metaResponses?.cnt || '0');

      // ── Taxas ─────────────────────────────────────────────────────
      const totalSentEver = templates.reduce((s: number, t: any) => s + parseInt(t.total_sent || '0'), 0);

      res.json({
        date: filterDate,
        email: {
          sent: parseInt(emailSent?.cnt || '0'),
          opened: parseInt(emailOpened?.cnt || '0'),
          replied: parseInt(emailReplied?.cnt || '0'),
          clicked: parseInt(emailClicked?.cnt || '0'),
          openRate: emailSent?.cnt > 0 ? ((emailOpened?.cnt || 0) / emailSent.cnt * 100).toFixed(1) : '0.0',
          replyRate: emailSent?.cnt > 0 ? ((emailReplied?.cnt || 0) / emailSent.cnt * 100).toFixed(1) : '0.0',
        },
        meta: {
          sent: parseInt(metaSent?.cnt || '0'),
          responses: respondedToday,
          totalContactsResponded: parseInt(respondedContacts?.cnt || '0'),
          responseRate: metaSent?.cnt > 0 ? (respondedToday / metaSent.cnt * 100).toFixed(1) : '0.0',
        },
        templates: (templates || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          maxSends: parseInt(t.max_sends || '0'),
          sentCount: parseInt(t.sent_count || '0'),
          sentToday: parseInt(t.sent_today || '0'),
          paused: t.paused == 1 || t.paused === true,
          progress: t.max_sends > 0 ? Math.round((t.sent_count || 0) / t.max_sends * 100) : 0,
        })),
        prospects: {
          total: parseInt(totalProspects?.cnt || '0'),
          sent: parseInt(sentProspects?.cnt || '0'),
          responded: parseInt(respondedContacts?.cnt || '0'),
          respondedToday,
          queueEstimate: parseInt(queueProspects?.cnt || '0'),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Meta Templates CRUD ──────────────────────────────────────────
  app.get("/api/whatsapp/templates", async (req: any, res) => {
    try {
      const templates = await query(
        "SELECT * FROM meta_templates ORDER BY created_at DESC"
      );
      res.json(templates || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/whatsapp/templates/meta", async (req: any, res) => {
    try {
      const metaTemplates = await metaApi.checkTemplateStatus();
      res.json(metaTemplates);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/templates/sync", async (req: any, res) => {
    try {
      if (!metaApi.isConfigured()) {
        return res.status(400).json({ error: "Meta API não configurada" });
      }
      const metaTemplates = await metaApi.checkTemplateStatus();
      const approved = metaTemplates.filter(t => t.status === 'APPROVED');
      if (!approved.length) {
        return res.json({ imported: 0, message: "Nenhum template aprovado encontrado na Meta" });
      }

      let imported = 0;
      for (const mt of approved) {
        const existing = await queryOne("SELECT id FROM meta_templates WHERE name = ?", [mt.name]);
        if (existing) continue;

        const id = uuidv4();
        await run(
          "INSERT INTO meta_templates (id, name, vars, body, segment, max_sends) VALUES (?, ?, ?, ?, 'geral', 50)",
          [id, mt.name, JSON.stringify(mt.vars || []), mt.body || mt.name]
        );
        imported++;
      }

      res.json({ imported, message: `${imported} templates importados da Meta` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/templates", async (req: any, res) => {
    try {
      const { name, vars, body, segment, max_sends } = req.body;
      if (!name || !body) {
        return res.status(400).json({ error: "name e body são obrigatórios" });
      }
      const id = uuidv4();
      await run(
        "INSERT INTO meta_templates (id, name, vars, body, segment, max_sends) VALUES (?, ?, ?, ?, ?, ?)",
        [id, name, JSON.stringify(vars || []), body, segment || 'geral', max_sends || 50]
      );
      const template = await queryOne("SELECT * FROM meta_templates WHERE id = ?", [id]);
      res.status(201).json(template);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/whatsapp/templates/:id", async (req: any, res) => {
    try {
      const { name, vars, body, segment, max_sends, paused } = req.body;
      const existing = await queryOne("SELECT * FROM meta_templates WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Template não encontrado" });

      await run(
        `UPDATE meta_templates SET 
          name = COALESCE(?, name),
          vars = COALESCE(?, vars),
          body = COALESCE(?, body),
          segment = COALESCE(?, segment),
          max_sends = COALESCE(?, max_sends),
          paused = COALESCE(?, paused),
          updated_at = datetime('now')
         WHERE id = ?`,
        [
          name ?? null,
          vars ? JSON.stringify(vars) : null,
          body ?? null,
          segment ?? null,
          max_sends ?? null,
          paused !== undefined ? paused : null,
          req.params.id,
        ]
      );
      const template = await queryOne("SELECT * FROM meta_templates WHERE id = ?", [req.params.id]);
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/whatsapp/templates/:id", async (req: any, res) => {
    try {
      await run("DELETE FROM meta_templates WHERE id = ?", [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Stats de entrega e custos dos disparos Meta
  app.get("/api/whatsapp/delivery-stats", async (_req: any, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = today.slice(0, 7) + '-01';

      // Hoje
      const todayStats = await query(
        "SELECT status, COUNT(*)::int as cnt FROM meta_template_logs WHERE created_at::text LIKE $1 GROUP BY status",
        [`${today}%`]
      ).catch(() => []);

      // Mês
      const monthStats = await query(
        "SELECT status, COUNT(*)::int as cnt FROM meta_template_logs WHERE created_at::text >= $1 GROUP BY status",
        [monthStart]
      ).catch(() => []);

      // Por template (mês)
      const templateStats = await query(
        `SELECT t.name, t.max_sends, t.paused,
          COUNT(*) FILTER (WHERE l.status = 'sent')::int as sent,
          COUNT(*) FILTER (WHERE l.status = 'delivered')::int as delivered,
          COUNT(*) FILTER (WHERE l.status = 'read')::int as read,
          COUNT(*) FILTER (WHERE l.status = 'failed')::int as failed
         FROM meta_template_logs l
         JOIN meta_templates t ON l.template_id = t.id
         WHERE l.created_at::text >= $1
         GROUP BY t.id, t.name, t.max_sends, t.paused
         ORDER BY sent DESC
         LIMIT 20`,
        [monthStart]
      ).catch(() => []);

      // Totais
      const totalToday = todayStats.reduce((s, r) => s + r.cnt, 0);
      const totalMonth = monthStats.reduce((s, r) => s + r.cnt, 0);

      const deliveredToday = todayStats.find(r => r.status === 'delivered')?.cnt || 0;
      const deliveredMonth = monthStats.find(r => r.status === 'delivered')?.cnt || 0;
      const readToday = todayStats.find(r => r.status === 'read')?.cnt || 0;
      const readMonth = monthStats.find(r => r.status === 'read')?.cnt || 0;
      const failedMonth = monthStats.find(r => r.status === 'failed')?.cnt || 0;

      // Custo estimado (Meta cobra ~R$0.26/conversa de marketing no BR)
      const COST_PER_DELIVERED_BRL = 0.26;
      const costMonth = deliveredMonth * COST_PER_DELIVERED_BRL;

      res.json({
        today: { total: totalToday, delivered: deliveredToday, read: readToday },
        month: { total: totalMonth, delivered: deliveredMonth, read: readMonth, failed: failedMonth },
        templates: templateStats,
        cost: {
          per_delivered_brl: COST_PER_DELIVERED_BRL,
          month_estimated_brl: Math.round(costMonth * 100) / 100,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOG — exclusivo no subdomínio blog.vigasales.com.br
  const BLOG_CSS = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&family=Inter:wght@400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',-apple-system,sans-serif;background:#080d18;color:#d4dce8;line-height:1.75;-webkit-font-smoothing:antialiased}.container{max-width:780px;margin:0 auto;padding:50px 24px}header{text-align:center;margin-bottom:56px;padding-top:20px}header h1{font-family:'Montserrat',sans-serif;font-size:38px;font-weight:900;color:#fff;margin-bottom:10px;letter-spacing:-0.5px}header p{color:#6b7fa0;font-size:15px;font-weight:400}article{margin-bottom:44px;padding-bottom:36px;border-bottom:1px solid #152036;transition:transform .15s}article:hover{transform:translateY(-2px)}article img{width:100%;max-height:280px;object-fit:cover;border-radius:14px;margin-bottom:18px;box-shadow:0 8px 32px rgba(0,0,0,0.3)}article h2{margin-bottom:8px}article h2 a{font-family:'Montserrat',sans-serif;color:#f0f4ff;text-decoration:none;font-size:21px;font-weight:700;letter-spacing:-0.3px;transition:color .15s}article h2 a:hover{color:#f97316}.sub{color:#64748b;font-size:14px;margin-bottom:10px;line-height:1.6}article small{color:#475569;font-size:12px;font-weight:500}.meta{color:#5a6a80;font-size:13px;margin-bottom:32px;display:flex;align-items:center;gap:8px}.meta span{color:#f97316;font-weight:600}.content{font-size:16px;color:#cbd5e1;line-height:1.9}.content h2{font-family:'Montserrat',sans-serif;color:#fff;font-size:26px;font-weight:800;margin:44px 0 20px;padding-bottom:10px;border-bottom:2px solid #1e3050;letter-spacing:-0.3px}.content h3{font-family:'Montserrat',sans-serif;color:#e8eef6;font-size:18px;font-weight:700;margin:28px 0 12px}.content p{margin-bottom:20px}.content img{max-width:100%;border-radius:14px;margin:24px 0;box-shadow:0 6px 24px rgba(0,0,0,0.3)}.content strong{color:#f97316;font-weight:600}.content ul,.content ol{padding-left:22px;margin:20px 0}.content li{margin-bottom:10px;padding-left:4px}.content blockquote{border-left:3px solid #f97316;padding:12px 20px;margin:24px 0;color:#8899bb;font-style:italic;background:rgba(249,115,22,0.04);border-radius:0 8px 8px 0}.cover-img{width:100%;max-height:420px;object-fit:cover;border-radius:16px;margin-bottom:28px;box-shadow:0 12px 40px rgba(0,0,0,0.4)}.back{display:inline-flex;align-items:center;gap:6px;margin-bottom:32px;color:#f97316;text-decoration:none;font-size:14px;font-weight:600;transition:gap .15s}.back:hover{gap:10px}.back::before{content:'←'}footer{text-align:center;padding:36px 20px;color:#3a4a60;font-size:12px;border-top:1px solid #152036;margin-top:60px}footer a{color:#5a6a80;text-decoration:none}@media(max-width:600px){.container{padding:32px 16px}header h1{font-size:28px}article h2 a{font-size:18px}.content h2{font-size:22px}.content h3{font-size:16px}}`;

  const serveBlogList = async (req, res) => {
    const posts = await query("SELECT * FROM blog_posts WHERE status='published' ORDER BY published_at DESC LIMIT 50").catch(()=>[]);
    const list = (posts||[]).map(p => `<article>${p.cover_image?`<img src="${p.cover_image}" alt="${p.title}" loading="lazy">`:''}<h2><a href="/${p.slug}">${p.title}</a></h2>${p.subtitle?`<p class="sub">${p.subtitle}</p>`:''}<small>${new Date(p.published_at).toLocaleDateString('pt-BR')} · ${JSON.parse(p.tags||'[]').join(',')}</small></article>`).join('');
    res.send(`<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blog Viga Sales</title><meta name="description" content="Automação de atendimento, CRM e growth para construtoras."><style>${BLOG_CSS}</style></head><body><div class="container"><header><h1>Blog Viga Sales</h1><p>Automação de atendimento, CRM e growth para construção civil</p></header>${list||'<p style="text-align:center;color:#64748b;padding:60px 0">Nenhum post ainda.</p>'}</div><footer>Viga Sales</footer></body></html>`);
  };

  const serveBlogPost = (req, res, post) => {
    let faqSchema = '';
    try { const faq = typeof post.faq==='string' ? JSON.parse(post.faq) : (post.faq||[]); if (faq.length) faqSchema = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[${faq.map(q=>`{"@type":"Question","name":${JSON.stringify(q.question)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(q.answer)}}}`).join(',')}]}</script>`; } catch {}
    res.send(`<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${post.title} — Blog Viga Sales</title><meta name="description" content="${(post.subtitle||post.title).substring(0,160)}">${faqSchema}<style>${BLOG_CSS}</style></head><body><div class="container"><a href="/" class="back">← Blog</a><h1>${post.title}</h1>${post.subtitle?`<p style="color:#94a3b8;font-size:16px;margin-bottom:16px">${post.subtitle}</p>`:''}${post.cover_image?`<img src="${post.cover_image}" class="cover-img" alt="${post.title}">`:''}<div class="meta">${new Date(post.published_at).toLocaleDateString('pt-BR')}</div><div class="content">${post.body}</div></div><footer>Viga Sales</footer></body></html>`);
  };

  // Blog no subdomínio
  app.get("/", (req, res, next) => {
    if (req.hostname === 'blog.vigasales.com.br') return serveBlogList(req, res);
    next();
  });
  app.get("/:slug", async (req, res, next) => {
    if (req.hostname !== 'blog.vigasales.com.br') return next();
    const post = await queryOne("SELECT * FROM blog_posts WHERE slug=? AND status='published'", [req.params.slug]).catch(()=>null);
    if (!post) return res.status(404).send(`<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><title>404</title><style>body{background:#0b1120;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}</style></head><body><div style="text-align:center"><h1>404</h1><p>Post não encontrado</p><a href="/" style="color:#f97316">← Blog</a></div></body></html>`);
    serveBlogPost(req, res, post);
  });

  // No domínio principal (.shop, .com.br), redireciona pro subdomínio
  app.get("/blog", (req, res, next) => { if (req.hostname !== 'blog.vigasales.com.br') return res.redirect('https://blog.vigasales.com.br'); next(); });
  app.get("/blog/:slug", (req, res, next) => { if (req.hostname !== 'blog.vigasales.com.br') return res.redirect(`https://blog.vigasales.com.br/${req.params.slug}`); next(); });

  // Blog API (interna)
  app.get("/api/blog", async (req, res) => { try { const posts = await query("SELECT id,title,subtitle,slug,tags,published_at,cover_image FROM blog_posts WHERE status='published' ORDER BY published_at DESC LIMIT 50"); res.json(posts||[]); } catch { res.json([]); } });
  app.get("/api/blog/:slug", async (req, res) => { try { const post = await queryOne("SELECT * FROM blog_posts WHERE slug=? AND status='published'", [req.params.slug]); if (!post) return res.status(404).json({error:'Not found'}); res.json(post); } catch { res.status(500).json({error:'Error'}); } });

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
      // Prioridade: Meta Cloud API oficial
      if (metaApi.isConfigured()) {
        const token = process.env.META_ACCESS_TOKEN;
        const phoneId = process.env.META_PHONE_NUMBER_ID;
        try {
          const metaRes = await fetch(
            `https://graph.facebook.com/v22.0/${phoneId}?fields=code_verification_status,quality_rating`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          const metaData = await metaRes.json();
          if (metaData.code_verification_status === 'VERIFIED') {
            return res.json({
              instance: { state: 'connected', connection: 'meta_official' },
              phone: metaData.display_phone_number || phoneId,
              quality: metaData.quality_rating || 'GREEN',
            });
          }
        } catch (_) {}
      }

      // Fallback: Evolution API
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
      const { funnel_id } = req.query;
      const stages = funnel_id
        ? await query("SELECT * FROM pipeline_stages WHERE funnel_id = ? ORDER BY position", [funnel_id])
        : await query("SELECT * FROM pipeline_stages ORDER BY funnel_id, position");
      res.json(stages);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Funnels CRUD ────────────────────────────────────────────────────────────

  app.get("/api/funnels", async (req, res) => {
    try {
      const funnels = await query("SELECT * FROM funnels ORDER BY position");
      res.json(funnels);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/funnels", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
      const { v4: uuidv4 } = await import('uuid');
      const id = `funnel_${uuidv4().replace(/-/g,'').slice(0,12)}`;
      const maxPos: any = await query("SELECT COALESCE(MAX(position),0)+1 as pos FROM funnels");
      const pos = maxPos[0]?.pos || 1;
      await query("INSERT INTO funnels (id, name, position) VALUES (?, ?, ?)", [id, name.trim(), pos]);
      res.json({ id, name: name.trim(), position: pos });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/funnels/:id", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
      await query("UPDATE funnels SET name = ? WHERE id = ?", [name.trim(), req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/funnels/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const stagesInUse: any = await query(
        "SELECT COUNT(*) as c FROM contacts WHERE pipeline_stage IN (SELECT id FROM pipeline_stages WHERE funnel_id = ?)", [id]
      );
      if (stagesInUse[0]?.c > 0) {
        return res.status(400).json({ error: `Existem ${stagesInUse[0].c} contatos neste funil. Mova-os antes de excluir.` });
      }
      await query("DELETE FROM pipeline_stages WHERE funnel_id = ?", [id]);
      await query("DELETE FROM funnels WHERE id = ?", [id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Pipeline Stages CRUD ────────────────────────────────────────────────────

  app.post("/api/pipeline/stages", async (req, res) => {
    try {
      const { name, color, funnel_id } = req.body;
      if (!name?.trim() || !funnel_id) return res.status(400).json({ error: 'Nome e funil são obrigatórios' });
      const { v4: uuidv4 } = await import('uuid');
      const id = `stage_${uuidv4().replace(/-/g,'').slice(0,12)}`;
      const maxPos: any = await query("SELECT COALESCE(MAX(position),0)+1 as pos FROM pipeline_stages WHERE funnel_id = ?", [funnel_id]);
      const pos = maxPos[0]?.pos || 1;
      await query("INSERT INTO pipeline_stages (id, name, color, position, funnel_id) VALUES (?, ?, ?, ?, ?)",
        [id, name.trim(), color || '#6366f1', pos, funnel_id]);
      res.json({ id, name: name.trim(), color: color || '#6366f1', position: pos, funnel_id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/pipeline/stages/:id", async (req, res) => {
    try {
      const { name, color } = req.body;
      await query("UPDATE pipeline_stages SET name = ?, color = ? WHERE id = ?",
        [name?.trim(), color, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/pipeline/stages/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const inUse: any = await query("SELECT COUNT(*) as c FROM contacts WHERE pipeline_stage = ?", [id]);
      if (inUse[0]?.c > 0) {
        return res.status(400).json({ error: `${inUse[0].c} contato(s) nesta etapa. Mova-os antes de excluir.` });
      }
      await query("DELETE FROM pipeline_stages WHERE id = ?", [id]);
      res.json({ success: true });
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
    app.use(express.static(path.join(__dirname, "..", "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
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
