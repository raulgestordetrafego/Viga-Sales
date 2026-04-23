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
const AB_CAPITAL_INSTANCE = process.env.AB_CAPITAL_EVOLUTION_INSTANCE || 'Adila_pessoal';
// Notificações ao grupo (tarefas, follow-ups) via instância AB Capital
const AB_CAPITAL_NOTIFY_INSTANCE = process.env.AB_CAPITAL_NOTIFY_INSTANCE || process.env.AB_CAPITAL_EVOLUTION_INSTANCE || 'Adila_pessoal';

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

// ── Arquivos estáticos públicos ───────────────────────────────────────────────
router.get('/logo',        (req, res) => res.sendFile(path.join('/app', 'public', 'abcapital', 'logo.png')));
router.get('/favicon.ico', (req, res) => res.sendFile(path.join('/app', 'public', 'abcapital', 'favicon.ico')));
router.get('/favicon-192.png', (req, res) => res.sendFile(path.join('/app', 'public', 'abcapital', 'favicon-192.png')));

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
        await evolutionApi.sendTextMessageFromInstance(
          AB_CAPITAL_INSTANCE,
          cleanPhone,
          `Olá, ${firstName}! 👋\n\nAqui é da *AB Capital*. Recebemos seu contato e ficamos felizes com seu interesse!\n\nEm breve um de nossos consultores entrará em contato para entender melhor como podemos te ajudar. 😊`
        );
        console.log(`[AB Capital] Mensagem enviada para lead ${cleanPhone} via instância ${AB_CAPITAL_INSTANCE}`);
      } catch (err) {
        console.warn(`[AB Capital] Não foi possível enviar mensagem para ${cleanPhone}:`, err.message);
      }

      // 2. Notificação no grupo (sempre envia, independente do item acima)
      try {
        const objectiveText = objective ? `\n🎯 Objetivo: ${objective}` : '';
        await evolutionApi.sendTextMessageFromInstance(
          AB_CAPITAL_INSTANCE,
          AB_CAPITAL_GROUP_ID,
          `🔔 *Novo lead via landing page!*\n\n👤 Nome: ${name.trim()}\n📱 Telefone: +55 ${cleanPhone}${objectiveText}`
        );
        console.log(`[AB Capital] Notificação enviada ao grupo via instância ${AB_CAPITAL_INSTANCE}`);
      } catch (err) {
        console.error('[AB Capital] Erro ao notificar grupo:', err.message, '| Instância:', AB_CAPITAL_INSTANCE);
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
    const { responsible, date_from, date_to } = req.query;

    // Monta cláusula de filtros dinâmicos
    const buildWhere = (table) => {
      const clauses = ['1=1'];
      const p = [];
      if (isUser) { clauses.push(`${table}responsible = ?`); p.push(req.abSession.name); }
      else if (responsible) { clauses.push(`${table}responsible = ?`); p.push(responsible); }
      if (date_from) { clauses.push(`date(${table}created_at) >= ?`); p.push(date_from); }
      if (date_to)   { clauses.push(`date(${table}created_at) <= ?`); p.push(date_to); }
      return { where: clauses.join(' AND '), p };
    };

    const lf = buildWhere('');
    const cf = buildWhere('');

    const [totalRow]  = await query(`SELECT COUNT(*) as c FROM ab_capital_leads WHERE ${lf.where}`, lf.p);
    const todayParams = [...lf.p];
    const todayExtra  = date_from || date_to ? '' : ` AND date(created_at) = '${today}'`;
    const [todayRow]  = date_from || date_to
      ? [{ c: 0 }]
      : await query(`SELECT COUNT(*) as c FROM ab_capital_leads WHERE ${lf.where}${todayExtra}`, lf.p);
    const stages      = await query(`SELECT pipeline_stage, COUNT(*) as c FROM ab_capital_leads WHERE ${lf.where} GROUP BY pipeline_stage`, lf.p);
    const [prosTotal] = await query('SELECT COUNT(*) as c FROM ab_capital_prospects', []);

    const [finRow] = await query(
      `SELECT
         COALESCE(SUM(credit_value), 0)                                                                    AS total_credit,
         COALESCE(SUM(credit_value * COALESCE(commission_pct, 4) / 100), 0)                               AS total_commission,
         COALESCE(SUM(installment_value * (COALESCE(installments,0) - COALESCE(parcelas_pagas,0))), 0)    AS remaining_balance,
         COUNT(CASE WHEN status_atraso = 1    THEN 1 END)                                                  AS overdue_count,
         COUNT(CASE WHEN status = 'cancelado' THEN 1 END)                                                  AS cancelled_count,
         COUNT(*) AS won_count
       FROM ab_capital_clientes WHERE ${cf.where}`, cf.p
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
    const isUser = req.abSession.role === 'user';
    if (isUser && lead.responsible !== req.abSession.name)
      return res.status(403).json({ error: 'Sem permissão para ver este lead' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/leads/:id', abAuth, async (req, res) => {
  try {
    const lead = await queryOne('SELECT responsible FROM ab_capital_leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    const isUser = req.abSession.role === 'user';
    if (isUser && lead.responsible !== req.abSession.name)
      return res.status(403).json({ error: 'Sem permissão para editar este lead' });

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
        admin_company=?, general_info=?, traffic_source=?, responsible=COALESCE(?,responsible),
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
    const updated = await queryOne('SELECT * FROM ab_capital_leads WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/leads/:id/upload', abAuth, upload.fields([
  { name: 'attachment', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
]), async (req, res) => {
  try {
    const lead = await queryOne('SELECT responsible FROM ab_capital_leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    const isUser = req.abSession.role === 'user';
    if (isUser && lead.responsible !== req.abSession.name)
      return res.status(403).json({ error: 'Sem permissão para editar este lead' });

    const now = new Date().toISOString();
    const updates = [];
    const params = [];
    if (req.files?.attachment) {
      updates.push('attachment_path=?');
      params.push('/api/uploads/ab-capital/' + req.files.attachment[0].filename);
    }
    if (req.files?.photo) {
      updates.push('photo_path=?');
      params.push('/api/uploads/ab-capital/' + req.files.photo[0].filename);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    updates.push('updated_at=?');
    params.push(now, req.params.id);
    await run(`UPDATE ab_capital_leads SET ${updates.join(',')} WHERE id=?`, params);
    const updated = await queryOne('SELECT * FROM ab_capital_leads WHERE id = ?', [req.params.id]);
    res.json(updated);
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

// GET /clientes — lista clientes com contagem de contratos agregada
router.get('/clientes', abAuth, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const isUser = req.abSession.role === 'user';
    const clauses = ['1=1'];
    const params = [];
    if (isUser) { clauses.push('c.responsible = ?'); params.push(req.abSession.name); }
    if (search) {
      clauses.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const where = clauses.join(' AND ');
    const sql = `
      SELECT c.*,
        COUNT(ct.id) as total_contratos,
        COALESCE(SUM(ct.credit_value), 0) as total_credit,
        COUNT(CASE WHEN ct.status_atraso = 1 THEN 1 END) as contratos_atraso
      FROM ab_capital_clientes c
      LEFT JOIN ab_capital_contratos ct ON ct.cliente_id = c.id
      WHERE ${where}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);
    const clientes = await query(sql, params);

    const countParams = clauses.slice(1).length > 0
      ? params.slice(0, params.length - 2)
      : [];
    const countSql = `SELECT COUNT(DISTINCT c.id) as total FROM ab_capital_clientes c WHERE ${where}`;
    const [{ total }] = await query(countSql, countParams);
    res.json({ clientes, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /clientes/stats — estatísticas usando JOIN com contratos
router.get('/clientes/stats', abAuth, async (req, res) => {
  try {
    const isUser = req.abSession.role === 'user';
    const { responsible, date_from, date_to } = req.query;
    const clauses = ['1=1'];
    const p = [];
    if (isUser) { clauses.push('c.responsible = ?'); p.push(req.abSession.name); }
    else if (responsible) { clauses.push('c.responsible = ?'); p.push(responsible); }
    if (date_from) { clauses.push('date(c.created_at) >= ?'); p.push(date_from); }
    if (date_to)   { clauses.push('date(c.created_at) <= ?'); p.push(date_to); }
    const where = clauses.join(' AND ');
    const [row] = await query(
      `SELECT
         COUNT(DISTINCT c.id) AS total,
         COUNT(DISTINCT CASE WHEN ct.status = 'ativo' THEN c.id END) AS ativos,
         COUNT(DISTINCT CASE WHEN ct.status_atraso = 1 THEN c.id END) AS em_atraso,
         COUNT(DISTINCT CASE WHEN ct.status = 'cancelado' THEN c.id END) AS cancelados,
         COUNT(DISTINCT CASE WHEN ct.status = 'quitado' THEN c.id END) AS quitados,
         COALESCE(SUM(ct.credit_value), 0) AS total_credit,
         COALESCE(SUM(ct.credit_value * COALESCE(ct.commission_pct,4) / 100), 0) AS total_commission,
         COALESCE(SUM(ct.installment_value * (COALESCE(ct.installments,0) - COALESCE(ct.parcelas_pagas,0))), 0) AS remaining_balance
       FROM ab_capital_clientes c
       LEFT JOIN ab_capital_contratos ct ON ct.cliente_id = c.id
       WHERE ${where}`, p
    );
    res.json({ ...row, revenue_target: 3_000_000 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /clientes/:id — retorna cliente com array de contratos
router.get('/clientes/:id', abAuth, async (req, res) => {
  try {
    const cliente = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [req.params.id]);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    const contratos = await query('SELECT * FROM ab_capital_contratos WHERE cliente_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.json({ ...cliente, contratos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /clientes — cria somente o cliente (sem contrato)
router.post('/clientes', abAuth, async (req, res) => {
  try {
    const {
      name, phone, email, cpf_cnpj, address,
      responsible, traffic_source, notes, source, lead_id,
    } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Nome e telefone obrigatórios' });
    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO ab_capital_clientes
        (id, lead_id, name, phone, email, cpf_cnpj, address,
         responsible, traffic_source, notes, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, lead_id||null, name.trim(), String(phone).replace(/\D/g,''),
       email||null, cpf_cnpj||null, address||null,
       responsible||null, traffic_source||null, notes||null,
       source||'manual', now, now]
    );
    const cliente = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [id]);
    const contratos = await query('SELECT * FROM ab_capital_contratos WHERE cliente_id = ? ORDER BY created_at ASC', [id]);
    res.json({ ...cliente, contratos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /clientes/:id — atualiza apenas campos do cliente
router.put('/clientes/:id', abAuth, async (req, res) => {
  try {
    const {
      name, phone, email, cpf_cnpj, address,
      responsible, traffic_source, general_info, notes,
    } = req.body;
    const now = new Date().toISOString();
    await run(
      `UPDATE ab_capital_clientes SET
         name=COALESCE(?,name), phone=COALESCE(?,phone),
         email=?, cpf_cnpj=COALESCE(?,cpf_cnpj), address=?,
         responsible=?, traffic_source=?, general_info=?, notes=?,
         updated_at=?
       WHERE id=?`,
      [
        name||null, phone ? String(phone).replace(/\D/g,'') : null,
        email||null, cpf_cnpj||null, address||null,
        responsible||null, traffic_source||null, general_info||null, notes||null,
        now, req.params.id,
      ]
    );
    const cliente = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [req.params.id]);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    const contratos = await query('SELECT * FROM ab_capital_contratos WHERE cliente_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.json({ ...cliente, contratos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /clientes/:id/contratos — cria novo contrato para um cliente
router.post('/clientes/:id/contratos', abAuth, async (req, res) => {
  try {
    const clienteId = req.params.id;
    const cliente = await queryOne('SELECT id FROM ab_capital_clientes WHERE id = ?', [clienteId]);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    const {
      admin_company, grupo, cota, contrato,
      credit_value, commission_pct, installments, installment_value,
      parcelas_pagas, status, status_atraso, status_cancelamento,
      data_adesao, comissao_valor, comissao_recebida, comissao_status,
      empresa, nf_emitida, data_boleto, data_lance,
      parceria_pct, parceria_obs, notes,
    } = req.body;
    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO ab_capital_contratos
        (id, cliente_id, admin_company, grupo, cota, contrato,
         credit_value, commission_pct, installments, installment_value,
         parcelas_pagas, status, status_atraso, status_cancelamento,
         data_adesao, comissao_valor, comissao_recebida, comissao_status,
         empresa, nf_emitida, data_boleto, data_lance,
         parceria_pct, parceria_obs, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, clienteId, admin_company||null, grupo||null, cota||null, contrato||null,
       credit_value||null, commission_pct||4, installments||null, installment_value||null,
       parcelas_pagas||0, status||'ativo',
       status_atraso ? 1 : 0, status_cancelamento ? 1 : 0,
       data_adesao||null, comissao_valor||null, comissao_recebida||0,
       comissao_status||'pendente', empresa||'AB', nf_emitida ? 1 : 0,
       data_boleto||null, data_lance||null,
       parceria_pct||null, parceria_obs||null, notes||null,
       now, now]
    );
    const ct = await queryOne('SELECT * FROM ab_capital_contratos WHERE id = ?', [id]);
    res.json(ct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /contratos/:id — atualiza um contrato
router.put('/contratos/:id', abAuth, async (req, res) => {
  try {
    const {
      admin_company, grupo, cota, contrato,
      credit_value, commission_pct, installments, installment_value,
      parcelas_pagas, status, status_atraso, status_cancelamento,
      data_adesao, comissao_valor, comissao_recebida, comissao_status,
      empresa, nf_emitida, data_boleto, data_lance,
      parceria_pct, parceria_obs, notes,
    } = req.body;
    const now = new Date().toISOString();
    await run(
      `UPDATE ab_capital_contratos SET
         admin_company=?, grupo=?, cota=?, contrato=?,
         credit_value=?, commission_pct=COALESCE(?,commission_pct),
         installments=?, installment_value=?,
         parcelas_pagas=COALESCE(?,parcelas_pagas),
         status=COALESCE(?,status),
         status_atraso=COALESCE(?,status_atraso),
         status_cancelamento=COALESCE(?,status_cancelamento),
         data_adesao=?, comissao_valor=?,
         comissao_recebida=COALESCE(?,comissao_recebida),
         comissao_status=COALESCE(?,comissao_status),
         empresa=COALESCE(?,empresa), nf_emitida=COALESCE(?,nf_emitida),
         data_boleto=?, data_lance=?,
         parceria_pct=?, parceria_obs=?, notes=?,
         updated_at=?
       WHERE id=?`,
      [
        admin_company||null, grupo||null, cota||null, contrato||null,
        credit_value||null, commission_pct||null,
        installments||null, installment_value||null,
        parcelas_pagas != null ? Number(parcelas_pagas) : null,
        status||null,
        status_atraso != null ? (status_atraso ? 1 : 0) : null,
        status_cancelamento != null ? (status_cancelamento ? 1 : 0) : null,
        data_adesao||null, comissao_valor||null,
        comissao_recebida != null ? Number(comissao_recebida) : null,
        comissao_status||null, empresa||null,
        nf_emitida != null ? (nf_emitida ? 1 : 0) : null,
        data_boleto||null, data_lance||null,
        parceria_pct||null, parceria_obs||null, notes||null,
        now, req.params.id,
      ]
    );
    const ct = await queryOne('SELECT * FROM ab_capital_contratos WHERE id = ?', [req.params.id]);
    if (!ct) return res.status(404).json({ error: 'Contrato não encontrado' });
    res.json(ct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /contratos/:id — deleta um contrato (master only)
router.delete('/contratos/:id', abMaster, async (req, res) => {
  try {
    await run('DELETE FROM ab_capital_contratos WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /clientes/:id/upload — upload de foto/anexo do cliente
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
      params.push('/api/uploads/ab-capital/' + req.files.attachment[0].filename);
    }
    if (req.files?.photo) {
      updates.push('photo_path=?');
      params.push('/api/uploads/ab-capital/' + req.files.photo[0].filename);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    updates.push('updated_at=?');
    params.push(now, req.params.id);
    await run(`UPDATE ab_capital_clientes SET ${updates.join(',')} WHERE id=?`, params);
    const cliente = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [req.params.id]);
    const contratos = await query('SELECT * FROM ab_capital_contratos WHERE cliente_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.json({ ...cliente, contratos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Exportação CSV ────────────────────────────────────────────────────────────
function csvRow(cells) {
  return cells.map(c => {
    const v = c == null ? '' : String(c);
    return v.includes(',') || v.includes('"') || v.includes('\n')
      ? '"' + v.replace(/"/g, '""') + '"'
      : v;
  }).join(',');
}
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString('pt-BR');
}
function fmtMoney(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// Provisão — formato igual à planilha do contador
router.get('/export/provisao', abAuth, async (req, res) => {
  try {
    const rows_data = await query(
      `SELECT c.name, c.responsible, ct.*
       FROM ab_capital_contratos ct
       JOIN ab_capital_clientes c ON c.id = ct.cliente_id
       WHERE ct.status != 'cancelado'
       ORDER BY ct.admin_company, c.name`, []
    );
    const header = csvRow([
      'Administradora','Nome','Grupo','Cota','Situação','Valor do Bem','Contrato',
      'Data Adesão','Parcelas','Parcelas Pagas','Parcelas Restantes',
      '% Comissão','Valor da Comissão','Status Comissão','Comissão Recebida',
      'Valores Restantes a Receber','Empresa','NF Emitida','Data Boleto','Data Lance',
      'Parceria %','Obs Parceria','Responsável',
    ]);
    const rows = rows_data.map(c => {
      const parcRestantes = (c.installments||0) - (c.parcelas_pagas||0);
      const comissaoMensal = c.comissao_valor || (c.credit_value && c.commission_pct ? c.credit_value * c.commission_pct / 100 : null);
      const totalRestante  = comissaoMensal && parcRestantes ? comissaoMensal * parcRestantes : null;
      const situacao = c.status_atraso ? 'Em atraso' : c.status === 'quitado' ? 'Quitado' : 'Ativa';
      return csvRow([
        c.admin_company||'', c.name, c.grupo||'', c.cota||'', situacao,
        fmtMoney(c.credit_value), c.contrato||'',
        fmtDate(c.data_adesao||c.created_at), c.installments||'',
        c.parcelas_pagas||0, parcRestantes,
        c.commission_pct ? c.commission_pct.toFixed(4)+'%' : '',
        fmtMoney(comissaoMensal),
        c.comissao_status||'pendente',
        fmtMoney(c.comissao_recebida||0),
        fmtMoney(totalRestante),
        c.empresa||'AB', c.nf_emitida ? 'Sim' : 'Não',
        c.data_boleto||'', c.data_lance||'',
        c.parceria_pct||'', c.parceria_obs||'', c.responsible||'',
      ]);
    });
    // Linha de totais
    const totCredit = rows_data.reduce((s,c)=>s+(c.credit_value||0),0);
    rows.push(csvRow(['TOTAL','','','','','','','','','','','','','','',fmtMoney(totCredit),'','','','','','','']));

    const bom = '\uFEFF'; // BOM para Excel reconhecer UTF-8
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="provisao_${new Date().toISOString().split('T')[0]}.csv"`);
    res.end(bom + [header, ...rows].join('\r\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Relatório de Vendas — histórico completo
router.get('/export/relatorio', abAuth, async (req, res) => {
  try {
    const { responsible, date_from, date_to } = req.query;
    const clauses = ['1=1'];
    const p = [];
    if (responsible) { clauses.push('c.responsible = ?'); p.push(responsible); }
    if (date_from)   { clauses.push('date(ct.created_at) >= ?'); p.push(date_from); }
    if (date_to)     { clauses.push('date(ct.created_at) <= ?'); p.push(date_to); }
    const rows_data = await query(
      `SELECT c.name, c.responsible, c.traffic_source, ct.*
       FROM ab_capital_contratos ct
       JOIN ab_capital_clientes c ON c.id = ct.cliente_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY ct.created_at DESC`, p
    );
    const header = csvRow([
      'Mês Venda','Administradora','Nº Contrato','Cliente','Valor Venda','Data Venda',
      '% Comissão','Parcelas','Valor Comissão Total','Valor Parcela Comissão',
      'Status Comissão','NF Emitida','Empresa','Origem','Data Adesão',
      'Grupo','Cota','Status Contrato','Parcelas Pagas','Parcelas Restantes',
      'Comissão Recebida','A Receber','Responsável','Parceria','Obs Parceria',
    ]);
    const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const rows = rows_data.map(c => {
      const dt = c.data_adesao ? new Date(c.data_adesao) : new Date(c.created_at);
      const mes = isNaN(dt) ? '' : MESES[dt.getMonth()]+'/'+dt.getFullYear();
      const comissaoTotal  = c.credit_value && c.commission_pct ? c.credit_value * c.commission_pct / 100 : null;
      const comissaoMensal = c.comissao_valor || (comissaoTotal && c.installments ? comissaoTotal / c.installments : null);
      const parcRestantes  = (c.installments||0) - (c.parcelas_pagas||0);
      const aReceber       = comissaoMensal ? comissaoMensal * parcRestantes : null;
      return csvRow([
        mes, c.admin_company||'', c.contrato||'', c.name,
        fmtMoney(c.credit_value), fmtDate(c.data_adesao||c.created_at),
        c.commission_pct ? c.commission_pct.toFixed(2)+'%' : '',
        c.installments||'', fmtMoney(comissaoTotal), fmtMoney(comissaoMensal),
        c.comissao_status||'pendente', c.nf_emitida?'Sim':'Não',
        c.empresa||'AB', c.traffic_source||'', fmtDate(c.data_adesao),
        c.grupo||'', c.cota||'',
        c.status_atraso?'Em atraso':c.status||'ativo',
        c.parcelas_pagas||0, parcRestantes,
        fmtMoney(c.comissao_recebida||0), fmtMoney(aReceber),
        c.responsible||'', c.parceria_pct||'', c.parceria_obs||'',
      ]);
    });
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio_vendas_${new Date().toISOString().split('T')[0]}.csv"`);
    res.end(bom + [header, ...rows].join('\r\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /clientes/:id — deleta cliente e todos seus contratos (master only)
router.delete('/clientes/:id', abMaster, async (req, res) => {
  try {
    await run('DELETE FROM ab_capital_contratos WHERE cliente_id = ?', [req.params.id]);
    await run('DELETE FROM ab_capital_clientes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Converte lead em cliente (idempotente) — cria apenas o registro de pessoa
router.post('/leads/:id/convert', abAuth, async (req, res) => {
  try {
    const lead = await queryOne('SELECT * FROM ab_capital_leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    const isUser = req.abSession.role === 'user';
    if (isUser && lead.responsible !== req.abSession.name)
      return res.status(403).json({ error: 'Sem permissão para converter este lead' });

    // Se já foi convertido, retorna o cliente existente
    if (lead.converted_to_client_id) {
      const existing = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [lead.converted_to_client_id]);
      if (existing) {
        const contratos = await query('SELECT * FROM ab_capital_contratos WHERE cliente_id = ? ORDER BY created_at ASC', [existing.id]);
        return res.json({ cliente: { ...existing, contratos }, already_existed: true });
      }
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO ab_capital_clientes
        (id, lead_id, name, phone, email, address,
         responsible, traffic_source, general_info, notes,
         source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'conversao',?,?)`,
      [id, lead.id, lead.name, lead.phone, lead.email||null, lead.address||null,
       lead.responsible||null, lead.traffic_source||null,
       lead.general_info||null, lead.notes||null,
       now, now]
    );

    // Marca o lead como convertido e registra data de fechamento
    await run('UPDATE ab_capital_leads SET converted_to_client_id = ?, won_at = ?, updated_at = ? WHERE id = ?',
      [id, now, now, lead.id]);

    const cliente = await queryOne('SELECT * FROM ab_capital_clientes WHERE id = ?', [id]);
    const contratos = await query('SELECT * FROM ab_capital_contratos WHERE cliente_id = ? ORDER BY created_at ASC', [id]);
    res.json({ cliente: { ...cliente, contratos }, already_existed: false });
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

// ── Configurações (Google Sheets webhook) ─────────────────────────────────────

// GET — retorna webhook_url salvo (para o frontend saber se está configurado)
router.get('/settings/sheets-webhook', abAuth, async (req, res) => {
  const url = process.env.AB_CAPITAL_SHEETS_WEBHOOK || '';
  res.json({ webhook_url: url || null });
});

// PUT — atualiza em memória por env var não é persistente; para persistência
//       salve no .env do VPS e reinicie. Retorna instrução ao usuário.
router.put('/settings/sheets-webhook', abMaster, async (req, res) => {
  const { webhook_url } = req.body;
  if (!webhook_url) return res.status(400).json({ error: 'webhook_url obrigatório' });
  // Persiste no .env temporariamente em runtime
  process.env.AB_CAPITAL_SHEETS_WEBHOOK = webhook_url;
  res.json({ ok: true, note: 'Salvo em memória. Para persistir após restart, adicione AB_CAPITAL_SHEETS_WEBHOOK no .env do servidor.' });
});

// ── Follow-ups ────────────────────────────────────────────────────────────────

const AB_CAPITAL_GROUP_FOLLOWUP = process.env.AB_CAPITAL_GROUP_ID || '120363426868095162@g.us';

// Lista follow-ups de um cliente
router.get('/clientes/:id/followups', abAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM ab_capital_followups WHERE cliente_id = ? ORDER BY scheduled_date ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cria follow-up agendado
router.post('/clientes/:id/followups', abAuth, async (req, res) => {
  try {
    const { scheduled_date, note, cliente_name } = req.body;
    if (!scheduled_date) return res.status(400).json({ error: 'Data obrigatória' });

    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO ab_capital_followups (id, cliente_id, cliente_name, scheduled_date, note, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, req.params.id, cliente_name || 'Cliente', scheduled_date, note || null, req.abSession.name, now]
    );
    const followup = await queryOne('SELECT * FROM ab_capital_followups WHERE id = ?', [id]);
    res.json(followup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deleta follow-up
router.delete('/followups/:id', abAuth, async (req, res) => {
  try {
    await run('DELETE FROM ab_capital_followups WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scheduler: verifica follow-ups pendentes a cada minuto e envia lembrete no grupo
setInterval(async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const due = await query(
      `SELECT * FROM ab_capital_followups WHERE status = 'pending' AND scheduled_date <= ?`,
      [today]
    );
    for (const f of due) {
      try {
        const noteText = f.note ? `\n📝 ${f.note}` : '';
        const msg = `🔔 *Follow-up AB Capital*\n\n📌 Falar com *${f.cliente_name}* hoje!\n👤 Agendado por: ${f.created_by || '—'}${noteText}`;
        await evolutionApi.sendTextMessageFromInstance(
          AB_CAPITAL_NOTIFY_INSTANCE,
          AB_CAPITAL_GROUP_FOLLOWUP,
          msg
        );
        await run(
          `UPDATE ab_capital_followups SET status = 'sent', sent_at = ? WHERE id = ?`,
          [new Date().toISOString(), f.id]
        );
        console.log(`[Follow-up] Lembrete enviado para grupo — cliente: ${f.cliente_name}`);
      } catch (err) {
        console.error(`[Follow-up] Erro ao enviar lembrete (${f.id}):`, err.message);
      }
    }
  } catch (err) {
    console.error('[Follow-up] Scheduler error:', err.message);
  }
}, 60 * 1000);

// ══════════════════════════════════════════════════════════════════
// TAREFAS
// ══════════════════════════════════════════════════════════════════

// Lista tarefas (filtro por usuário para role=user)
router.get('/tasks', abAuth, async (req, res) => {
  try {
    const session = getAbSession(req);
    const { status, priority, lead_id } = req.query;
    let sql = `SELECT * FROM ab_capital_tasks WHERE 1=1`;
    const params = [];
    if (session.role === 'user') { sql += ` AND (assigned_to = ? OR created_by = ?)`; params.push(session.name, session.name); }
    if (status)   { sql += ` AND status = ?`;   params.push(status); }
    if (priority) { sql += ` AND priority = ?`; params.push(priority); }
    if (lead_id)  { sql += ` AND lead_id = ?`;  params.push(lead_id); }
    sql += ` ORDER BY due_date ASC, created_at DESC`;
    const tasks = await query(sql, params);
    res.json(tasks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cria tarefa
router.post('/tasks', abAuth, async (req, res) => {
  try {
    const session = getAbSession(req);
    const { lead_id, lead_name, title, description, due_date, due_time, priority, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: 'Título obrigatório' });
    const id = uuidv4();
    const now = new Date().toISOString();
    await run(
      `INSERT INTO ab_capital_tasks (id, lead_id, lead_name, title, description, due_date, due_time, priority, status, assigned_to, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?)`,
      [id, lead_id || null, lead_name || null, title, description || null, due_date || null,
       due_time || null, priority || 'media', assigned_to || session.name, session.name, now, now]
    );
    const task = await queryOne('SELECT * FROM ab_capital_tasks WHERE id = ?', [id]);
    res.status(201).json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualiza tarefa (status, campos)
router.put('/tasks/:id', abAuth, async (req, res) => {
  try {
    const { title, description, due_date, due_time, priority, status, assigned_to } = req.body;
    const now = new Date().toISOString();
    await run(
      `UPDATE ab_capital_tasks SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        due_date = COALESCE(?, due_date),
        due_time = COALESCE(?, due_time),
        priority = COALESCE(?, priority),
        status = COALESCE(?, status),
        assigned_to = COALESCE(?, assigned_to),
        updated_at = ?
       WHERE id = ?`,
      [title || null, description || null, due_date || null, due_time || null,
       priority || null, status || null, assigned_to || null, now, req.params.id]
    );
    const task = await queryOne('SELECT * FROM ab_capital_tasks WHERE id = ?', [req.params.id]);
    res.json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Deleta tarefa
router.delete('/tasks/:id', abAuth, async (req, res) => {
  try {
    await run('DELETE FROM ab_capital_tasks WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Scheduler de tarefas: envia lista diária no grupo ─────────────────────────
let taskDigestLastSent = '';

async function sendTaskDigest(forceDate) {
  const now = new Date();
  const today = forceDate || now.toISOString().split('T')[0];

  const tasks = await query(
    `SELECT * FROM ab_capital_tasks
     WHERE due_date = ? AND status NOT IN ('concluida', 'cancelada')
     ORDER BY CASE priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, title ASC`,
    [today]
  );

  if (!tasks || tasks.length === 0) return { sent: false, reason: 'Nenhuma tarefa para hoje' };

  const PRIORITY_ICON = { alta: '🔴', media: '🟡', baixa: '🟢' };
  const dateFormatted = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

  let msg;
  if (tasks.length === 1) {
    const t = tasks[0];
    const icon = PRIORITY_ICON[t.priority] || '🟡';
    const timeInfo = t.due_time ? `\n⏰ Horário: ${t.due_time}` : '';
    const leadInfo = t.lead_name ? `\n🎯 Lead: ${t.lead_name}` : '';
    const respInfo = t.assigned_to ? `\n👤 Responsável: ${t.assigned_to}` : '';
    msg = `📋 *Tarefa para hoje — ${dateFormatted}*\n\n${icon} *${t.title}*${timeInfo}${leadInfo}${respInfo}`;
  } else {
    const lista = tasks.map((t, i) => {
      const icon = PRIORITY_ICON[t.priority] || '🟡';
      const time = t.due_time ? ` ⏰${t.due_time}` : '';
      const resp = t.assigned_to ? ` (${t.assigned_to})` : '';
      const lead = t.lead_name ? ` — ${t.lead_name}` : '';
      return `${i + 1}. ${icon} *${t.title}*${time}${lead}${resp}`;
    }).join('\n');
    msg = `📋 *Tarefas para hoje — ${dateFormatted}*\n\n${lista}\n\n_${tasks.length} tarefas pendentes_`;
  }

  await evolutionApi.sendTextMessageFromInstance(AB_CAPITAL_NOTIFY_INSTANCE, AB_CAPITAL_GROUP_ID, msg);
  console.log(`[Tasks] Digest enviado — ${tasks.length} tarefa(s)`);
  return { sent: true, tasks: tasks.length, msg };
}

// Rota de teste (só master/admin)
router.post('/tasks/test-notify', abAuth, abMaster, async (req, res) => {
  try {
    const result = await sendTaskDigest(req.body.date || null);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Disparo automático diário às 08:00
setInterval(async () => {
  try {
    const now = new Date();
    if (now.getHours() !== 8 || now.getMinutes() !== 0) return;
    const today = now.toISOString().split('T')[0];
    if (taskDigestLastSent === today) return;
    await sendTaskDigest(today);
    taskDigestLastSent = today;
  } catch (err) {
    console.error('[Tasks] Scheduler error:', err.message);
  }
}, 60 * 1000);

export default router;
