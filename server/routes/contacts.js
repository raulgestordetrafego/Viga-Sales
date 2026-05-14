import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run } from '../db/database.js';

const router = express.Router();

// GET /contacts - listar todos
router.get('/', async (req, res) => {
  try {
    const { search, stage, tag, limit = 100, offset = 0 } = req.query;

    let sql = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (name ILIKE ? OR phone ILIKE ? OR email ILIKE ? OR company ILIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (stage) {
      sql += ' AND pipeline_stage = ?';
      params.push(stage);
    }
    if (tag) {
      sql += ' AND tags LIKE ?';
      params.push(`%"${tag}"%`);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const contacts = await query(sql, params);
    const totalData = await queryOne('SELECT COUNT(*) as count FROM contacts');
    const total = parseInt(totalData?.count || 0);

    res.json({ contacts: contacts.map(parseContact), total });
  } catch (err) {
    console.error('GET /contacts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /contacts/:id
// GET /contacts/phone/:phone — busca contato pelo número (usado pelo n8n)
router.get('/phone/:phone', async (req, res) => {
  try {
    const clean = String(req.params.phone).replace(/\D/g, '');
    const contact = await queryOne(
      'SELECT * FROM contacts WHERE phone = ? OR phone LIKE ?',
      [clean, `%${clean.slice(-8)}`]
    );
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
    res.json(parseContact(contact));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

    const activities = await query('SELECT * FROM activities WHERE contact_id = ? ORDER BY created_at DESC', [req.params.id]);
    const conversation = await queryOne('SELECT * FROM conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1', [req.params.id]);

    res.json({ ...parseContact(contact), activities, conversation });
  } catch (err) {
    console.error('GET /contacts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /contacts
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, company, tags = [], notes, pipeline_stage, pipeline_value, assigned_to } = req.body;

    if (!name || !phone) return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });

    const id = uuidv4();
    await run(`
      INSERT INTO contacts (id, name, phone, email, company, tags, notes, pipeline_stage, pipeline_value, assigned_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, phone, email || null, company || null, JSON.stringify(tags), notes || null, pipeline_stage || 'stage_lead', pipeline_value || 0, assigned_to || null]);

    const contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
    res.status(201).json(parseContact(contact));
  } catch (err) {
    console.error('POST /contacts error:', err);
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Telefone já cadastrado' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /contacts/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, company, tags, notes, pipeline_stage, pipeline_value, assigned_to, status } = req.body;

    const contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

    await run(`
      UPDATE contacts SET
        name = ?, phone = ?, email = ?, company = ?, tags = ?, notes = ?,
        pipeline_stage = ?, pipeline_value = ?, assigned_to = ?, status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name ?? contact.name,
      phone ?? contact.phone,
      email ?? contact.email,
      company ?? contact.company,
      tags ? JSON.stringify(tags) : contact.tags,
      notes ?? contact.notes,
      pipeline_stage ?? contact.pipeline_stage,
      pipeline_value ?? contact.pipeline_value,
      assigned_to ?? contact.assigned_to,
      status ?? contact.status,
      req.params.id
    ]);

    const updated = await queryOne('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    res.json(parseContact(updated));
  } catch (err) {
    console.error('PUT /contacts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /contacts/:id/stage - mover no pipeline
router.patch('/:id/stage', async (req, res) => {
  try {
    const { stage } = req.body;
    await run(`UPDATE contacts SET pipeline_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [stage, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /contacts/:id/stage error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /contacts/:id
router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /contacts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /contacts/:id/activities
router.post('/:id/activities', async (req, res) => {
  try {
    const { type, title, description, due_date } = req.body;
    const id = uuidv4();
    await run(`INSERT INTO activities (id, contact_id, type, title, description, due_date) VALUES (?, ?, ?, ?, ?, ?)`, [id, req.params.id, type, title, description || null, due_date || null]);
    const activity = await queryOne('SELECT * FROM activities WHERE id = ?', [id]);
    res.status(201).json(activity);
  } catch (err) {
    console.error('POST /contacts/:id/activities error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /contacts/stats/pipeline
router.get('/stats/pipeline', async (req, res) => {
  try {
    const stages = await query('SELECT * FROM pipeline_stages ORDER BY position');
    const counts = await query(
      'SELECT pipeline_stage, COUNT(*) as count, SUM(pipeline_value) as value FROM contacts GROUP BY pipeline_stage'
    );
    const countMap = {};
    counts.forEach(r => { countMap[r.pipeline_stage] = { count: parseInt(r.count||0), value: parseFloat(r.value||0) }; });
    res.json(stages.map(s => ({ ...s, count: countMap[s.id]?.count||0, value: countMap[s.id]?.value||0 })));
  } catch (err) {
    console.error('GET /contacts/stats/pipeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

function parseContact(c) {
  if (!c) return null;
  let tags = [];
  try {
    if (typeof c.tags === 'string') {
      tags = JSON.parse(c.tags || '[]');
    } else if (Array.isArray(c.tags)) {
      tags = c.tags;
    }
  } catch (e) {
    console.warn("Failed to parse contact tags:", e.message);
  }
  return { ...c, tags };
}

export default router;
