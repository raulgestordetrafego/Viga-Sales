import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run } from '../db/database.js';
import evolutionApi from '../services/evolutionApi.js';

const router = express.Router();

// GET /broadcasts
router.get('/', async (req, res) => {
  try {
    const broadcasts = await query('SELECT * FROM broadcasts ORDER BY created_at DESC');
    res.json(broadcasts.map(parseBroadcast));
  } catch (err) {
    console.error('GET /broadcasts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /broadcasts/:id
router.get('/:id', async (req, res) => {
  try {
    const broadcast = await queryOne('SELECT * FROM broadcasts WHERE id = ?', [req.params.id]);
    if (!broadcast) return res.status(404).json({ error: 'Disparo não encontrado' });
    const logs = await query(`
      SELECT bl.*, c.name as contact_name FROM broadcast_logs bl
      JOIN contacts c ON bl.contact_id = c.id
      WHERE bl.broadcast_id = ? ORDER BY bl.sent_at DESC
    `, [req.params.id]);
    res.json({ ...parseBroadcast(broadcast), logs });
  } catch (err) {
    console.error('GET /broadcasts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /broadcasts
router.post('/', async (req, res) => {
  try {
    const { name, message, media_url, media_type, target_tags = [], target_contacts = [], scheduled_at } = req.body;

    if (!name || !message) return res.status(400).json({ error: 'Nome e mensagem são obrigatórios' });

    const id = uuidv4();
    await run(`
      INSERT INTO broadcasts (id, name, message, media_url, media_type, target_tags, target_contacts, scheduled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, message, media_url || null, media_type || null, JSON.stringify(target_tags), JSON.stringify(target_contacts), scheduled_at || null]);

    const broadcast = await queryOne('SELECT * FROM broadcasts WHERE id = ?', [id]);
    res.status(201).json(parseBroadcast(broadcast));
  } catch (err) {
    console.error('POST /broadcasts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /broadcasts/:id/send - disparar
router.post('/:id/send', async (req, res) => {
  try {
    const broadcast = await queryOne('SELECT * FROM broadcasts WHERE id = ?', [req.params.id]);
    if (!broadcast) return res.status(404).json({ error: 'Disparo não encontrado' });
    if (broadcast.status === 'running') return res.status(400).json({ error: 'Disparo já em andamento' });

    const parsed = parseBroadcast(broadcast);

    // Resolver contatos-alvo
    let contacts = [];
    if (parsed.target_contacts.length > 0) {
      const placeholders = parsed.target_contacts.map(() => '?').join(',');
      contacts = await query(`SELECT * FROM contacts WHERE id IN (${placeholders}) AND status = 'active'`, parsed.target_contacts);
    } else if (parsed.target_tags.length > 0) {
      const allContacts = await query("SELECT * FROM contacts WHERE status = 'active'");
      contacts = allContacts.filter(c => {
        const tags = JSON.parse(typeof c.tags === 'string' ? c.tags : '[]');
        return parsed.target_tags.some(t => tags.includes(t));
      });
    } else {
      contacts = await query("SELECT * FROM contacts WHERE status = 'active'");
    }

    if (contacts.length === 0) return res.status(400).json({ error: 'Nenhum contato encontrado para os critérios' });

    // Criar logs
    for (const c of contacts) {
      await run('INSERT INTO broadcast_logs (id, broadcast_id, contact_id, phone, status) VALUES (?, ?, ?, ?, ?)', [uuidv4(), broadcast.id, c.id, c.phone, 'pending']);
    }

    await run(`UPDATE broadcasts SET status = 'running', started_at = CURRENT_TIMESTAMP, total_count = ? WHERE id = ?`, [contacts.length, broadcast.id]);

    // Disparar em background com delay entre mensagens
    res.json({ success: true, total: contacts.length, message: 'Disparo iniciado!' });

    // Processar em background
    processBroadcast(broadcast.id, parsed.message, parsed.media_url, parsed.media_type);
  } catch (err) {
    console.error('POST /broadcasts/:id/send error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /broadcasts/:id
router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM broadcasts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /broadcasts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: processar disparo em background ──────────────────────────────────

async function processBroadcast(broadcastId, message, mediaUrl, mediaType) {
  const logs = await query("SELECT * FROM broadcast_logs WHERE broadcast_id = ? AND status = 'pending'", [broadcastId]);

  let sent = 0, failed = 0;
  for (const log of logs) {
    try {
      // Delay de 2-5s entre mensagens para evitar ban
      await sleep(2000 + Math.random() * 3000);

      if (mediaUrl && mediaType === 'image') {
        await evolutionApi.sendImageMessage(log.phone, mediaUrl, message);
      } else {
        await evolutionApi.sendTextMessage(log.phone, message);
      }

      await run("UPDATE broadcast_logs SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?", [log.id]);
      sent++;
    } catch (err) {
      await run("UPDATE broadcast_logs SET status = 'failed', error = ? WHERE id = ?", [err.message, log.id]);
      failed++;
    }

    await run('UPDATE broadcasts SET sent_count = ?, failed_count = ? WHERE id = ?', [sent, failed, broadcastId]);
  }

  await run("UPDATE broadcasts SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ?", [broadcastId]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseBroadcast(b) {
  if (!b) return null;
  let target_tags = [];
  let target_contacts = [];
  
  try {
    if (typeof b.target_tags === 'string') {
      target_tags = JSON.parse(b.target_tags || '[]');
    } else if (Array.isArray(b.target_tags)) {
      target_tags = b.target_tags;
    }

    if (typeof b.target_contacts === 'string') {
      target_contacts = JSON.parse(b.target_contacts || '[]');
    } else if (Array.isArray(b.target_contacts)) {
      target_contacts = b.target_contacts;
    }
  } catch (e) {
    console.warn("Failed to parse broadcast targets:", e.message);
  }

  return {
    ...b,
    target_tags,
    target_contacts,
  };
}

export default router;
