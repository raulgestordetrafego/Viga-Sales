/**
 * AB Capital — Rotas backend
 * Auth separada | Leads da landing page | Prospecção ativa | Pipeline CRM
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { query, queryOne, run } from '../db/database.js';

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

// ── Leads (captura da landing page — rota PÚBLICA) ───────────────────────────

router.post('/leads/public', async (req, res) => {
  try {
    const { name, phone, email, objective } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Nome e telefone obrigatórios' });

    const cleanPhone = String(phone).replace(/\D/g, '');
    const id = uuidv4();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO ab_capital_leads (id, name, phone, email, objective, source, pipeline_stage, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'landing', 'novo', ?, ?)`,
      [id, name.trim(), cleanPhone, email?.trim() || null, objective || null, now, now]
    );

    console.log(`[AB Capital] Novo lead: ${name} | ${cleanPhone}`);
    res.json({ ok: true, id });
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
    let sql = 'SELECT * FROM ab_capital_leads WHERE 1=1';
    const params = [];
    if (stage) { sql += ' AND pipeline_stage = ?'; params.push(stage); }
    if (search) {
      sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);
    const leads = await query(sql, params);
    const [{ total }] = await query(
      'SELECT COUNT(*) as total FROM ab_capital_leads WHERE 1=1' +
      (stage ? ' AND pipeline_stage = ?' : '') +
      (search ? ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)' : ''),
      [...(stage ? [stage] : []), ...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [])]
    );
    res.json({ leads, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leads/stats', abAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [totalRow] = await query('SELECT COUNT(*) as c FROM ab_capital_leads', []);
    const [todayRow] = await query(
      "SELECT COUNT(*) as c FROM ab_capital_leads WHERE date(created_at) = ?", [today]
    );
    const stages = await query(
      'SELECT pipeline_stage, COUNT(*) as c FROM ab_capital_leads GROUP BY pipeline_stage', []
    );
    const [prosTotal] = await query('SELECT COUNT(*) as c FROM ab_capital_prospects', []);
    res.json({
      total_leads: totalRow.c,
      leads_today: todayRow.c,
      stages,
      total_prospects: prosTotal.c,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/leads/:id', abAuth, async (req, res) => {
  try {
    const { pipeline_stage, notes } = req.body;
    const now = new Date().toISOString();
    await run(
      'UPDATE ab_capital_leads SET pipeline_stage = ?, notes = ?, updated_at = ? WHERE id = ?',
      [pipeline_stage, notes, now, req.params.id]
    );
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

export default router;
