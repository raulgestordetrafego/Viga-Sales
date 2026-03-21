import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run, getDb } from '../db/database.js';

// Cria contato + conversa no CRM quando um prospect é marcado como enviado
async function syncProspectToConversation(prospect, message) {
  try {
    const cleanPhone = String(prospect.phone).replace(/\D/g, '');
    const contactName = prospect.name || prospect.company || cleanPhone;
    const now = new Date().toISOString();

    // Encontrar ou criar contato
    let contact = await queryOne(
      'SELECT * FROM contacts WHERE phone = ? OR phone LIKE ?',
      [cleanPhone, `%${cleanPhone.slice(-8)}`]
    );

    if (!contact) {
      const id = uuidv4();
      await run(
        `INSERT INTO contacts (id, name, phone, company, status, pipeline_stage, last_interaction, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', 'stage_lead', ?, ?, ?)`,
        [id, contactName, cleanPhone, prospect.company || null, now, now, now]
      );
      contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
    }

    // Encontrar ou criar conversa
    let conv = await queryOne(
      'SELECT * FROM conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1',
      [contact.id]
    );

    if (!conv) {
      const id = uuidv4();
      const chatId = `${cleanPhone}@s.whatsapp.net`;
      await run(
        `INSERT INTO conversations (id, contact_id, whatsapp_chat_id, status, last_message, last_message_at, created_at, updated_at)
         VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`,
        [id, contact.id, chatId, message || '[prospecção]', now, now, now]
      );
      conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [id]);
    } else {
      await run(
        `UPDATE conversations SET last_message = ?, last_message_at = ?, updated_at = ? WHERE id = ?`,
        [message || '[prospecção]', now, now, conv.id]
      );
    }

    // Salvar a mensagem enviada
    if (message) {
      await run(
        `INSERT OR IGNORE INTO messages (id, conversation_id, direction, type, content, status, timestamp, created_at)
         VALUES (?, ?, 'outbound', 'text', ?, 'sent', ?, ?)`,
        [uuidv4(), conv.id, message, now, now]
      );
    }

    return contact;
  } catch (err) {
    console.error('[syncProspectToConversation] Erro:', err.message);
  }
}

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseProspect(p) {
  if (!p) return null;
  return {
    ...p,
    raw_data: p.raw_data ? JSON.parse(p.raw_data) : null,
    use_ai: p.use_ai === 1 || p.use_ai === true,
  };
}

function normalizePhone(phone) {
  return String(phone).replace(/\D/g, '');
}

async function generateAIMessage(prospect) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

  const context = [
    prospect.company && `Empresa: ${prospect.company}`,
    prospect.segment && `Segmento: ${prospect.segment}`,
    prospect.city && `Cidade: ${prospect.city}`,
    prospect.rating && `Avaliação Google: ${prospect.rating}/5 (${prospect.reviews_count || 0} avaliações)`,
    prospect.website && `Site: ${prospect.website}`,
  ].filter(Boolean).join('\n');

  const senderName = process.env.SENDER_NAME || 'Raul';
  const senderCompany = process.env.SENDER_COMPANY || 'Viga Sales';

  const prompt = `Você é ${senderName}, da empresa ${senderCompany}, especialista em prospecção de clientes via WhatsApp.
Escreva uma mensagem de prospecção CURTA (máximo 3 parágrafos), CASUAL e PERSONALIZADA para o seguinte prospect:

${context}

Regras:
- Escreva na primeira pessoa como ${senderName} da ${senderCompany} — nunca use placeholders como [Seu Nome] ou [Sua Empresa]
- Tom amigável e humano, não robótico
- Mencione o nome da empresa ou cidade do prospect para personalizar
- Apresente brevemente o serviço (CRM de WhatsApp para gestão de clientes)
- Termine com uma pergunta aberta simples para iniciar conversa
- Não use emojis em excesso (máximo 2)
- Não mencione preço
- Máximo 150 palavras`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`OpenAI error: ${err.error?.message}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function resetDailyCountIfNeeded(campaignId) {
  const today = new Date().toISOString().split('T')[0];
  const campaign = await queryOne('SELECT * FROM prospecting_campaigns WHERE id = ?', [campaignId]);
  if (!campaign) return;
  if (campaign.last_reset_date !== today) {
    await run(
      'UPDATE prospecting_campaigns SET sent_today = 0, last_reset_date = ? WHERE id = ?',
      [today, campaignId]
    );
  }
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

// GET /api/prospects/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await query('SELECT * FROM prospecting_campaigns ORDER BY created_at DESC');
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/campaigns
router.post('/campaigns', async (req, res) => {
  try {
    const { name, segment, city, daily_limit = 40, message_template, use_ai = 1 } = req.body;
    if (!name) return res.status(400).json({ error: 'name obrigatório' });

    const id = uuidv4();
    await run(
      `INSERT INTO prospecting_campaigns (id, name, segment, city, daily_limit, message_template, use_ai, last_reset_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, segment, city, daily_limit, message_template, use_ai ? 1 : 0,
        new Date().toISOString().split('T')[0]]
    );
    const campaign = await queryOne('SELECT * FROM prospecting_campaigns WHERE id = ?', [id]);
    res.status(201).json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/prospects/campaigns/:id
