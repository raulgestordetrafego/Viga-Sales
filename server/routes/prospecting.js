import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run, getDb } from '../db/database.js';
import * as evolutionApi from '../services/evolutionApi.js';
import multer from 'multer';
import Papa from 'papaparse';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

    // Monta nota com contexto da prospecção (segmento + cidade)
    const prospectNote = [
      'prospecção_ativa',
      prospect.segment && `segmento: ${prospect.segment}`,
      prospect.city    && `cidade: ${prospect.city}`,
    ].filter(Boolean).join(' | ');

    if (!contact) {
      const id = uuidv4();
      await run(
        `INSERT INTO contacts (id, name, phone, company, tags, notes, status, pipeline_stage, last_interaction, created_at, updated_at)
         VALUES (?, ?, ?, ?, '["prospecção_ativa"]', ?, 'active', 'stage_lead', ?, ?, ?)`,
        [id, contactName, cleanPhone, prospect.company || null, prospectNote, now, now, now]
      );
      contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
    } else {
      // Garante tag + atualiza nota com segmento
      let existingTags = [];
      try { existingTags = JSON.parse(contact.tags || '[]'); } catch {}
      if (!existingTags.includes('prospecção_ativa')) existingTags.push('prospecção_ativa');
      await run('UPDATE contacts SET tags = ?, notes = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(existingTags), prospectNote, now, contact.id]);
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

// Segmentos conhecidos do Google Maps (tipos em PT-BR)
const SEGMENT_NAMES = {
  restaurant: 'restaurante', food: 'alimentação', bar: 'bar',
  cafe: 'cafeteria', bakery: 'padaria', meal_delivery: 'delivery',
  hair_care: 'salão de beleza', beauty_salon: 'salão de beleza',
  barber_shop: 'barbearia', spa: 'spa', nail_salon: 'manicure',
  gym: 'academia', health: 'saúde', doctor: 'médico', dentist: 'dentista',
  physiotherapist: 'fisioterapia', pharmacy: 'farmácia',
  real_estate_agency: 'imobiliária', lawyer: 'advocacia',
  accounting: 'contabilidade', insurance_agency: 'seguros',
  car_dealer: 'concessionária', car_repair: 'mecânica', car_wash: 'lava-rápido',
  clothing_store: 'loja de roupas', shoe_store: 'sapataria',
  electronics_store: 'eletrônicos', furniture_store: 'móveis',
  pet_store: 'pet shop', florist: 'floricultura',
  school: 'escola', university: 'faculdade',
  hotel: 'hotel', lodging: 'hospedagem',
  travel_agency: 'agência de viagens',
  construction: 'construção civil', general_contractor: 'construtora',
  plumber: 'encanador', electrician: 'eletricista', painter: 'pintor',
  cleaning: 'limpeza', laundry: 'lavanderia',
  photography: 'fotografia', event_venue: 'espaço de eventos',
};

function resolveSegment(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  // Segmento puramente numérico (ex: "7", "10") = dado inválido, ignorar
  if (/^\d+$/.test(str)) return null;
  // Tentar mapear chave inglesa → PT-BR
  return SEGMENT_NAMES[str.toLowerCase()] || str;
}

async function generateAIMessage(prospect, campaignTemplate) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

  const segmentLabel = resolveSegment(prospect.segment);

  const context = [
    prospect.company && `Empresa: ${prospect.company}`,
    segmentLabel && `Segmento: ${segmentLabel}`,
    prospect.city && `Cidade: ${prospect.city}`,
    prospect.rating && `Avaliação Google: ${prospect.rating}/5 (${prospect.reviews_count || 0} avaliações)`,
    prospect.website && `Site: ${prospect.website}`,
  ].filter(Boolean).join('\n');

  const senderName = process.env.SENDER_NAME || 'Raul';

  const customInstruction = campaignTemplate
    ? `ABORDAGEM DA CAMPANHA (siga à risca):
${campaignTemplate}

`
    : '';

  const prompt = `Você é ${senderName}, contatando negócios via WhatsApp no Brasil.
Escreva uma primeira mensagem para o seguinte contato:

${context}

${customInstruction}Regras:
- Escreva na primeira pessoa como ${senderName} — nunca use placeholders
- Tom casual e humano, como se fosse uma mensagem no WhatsApp mesmo
- Máximo 80 palavras
- Sem emojis excessivos (máximo 1)
- Varie levemente o estilo a cada geração para não parecer robô`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 300 },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini error: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text.trim();
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

// GET /api/prospects/default-campaign — retorna ou cria a campanha padrão da Viga Sales
router.get('/default-campaign', async (req, res) => {
  try {
    let campaign = await queryOne(
      "SELECT * FROM prospecting_campaigns WHERE status = 'active' ORDER BY created_at ASC LIMIT 1"
    );
    if (!campaign) {
      const id = uuidv4();
      const today = new Date().toISOString().split('T')[0];
      await run(
        `INSERT INTO prospecting_campaigns (id, name, segment, city, daily_limit, message_template, use_ai, status, last_reset_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          'Viga Sales Principal',
          'construção civil',
          'Brasília, DF',
          40,
          `Abordagem para engenheiros, arquitetos, construtores e empreiteiros.
Apresente-se como Raul da Viga Sales.
Proposta de valor: ajudamos profissionais da construção civil a receber pedidos de orçamento de clientes qualificados pelo WhatsApp, sem depender só de indicação.
Tom: casual e humano, como WhatsApp mesmo. Direto ao ponto.
Mencione o nome da empresa se disponível.
Não prometa resultados específicos nem use linguagem de vendedor.
Máximo 3-4 frases.`,
          1,
          'active',
          today,
        ]
      );
      campaign = await queryOne('SELECT * FROM prospecting_campaigns WHERE id = ?', [id]);
      console.log('[default-campaign] Campanha "Viga Sales Principal" criada:', id);
    }
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const { name, segment, city, daily_limit = 30, message_template, use_ai = 1 } = req.body;
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

// ── Autenticação interna para n8n / automações ───────────────────────────────
function internalAuth(req, res, next) {
  const token = req.headers['x-internal-key'] || req.query.internal_key;
  const expected = process.env.VIGA_INTERNAL_TOKEN || process.env.N8N_AUTH_TOKEN;
  if (!expected) return res.status(503).json({ error: 'VIGA_INTERNAL_TOKEN não configurado' });
  if (token !== expected) return res.status(401).json({ error: 'Token interno inválido' });
  next();
}

// GET /api/prospects/check-audio — verifica se um telefone é prospect com áudio enviado
router.get('/check-audio', internalAuth, async (req, res) => {
  try {
    const rawPhone = (req.query.phone || '').replace(/\D/g, '');
    if (!rawPhone) return res.status(400).json({ error: 'phone obrigatório' });

    const base = rawPhone.replace(/^55/, '');
    const phoneVariants = [rawPhone, '55' + base, base];
    if (base.length === 11) phoneVariants.push('55' + base.slice(0, 2) + base.slice(3), base.slice(0, 2) + base.slice(3));
    if (base.length === 10) phoneVariants.push('55' + base.slice(0, 2) + '9' + base.slice(2), base.slice(0, 2) + '9' + base.slice(2));

    const placeholders = phoneVariants.map(() => '?').join(', ');
    const prospect = await queryOne(
      `SELECT id, phone, name, status, audio_batch_sent, campaign_id FROM prospects
       WHERE phone IN (${placeholders}) AND audio_batch_sent = 1 LIMIT 1`,
      phoneVariants
    );

    res.json({
      is_prospect: !!prospect,
      audio_sent: !!prospect,
      status: prospect?.status || null,
      prospect_id: prospect?.id || null,
      campaign_id: prospect?.campaign_id || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/audio-pending — prospects sem áudio há mais de X minutos
router.get('/audio-pending', internalAuth, async (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes || 5);
    const campaign_id = req.query.campaign_id || null;
    const limit = Math.min(parseInt(req.query.limit || 10), 50);
    const db = getDb();
    let sql;
    const params = [];
    if (db.isPostgres) {
      sql = `SELECT * FROM prospects WHERE status = 'enviado'
             AND (audio_batch_sent IS NULL OR audio_batch_sent = 0 OR audio_batch_sent = false)
             AND sent_at IS NOT NULL
             AND COALESCE(sent_at::timestamp, updated_at::timestamp) <= NOW() - INTERVAL '${minutes} minutes'`;
      if (campaign_id) { sql += ' AND campaign_id = $1'; params.push(campaign_id); }
      sql += ` ORDER BY RANDOM() LIMIT ${limit}`;
    } else {
      sql = `SELECT * FROM prospects WHERE status = 'enviado'
             AND (audio_batch_sent IS NULL OR audio_batch_sent = 0)
             AND sent_at IS NOT NULL
             AND datetime(replace(COALESCE(sent_at, updated_at),'T',' ')) <= datetime('now', '-${minutes} minutes')`;
      if (campaign_id) { sql += ' AND campaign_id = ?'; params.push(campaign_id); }
      sql += ` ORDER BY RANDOM() LIMIT ${limit}`;
    }
    const prospects = await query(sql, params);
    res.json({ prospects: prospects.map(parseProspect), count: prospects.length });
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
      [id, name, normalizedPhone, email, company, resolveSegment(segment) || segment, city, address, website,
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
          [uuidv4(), p.name, normalizedPhone, p.email, p.company, resolveSegment(p.segment) || p.segment,
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

    const parsed = parseProspect(prospect);
    const campaign = parsed.campaign_id
      ? await queryOne('SELECT message_template FROM prospecting_campaigns WHERE id = ?', [parsed.campaign_id])
      : null;
    const message = await generateAIMessage(parsed, campaign?.message_template || null);

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

// POST /api/prospects/:id/send-audio — claim atômico + envia áudio aleatório
router.post('/:id/send-audio', internalAuth, async (req, res) => {
  const prospectId = req.params.id;
  let claimed = false;
  try {
    // Claim atômico — marca audio_batch_sent=1 apenas se ainda está sem áudio
    const result = await run(
      `UPDATE prospects SET audio_batch_sent = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'enviado' AND (audio_batch_sent IS NULL OR audio_batch_sent = 0)`,
      [prospectId]
    );

    if (!result.changes) {
      return res.json({ ok: false, reason: 'already_claimed_or_invalid_status' });
    }
    claimed = true;

    const prospect = await queryOne('SELECT * FROM prospects WHERE id = ?', [prospectId]);
    if (!prospect) return res.status(404).json({ error: 'Prospect não encontrado' });

    // Áudios disponíveis — servidos pelo próprio servidor em /api/audio/
    const audioFiles = ['raul_audio_01.mp3', 'raul_audio_02.mp3', 'raul_audio_03.mp3'];
    const appUrl = (process.env.APP_URL || 'https://vigasales.shop').replace(/\/$/, '');
    const audioFile = audioFiles[Math.floor(Math.random() * audioFiles.length)];
    const audioUrl = `${appUrl}/api/audio/${audioFile}`;

    // Enviar via Evolution API
    await evolutionApi.sendAudioMessage(prospect.phone, audioUrl);

    // Log da ação
    await run(
      'INSERT INTO prospecting_logs (id, prospect_id, campaign_id, action, message) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), prospect.id, prospect.campaign_id || null, 'audio_enviado', audioUrl]
    );

    console.log(`[Audio] Áudio enviado para ${prospect.phone} (${prospect.name || prospect.company}): ${audioFile}`);
    res.json({ ok: true, audio_url: audioUrl, audio_file: audioFile, prospect_id: prospect.id });
  } catch (err) {
    // Reverter claim se o envio falhou
    if (claimed) {
      await run(
        `UPDATE prospects SET audio_batch_sent = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [prospectId]
      ).catch(() => {});
    }
    console.error(`[Audio] Erro ao enviar áudio para prospect ${prospectId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/recovery — libera prospects travados em 'reservado' de volta para 'novo'
router.post('/recovery', async (req, res) => {
  try {
    const result = await run(
      `UPDATE prospects SET status = 'novo', updated_at = CURRENT_TIMESTAMP WHERE status = 'reservado'`,
      []
    );
    res.json({ released: result.changes });
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
       WHERE pl.error IS NOT NULL
       ORDER BY pl.created_at DESC
       LIMIT ?`,
      [Number(limit)]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/import-csv — importar lista via arquivo CSV
router.post('/import-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const csv = req.file.buffer.toString('utf-8');
    const { data, errors: parseErrors } = Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
    });

    if (!data.length) return res.status(400).json({ error: 'CSV vazio ou sem dados válidos' });

    const campaign_id    = req.body.campaign_id || null;
    const pipeline_stage = req.body.pipeline_stage || null;

    // Mapeamento flexível: aceita nomes exatos da planilha CNPJ ou variações
    const col = (row, ...keys) => {
      for (const k of keys) {
        const found = Object.keys(row).find(h => h.toLowerCase().trim() === k.toLowerCase());
        if (found && row[found] !== undefined && row[found] !== '') return String(row[found]).trim();
      }
      return null;
    };

    let inserted = 0, skipped = 0, invalid = 0, addedToPipeline = 0;
    const errors = [];

    for (const row of data) {
      try {
        const phone = normalizePhone(
          col(row, 'Telefone Principal', 'telefone principal', 'telefone', 'phone', 'celular', 'whatsapp') || ''
        );
        if (!phone || phone.length < 8) { invalid++; continue; }

        const existing = await queryOne('SELECT id FROM prospects WHERE phone = ?', [phone]);
        if (existing) { skipped++; continue; }

        const cnpj       = col(row, 'CNPJ', 'cnpj');
        // Razão Social (CNPJ) ou Nome da Empresa (Google Maps)
        const razaoSocial= col(row, 'Razão Social', 'razao social', 'razão social', 'Nome da Empresa', 'nome da empresa', 'empresa', 'company');
        const nomeFant   = col(row, 'Nome Fantasia', 'nome fantasia', 'nome_fantasia', 'trade_name');
        const email      = col(row, 'E-mail', 'email', 'e-mail');
        const phone2     = normalizePhone(col(row, 'Telefone Secundário', 'telefone secundário', 'telefone2', 'phone2') || '') || null;
        const cidade     = col(row, 'Cidade', 'cidade', 'city', 'municipio', 'município');
        const estado     = col(row, 'Estado', 'estado', 'uf', 'state');
        // Endereço: campo direto (Google Maps) ou partes separadas (CNPJ)
        const enderecoDir= col(row, 'Endereço', 'endereco', 'endereço');
        const logradouro = col(row, 'Logradouro', 'logradouro', 'rua');
        const numero     = col(row, 'Número', 'numero', 'número', 'number');
        const complemento= col(row, 'Complemento', 'complemento');
        const bairro     = col(row, 'Bairro', 'bairro', 'neighborhood');
        const cep        = col(row, 'CEP', 'cep', 'zip', 'zip_code');
        // Segmento: Atividade Principal (CNPJ) ou Segmento da Empresa (Google Maps)
        const atividade  = col(row, 'Atividade Principal', 'atividade principal', 'Segmento da Empresa', 'segmento da empresa', 'atividade', 'segment', 'segmento');
        const atividadeCod = col(row, 'Atividade Principal Código', 'atividade principal código', 'atividade_codigo');
        const porte      = col(row, 'Porte', 'porte', 'company_size');
        const capital    = col(row, 'Capital Social', 'capital social', 'capital_social');
        const natJur     = col(row, 'Natureza Jurídica', 'natureza jurídica', 'natureza juridica', 'legal_nature');
        const dtAbertura = col(row, 'Data de Abertura', 'data de abertura', 'data_abertura', 'opening_date');
        const sitCadastral= col(row, 'Situação Cadastral', 'situação cadastral', 'situacao cadastral', 'cnpj_status');
        const website    = col(row, 'Site', 'site', 'website', 'url');
        const instagram  = col(row, 'Instagram', 'instagram');
        const decisor    = col(row, 'Decisor', 'decisor', 'decision_maker');
        const horario    = col(row, 'Horário', 'horario', 'horário', 'hours');

        const addressParts = enderecoDir
          ? [enderecoDir]
          : [logradouro, numero, complemento].filter(Boolean);
        const address = addressParts.length ? addressParts.join(', ') : null;
        const cityFull = [cidade, estado].filter(Boolean).join(' - ') || null;
        const extraNotes = [
          decisor && `Decisor: ${decisor}`,
          horario && `Horário: ${horario}`,
        ].filter(Boolean).join(' | ') || null;

        const prospectId = uuidv4();
        await run(
          `INSERT INTO prospects
            (id, name, phone, phone2, email, company, trade_name, cnpj,
             segment, main_activity_code, city, state, address, neighborhood, zip_code,
             company_size, capital_social, legal_nature, opening_date, cnpj_status,
             website, instagram, notes,
             source, campaign_id, raw_data, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo')`,
          [
            prospectId,
            nomeFant || razaoSocial,
            phone,
            phone2,
            email,
            razaoSocial,
            nomeFant,
            cnpj,
            atividade,
            atividadeCod,
            cityFull,
            estado,
            address,
            bairro,
            cep,
            porte,
            capital,
            natJur,
            dtAbertura,
            sitCadastral,
            website,
            instagram,
            extraNotes,
            'csv_import',
            campaign_id,
            JSON.stringify(row),
          ]
        );

        // Se uma etapa do pipeline foi escolhida, cria/atualiza o contato no CRM
        if (pipeline_stage) {
          const existingContact = await queryOne('SELECT id FROM contacts WHERE phone = ?', [phone]);
          if (!existingContact) {
            await run(
              `INSERT INTO contacts (id, name, phone, email, company, pipeline_stage, status, tags, notes, last_interaction)
               VALUES (?, ?, ?, ?, ?, ?, 'active', '[]', ?, datetime('now'))`,
              [uuidv4(), nomeFant || razaoSocial || phone, phone, email || null, razaoSocial || null, pipeline_stage, [cityFull, address, website].filter(Boolean).join(' | ') || null]
            );
          } else {
            await run(
              `UPDATE contacts SET pipeline_stage = ?, last_interaction = datetime('now') WHERE id = ?`,
              [pipeline_stage, existingContact.id]
            );
          }
          addedToPipeline++;
        }

        inserted++;
      } catch (e) {
        errors.push({ row: data.indexOf(row) + 2, error: e.message });
      }
    }

    res.json({ inserted, skipped, invalid, addedToPipeline, errors, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
