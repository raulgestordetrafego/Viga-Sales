import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, queryOne, run } from '../db/database.js';
import evolutionApi from '../services/evolutionApi.js';
import * as metaApi from '../services/metaWhatsapp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../uploads');

// Salva base64 como arquivo, retorna URL pública
function saveBase64File(base64DataUri, type) {
  // Suporta mimetypes com parâmetros ex: "audio/webm;codecs=opus"
  const semiIdx = base64DataUri.indexOf(';base64,');
  if (!base64DataUri.startsWith('data:') || semiIdx === -1) throw new Error('Formato base64 inválido');
  const mimeType = base64DataUri.slice(5, semiIdx); // ex: "audio/webm;codecs=opus"
  const data = base64DataUri.slice(semiIdx + 8);    // dados após ";base64,"
  const baseMime = mimeType.split(';')[0];           // ex: "audio/webm"
  const ext = baseMime.split('/')[1] || (type === 'audio' ? 'webm' : 'bin');
  const filename = `${uuidv4()}.${ext}`;
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(data, 'base64'));
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return `${appUrl}/uploads/${filename}`;
}

const router = express.Router();

// GET /conversations
router.get('/', async (req, res) => {
  try {
    const { status, assigned_to } = req.query;
    const user = req.user;

    let sql = `
      SELECT c.*, ct.name as contact_name, ct.phone as contact_phone, ct.avatar as contact_avatar
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      WHERE 1=1
    `;
    const params = [];

    // Instance access control: non-master users only see conversations from their permitted instances
    if (user && user.role !== 'master') {
      const perms = await query(
        'SELECT instance_id FROM user_instance_permissions WHERE user_id = ?',
        [user.userId]
      );
      const allowedIds = perms.map(p => p.instance_id);
      if (allowedIds.length === 0) {
        // User has no instance permissions — return empty list
        return res.json([]);
      }
      sql += ` AND (c.instance_id IN (${allowedIds.map(() => '?').join(',')}) OR c.instance_id IS NULL)`;
      params.push(...allowedIds);
    }

    if (status) {
      sql += ' AND c.status = ?';
      params.push(status);
    }
    if (assigned_to) {
      sql += ' AND c.assigned_to = ?';
      params.push(assigned_to);
    }
    sql += ' ORDER BY c.last_message_at DESC NULLS LAST';

    const convs = await query(sql, params);
    res.json(convs);
  } catch (err) {
    console.error('GET /conversations error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /conversations/:id/messages
router.get('/:id/messages', async (req, res) => {
  try {
    const { limit = 50, before } = req.query;
    let sql = 'SELECT * FROM messages WHERE conversation_id = ?';
    const params = [req.params.id];

    if (before) { 
      sql += ' AND timestamp < ?'; 
      params.push(before); 
    }
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(Number(limit));

    const messages = await query(sql, params);
    res.json(messages.reverse());
  } catch (err) {
    console.error('GET /conversations/:id/messages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /conversations/:id/messages - enviar mensagem (Meta oficial ou Evolution)
router.post('/:id/messages', async (req, res) => {
  try {
    const { content, type = 'text', media_url } = req.body;

    const conv = await queryOne(`
      SELECT c.*, ct.phone FROM conversations c JOIN contacts ct ON c.contact_id = ct.id WHERE c.id = ?
    `, [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    const useMeta = metaApi.isConfigured();

    let result;
    let savedMediaUrl = media_url || null;
    let wamid = null;

    if (type === 'text') {
      if (useMeta) {
        result = await metaApi.sendText(conv.phone, content);
        wamid = result?.messages?.[0]?.id || null;
      } else {
        result = await evolutionApi.sendTextMessage(conv.phone, content);
        wamid = result?.key?.id || null;
      }
    } else if (type === 'image') {
      if (useMeta) {
        let imageUrl = media_url;
        if (req.body.base64) {
          try { imageUrl = saveBase64File(req.body.base64, type); savedMediaUrl = imageUrl; } catch(_) {}
        }
        result = await metaApi.sendImage(conv.phone, imageUrl, content);
        wamid = result?.messages?.[0]?.id || null;
      } else {
        const imgData = req.body.base64 || media_url;
        result = await evolutionApi.sendImageMessage(conv.phone, imgData, content);
        wamid = result?.key?.id || null;
        if (req.body.base64) {
          try { savedMediaUrl = saveBase64File(req.body.base64, type); } catch(_) {}
        }
      }
    } else if (type === 'audio') {
      if (useMeta) {
        let audioUrl = media_url;
        if (req.body.base64) {
          try {
            audioUrl = saveBase64File(req.body.base64, type);
            savedMediaUrl = audioUrl;
            result = await metaApi.sendAudio(conv.phone, audioUrl);
            wamid = result?.messages?.[0]?.id || null;
          } catch(e) {
            return res.status(400).json({ error: 'Arquivo inválido: ' + e.message });
          }
        } else {
          result = await metaApi.sendAudio(conv.phone, audioUrl);
          wamid = result?.messages?.[0]?.id || null;
        }
      } else {
        if (req.body.base64) {
          try {
            const audioUrl = saveBase64File(req.body.base64, type);
            savedMediaUrl = audioUrl;
            result = await evolutionApi.sendAudioMessage(conv.phone, audioUrl);
            wamid = result?.key?.id || null;
          } catch(e) {
            return res.status(400).json({ error: 'Arquivo inválido: ' + e.message });
          }
        } else {
          result = await evolutionApi.sendAudioMessage(conv.phone, media_url);
          wamid = result?.key?.id || null;
        }
      }
    } else if (type === 'document') {
      if (useMeta) {
        let docUrl = media_url;
        if (req.body.base64) {
          try { docUrl = saveBase64File(req.body.base64, type); savedMediaUrl = docUrl; } catch(_) {}
        }
        result = await metaApi.sendImage(conv.phone, docUrl, content);
        wamid = result?.messages?.[0]?.id || null;
      } else {
        let docUrl = media_url;
        if (req.body.base64) {
          try { docUrl = saveBase64File(req.body.base64, type); savedMediaUrl = docUrl; } catch(_) {}
        }
        result = await evolutionApi.sendDocumentMessage(conv.phone, docUrl, content);
        wamid = result?.key?.id || null;
      }
    }

    // Salvar mensagem no banco
    const msgId = uuidv4();
    const now = new Date().toISOString();

    await run(`
      INSERT INTO messages (id, conversation_id, whatsapp_message_id, direction, type, content, media_url, status, timestamp)
      VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'sent', ?)
    `, [msgId, req.params.id, wamid, type, content || null, savedMediaUrl, now]);

    await run(`
      UPDATE conversations SET last_message = ?, last_message_at = ?, updated_at = ? WHERE id = ?
    `, [content || '[mídia]', now, now, req.params.id]);

    const message = await queryOne('SELECT * FROM messages WHERE id = ?', [msgId]);
    res.json(message);
  } catch (err) {
    console.error('POST /conversations/:id/messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /conversations/:id/messages/save — salva mensagem já enviada (sem reenviar)
router.post('/:id/messages/save', async (req, res) => {
  try {
    const { content, type = 'text', media_url } = req.body;
    const msgId = uuidv4();
    const now = new Date().toISOString();

    await run(
      "INSERT INTO messages (id, conversation_id, direction, type, content, media_url, status, timestamp) VALUES (?, ?, 'outbound', ?, ?, ?, 'sent', ?)",
      [msgId, req.params.id, type, content || null, media_url || null, now]
    );
    await run(
      "UPDATE conversations SET last_message = ?, last_message_at = ?, updated_at = ? WHERE id = ?",
      [content || '[mídia]', now, now, req.params.id]
    );

    const message = await queryOne('SELECT * FROM messages WHERE id = ?', [msgId]);
    res.json(message);
  } catch (err) {
    console.error('POST /conversations/:id/messages/save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /conversations/or-create/:contactId
router.get('/or-create/:contactId', async (req, res) => {
  try {
    let conv = await queryOne('SELECT * FROM conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1', [req.params.contactId]);
    if (!conv) {
      const id = uuidv4();
      const now = new Date().toISOString();
      await run('INSERT INTO conversations (id, contact_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id, req.params.contactId, 'open', now, now]);
      conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [id]);
    }
    res.json(conv);
  } catch (err) {
    console.error('GET /conversations/or-create/:contactId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /conversations/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await run(`UPDATE conversations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /conversations/:id/status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /conversations/:id/read — zera unread_count
router.put('/:id/read', async (req, res) => {
  try {
    await run(`UPDATE conversations SET unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /conversations/:id/read error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
