import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run } from '../db/database.js';

const router = express.Router();

// GET /contacts - listar todos
router.get('/', async (req, res) => {
  try {
    const { search, stage, tag, status, limit = 100, offset = 0 } = req.query;

    const wheres = [];
    const params = [];

    // Por padrão esconde "pessoais" (status='pessoal'); passar ?status=pessoal lista só eles
    if (status) {
      wheres.push('status = ?');
      params.push(status);
    } else {
      wheres.push("(status IS NULL OR status <> 'pessoal')");
    }

    if (search) {
      wheres.push('(name ILIKE ? OR phone ILIKE ? OR email ILIKE ? OR company ILIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (stage) {
      wheres.push('pipeline_stage = ?');
      params.push(stage);
    }
    if (tag) {
      wheres.push('tags LIKE ?');
      params.push(`%"${tag}"%`);
    }

    const whereSql = ' WHERE ' + wheres.join(' AND ');

    const contacts = await query('SELECT * FROM contacts' + whereSql + ' ORDER BY updated_at DESC LIMIT ? OFFSET ?', [...params, Number(limit), Number(offset)]);
    const totalData = await queryOne('SELECT COUNT(*) as count FROM contacts' + whereSql, params);
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

    // Dispara evento CAPI quando o contato avança para Reunião Agendada / Ganho
    if ((updated.pipeline_stage || '') !== (contact.pipeline_stage || '')) {
      import('../services/metaCapiService.js').then((m) => m.fireStageEvent(updated, contact.pipeline_stage)).catch(() => {});
    }

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
    const before = await queryOne('SELECT * FROM contacts WHERE id = ?', [req.params.id]).catch(() => null);
    await run(`UPDATE contacts SET pipeline_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [stage, req.params.id]);

    // Dispara evento CAPI no avanço de pipeline (Reunião Agendada → Lead, Ganho → Purchase)
    if (before && (before.pipeline_stage || '') !== (stage || '')) {
      const after = await queryOne('SELECT * FROM contacts WHERE id = ?', [req.params.id]).catch(() => null);
      if (after) {
        import('../services/metaCapiService.js').then((m) => m.fireStageEvent(after, before.pipeline_stage)).catch(() => {});
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /contacts/:id/stage error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /contacts/:id/personal — marca contato como pessoal: SDR nunca atende + some da pipeline
router.patch('/:id/personal', async (req, res) => {
  try {
    const contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [req.params.id]);
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

    const digits = String(contact.phone || '').replace(/\D/g, '');
    if (digits && digits.length >= 10) {
      const variants = [digits];
      // Sem o 9º dígito (BR fixo), pra casar com qualquer formato que o WhatsApp use
      if (digits.length === 13 && digits.startsWith('55')) {
        variants.push(digits.slice(0, 4) + digits.slice(5));
      }
      for (const v of variants) {
        await run(
          `INSERT INTO personal_ignore (phone, name, created_at) VALUES (?, ?, NOW())
           ON CONFLICT (phone) DO NOTHING`,
          [v, (contact.name || 'pessoal').slice(0, 200)]
        );
      }
    }

    // Arquiva: sai do kanban (pipeline_stage NULL), mantém histórico/conversas
    await run(`UPDATE contacts SET status = 'pessoal', pipeline_stage = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);

    res.json({ success: true, ignored: !!digits });
  } catch (err) {
    console.error('PATCH /contacts/:id/personal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /contacts/:id
router.delete('/:id', async (req, res) => {
  try {
    // Apaga em cascata: mensagens → conversas → atividades/lembretes → contato
    await run('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id = ?)', [req.params.id]);
    await run('DELETE FROM conversations WHERE contact_id = ?', [req.params.id]);
    await run('DELETE FROM activities WHERE contact_id = ?', [req.params.id]).catch(() => {});
    await run('DELETE FROM reminders WHERE contact_id = ?', [req.params.id]).catch(() => {});
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