router.patch('/campaigns/:id', async (req, res) => {
  try {
    const { name, segment, city, daily_limit, message_template, use_ai, status } = req.body;
    const fields = [];
    const params = [];

    if (name !== undefined)             { fields.push('name = ?');             params.push(name); }
    if (segment !== undefined)          { fields.push('segment = ?');          params.push(segment); }
    if (city !== undefined)             { fields.push('city = ?');             params.push(city); }
    if (daily_limit !== undefined)      { fields.push('daily_limit = ?');      params.push(daily_limit); }
    if (message_template !== undefined) { fields.push('message_template = ?'); params.push(message_template); }
    if (use_ai !== undefined)           { fields.push('use_ai = ?');           params.push(use_ai ? 1 : 0); }
    if (status !== undefined)           { fields.push('status = ?');           params.push(status); }

    if (!fields.length) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    await run(`UPDATE prospecting_campaigns SET ${fields.join(', ')} WHERE id = ?`, params);
    const campaign = await queryOne('SELECT * FROM prospecting_campaigns WHERE id = ?', [req.params.id]);
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Prospects ─────────────────────────────────────────────────────────────────

// GET /api/prospects — listar com filtros
router.get('/', async (req, res) => {
  try {
    const { status, source, campaign_id, limit = 50, offset = 0, days_since } = req.query;

    let sql = 'SELECT * FROM prospects WHERE 1=1';
    const params = [];

    if (status)      { sql += ' AND status = ?';      params.push(status); }
    if (source)      { sql += ' AND source = ?';      params.push(source); }
    if (campaign_id) { sql += ' AND campaign_id = ?'; params.push(campaign_id); }

    if (days_since) {
      // prospects enviados há X dias sem resposta
      sql += ` AND sent_at IS NOT NULL AND responded_at IS NULL
               AND datetime(sent_at) <= datetime('now', '-${parseInt(days_since)} days')`;
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const prospects = await query(sql, params);
    const totalData = await queryOne('SELECT COUNT(*) as count FROM prospects');

    res.json({
      prospects: prospects.map(parseProspect),
      total: parseInt(totalData?.count || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/queue — próximos a disparar (usado pelo n8n)
router.get('/queue', async (req, res) => {
  try {
    const { campaign_id, limit = 3 } = req.query;

    // Verifica limite diário da campanha
    if (campaign_id) {
      await resetDailyCountIfNeeded(campaign_id);
      const campaign = await queryOne('SELECT * FROM prospecting_campaigns WHERE id = ?', [campaign_id]);
      if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
      if (campaign.status !== 'active') return res.json({ prospects: [], reason: 'campaign_paused' });
      if (campaign.sent_today >= campaign.daily_limit) {
        return res.json({ prospects: [], reason: 'daily_limit_reached', sent_today: campaign.sent_today });
      }
    }

    // Reserva atômica — SELECT + UPDATE em transação única, impossível duplicar
    const prospects = await getDb().atomicReserve(campaign_id || null, Number(limit));

    res.json({ prospects: prospects.map(parseProspect) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/:id
router.get('/:id', async (req, res) => {
  try {
    const prospect = await queryOne('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect não encontrado' });
    const logs = await query('SELECT * FROM prospecting_logs WHERE prospect_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ ...parseProspect(prospect), logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects — criar um prospect
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, company, segment, city, address, website,
            instagram, rating, reviews_count, source = 'manual', campaign_id, raw_data } = req.body;

    if (!phone) return res.status(400).json({ error: 'phone obrigatório' });

    const id = uuidv4();
    const normalizedPhone = normalizePhone(phone);

    await run(
      `INSERT INTO prospects
        (id, name, phone, email, company, segment, city, address, website, instagram,
         rating, reviews_count, source, campaign_id, raw_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, normalizedPhone, email, company, segment, city, address, website,
       instagram, rating, reviews_count, source, campaign_id,
       raw_data ? JSON.stringify(raw_data) : null]
    );

    const prospect = await queryOne('SELECT * FROM prospects WHERE id = ?', [id]);
    res.status(201).json(parseProspect(prospect));
  } catch (err) {
    if (err.message?.includes('UNIQUE') || err.message?.includes('unique')) {
      return res.status(409).json({ error: 'Telefone já cadastrado', phone: req.body.phone });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/bulk — importar lote (vindo do n8n)
router.post('/bulk', async (req, res) => {
  try {
    const { prospects: list, campaign_id, source = 'google_maps' } = req.body;
    if (!Array.isArray(list) || !list.length) {
      return res.status(400).json({ error: 'Envie um array "prospects"' });
    }

    let inserted = 0;
    let skipped = 0;
    const errors = [];

    for (const p of list) {
      try {
        if (!p.phone) { skipped++; continue; }
        const normalizedPhone = normalizePhone(p.phone);
        const existing = await queryOne('SELECT id FROM prospects WHERE phone = ?', [normalizedPhone]);
        if (existing) { skipped++; continue; }

        await run(
          `INSERT INTO prospects
            (id, name, phone, email, company, segment, city, address, website,
             instagram, rating, reviews_count, source, campaign_id, raw_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), p.name, normalizedPhone, p.email, p.company, p.segment,
           p.city, p.address, p.website, p.instagram,
           p.rating, p.reviews_count, source, campaign_id,
           p.raw_data ? JSON.stringify(p.raw_data) : JSON.stringify(p)]
        );
        inserted++;
      } catch (e) {
        errors.push({ phone: p.phone, error: e.message });
      }
    }

    res.json({ inserted, skipped, errors, total: list.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/:id/generate-message — gera mensagem com IA
router.post('/:id/generate-message', async (req, res) => {
  try {
    const prospect = await queryOne('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect não encontrado' });

    const message = await generateAIMessage(parseProspect(prospect));

    await run(
      'UPDATE prospects SET ai_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [message, req.params.id]
    );

    res.json({ message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/prospects/:id/status — atualizar status (usado pelo n8n após disparo)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, campaign_id, message, error: errorMsg } = req.body;
    const allowed = ['novo', 'enviado', 'respondeu', 'follow-up', 'convertido', 'descartado'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${allowed.join(', ')}` });
    }

    const extra = [];
    const params = [];

    if (status === 'enviado') {
      extra.push('sent_at = CURRENT_TIMESTAMP');
      if (campaign_id) {
        await run(
          'UPDATE prospecting_campaigns SET sent_today = sent_today + 1 WHERE id = ?',
          [campaign_id]
        );
      }
      // Sincroniza prospect como contato + conversa no CRM automaticamente
      const prospect = await queryOne('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
      if (prospect) {
        await syncProspectToConversation(prospect, message || prospect.ai_message || null);
      }
    }
    if (status === 'respondeu') extra.push('responded_at = CURRENT_TIMESTAMP');
    if (status === 'follow-up') extra.push('follow_up_at = CURRENT_TIMESTAMP');

    const setClause = ['status = ?', 'updated_at = CURRENT_TIMESTAMP', ...extra].join(', ');
    params.unshift(status);
    params.push(req.params.id);

    await run(`UPDATE prospects SET ${setClause} WHERE id = ?`, params);

    // log da ação
    await run(
      'INSERT INTO prospecting_logs (id, prospect_id, campaign_id, action, message, error) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.params.id, campaign_id || null, status, message || null, errorMsg || null]
    );

    const prospect = await queryOne('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
    res.json(parseProspect(prospect));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/prospects/:id/notes — salvar observação
router.patch('/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    await run(
      'UPDATE prospects SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [notes || null, req.params.id]
    );
    const prospect = await queryOne('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
    res.json(parseProspect(prospect));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/stats/summary — resumo para dashboard
router.get('/stats/summary', async (req, res) => {
  try {
    const [total, novo, enviado, respondeu, convertido, follow_up] = await Promise.all([
      queryOne('SELECT COUNT(*) as n FROM prospects'),
      queryOne("SELECT COUNT(*) as n FROM prospects WHERE status = 'novo'"),
      queryOne("SELECT COUNT(*) as n FROM prospects WHERE status = 'enviado'"),
      queryOne("SELECT COUNT(*) as n FROM prospects WHERE status = 'respondeu'"),
      queryOne("SELECT COUNT(*) as n FROM prospects WHERE status = 'convertido'"),
      queryOne("SELECT COUNT(*) as n FROM prospects WHERE status = 'follow-up'"),
    ]);

    const todayLogs = await queryOne(
      "SELECT COUNT(*) as n FROM prospecting_logs WHERE action = 'enviado' AND date(created_at) = date('now')"
    );

    res.json({
      total: parseInt(total?.n || 0),
      novo: parseInt(novo?.n || 0),
      enviado: parseInt(enviado?.n || 0),
      respondeu: parseInt(respondeu?.n || 0),
      convertido: parseInt(convertido?.n || 0),
      follow_up: parseInt(follow_up?.n || 0),
      sent_today: parseInt(todayLogs?.n || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/logs/failures — relatório de falhas de envio
router.get('/logs/failures', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logs = await query(
      `SELECT pl.id, pl.prospect_id, pl.campaign_id, pl.action, pl.error, pl.created_at,
              p.name, p.company, p.phone, p.city, p.status as prospect_status
       FROM prospecting_logs pl
       LEFT JOIN prospects p ON p.id = pl.prospect_id
       WHERE pl.error IS NOT NULL AND pl.action = 'novo'
       ORDER BY pl.created_at DESC
       LIMIT ?`,
      [Number(limit)]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
