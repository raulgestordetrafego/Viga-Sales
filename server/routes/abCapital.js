/**
 * AB Capital — Rotas backend
 * Auth separada | Leads da landing page | Prospecção ativa | Pipeline CRM
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { query, queryOne, run } from '../db/database.js';
import evolutionApi from '../services/evolutionApi.js';

const AB_CAPITAL_GROUP_ID = '120363426868095162@g.us';

const leadSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,                    // máx 5 submissões por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

// ── Upload de arquivos ────────────────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), 'uploads', 'ab-capital');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4().slice(0,8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

const router = express.Router();

// ── Sessões AB Capital (in-memory, separadas do Viga Sales) ──────────────────
const abSessions = new Map();
const SESSION_TTL_MS      = 8 * 60 * 60 * 1000;  // 8h
const INACTIVITY_TTL_MS   = 30 * 60 * 1000;       // 30 min

function getAbSession(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return undefined;
  const s = abSessions.get(token);
  if (!s) return undefined;
  const now = Date.now();
  if (now > s.expiresAt || now - s.lastActivity > INACTIVITY_TTL_MS) {
    abSessions.delete(token);
    return undefined;
  }
  s.lastActivity = now;
  return s;
}

function abAuth(req, res, next) {
  const s = getAbSession(req);
  if (!s) return res.status(401).json({ error: 'Não autenticado' });
  req.abSession = s;
  next();
}

function abMaster(req, res, next) {
  const s = getAbSession(req);
  if (!s) return res.status(401).json({ error: 'Não autenticado' });
  if (s.role !== 'master' && s.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });
  req.abSession = s;
  next();
}

// Limpeza periódica de sessões (15 min)
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of abSessions.entries()) {
    if (now > s.expiresAt || now - s.lastActivity > INACTIVITY_TTL_MS) {
      abSessions.delete(token);
    }
  }
}, 15 * 60 * 1000);

// ── Auth ─────────────────────────────────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('[AB Login] body:', JSON.stringify({ email, passwordLen: password?.length }));
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

    const user = await queryOne('SELECT * FROM ab_capital_users WHERE email = ?', [email]);
    console.log('[AB Login] user found:', user ? user.email : 'NOT FOUND');
    if (!user) {
      await bcrypt.compare('dummy', '$2b$12$dummydummydummydummydudummydummydummydummydum');
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }
    if (user.status !== 'active') return res.status(403).json({ error: 'Conta inativa' });

    const ok = await bcrypt.compare(password, user.password_hash);
    console.log('[AB Login] bcrypt ok:', ok);
    if (!ok) return res.status(401).json({ error: 'Email ou senha incorretos' });

    const token = uuidv4();
    const now = Date.now();
    abSessions.set(token, {
      userId: user.id, name: user.name, email: user.email, role: user.role,
      expiresAt: now + SESSION_TTL_MS, lastActivity: now,
    });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/logout', abAuth, (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  abSessions.delete(token);
  res.json({ ok: true });
});

router.get('/auth/me', abAuth, (req, res) => {
  res.json({ user: req.abSession });
});

router.post('/auth/change-password', abAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Preencha todos os campos' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });
    const user = await queryOne('SELECT * FROM ab_capital_users WHERE email = ?', [req.abSession.email]);
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Senha atual incorreta' });
    const hash = await bcrypt.hash(newPassword, 12);
    await run('UPDATE ab_capital_users SET password_hash = ?, updated_at = ? WHERE email = ?', [hash, new Date().toISOString(), req.abSession.email]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Leads (captura da landing page — rota PÚBLICA) ───────────────────────────

router.post('/leads/public', leadSubmitLimiter, async (req, res) => {
  try {
    const { name, phone, email, objective } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Nome e telefone obrigatórios' });

    const cleanPhone = String(phone).replace(/\D/g, '');
    const id = uuidv4();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO ab_capital_leads (id, name, phone, email, objective, source, pipeline_stage, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'landing', 'analise', ?, ?)`,
      [id, name.trim(), cleanPhone, email?.trim() || null, objective || null, now, now]
    );

    console.log(`[AB Capital] Novo lead: ${name} | ${cleanPhone}`);
    res.json({ ok: true, id });

    // Automações em background (não bloqueiam a resposta)
    setImmediate(async () => {
      const firstName = name.trim().split(' ')[0];

      // 1. Primeira mensagem para o lead (falha silenciosa se número não existe)
      try {
        await evolutionApi.sendTextMessage(
          cleanPhone,
          `Olá, ${firstName}! 👋\n\nAqui é da *AB Capital*. Recebemos seu contato e ficamos felizes com seu interesse!\n\nEm breve um de nossos consultores entrará em contato para entender melhor como podemos te ajudar. 😊`
        );
        console.log(`[AB Capital] Mensagem enviada para lead ${cleanPhone}`);
      } catch (err) {
        console.warn(`[AB Capital] Não foi possível enviar mensagem para ${cleanPhone}:`, err.message);
      }

      // 2. Notificação no grupo (sempre envia, independente do item acima)
      try {
        const objectiveText = objective ? `\n🎯 Objetivo: ${objective}` : '';
        await evolutionApi.sendTextMessage(
          AB_CAPITAL_GROUP_ID,
          `🔔 *Novo lead via landing page!*\n\n👤 Nome: ${name.trim()}\n📱 Telefone: +55 ${cleanPhone}${objectiveText}`
        );
        console.log(`[AB Capital] Notificação enviada ao grupo`);
      } catch (err) {
        console.error('[AB Capital] Erro ao notificar grupo:', err.message);
      }
    });
  } catch (err) {
    console.error('[AB Capital] Erro ao salvar lead:', err.message);
    res.status(500).json({ error: 'Erro ao salvar lead' });
  }
});

// ── Leads (autenticado) ───────────────────────────────────────────────────────

router.get('/leads', abAuth, async (req, res) => {
  try {
    const { stage, search, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const isUser = req.abSession.role === 'user';
    let sql = 'SELECT * FROM ab_capital_leads WHERE 1=1';
    const params = [];
    // Usuários comuns enxergam apenas seus próprios leads
    if (isUser) { sql += ' AND responsible = ?'; params.push(req.abSession.name); }
    if (stage) { sql += ' AND pipeline_stage = ?'; params.push(stage); }
    if (search) {
      sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const leads = await query(sql, params);

    let countSql = 'SELECT COUNT(*) as total FROM ab_capital_leads WHERE 1=1';
    const countParams = [];
    if (isUser) { countSql += ' AND responsible = ?'; countParams.push(req.abSession.name); }
    if (stage) { countSql += ' AND pipeline_stage = ?'; countParams.push(stage); }
    if (search) {
      countSql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const like = `%${search}%`;
      countParams.push(like, like, like);
    }
    const [{ total }] = await query(countSql, countParams);
    res.json({ leads, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leads/stats', abAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const isUser = req.abSession.role === 'user';
    const scopeClause = isUser ? ` AND responsible = '${req.abSession.name.replace(/'/g, "''")}'` : '';

    const [totalRow]  = await query(`SELECT COUNT(*) as c FROM ab_capital_leads WHERE 1=1${scopeClause}`, []);
    const [todayRow]  = await query(`SELECT COUNT(*) as c FROM ab_capital_leads WHERE date(created_at) = ?${scopeClause}`, [today]);
    const stages      = await query(`SELECT pipeline_stage, COUNT(*) as c FROM ab_capital_leads WHERE 1=1${scopeClause} GROUP BY pipeline_stage`, []);
    const [prosTotal] = await query('SELECT COUNT(*) as c FROM ab_capital_prospects', []);

    // Financeiro vem da tabela de clientes
    const clientScope = isUser ? ` AND responsible = '${req.abSession.name.replace(/'/g, "''")}'` : '';
    const [finRow] = await query(
      `SELECT
         COALESCE(SUM(credit_value), 0)                                                                    AS total_credit,
         COALESCE(SUM(credit_value * COALESCE(commission_pct, 4) / 100), 0)                               AS total_commission,
         COALESCE(SUM(installment_value * (COALESCE(installments,0) - COALESCE(parcelas_pagas,0))), 0)    AS remaining_balance,
         COUNT(CASE WHEN status_atraso = 1    THEN 1 END)                                                  AS overdue_count,
         COUNT(CASE WHEN status = 'cancelado' THEN 1 END)                                                  AS cancelled_count,
         COUNT(*) AS won_count
       FROM ab_capital_clientes WHERE 1=1${clientScope}`, []
    );

    res.json({
      total_leads:      totalRow.c,
      leads_today:      todayRow.c,
      stages,
      total_prospects:  prosTotal.c,
      financials: {
        total_credit:      Number(finRow.total_credit      || 0),
        total_commission:  Number(finRow.total_commission  || 0),
        remaining_balance: Number(finRow.remaining_balance || 0),
        overdue_count:     Number(finRow.overdue_count     || 0),
        cancelled_count:   Number(finRow.cancelled_count   || 0),
        won_count:         Number(finRow.won_count         || 0),
        revenue_target:    3_000_000,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leads/:id', abAuth, async (req, res) => {
  try {
    const lead = await queryOne('SELECT * FROM ab_capital_leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/leads/:id', abAuth, async (req, res) => {
  try {
    const {
      name, phone, email, address, consortium_name, installments, installment_value,
      admin_profit_pct, admin_company, general_info, traffic_source, responsible,
      pipeline_stage, notes, credit_value, objective,
      // v2
      grupo, cota, contrato,
      status_atraso, status_cancelamento, parcelas_pagas, commission_pct,
    } = req.body;
    const now = new Date().toISOString();
    await run(
      `UPDATE ab_capital_leads SET
        name=COALESCE(?,name), phone=COALESCE(?,phone), email=?, address=?,
        consortium_name=?, installments=?, installment_value=?, admin_profit_pct=?,
        admin_company=?, general_info=?, traffic_source=?, responsible=?,
        credit_value=?, objective=COALESCE(?,objective),
        pipeline_stage=COALESCE(?,pipeline_stage), notes=?,
        grupo=?, cota=?, contrato=?,
        status_atraso=COALESCE(?,status_atraso),
        status_cancelamento=COALESCE(?,status_cancelamento),
        parcelas_pagas=COALESCE(?,parcelas_pagas),
        commission_pct=?,
        updated_at=?
       WHERE id=?`,
      [
        name||null, phone||null, email||null, address||null,
        consortium_name||null, installments||null, installment_value||null, admin_profit_pct||null,
        admin_company||null, general_info||null, traffic_source||null, responsible||null,
        credit_value||null, objective||null,
        pipeline_stage||null, notes||null,
        grupo||null, cota||null, contrato||null,
        status_atraso != null ? (status_atraso ? 1 : 0) : null,
        status_cancelamento != null ? (status_cancelamento ? 1 : 0) : null,
        parcelas_pagas != null ? Number(parcelas_pagas) : null,
        commission_pct != null ? Number(commission_pct) : null,
        now,
        req.params.id,
      ]
    );
    const lead = await queryOne('SELECT * FROM ab_capital_leads WHERE id = ?', [req.params.id]);
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/leads/:id/upload', abAuth, upload.fields([
  { name: 'attachment', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
]), async (req, res) => {
  try {
    const now = new Date().toISOString();
    const updates = [];
    const params = [];
    if (req.files?.attachment) {
      updates.push('attachment_path=?');
      params.push('/uploads/ab-capital/' + req.files.attachment[0].filename);
    }
    if (req.files?.photo) {
      updates.push('photo_path=?');
      params.push('/uploads/ab-capital/' + req.files.photo[0].filename);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    updates.push('updated_at=?');
    params.push(now, req.params.id);
    await run(`UPDATE ab_capital_leads SET ${updates.join(',')} WHERE id=?`, params);
    const lead = await queryOne('SELECT * FROM ab_capital_leads WHERE id = ?', [req.params.id]);
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/leads/:id', abMaster, async (req, res) => {
  try {
    await run('DELETE FROM ab_capital_leads WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Clientes ──────────────────────────────────────────────────────────────────

router.get('/clientes', abAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const isUser = req.abSession.role === 'user';
    let sql = 'SELECT * FROM ab_capital_clientes WHERE 1=1';
    const params = [];
    if (isUser) { sql += ' AND responsible = ?'; params.push(req.abSession.name); }
    if (status)  { sql += ' AND status = ?'; params.push(status); }
    if (search) {
      sql += ' AND (name LIKE ? OR phone LIKE ? OR contrato LIKE ? OR grupo LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const clientes = await query(sql, params);

    let countSql = 'SELECT COUNT(*) as total FROM ab_capital_clientes WHERE 1=1';
    const countParams = [];
    if (isUser) { countSql += ' AND responsible = ?'; countParams.push(req.abSession.name); }
    if (status)  { countSql += ' AND status = ?'; countParams.push(status); }
    if (search) {
      countSql += ' AND (name LIKE ? OR phone LIKE ? OR contrato LIKE ? OR grupo LIKE ?)';
      const like = `%${search}%`;
      countParams.push(like, like, like, like);
    }
    const [{ total }] = await query(countSql, countParams);
    res.json({ clientes, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/clientes/stats', abAuth, async (req, res) => {
  try {
    const isUser = req.abSession.role === 'user';
    const scopeClause = isUser ? ` AND responsible = '${req.abSession.name.replace(/'/g, "''")}'` : '';
    const [row] = await query(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN status = 'ativo'     THEN 1 END) AS ativos,
         COUNT(CASE WHEN status_atraso = 1    THEN 1 END) AS em_atraso,
         COUNT(CASE WHEN status = 'cancelado' THEN 1 END) AS cancelados,
         COUNT(CASE WHEN status = 'quitado'   THEN 1 END) AS quitados,
         COALESCE(SUM(credit_value), 0) AS total_credit,
         COALESCE(SUM(credit_value * COALESCE(commission_pct,4) / 100), 0) AS total_commission,
         COALESCE(SUM(installment_value * (COALESCE(installments,0) - COALESCE(parcelas_pagas,0))), 0) AS remaining_balance
       FROM ab_capital_clientes WHERE 1=1${scopeClause}`, []
    );
    res.json({ ...row, revenue_target: 3_000_000 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/clientes/:id', abAuth, async (req, res) => {
  try {
    const c = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clientes', abAuth, async (req, res) => {
  try {
    const {
      name, phone, email, address, consortium_name, admin_company,
      grupo, cota, contrato, credit_value, commission_pct, installments,
      installment_value, parcelas_pagas, admin_profit_pct,
      responsible, traffic_source, general_info, notes, lead_id,
    } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Nome e telefone obrigatórios' });
    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO ab_capital_clientes
        (id, lead_id, name, phone, email, address, consortium_name, admin_company,
         grupo, cota, contrato, credit_value, commission_pct, installments,
         installment_value, parcelas_pagas, admin_profit_pct,
         responsible, traffic_source, general_info, notes, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'manual',?,?)`,
      [id, lead_id||null, name, String(phone).replace(/\D/g,''), email||null, address||null,
       consortium_name||null, admin_company||null,
       grupo||null, cota||null, contrato||null,
       credit_value||null, commission_pct||4, installments||null,
       installment_value||null, parcelas_pagas||0, admin_profit_pct||null,
       responsible||null, traffic_source||null, general_info||null, notes||null,
       now, now]
    );
    const cliente = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [id]);
    res.json(cliente);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/clientes/:id', abAuth, async (req, res) => {
  try {
    const {
      name, phone, email, address, consortium_name, admin_company,
      grupo, cota, contrato, credit_value, commission_pct, installments,
      installment_value, parcelas_pagas, admin_profit_pct,
      status, status_atraso, status_cancelamento,
      responsible, traffic_source, general_info, notes,
    } = req.body;
    const now = new Date().toISOString();
    await run(
      `UPDATE ab_capital_clientes SET
         name=COALESCE(?,name), phone=COALESCE(?,phone), email=?, address=?,
         consortium_name=?, admin_company=?,
         grupo=?, cota=?, contrato=?,
         credit_value=?, commission_pct=COALESCE(?,commission_pct),
         installments=?, installment_value=?,
         parcelas_pagas=COALESCE(?,parcelas_pagas),
         admin_profit_pct=?,
         status=COALESCE(?,status),
         status_atraso=COALESCE(?,status_atraso),
         status_cancelamento=COALESCE(?,status_cancelamento),
         responsible=?, traffic_source=?, general_info=?, notes=?,
         updated_at=?
       WHERE id=?`,
      [
        name||null, phone ? String(phone).replace(/\D/g,'') : null, email||null, address||null,
        consortium_name||null, admin_company||null,
        grupo||null, cota||null, contrato||null,
        credit_value||null, commission_pct||null,
        installments||null, installment_value||null,
        parcelas_pagas != null ? Number(parcelas_pagas) : null,
        admin_profit_pct||null,
        status||null,
        status_atraso != null ? (status_atraso ? 1 : 0) : null,
        status_cancelamento != null ? (status_cancelamento ? 1 : 0) : null,
        responsible||null, traffic_source||null, general_info||null, notes||null,
        now, req.params.id,
      ]
    );
    const c = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [req.params.id]);
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clientes/:id/upload', abAuth, upload.fields([
  { name: 'attachment', maxCount: 1 },
  { name: 'photo',      maxCount: 1 },
]), async (req, res) => {
  try {
    const now = new Date().toISOString();
    const updates = [];
    const params = [];
    if (req.files?.attachment) {
      updates.push('attachment_path=?');
      params.push('/uploads/ab-capital/' + req.files.attachment[0].filename);
    }
    if (req.files?.photo) {
      updates.push('photo_path=?');
      params.push('/uploads/ab-capital/' + req.files.photo[0].filename);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    updates.push('updated_at=?');
    params.push(now, req.params.id);
    await run(`UPDATE ab_capital_clientes SET ${updates.join(',')} WHERE id=?`, params);
    const c = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [req.params.id]);
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/clientes/:id', abMaster, async (req, res) => {
  try {
    await run('DELETE FROM ab_capital_clientes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Converte lead em cliente (idempotente)
router.post('/leads/:id/convert', abAuth, async (req, res) => {
  try {
    const lead = await queryOne('SELECT * FROM ab_capital_leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    // Se já foi convertido, retorna o cliente existente
    if (lead.converted_to_client_id) {
      const existing = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [lead.converted_to_client_id]);
      if (existing) return res.json({ cliente: existing, already_existed: true });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO ab_capital_clientes
        (id, lead_id, name, phone, email, address, consortium_name, admin_company,
         credit_value, responsible, traffic_source, general_info, notes,
         source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'conversao',?,?)`,
      [id, lead.id, lead.name, lead.phone, lead.email||null, lead.address||null,
       lead.consortium_name||null, lead.admin_company||null,
       lead.credit_value||null, lead.responsible||null,
       lead.traffic_source||null, lead.general_info||null, lead.notes||null,
       now, now]
    );

    // Marca o lead como convertido
    await run('UPDATE ab_capital_leads SET converted_to_client_id = ?, updated_at = ? WHERE id = ?',
      [id, now, lead.id]);

    const cliente = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [id]);
    res.json({ cliente, already_existed: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Prospects (prospecção ativa) ──────────────────────────────────────────────

router.get('/prospects', abAuth, async (req, res) => {
  try {
    const { status, search, campaign_id, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let sql = 'SELECT * FROM ab_capital_prospects WHERE 1=1';
    const params = [];
    if (status)      { sql += ' AND status = ?'; params.push(status); }
    if (campaign_id) { sql += ' AND campaign_id = ?'; params.push(campaign_id); }
    if (search) {
      sql += ' AND (name LIKE ? OR phone LIKE ? OR company LIKE ? OR city LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const rows = await query(sql, params);
    const prospects = rows.map(p => ({ ...p, raw_data: p.raw_data ? JSON.parse(p.raw_data) : null }));
    const [{ total }] = await query(
      'SELECT COUNT(*) as total FROM ab_capital_prospects WHERE 1=1' +
      (status ? ' AND status = ?' : '') +
      (campaign_id ? ' AND campaign_id = ?' : '') +
      (search ? ' AND (name LIKE ? OR phone LIKE ? OR company LIKE ? OR city LIKE ?)' : ''),
      [...(status ? [status] : []), ...(campaign_id ? [campaign_id] : []),
       ...(search ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`] : [])]
    );
    res.json({ prospects, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/prospects', abAuth, async (req, res) => {
  try {
    const { name, phone, email, company, segment, city, address, website, instagram, notes, campaign_id } = req.body;
    if (!phone) return res.status(400).json({ error: 'Telefone obrigatório' });
    const cleanPhone = String(phone).replace(/\D/g, '');
    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO ab_capital_prospects
        (id, name, phone, email, company, segment, city, address, website, instagram, notes, campaign_id, source, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'novo', ?, ?)`,
      [id, name || null, cleanPhone, email || null, company || null, segment || null,
       city || null, address || null, website || null, instagram || null, notes || null,
       campaign_id || null, now, now]
    );
    const prospect = await queryOne('SELECT * FROM ab_capital_prospects WHERE id = ?', [id]);
    res.json(prospect);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Telefone já cadastrado' });
    res.status(500).json({ error: err.message });
  }
});

router.post('/prospects/import', abAuth, async (req, res) => {
  try {
    const { prospects, campaign_id } = req.body;
    if (!Array.isArray(prospects)) return res.status(400).json({ error: 'Array de prospects obrigatório' });
    let imported = 0, skipped = 0;
    const now = new Date().toISOString();
    for (const p of prospects) {
      try {
        const cleanPhone = String(p.phone || p.whatsapp || '').replace(/\D/g, '');
        if (!cleanPhone) { skipped++; continue; }
        const id = uuidv4();
        await run(
          `INSERT OR IGNORE INTO ab_capital_prospects
            (id, name, phone, email, company, segment, city, address, website, instagram, rating, reviews_count, raw_data, campaign_id, source, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', 'novo', ?, ?)`,
          [id, p.name || null, cleanPhone, p.email || null, p.company || null,
           p.segment || null, p.city || null, p.address || null, p.website || null,
           p.instagram || null, p.rating || null, p.reviews_count || null,
           p.raw_data ? JSON.stringify(p.raw_data) : null, campaign_id || null, now, now]
        );
        imported++;
      } catch { skipped++; }
    }
    res.json({ ok: true, imported, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/prospects/:id', abAuth, async (req, res) => {
  try {
    const { status, notes, ai_message, follow_up_at } = req.body;
    const now = new Date().toISOString();
    await run(
      `UPDATE ab_capital_prospects SET status = ?, notes = ?, ai_message = ?, follow_up_at = ?, updated_at = ? WHERE id = ?`,
      [status, notes, ai_message, follow_up_at, now, req.params.id]
    );
    const p = await queryOne('SELECT * FROM ab_capital_prospects WHERE id = ?', [req.params.id]);
    res.json({ ...p, raw_data: p.raw_data ? JSON.parse(p.raw_data) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/prospects/:id', abMaster, async (req, res) => {
  try {
    await run('DELETE FROM ab_capital_prospects WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Campanhas ─────────────────────────────────────────────────────────────────

router.get('/campaigns', abAuth, async (req, res) => {
  try {
    const campaigns = await query('SELECT * FROM ab_capital_campaigns ORDER BY created_at DESC', []);
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/campaigns', abAuth, async (req, res) => {
  try {
    const { name, segment, city, daily_limit = 40, message_template, use_ai = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO ab_capital_campaigns (id, name, segment, city, daily_limit, message_template, use_ai, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, segment || null, city || null, daily_limit, message_template || null, use_ai ? 1 : 0, now, now]
    );
    const c = await queryOne('SELECT * FROM ab_capital_campaigns WHERE id = ?', [id]);
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Usuários (master only) ────────────────────────────────────────────────────

router.get('/users', abMaster, async (req, res) => {
  try {
    const users = await query(
      'SELECT id, name, email, role, status, created_at FROM ab_capital_users ORDER BY created_at ASC', []
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', abMaster, async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha obrigatórios' });
    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO ab_capital_users (id, name, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [id, name, email, hash, role, now, now]
    );
    res.json({ id, name, email, role, status: 'active' });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Email já cadastrado' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/password', abMaster, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Senha mínima: 6 caracteres' });
    const hash = await bcrypt.hash(password, 12);
    await run('UPDATE ab_capital_users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [hash, new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/status', abMaster, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    await run('UPDATE ab_capital_users SET status = ?, updated_at = ? WHERE id = ?',
      [status, new Date().toISOString(), req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
