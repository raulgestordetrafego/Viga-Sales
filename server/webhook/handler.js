import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run } from '../db/database.js';
import evolutionApi from '../services/evolutionApi.js';
import axios from 'axios';
import pg from 'pg';
const { Pool } = pg;

const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const AGENTS_GROUP = process.env.AGENTS_GROUP_ID || '120363428115495870@g.us';

// ── Agente de atendimento (n8n AGENTE PEDRO) ──────────────────────────────
// A instância que recebe do cliente e RESPONDE (Evolution)
const AGENT_INSTANCE = process.env.EVOLUTION_AGENT_INSTANCE || 'Raul Santos';
// Webhook n8n que processa a conversa
const AGENT_N8N_URL = process.env.N8N_AGENT_URL || 'https://n8n.vigasales.shop/webhook/agente_pedro';
// Números autorizados a acionar o agente mesmo sem intenção (apenas via env, sem fallback de teste)
const AGENT_ALLOW_PHONES = (process.env.EVOLUTION_AGENT_ALLOW || '').split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean);

// ── Classificador de intencao de campanha (frase padrão / gatilhos) ─────
const normTxt = (t) => String(t||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const KW_SITE = ["site", "landing", "loja virtual", "loja online", "ecommerce", "e-commerce", "pagina profissional", "pagina de vendas", "wordpress", "desenvolver site", "criar site", "fazer um site", "meu site"];
const KW_TRAFEGO = ["anunciar", "anuncio", "trafego", "trafico", "impulsionar", "impulsionamento", "instagram", "facebook", "google ads", "marketing digital", "gestao de anuncios", "patrocinado", "campanha de anuncio", "vender mais", "mais clientes", "mais vendas"];
const KW_AUTOM = ["automatizar", "bot de", "resposta automatica", "whatsapp empresarial", "atendimento automatico"];
const KW_CRM = ["crm", "organizar cliente", "gerenciar cliente", "gerenciar lead"];
const KW_SIS = ["sistema personalizado", "plataforma", "aplicativo", "app para", "software"];

// ── Opt-out: lead pediu para parar de receber ─────────────────────────────
// Frases já normalizadas (sem acento, minúsculas) — comparadas com normTxt()
const OPTOUT_PHRASES = [
  "nao me chama mais", "nao me chame mais", "nao me manda mais", "nao me mande mais",
  "para de me mandar", "pare de me mandar", "para de me enviar", "pare de me enviar",
  "me tira da lista", "me tire da lista", "me remove da lista", "me remova da lista",
  "sair da lista", "quero sair da lista", "me descadastra", "me descadastre", "descadastrar",
  "nao quero mais receber", "nao quero receber", "nao quero mais mensagem", "nao quero mensagem",
  "nao tenho interesse", "nao me interessa", "bloqueia meu numero", "bloqueie meu numero",
  "nao me perturbe", "nao me contate", "nao entre em contato"
];
function isOptOut(text) {
  const t = normTxt(text);
  if (!t) return false;
  return OPTOUT_PHRASES.some(p => t.includes(p));
}

function classifyIntent(text) {
  const t = normTxt(text);
  if (!t) return { code: "qualifica_padrao", source: "meta", service: null };
  const has = (arr) => arr.some(k => t.includes(k));
  const hasSite = has(KW_SITE);
  const hasTra = has(KW_TRAFEGO);
  if (hasSite && hasTra) return { code: "ambos", source: "meta_ambos", service: "ambos" };
  if (hasSite) return { code: "criacao_de_site", source: "meta_site", service: "criacao_de_site" };
  if (hasTra) return { code: "trafico_pago", source: "meta_trafego", service: "trafico_pago" };
  if (has(KW_AUTOM)) return { code: "automacao_comercial", source: "meta_outro", service: "automacao_comercial" };
  if (has(KW_CRM)) return { code: "crm", source: "meta_outro", service: "crm" };
  if (has(KW_SIS)) return { code: "sistema_personalizado", source: "meta_outro", service: "sistema_personalizado" };
  return { code: "qualifica_padrao", source: "meta", service: null };
}

let agentePool = null;
function getAgentePool() {
  if (agentePool) return agentePool;
  const url = process.env.DATABASE_AGENTE_URL;
  if (!url) return null;
  agentePool = new Pool({ connectionString: url, max: 3 });
  return agentePool;
}

let leadsPool = null;
function getLeadsPool() {
  if (leadsPool) return leadsPool;
  const url = process.env.DATABASE_LEADS_URL;
  if (!url) return null;
  leadsPool = new Pool({ connectionString: url, max: 2 });
  return leadsPool;
}

// ── Gatilho positivo: só ativa o agente se há intenção OU o número é lead real nosso ──
async function isKnownLeadPhone(phone) {
  try {
    const d = String(phone || '').replace(/\D/g, '');
    if (!d || d.length < 11) return false;
    const tail = d.slice(-8);
    // 1) Base de prospects do CRM (vigasales DB) — prospecção ativa/áudio/respondeu
    const p = await queryOne(
      `SELECT 1 FROM prospects
       WHERE regexp_replace(phone,'\\D','','g') LIKE '%' || ? || '%'
       LIMIT 1`, [tail]);
    if (p) return true;
    // 2) Tabela leads do agente (conversa já qualificada)
    const pool = getAgentePool();
    if (pool) {
      const l = await pool.query(
        `SELECT 1 FROM leads
         WHERE regexp_replace(phone,'[^0-9]','','g') LIKE '%' || $1
            OR regexp_replace(phone,'[^0-9]','','g') = $2
         LIMIT 1`, [tail, d]);
      if (l.rowCount > 0) return true;
    }
    // 3) Leads DB (prospects de prospecção ativa com áudio enviado / follow-up)
    const lpool = getLeadsPool();
    if (lpool) {
      const l2 = await lpool.query(
        `SELECT 1 FROM prospects
         WHERE regexp_replace(phone,'[^0-9]','','g') LIKE '%' || $1
            OR regexp_replace(phone,'[^0-9]','','g') = $2
         LIMIT 1`, [tail, d]);
      if (l2.rowCount > 0) return true;
    }
    return false;
  } catch (e) {
    console.error('[Agente] Erro ao checar lead conhecido:', e.message);
    return false;
  }
}

async function tagLeadAgent(phone, name, intent) {
  try {
    if (!phone || phone.length < 11) return;
    const pool = getAgentePool();
    if (!pool) return;
    // NÃO gravar o nome do perfil (pushName) em leads.name — isso fazia o agente
    // "achar" que já sabia o nome. O nome confirmado é gravado pela tool Salva Lead.
    // O nome do WhatsApp fica em whatsapp_name (referência).
    await pool.query(
      `INSERT INTO leads (phone, whatsapp_name, source, service_interest, created_at, updated_at)
       VALUES ($1,$2,$3,$4, NOW(), NOW())
       ON CONFLICT (phone) DO UPDATE SET
         whatsapp_name = COALESCE(NULLIF(EXCLUDED.whatsapp_name,''), leads.whatsapp_name),
         source = COALESCE(NULLIF(EXCLUDED.source,''), leads.source),
         service_interest = COALESCE(NULLIF(EXCLUDED.service_interest,''), leads.service_interest),
         updated_at = NOW()`,
      [phone, (name || "").slice(0,120), intent.source, intent.service]
    );
  } catch (e) {
    console.error("[Agente] Erro ao marcar lead:", e.message);
  }
}


async function isIgnoredPhone(phone) {
  try {
    const d = String(phone || '').replace(/\D/g, '');
    if (!d || d.length < 10) return false;
    const r = await query('SELECT 1 FROM personal_ignore WHERE phone = ?', [d]);
    return !!(r && r.length);
  } catch (e) {
    return false;
  }
}

// Cliente já fechado (pipeline stage_won) nunca é atendido pelo agente SDR
async function isClientPhone(phone) {
  try {
    const d = String(phone || '').replace(/\D/g, '');
    if (!d || d.length < 10) return false;
    const tail = d.slice(-8);
    const r = await queryOne(
      `SELECT 1 FROM contacts
       WHERE pipeline_stage = 'stage_won'
         AND (regexp_replace(phone,'\\D','','g') LIKE '%' || ? || '%'
              OR regexp_replace(phone,'\\D','','g') = ?)
       LIMIT 1`, [tail, d]);
    return !!r;
  } catch (e) {
    console.error('[Agente] Erro ao checar cliente:', e.message);
    return false;
  }
}

// SDR pausado (atendimento manual do gestor) — mantém o lead na pipeline, mas o agente não responde
async function isSdrPausedPhone(phone) {
  try {
    const d = String(phone || '').replace(/\D/g, '');
    if (!d || d.length < 10) return false;
    const tail = d.slice(-8);
    const r = await queryOne(
      `SELECT 1 FROM contacts
       WHERE sdr_paused = 1
         AND (regexp_replace(phone,'\\D','','g') LIKE '%' || ? || '%'
              OR regexp_replace(phone,'\\D','','g') = ?)
       LIMIT 1`, [tail, d]);
    return !!r;
  } catch (e) {
    console.error('[Agente] Erro ao checar SDR pausado:', e.message);
    return false;
  }
}

async function maybeForwardAgentInbound(payload) {
  try {
    if (!payload || payload.event !== 'messages.upsert') return;
    const instance = payload.instance || payload.instanceName || payload.data?.instanceName;
    if (instance !== AGENT_INSTANCE) return;

    const data = payload.data;
    const key = data?.key;
    if (!key || key.fromMe === true) return;
    const remoteJid = key.remoteJid || '';
    if (!remoteJid.endsWith('@s.whatsapp.net')) return; // só DM (exclui grupo/broadcast)

    const phone = remoteJid.split('@')[0].replace(/\D/g, '');

    // Recepção ABERTA para qualquer DM (não-boss, não-ignorado, não-grupo) —
    // a proteção contra pessoais está na tabela personal_ignore
    // (opcional: restrinja com EVOLUTION_AGENT_ALLOW="num,num")

    const bossPhones = (process.env.BOSS_PHONES || '').split(',').map(p => p.trim().replace(/\D/g, '')).filter(Boolean);
    if (bossPhones.some(p => phone.endsWith(p.slice(-11)))) return;

    // Números pessoais/ignorados: agente NUNCA responde
    if (await isIgnoredPhone(phone)) {
      console.log(`[Agente] Número ignorado (pessoal) ${phone} — sem resposta do agente`);
      return;
    }

    // Clientes fechados (stage_won): já têm relacionamento direto com Raul, sem agente SDR
    if (await isClientPhone(phone)) {
      console.log(`[Agente] Cliente (stage_won) ${phone} — sem resposta do agente`);
      return;
    }

    // SDR pausado (atendimento manual do gestor): lead segue na pipeline, mas o agente não responde
    if (await isSdrPausedPhone(phone)) {
      console.log(`[Agente] SDR pausado (atendimento manual) ${phone} — sem resposta do agente`);
      return;
    }

    // ── GATILHO (filtro de intenção): ativa só se há intenção de compra
    //    OU o número já é um lead/prospect real nosso (prospecção ativa/áudio enviado
    //    ou conversa já qualificada na tabela leads do agente). Fornecedor/aleatório
    //    que manda DM sem intenção NÃO ativa o agente.
    const content = data.message?.conversation || data.message?.extendedTextMessage?.text || '';
    const intent = classifyIntent(content);
    const pushName = data.pushName || '';

    const isAllowedTest = AGENT_ALLOW_PHONES.some(p => phone.endsWith(p.slice(-11)));
    const hasIntent = !!intent.service;
    const isKnownLead = await isKnownLeadPhone(phone);

    if (!hasIntent && !isKnownLead && !isAllowedTest) {
      console.log(`[Agente] Sem intenção e não é lead nosso (${phone}) — agente NÃO ativa. Msg: "${content.substring(0, 60)}"`);
      return;
    }

    if (hasIntent) {
      await tagLeadAgent(phone, pushName, intent).catch(() => {});
      console.log(`[Agente] Intencao ${intent.code} (${intent.source}) p/ ${phone}`);
    }

    await axios.post(AGENT_N8N_URL, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    console.log(`[Agente] Inbound ${phone} (${AGENT_INSTANCE}) → agente_mestre`);
  } catch (e) {
    console.error('[Agente] Falha ao encaminhar pro n8n:', e.response?.status || e.message);
  }
}

async function notifyRaulEvolution(fromPhone, prospect, resposta) {
  const name = prospect.name || 'Lead';
  const phone = prospect.phone?.replace(/^55/, '') || fromPhone;
  const company = prospect.company || '';
  const segment = prospect.segment || '';

  let msg = `🔔 *${name} respondeu!*\n📞 +55 ${phone}\n`;
  if (company) msg += `🏢 ${company}\n`;
  if (segment) msg += `📐 ${segment}\n`;
  msg += `\n💬 _${resposta.substring(0, 300)}_`;

  try {
    await axios.post(`${EVO_URL}/message/sendText/Raul%20Santos`, {
      number: AGENTS_GROUP,
      text: msg,
      delay: 1200,
    }, {
      headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    console.log(`[Notify Evo] Alerta enviado para Raul: ${name}`);
  } catch (e) {
    console.error(`[Notify Evo] Falha:`, e.response?.status || e.message);
  }
}

/**
 * Processa eventos recebidos da Evolution API via webhook
 */
export async function handleWebhook(payload, io) {
  console.log("Incoming Webhook Event:", payload?.event);

  // Encaminha para o agente n8n (AGENTE PEDRO) mensagens inbound da instância do agente
  maybeForwardAgentInbound(payload);

  // Forward webhook if configured
  if (process.env.FORWARD_WEBHOOK_URL) {
    const forwardUrl = process.env.FORWARD_WEBHOOK_URL;
    console.log(`[Forwarding] Attempting to forward webhook to: ${forwardUrl}`);
    axios.post(forwardUrl, payload, { timeout: 5000 })
      .then(() => console.log(`[Forwarding] Successfully forwarded webhook to: ${forwardUrl}`))
      .catch(err => {
        if (err.response?.status === 404) {
          console.warn(`[Forwarding] Target URL not found (404): ${forwardUrl}. Please check if the n8n workflow is active.`);
        } else {
          console.error(`[Forwarding] Failed to forward webhook to ${forwardUrl}:`, err.message);
        }
      });
  }

  console.log(`[Webhook] Parsing payload for event: ${payload?.event || payload?.type}`);
  const parsed = evolutionApi.parseIncomingWebhook(payload);
  if (!parsed) {
    console.log("[Webhook] Event ignored or failed to parse. Payload keys:", Object.keys(payload));
    return;
  }

  console.log(`[Webhook] Parsed event: ${parsed.event}. Direction: ${parsed.fromMe ? 'outbound' : 'inbound'}`);

  if (parsed.event === 'message') {
    await handleIncomingMessage(parsed, io);
  }

  if (parsed.event === 'connection') {
    if (io) io.emit('connection_update', { state: parsed.state });
  }

  if (parsed.event === 'contacts_upsert') {
    await handleContactsUpsert(parsed.contacts, io);
  }
}

async function handleIncomingMessage(msg, io) {
  // Ignorar mensagens de status/stories do WhatsApp
  if (msg.chatId === 'status@broadcast' || msg.phone === 'status') {
    console.log('[Webhook] Ignorando mensagem de status/story do WhatsApp');
    return;
  }

  // Ignora mensagens de GRUPOS — não devem virar contato/conversa no inbox
  if (typeof msg.chatId === 'string' && msg.chatId.endsWith('@g.us')) {
    console.log('[Webhook] Ignorando mensagem de grupo:', msg.chatId);
    return;
  }

  // Números pessoais/ignorados: nem entram no CRM (some da pipeline) nem são respondidos
  const senderDigits = String(msg.phone || '').replace(/\D/g, '');
  if (senderDigits && await isIgnoredPhone(senderDigits)) {
    console.log('[Webhook] Número pessoal/ignorado — não entra no CRM:', senderDigits);
    return;
  }

  // ═══ OPT-OUT ═══ lead pediu para parar de receber mensagens
  if (!msg.fromMe && msg.content && isOptOut(msg.content)) {
    const digits = String(msg.phone || '').replace(/\D/g, '');
    console.log(`[OptOut] ${digits} pediu para parar — bloqueando e respondendo uma vez`);
    try {
      await run(`INSERT INTO personal_ignore (phone, name) VALUES (?, 'opt-out') ON CONFLICT (phone) DO NOTHING`, [digits]);
    } catch (e) { console.error('[OptOut] erro personal_ignore:', e.message); }
    try {
      const pool = getAgentePool();
      if (pool) {
        await pool.query(
          `UPDATE leads SET opted_out = true, lead_stage = 'descartado', updated_at = NOW()
            WHERE regexp_replace(phone,'[^0-9]','','g') LIKE '%' || $1`, [digits.slice(-8)]);
      }
    } catch (e) { console.error('[OptOut] erro leads.opted_out:', e.message); }
    try {
      await evolutionApi.sendTextMessage(digits, 'Sem problema! Não te chamo mais por aqui. Sucesso! 🌿');
    } catch (e) { console.error('[OptOut] erro ao responder:', e.message); }
    return;
  }

  // ═══ BOSS MODE ═══ intercepta antes de processar como mensagem normal
  const BOSS_PHONES = (process.env.BOSS_PHONES || '').split(',').map(p => p.trim()).filter(Boolean);
  const rawPhone = (msg.phone || '').replace(/\D/g, '');
  // Normaliza: remove 9º dígito se presente (55XX9XXXX → 55XXXXXX)
  const normalize = (p) => p.length === 13 && p.startsWith('55') ? p.slice(0,4) + p.slice(5) : p;
  const senderNorm = normalize(rawPhone);
  const isBoss = BOSS_PHONES.some(bp => normalize(bp.replace(/\D/g,'')) === senderNorm);
  
  if (isBoss && msg.content) {
    console.log('[BOSS] Comando de ' + rawPhone + ': ' + (msg.content||'').substring(0,80));
    try {
      const { handleBossCommand } = await import('../services/bossMode.js');
      const metaApi = await import('../services/metaWhatsapp.js');
      await handleBossCommand(rawPhone, msg.content, msg.pushName || 'Chefe', metaApi);
      return;
    } catch (e) {
      console.error('[BOSS] Erro:', e.message);
    }
  }

  // Process both inbound and outbound messages
  const direction = msg.fromMe ? 'outbound' : 'inbound';

  try {
    console.log(`Processing ${direction} message from ${msg.phone}: ${msg.content?.substring(0, 50)}`);

    // Clean phone number for consistent lookup
    let cleanPhone = msg.phone.replace(/\D/g, '');
    // Brazilian number normalization (add 55 if missing, handle 9th digit)
    if (cleanPhone.length === 11 && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    } else if (cleanPhone.length === 10 && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }
    
    // 1) Encontrar ou criar contato
    // Try to find by exact match, or by matching the last 8 digits (more flexible)
    let contact = await queryOne('SELECT * FROM contacts WHERE phone = ?', [cleanPhone]);
    // Fallback: match pelos ultimos 8 digitos (sem o 55) se nao encontrou exato
    if (!contact && cleanPhone.length >= 10) {
      const short = cleanPhone.replace(/^55/, '').slice(-8);
      contact = await queryOne("SELECT * FROM contacts WHERE REPLACE(phone, '55', '') LIKE ?", [`%${short}`]);
    }
    const now = new Date().toISOString();

    // Buscar nome real do contato na Evolution API quando:
    // - mensagem enviada por nós (fromMe), pois pushName seria nosso nome
    // - contato salvo com número no lugar do nome (indica que nome nunca foi puxado)
    const needsFetch = msg.fromMe || (contact && contact.name === contact.phone);
    let resolvedName = msg.fromMe ? null : (msg.pushName || null);

    if (needsFetch) {
      try {
        const info = await evolutionApi.getContactInfo(cleanPhone);
        const fetched = Array.isArray(info) ? info[0] : info;
        const fetchedName = fetched?.pushName || fetched?.name || fetched?.notify;
        if (fetchedName && fetchedName.trim()) {
          resolvedName = fetchedName.trim();
          console.log(`[Webhook] Nome puxado da Evolution: ${resolvedName}`);
        }
      } catch (err) {
        console.log(`[Webhook] Não foi possível buscar contato na Evolution: ${err.message}`);
      }
    }

    const contactName = resolvedName || msg.pushName || cleanPhone;

    if (!contact) {
      console.log(`Contact not found for phone ${cleanPhone}, creating new contact...`);
      const id = uuidv4();
      await run(`
        INSERT INTO contacts (id, name, phone, status, pipeline_stage, last_interaction, created_at, updated_at)
        VALUES (?, ?, ?, 'active', 'stage_lead', ?, ?, ?)
      `, [id, contactName, cleanPhone, now, now, now]);
      contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
      console.log(`New contact created: ${contact.id} (${contactName})`);
    } else {
      console.log(`Found existing contact: ${contact.id} (${contact.name})`);
      // Atualizar nome se estava salvo como número ou nome genérico
      const nameIsGeneric = !contact.name || contact.name === contact.phone || contact.name === cleanPhone;
      if (nameIsGeneric && resolvedName) {
        await run("UPDATE contacts SET name = ?, last_interaction = ?, updated_at = ? WHERE id = ?", [resolvedName, now, now, contact.id]);
        contact.name = resolvedName;
        console.log(`[Webhook] Nome do contato atualizado para: ${resolvedName}`);
      } else {
        await run("UPDATE contacts SET last_interaction = ?, updated_at = ? WHERE id = ?", [now, now, contact.id]);
      }
    }

    // Marca a OFERTA de interesse (gestão de tráfego / site) quando um inbound
    // chega com intenção clara — base pro Chief separar o funil por produto
    try {
      if (direction === 'inbound' && msg.content) {
        const intent = classifyIntent(msg.content);
        const offer = (intent.service === 'trafico_pago' || intent.service === 'ambos')
          ? 'oferta:gestao_trafego'
          : intent.service === 'criacao_de_site' ? 'oferta:site'
          : (intent.service === 'automacao_comercial' || intent.service === 'crm') ? 'oferta:automacao' : null;
        if (offer) {
          let existing = [];
          try { const a = JSON.parse(contact.tags || '[]'); existing = Array.isArray(a) ? a : []; } catch {}
          if (!existing.includes(offer)) {
            existing.push(offer);
            await run('UPDATE contacts SET tags = ?, updated_at = ? WHERE id = ?', [JSON.stringify(existing), now, contact.id]);
          }
        }
      }
    } catch (e) { console.error('[Webhook] Erro ao marcar oferta:', e.message); }

    // 2) Resolver instância pelo nome do payload
    let instanceId = 'instance_default';
    if (msg.instance) {
      const inst = await queryOne('SELECT id FROM whatsapp_instances WHERE instance_name = ?', [msg.instance]);
      if (inst) instanceId = inst.id;
    }

    // 3) Encontrar ou criar conversa
    let conv = await queryOne('SELECT * FROM conversations WHERE whatsapp_chat_id = ?', [msg.chatId]);
    if (!conv) {
      conv = await queryOne('SELECT * FROM conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1', [contact.id]);
    }

    if (!conv) {
      console.log(`Conversation not found for contact ${contact.id}, creating new conversation...`);
      const id = uuidv4();
      await run(`
        INSERT INTO conversations (id, contact_id, whatsapp_chat_id, instance_id, status, last_message, last_message_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)
      `, [id, contact.id, msg.chatId, instanceId, msg.content, now, now, now]);
      conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [id]);
      console.log(`New conversation created: ${conv.id}`);
    } else {
      console.log(`Found existing conversation: ${conv.id}`);
      // Update whatsapp_chat_id if missing or different
      const updateSql = `UPDATE conversations SET last_message = ?, last_message_at = ?, unread_count = ${direction === 'inbound' ? 'unread_count + 1' : 'unread_count'}, updated_at = ?, whatsapp_chat_id = ? WHERE id = ?`;
      await run(updateSql, [msg.content, now, now, msg.chatId, conv.id]);
      conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [conv.id]);
    }

    // 3) Salvar mensagem
    const existing = msg.messageId ? await queryOne('SELECT id FROM messages WHERE whatsapp_message_id = ?', [msg.messageId]) : null;
    let savedMsgId;
    let mediaUrl = null;
    if (!existing) {
      savedMsgId = uuidv4();
      console.log(`Saving new message ${savedMsgId} (WhatsApp ID: ${msg.messageId})`);

      // Buscar mídia como base64 para armazenamento permanente
      if (['audio', 'image', 'video', 'document'].includes(msg.type) && msg.raw) {
        try {
          const mediaData = await evolutionApi.getBase64FromMediaMessage(msg.raw);
          if (mediaData?.base64 && mediaData?.mimetype) {
            mediaUrl = `data:${mediaData.mimetype};base64,${mediaData.base64}`;
            console.log(`[Webhook] Mídia ${msg.type} baixada (${mediaData.mimetype})`);
          }
        } catch (err) {
          console.log(`[Webhook] Não foi possível baixar mídia: ${err.message}`);
        }
      }

      await run(`
        INSERT INTO messages (id, conversation_id, whatsapp_message_id, direction, type, content, media_url, status, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'delivered', ?)
      `, [savedMsgId, conv.id, msg.messageId, direction, msg.type, msg.content, mediaUrl, msg.timestamp]);
      console.log("Message saved successfully");
    } else {
      savedMsgId = existing.id;
      console.log(`Message with WhatsApp ID ${msg.messageId} already exists, skipping save.`);
    }

    // 4) Se mensagem inbound, verificar se é de um prospect e atualizar status
    if (direction === 'inbound') {
      try {
        // Buscar prospect pelo telefone (exact ou últimos 11 dígitos)
        const phoneVariants = [
          cleanPhone,
          cleanPhone.replace(/^55/, ''),           // sem DDI
          '55' + cleanPhone.replace(/^55/, ''),     // com DDI
        ];
        // Adicionar variante com/sem 9º dígito
        const phoneBase = cleanPhone.replace(/^55/, '');
        if (phoneBase.length === 11) {
          // tem 9º dígito → adicionar sem
          phoneVariants.push('55' + phoneBase.slice(0, 2) + phoneBase.slice(3));
        } else if (phoneBase.length === 10) {
          // sem 9º dígito → adicionar com
          phoneVariants.push('55' + phoneBase.slice(0, 2) + '9' + phoneBase.slice(2));
        }

        const placeholders = phoneVariants.map(() => '?').join(', ');
        const prospect = await queryOne(
          `SELECT id, name, phone, company, segment, status, notes FROM prospects WHERE phone IN (${placeholders}) AND status = 'enviado' LIMIT 1`,
          phoneVariants
        );

        if (prospect) {
          const resposta = (msg.content || '').substring(0, 500);
          const novaNote = `[Respondeu ${new Date().toLocaleDateString('pt-BR')}]: ${resposta}`;
          const notesAtual = prospect.notes ? prospect.notes + '\n' + novaNote : novaNote;

          await run(
            `UPDATE prospects SET status = 'respondeu', notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [notesAtual, prospect.id]
          );
          console.log(`[Webhook] Prospect ${prospect.id} atualizado para 'respondeu'. Resposta: "${resposta.substring(0, 60)}"`);
          // Notifica Raul no WhatsApp via Evolution
          notifyRaulEvolution(msg.phone, prospect, resposta).catch(e => console.error('[Notify Evo] Erro:', e.message));
        }
      } catch (err) {
        console.error('[Webhook] Erro ao atualizar status do prospect:', err.message);
      }
    }

    // 5) Emitir via socket para o front-end em tempo real
    if (io) {
      const fullContact = { ...contact, tags: JSON.parse(typeof contact.tags === 'string' ? contact.tags : '[]') };
      const updatedConv = await queryOne(`
        SELECT c.*, ct.name as contact_name, ct.phone as contact_phone, ct.avatar as contact_avatar
        FROM conversations c
        JOIN contacts ct ON c.contact_id = ct.id
        WHERE c.id = ?
      `, [conv.id]);
      
      console.log("Emitting new_message to socket clients...");
      io.emit('new_message', {
        conversation: updatedConv,
        contact: fullContact,
        message: {
          id: savedMsgId,
          conversation_id: conv.id,
          whatsapp_message_id: msg.messageId,
          direction: direction,
          type: msg.type,
          content: msg.content,
          media_url: mediaUrl,
          timestamp: msg.timestamp,
        },
      });
    }
  } catch (err) {
    console.error('handleIncomingMessage CRITICAL ERROR:', err);
  }
}

async function handleContactsUpsert(contacts, io) {
  for (const c of contacts) {
    if (!c.phone || !c.name) continue;
    let cleanPhone = c.phone.replace(/\D/g, '');
    if (cleanPhone.length === 11 && !cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;
    else if (cleanPhone.length === 10 && !cleanPhone.startsWith('55')) cleanPhone = '55' + cleanPhone;

    let contact = await queryOne('SELECT * FROM contacts WHERE phone = ?', [cleanPhone]);
    if (!contact && cleanPhone.length >= 10) {
      const short = cleanPhone.replace(/^55/, '').slice(-8);
      contact = await queryOne("SELECT * FROM contacts WHERE REPLACE(phone, '55', '') LIKE ?", [`%${short}`]);
    }
    if (!contact) continue;

    const nameIsGeneric = !contact.name || contact.name === contact.phone || contact.name === cleanPhone || /^\d+$/.test(contact.name);
    if (nameIsGeneric || contact.name !== c.name) {
      const now = new Date().toISOString();
      await run('UPDATE contacts SET name = ?, updated_at = ? WHERE id = ?', [c.name, now, contact.id]);
      console.log(`[contacts.upsert] Nome atualizado: "${contact.name}" → "${c.name}"`);
      if (io) io.emit('contact_updated', { id: contact.id, name: c.name });
    }
  }
}

export { classifyIntent, normTxt, isIgnoredPhone, isClientPhone, isSdrPausedPhone, isKnownLeadPhone, maybeForwardAgentInbound };
export default { handleWebhook };
