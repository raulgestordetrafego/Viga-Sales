import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run } from '../db/database.js';
import * as emailService from '../services/emailService.js';
import multer from 'multer';
import Papa from 'papaparse';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    cb(null, allowed.includes(file.mimetype));
  },
});

function auth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  next();
}

// ─── Tracking pixels / clicks ──────────────────────────────────────────────────
router.get('/track/open/:logId.gif', async (req, res) => {
  try {
    await emailService.handleOpenTracking(req.params.logId);
  } catch (_) {}
  const pixel = Buffer.from('R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');
  res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache, no-store', 'Content-Length': pixel.length });
  res.end(pixel);
});

router.get('/track/click/:logId', async (req, res) => {
  try {
    await emailService.handleClickTracking(req.params.logId, req.query.url);
  } catch (_) {}
  const redirectUrl = req.query.url || 'https://vigasales.com.br';
  res.redirect(302, redirectUrl);
});

// ─── Templates ──────────────────────────────────────────────────────────────────
router.get('/templates', auth, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM email_templates ORDER BY updated_at DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/templates/:id', auth, async (req, res) => {
  try {
    const t = await queryOne('SELECT * FROM email_templates WHERE id = ?', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    res.json(t);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/templates', auth, async (req, res) => {
  try {
    const { name, subject, body_html } = req.body;
    if (!name || !subject || !body_html) return res.status(400).json({ error: 'name, subject e body_html obrigatórios' });
    const id = uuidv4();
    await run('INSERT INTO email_templates (id, name, subject, body_html) VALUES (?, ?, ?, ?)', [id, name, subject, body_html]);
    const t = await queryOne('SELECT * FROM email_templates WHERE id = ?', [id]);
    res.json(t);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/templates/:id', auth, async (req, res) => {
  try {
    const { name, subject, body_html } = req.body;
    await run('UPDATE email_templates SET name=?, subject=?, body_html=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [name, subject, body_html, req.params.id]);
    const t = await queryOne('SELECT * FROM email_templates WHERE id = ?', [req.params.id]);
    res.json(t);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/templates/:id', auth, async (req, res) => {
  try {
    await run('DELETE FROM email_templates WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Lists (CSV Upload) ────────────────────────────────────────────────────────
router.get('/lists', auth, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM email_lists ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/lists/:id', auth, async (req, res) => {
  try {
    const list = await queryOne('SELECT * FROM email_lists WHERE id = ?', [req.params.id]);
    if (!list) return res.status(404).json({ error: 'Lista não encontrada' });
    const recipients = await query(
      'SELECT id, email, name, company, extra_data, status FROM email_recipients WHERE list_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ ...list, recipients });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/upload-list', auth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Arquivo CSV obrigatório' });
    const csvText = file.buffer.toString('utf-8');
    const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    if (!result.data?.length) return res.status(400).json({ error: 'CSV vazio ou inválido' });
    const rows = result.data;
    const emailCol = Object.keys(rows[0] || {}).find(k => k.toLowerCase().includes('email')) || Object.keys(rows[0] || {})[0];
    const nameCol = Object.keys(rows[0] || {}).find(k => k.toLowerCase().includes('nome') || k.toLowerCase().includes('name'));
    const companyCol = Object.keys(rows[0] || {}).find(k => k.toLowerCase().includes('empresa') || k.toLowerCase().includes('company') || k.toLowerCase().includes('organiza'));

    if (!emailCol) return res.status(400).json({ error: 'Coluna de email não encontrada no CSV' });

    const listId = uuidv4();
    const listName = req.body.name || file.originalname.replace(/\.csv$/i, '');
    await run('INSERT INTO email_lists (id, name, file_name, recipient_count) VALUES (?, ?, ?, ?)', [listId, listName, file.originalname, rows.length]);

    for (const row of rows) {
      const email = String(row[emailCol] || '').trim().toLowerCase();
      if (!email || !email.includes('@')) continue;
      const name = nameCol ? String(row[nameCol] || '').trim() : '';
      const company = companyCol ? String(row[companyCol] || '').trim() : '';
      const extraData = {};
      for (const k of Object.keys(row)) {
        if (![emailCol, nameCol, companyCol].includes(k) && row[k]) {
          extraData[k.toLowerCase().replace(/[^a-z0-9_]/g, '_')] = String(row[k]).trim();
        }
      }
      try {
        await run('INSERT INTO email_recipients (id, list_id, email, name, company, extra_data) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), listId, email, name, company, JSON.stringify(extraData)]);
      } catch (_) { /* skip duplicate */ }
    }

    const count = await queryOne('SELECT COUNT(*) as cnt FROM email_recipients WHERE list_id = ?', [listId]);
    await run('UPDATE email_lists SET recipient_count = ? WHERE id = ?', [count?.cnt || 0, listId]);
    const list = await queryOne('SELECT * FROM email_lists WHERE id = ?', [listId]);
    res.json({ ...list, recipients_preview: count?.cnt || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/import-from-prospects', auth, async (req, res) => {
  try {
    const { name, segment, city, limit } = req.body;
    const listName = name || `Prospects ${segment || city || 'Todos'} - ${new Date().toLocaleDateString('pt-BR')}`;
    const listId = uuidv4();

    let sql = `SELECT id, name, email, company, segment, city, phone, instagram, website, address FROM prospects WHERE email IS NOT NULL AND email != '' AND email LIKE '%@%'`;
    const params = [];
    if (segment) { sql += ` AND segment = ?`; params.push(segment); }
    if (city) { sql += ` AND city = ?`; params.push(city); }
    if (limit) { sql += ` LIMIT ?`; params.push(parseInt(limit)); }

    const prospects = await query(sql, params);
    if (!prospects.length) return res.status(400).json({ error: 'Nenhum prospect com email encontrado' });

    await run('INSERT INTO email_lists (id, name, file_name, recipient_count) VALUES (?, ?, ?, ?)', [listId, listName, 'prospects-db-import', prospects.length]);

    let imported = 0;
    for (const p of prospects) {
      try {
        const extraData = {
          segment: p.segment || '', cidade: p.city || '', telefone: p.phone || '', instagram: p.instagram || '', website: p.website || '', endereco: p.address || ''
        };
        await run('INSERT INTO email_recipients (id, list_id, email, name, company, extra_data) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), listId, p.email.toLowerCase().trim(), p.name || '', p.company || '', JSON.stringify(extraData)]);
        imported++;
      } catch (_) { /* skip duplicate */ }
    }

    await run('UPDATE email_lists SET recipient_count = ? WHERE id = ?', [imported, listId]);
    const list = await queryOne('SELECT * FROM email_lists WHERE id = ?', [listId]);
    res.json({ ...list, imported });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/import-segments', auth, async (req, res) => {
  try {
    const segs = await query("SELECT segment, COUNT(*) as cnt FROM prospects WHERE email IS NOT NULL AND email != '' AND email LIKE '%@%' GROUP BY segment ORDER BY cnt DESC");
    res.json(segs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/lists/:id', auth, async (req, res) => {
  try {
    await run('DELETE FROM email_send_logs WHERE recipient_id IN (SELECT id FROM email_recipients WHERE list_id = ?)', [req.params.id]);
    await run('DELETE FROM email_recipients WHERE list_id = ?', [req.params.id]);
    await run('DELETE FROM email_lists WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Campaigns ──────────────────────────────────────────────────────────────────
router.get('/campaigns', auth, async (req, res) => {
  try {
    const rows = await query('SELECT c.*, l.name as list_name, l.recipient_count as list_count FROM email_campaigns c LEFT JOIN email_lists l ON c.list_id = l.id ORDER BY c.updated_at DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/campaigns/:id', auth, async (req, res) => {
  try {
    const c = await queryOne('SELECT c.*, l.name as list_name, l.recipient_count as list_count FROM email_campaigns c LEFT JOIN email_lists l ON c.list_id = l.id WHERE c.id = ?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada' });
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/campaigns', auth, async (req, res) => {
  try {
    const { name, template_id, list_id, subject, body_html, sender_name, sender_email, reply_to, daily_limit, time_start, time_end, days_of_week, min_delay_sec, max_delay_sec, use_ai_variation, ai_variation_prompt } = req.body;
    if (!name || !subject || !body_html || !list_id) return res.status(400).json({ error: 'name, subject, body_html e list_id obrigatórios' });
    const id = uuidv4();
    const listCount = await queryOne('SELECT COUNT(*) as cnt FROM email_recipients WHERE list_id = ?', [list_id]);

    await run(
      `INSERT INTO email_campaigns (id, name, template_id, list_id, subject, body_html, sender_name, sender_email, reply_to, daily_limit, time_start, time_end, days_of_week, min_delay_sec, max_delay_sec, use_ai_variation, ai_variation_prompt, total_recipients)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, template_id || null, list_id, subject, body_html,
        sender_name || 'Viga Sales', sender_email || 'contato@vigasales.com.br', reply_to || null,
        daily_limit || 50, time_start || '08:00', time_end || '18:00',
        days_of_week ? JSON.stringify(days_of_week) : '[1,2,3,4,5]',
        min_delay_sec ?? 30, max_delay_sec ?? 120,
        use_ai_variation ? 1 : 0, ai_variation_prompt || null, listCount?.cnt || 0]
    );
    const c = await queryOne('SELECT * FROM email_campaigns WHERE id = ?', [id]);
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/campaigns/:id', auth, async (req, res) => {
  try {
    const { name, template_id, list_id, subject, body_html, sender_name, sender_email, reply_to, daily_limit, time_start, time_end, days_of_week, min_delay_sec, max_delay_sec, use_ai_variation, ai_variation_prompt } = req.body;
    const existing = await queryOne('SELECT * FROM email_campaigns WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Campanha não encontrada' });
    const totalRecipients = list_id ? (await queryOne('SELECT COUNT(*) as cnt FROM email_recipients WHERE list_id = ?', [list_id]))?.cnt || 0 : existing.total_recipients;

    await run(
      `UPDATE email_campaigns SET name=?, template_id=?, list_id=?, subject=?, body_html=?, sender_name=?, sender_email=?, reply_to=?, daily_limit=?, time_start=?, time_end=?, days_of_week=?, min_delay_sec=?, max_delay_sec=?, use_ai_variation=?, ai_variation_prompt=?, total_recipients=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [name, template_id || null, list_id, subject, body_html,
        sender_name || 'Viga Sales', sender_email || 'contato@vigasales.com.br', reply_to || null,
        daily_limit || 50, time_start || '08:00', time_end || '18:00',
        days_of_week ? JSON.stringify(days_of_week) : '[1,2,3,4,5]',
        min_delay_sec ?? 30, max_delay_sec ?? 120,
        use_ai_variation ? 1 : 0, ai_variation_prompt || null, totalRecipients, req.params.id]
    );
    const c = await queryOne('SELECT * FROM email_campaigns WHERE id = ?', [req.params.id]);
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/campaigns/:id', auth, async (req, res) => {
  try {
    await run('DELETE FROM email_send_logs WHERE campaign_id = ?', [req.params.id]);
    await run('DELETE FROM email_campaigns WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/campaigns/:id/start', auth, async (req, res) => {
  try {
    const c = await queryOne('SELECT * FROM email_campaigns WHERE id = ?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (c.status === 'active') return res.json({ ok: true, message: 'Já está ativa' });
    await run(`UPDATE email_campaigns SET status='active', started_at=COALESCE(started_at, datetime('now')), sent_count=0, sent_today=0, send_count_reset_date=datetime('now'), updated_at=CURRENT_TIMESTAMP WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/campaigns/:id/pause', auth, async (req, res) => {
  try {
    await run(`UPDATE email_campaigns SET status='paused', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/campaigns/:id/retry', auth, async (req, res) => {
  try {
    await run(`UPDATE email_recipients SET status='pending' WHERE list_id IN (SELECT list_id FROM email_campaigns WHERE id=?) AND status='failed'`, [req.params.id]);
    await run(`UPDATE email_send_logs SET status='pending', error=NULL WHERE campaign_id=? AND status='failed'`, [req.params.id]);
    await run(`UPDATE email_campaigns SET status='active' WHERE id=? AND status='completed'`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/campaigns/:id/logs', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const logs = await query(
      `SELECT l.*, r.email, r.name as recipient_name, r.company as recipient_company
       FROM email_send_logs l JOIN email_recipients r ON l.recipient_id = r.id
       WHERE l.campaign_id = ? ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [req.params.id, limit, offset]
    );
    const total = (await queryOne('SELECT COUNT(*) as cnt FROM email_send_logs WHERE campaign_id = ?', [req.params.id]))?.cnt || 0;
    res.json({ logs, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/campaigns/:id/stats', auth, async (req, res) => {
  try {
    const c = await queryOne('SELECT * FROM email_campaigns WHERE id = ?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada' });
    const statusCounts = await query(`SELECT status, COUNT(*) as cnt FROM email_send_logs WHERE campaign_id = ? GROUP BY status`, [req.params.id]);
    const pendingCount = (await queryOne(
      `SELECT COUNT(*) as cnt FROM email_recipients r WHERE r.list_id = ? AND r.status = 'pending' AND NOT EXISTS (SELECT 1 FROM email_send_logs l WHERE l.recipient_id = r.id AND l.status = 'sent')`,
      [c.list_id]
    ))?.cnt || 0;
    res.json({ ...c, status_breakdown: statusCounts, pending_count: pendingCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Dashboard Stats ────────────────────────────────────────────────────────────
router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await emailService.getDashboardStats();
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Preview inline ─────────────────────────────────────────────────────────────
router.post('/preview', auth, async (req, res) => {
  try {
    const { subject, body_html, recipient_sample } = req.body;
    let finalSubject = subject || '';
    let finalBody = body_html || '';
    if (recipient_sample) {
      const r = { name: recipient_sample.name || 'João Exemplo', company: recipient_sample.company || 'Empresa Exemplo', email: recipient_sample.email || 'exemplo@email.com', extra_data: recipient_sample.extra_data || '{}' };
      finalSubject = emailService.resolveVariables(emailService.resolveSpintax(finalSubject), r);
      finalBody = emailService.resolveVariables(emailService.resolveSpintax(finalBody), r);
    }
    res.json({ subject: finalSubject, body: finalBody });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
