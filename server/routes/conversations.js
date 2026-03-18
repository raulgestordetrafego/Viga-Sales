import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, queryOne, run } from '../db/database.js';
import evolutionApi from '../services/evolutionApi.js';

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

    let sql = `
      SELECT c.*, ct.name as contact_name, ct.phone as contact_phone, ct.avatar as contact_avatar
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      WHERE 1=1
    `;
    const params = [];

    if (status) { 
      sql += ' AND c.status = ?'; 
      params.push(status); 
    }
    if (assigned_to) { 
      sql += ' AND c.assigned_to = ?'; 
      params.push(assigned_to); 
    }
    sql += ' ORDER BY c.last_message_at DESC';

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

// POST /conversations/:id/messages - enviar mensagem
router.post('/:id/messages', async (req, res) => {
  try {
    const { content, type = 'text', media_url } = req.body;

    const conv = await queryOne(`
      SELECT c.*, ct.phone FROM conversations c JOIN contacts ct ON c.contact_id = ct.id WHERE c.id = ?
    `, [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    // Se veio base64, salva em disco e obtém URL pública
    let effectiveMediaUrl = media_url;
    if (req.body.base64 && type !== 'text') {
      try {
        effectiveMediaUrl = saveBase64File(req.body.base64, type);
      } catch(e) {
        return res.status(400).json({ error: 'Arquivo inválido: ' + e.message });
      }
    }

    // Enviar via Evolution API
    let result;
    if (type === 'text') {
      result = await evolutionApi.sendTextMessage(conv.phone, content);
    } else if (type === 'image') {
      result = await evolutionApi.sendImageMessage(conv.phone, effectiveMediaUrl, content);
    } else if (type === 'audio') {
      result = await evolutionApi.sendAudioMessage(conv.phone, effectiveMediaUrl);
    } else if (type === 'document') {
      result = await evolutionApi.sendDocumentMessage(conv.phone, effectiveMediaUrl, content);
    }

    // Salvar mensagem no banco
    const msgId = uuidv4();
    const now = new Date().toISOString();
    const savedMediaUrl = effectiveMediaUrl || null;

    await run(`
      INSERT INTO messages (id, conversation_id, whatsapp_message_id, direction, type, content, media_url, status, timestamp)
      VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'sent', ?)
    `, [msgId, req.params.id, result?.key?.id || null, type, content || null, savedMediaUrl, now]);

    await run(`
      UPDATE conversations SET last_message = ?, last_message_at = ?, updated_at = ? WHERE id = ?
    `, [content || '[mídia]', now, now, req.params.id]);

    const message = await queryOne('SELECT * FROM messages WHERE id = ?', [msgId]);
    res.json(message);
  } catch (err) {
    console.error('POST /conversations/:id/messages error:', err);
    if (err.response && err.response.data) {
      console.error('Evolution API Error Data:', JSON.stringify(err.response.data));
      
      let errorMessage = err.response.data.message || 'Erro na Evolution API';
      
      // Check if it's a "number does not exist" error
      if (Array.isArray(err.response.data.message)) {
        const notExists = err.response.data.message.find(m => m.exists === false);
        if (notExists) {
          errorMessage = `O número ${notExists.number.split('@')[0]} não possui WhatsApp.`;
        }
      }
      
      res.status(err.response.status).json({ error: errorMessage });
    } else {
      res.status(500).json({ error: err.message });
    }
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
