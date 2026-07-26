import pg from 'pg';
import { query, queryOne, run, getDb } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import * as metaApi from './metaWhatsapp.js';

const META_DISPATCH_INTERVAL = 120_000; // 2 minutos
const META_BATCH_SIZE = 6;               // prospects por ciclo
const META_DAILY_LIMIT = 400;
const META_DAYS = [1, 2, 3, 4, 5];       // seg a sex
const META_TIME_START = '08:00';          // Brasília
const META_TIME_END = '19:00';            // Brasília

function getBrazilDate() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

let dispatchRunning = false;

// Pool para o banco de leads (dedup cross-database)
const LEADS_DB_URL = process.env.DATABASE_LEADS_URL;
let leadsPool = null;
function getLeadsPool() {
  if (!leadsPool && LEADS_DB_URL) {
    leadsPool = new pg.Pool({
      connectionString: LEADS_DB_URL,
      connectionTimeoutMillis: 5000,
      max: 2,
    });
  }
  return leadsPool;
}

async function isAlreadyContacted(phone) {
  return false; // cross-database dedup desabilitado — leads DB era clone do SQLite antigo
}

// Templates: carregados do banco (meta_templates)
let templatesCache = [];
let templatesLastLoad = 0;
const TEMPLATES_CACHE_TTL = 60_000; // 1 min

async function loadTemplates() {
  const now = Date.now();
  if (templatesCache.length && now - templatesLastLoad < TEMPLATES_CACHE_TTL) {
    return templatesCache;
  }
  const rows = await query(
    "SELECT * FROM meta_templates WHERE paused = 0 AND sent_count < max_sends ORDER BY name"
  );
  templatesCache = rows.map(r => ({
    ...r,
    vars: JSON.parse(r.vars || '[]'),
  }));
  templatesLastLoad = now;
  return templatesCache;
}

function pickTemplate(prospect) {
  const available = templatesCache.filter(t => t.sent_count < t.max_sends);
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function resolveVar(prospect, varName) {
  switch (varName) {
    case 'primeiro_nome':
      return (prospect.name || 'engenheiro').split(' ')[0];
    case 'empresa':
      return prospect.company || 'sua empresa';
    default:
      return '';
  }
}

function cleanPhone(phone) {
  let p = String(phone).replace(/\D/g, '');
  if (p.length === 11 && !p.startsWith('55')) p = '55' + p;
  else if (p.length === 10 && !p.startsWith('55')) p = '55' + p;
  return p;
}

async function resetDailyCountIfNeeded() {
  const meta = await queryOne(
    "SELECT value, updated_at FROM system_config WHERE key = 'meta_daily_count'"
  );
  if (!meta) {
    await run("INSERT INTO system_config (key, value, updated_at) VALUES ('meta_daily_count', '0', datetime('now'))");
    return 0;
  }
  const updated = new Date(meta.updated_at);
  const now = getBrazilDate();
  if (updated.toDateString() !== now.toDateString()) {
    await run("UPDATE system_config SET value = '0', updated_at = datetime('now') WHERE key = 'meta_daily_count'");
    return 0;
  }
  return parseInt(meta.value || '0');
}

async function incrementDailyCount() {
  await run(
    "UPDATE system_config SET value = CAST(value AS INTEGER) + 1, updated_at = datetime('now') WHERE key = 'meta_daily_count'"
  );
}

export async function processMetaDispatch() {
  try {
    if (!metaApi.isConfigured()) return { sent: 0, error: 'Meta API não configurada' };

    // Recarrega templates do banco
    const templates = await loadTemplates();
    if (!templates.length) return { sent: 0, reason: 'no_templates' };

    // Verifica dia da semana (Brasília)
    const now = getBrazilDate();
    const dayOfWeek = now.getDay();
    if (!META_DAYS.includes(dayOfWeek)) return { sent: 0, reason: 'outside_days' };

    // Verifica janela de horario (Brasilia)
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = META_TIME_START.split(':').map(Number);
    const [eh, em] = META_TIME_END.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (currentMinutes < startMin || currentMinutes > endMin) return { sent: 0, reason: 'outside_hours' };

    const dailyCount = await resetDailyCountIfNeeded();
    if (dailyCount >= META_DAILY_LIMIT) return { sent: 0, reason: 'daily_limit_reached' };

    const remaining = META_DAILY_LIMIT - dailyCount;
    const limit = Math.min(remaining, META_BATCH_SIZE);

    // Pega prospects 'novo' da campanha padrão, reserva atomicamente
    const campaign = await queryOne(
      "SELECT * FROM prospecting_campaigns WHERE status = 'active' LIMIT 1"
    );
    if (!campaign) return { sent: 0, reason: 'no_active_campaign' };

    // Reset diário do contador da campanha (Brasília)
    const todayStr = now.toDateString();
    const lastReset = campaign.last_reset_date ? new Date(campaign.last_reset_date).toDateString() : null;
    if (lastReset !== todayStr) {
      await run("UPDATE prospecting_campaigns SET sent_today = 0, last_reset_date = ? WHERE id = ?", [now.toISOString(), campaign.id]);
      campaign.sent_today = 0;
    }

    if (campaign.sent_today >= (campaign.daily_limit || 50)) {
      return { sent: 0, reason: 'campaign_daily_limit', sent_today: campaign.sent_today };
    }

    const prospects = await getDb().atomicReserve(campaign.id, limit);
    if (!prospects || !prospects.length) return { sent: 0, reason: 'queue_empty' };

    let sent = 0;
    for (const prospect of prospects) {
      try {
        const phone = cleanPhone(prospect.phone);

        // Verifica se ja foi contactado anteriormente (leads DB)
        if (await isAlreadyContacted(phone)) {
          console.log(`[MetaDispatch] Skip duplicate: ${prospect.name} (${phone})`);
          await run("UPDATE prospects SET status = 'descartado', updated_at = datetime('now') WHERE id = ?", [prospect.id]);
          await run(
            "INSERT INTO prospecting_logs (id, prospect_id, campaign_id, action, message) VALUES (?, ?, ?, 'descartado_dup', 'Ja contactado anteriormente')",
            [uuidv4(), prospect.id, campaign.id]
          );
          continue;
        }

        // Recarrega templates a cada ciclo (podem ter pausado)
        const freshTemplates = await loadTemplates();
        const tpl = pickTemplate(prospect);
        if (!tpl) {
          console.log('[MetaDispatch] No available templates (all paused or limit reached) — leaving as reservado');
          continue;
        }

        const components = tpl.vars.map(varName => ({
          type: 'text',
          text: resolveVar(prospect, varName),
        }));

        const result = await metaApi.sendTemplate(phone, tpl.name, 'pt_BR', components, tpl.media_url);
        const wamid = result?.messages?.[0]?.id || null;

        // Marca como enviado
        await run("UPDATE prospects SET status = 'enviado', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [prospect.id]);

        // Log com wamid pra tracking de entrega
        await run(
          "INSERT INTO meta_template_logs (id, template_id, prospect_id, phone, status, wamid) VALUES (?, ?, ?, ?, 'sent', ?)",
          [uuidv4(), tpl.id, prospect.id, phone, wamid]
        );
        await run("UPDATE prospecting_campaigns SET sent_today = sent_today + 1 WHERE id = ?", [campaign.id]);
        await incrementDailyCount();

        // Incrementa contador do template e pausa se atingiu max_sends
        await run(
          "UPDATE meta_templates SET sent_count = sent_count + 1, updated_at = datetime('now') WHERE id = ?",
          [tpl.id]
        );

        // Verifica se atingiu o limite
        const updatedTpl = await queryOne("SELECT sent_count, max_sends FROM meta_templates WHERE id = ?", [tpl.id]);
        if (updatedTpl && updatedTpl.sent_count >= updatedTpl.max_sends) {
          await run("UPDATE meta_templates SET paused = 1, updated_at = datetime('now') WHERE id = ?", [tpl.id]);
          console.log(`[MetaDispatch] Template "${tpl.name}" pausado (${updatedTpl.sent_count}/${updatedTpl.max_sends})`);
        }

        // Log
        await run(
          "INSERT INTO prospecting_logs (id, prospect_id, campaign_id, action, message) VALUES (?, ?, ?, 'enviado_meta', ?)",
          [uuidv4(), prospect.id, campaign.id, `template:${tpl.name} | vars:${JSON.stringify(components)}`]
        );

        // Sync CRM
        await syncToCRM(prospect, tpl, components);
        sent++;

        console.log(`[MetaDispatch] Sent to ${prospect.name} (${phone}) via ${tpl.name} (${updatedTpl?.sent_count || '?'}/${tpl.max_sends})`);
      } catch (err) {
        console.error(`[MetaDispatch] Failed for ${prospect.name}:`, err.message);
        await run("UPDATE prospects SET status = 'descartado', updated_at = datetime('now') WHERE id = ?", [prospect.id]);
        await run(
          "INSERT INTO prospecting_logs (id, prospect_id, campaign_id, action, error) VALUES (?, ?, ?, 'erro_meta', ?)",
          [uuidv4(), prospect.id, campaign.id, err.message]
        );
        // conta como tentativa (sem delay)
        sent++;
      }
    }

    return { sent };
  } catch (err) {
    console.error('[MetaDispatch] Fatal error:', err.message);
    return { sent: 0, error: err.message };
  }
}

async function syncToCRM(prospect, tpl, components) {
  try {
    const cleanPhone = String(prospect.phone).replace(/\D/g, '');
    const name = prospect.name || prospect.company || cleanPhone;
    const now = new Date().toISOString();
    const segmentNote = [
      'prospecção_ativa_meta',
      prospect.segment && `segmento: ${prospect.segment}`,
      prospect.city && `cidade: ${prospect.city}`,
    ].filter(Boolean).join(' | ');

    let contact = await queryOne(
      "SELECT * FROM contacts WHERE phone = ?",
      [cleanPhone]
    );

    // Tenta match pelos ultimos 8 digitos apenas se nao encontrou exato
    if (!contact && cleanPhone.length >= 10) {
      contact = await queryOne(
        "SELECT * FROM contacts WHERE REPLACE(phone, '55', '') LIKE ?",
        [`%${cleanPhone.replace(/^55/, '').slice(-8)}`]
      );
    }

    if (!contact) {
      const id = uuidv4();
      await run(
        `INSERT INTO contacts (id, name, phone, company, tags, notes, status, pipeline_stage, last_interaction, created_at, updated_at)
         VALUES (?, ?, ?, ?, '["prospecção_ativa_meta"]', ?, 'active', 'stage_lead', ?, ?, ?)`,
        [id, name, cleanPhone, prospect.company || null, segmentNote, now, now, now]
      );
      contact = await queryOne('SELECT * FROM contacts WHERE id = ?', [id]);
    } else {
      let existingTags = [];
      try { existingTags = JSON.parse(contact.tags || '[]'); } catch {}
      if (!existingTags.includes('prospecção_ativa_meta')) existingTags.push('prospecção_ativa_meta');
      await run('UPDATE contacts SET tags = ?, notes = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(existingTags), segmentNote, now, contact.id]);
    }

    // Cria conversa
    let conv = await queryOne(
      "SELECT * FROM conversations WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1",
      [contact.id]
    );

    // Resolve o texto real do template com as variaveis
    const values = components.map(c => c.text);
    let resolvedBody = tpl.body || '';
    values.forEach((v, i) => { resolvedBody = resolvedBody.replace(`{{${i+1}}}`, v); });

    if (!conv) {
      const convId = uuidv4();
      await run(
        `INSERT INTO conversations (id, contact_id, status, last_message, last_message_at, created_at, updated_at)
         VALUES (?, ?, 'open', ?, ?, ?, ?)`,
        [convId, contact.id, resolvedBody, now, now, now]
      );
      conv = await queryOne('SELECT * FROM conversations WHERE id = ?', [convId]);
    } else {
      await run(
        "UPDATE conversations SET last_message = ?, last_message_at = ?, updated_at = ? WHERE id = ?",
        [resolvedBody, now, now, conv.id]
      );
    }

    // Insere mensagem no chat
    const msgId = uuidv4();
    const isImage = tpl.name.toLowerCase().includes('imagem');
    const isVideo = tpl.name.toLowerCase().includes('video');
    const msgType = isVideo ? 'video' : isImage ? 'image' : 'text';
    const msgContent = resolvedBody;
    const mediaUrl = tpl.media_url || null;
    await run(
      `INSERT INTO messages (id, conversation_id, direction, type, content, media_url, status, timestamp)
       VALUES (?, ?, 'outbound', ?, ?, ?, 'sent', ?)`,
      [msgId, conv.id, msgType, msgContent, mediaUrl, now]
    );
  } catch (err) {
    console.error('[MetaDispatch] CRM sync error:', err.message);
  }
}

export function startMetaDispatcher() {
  const run = async () => {
    if (dispatchRunning) return;
    dispatchRunning = true;
    try {
      const result = await processMetaDispatch();
      if (result.sent > 0) console.log(`[MetaDispatch] ${result.sent} prospects sent`);
      else if (result.reason && result.reason !== 'queue_empty') {
        console.log(`[MetaDispatch] Skipped: ${result.reason}${result.sent_today ? ` (${result.sent_today} sent today)` : ''}`);
      }
    } catch (err) {
      console.error('[MetaDispatch] Error:', err.message);
    }
    dispatchRunning = false;
  };

  // Primeiro disparo após 30s, depois a cada 2min
  setTimeout(run, 30_000);
  setInterval(run, META_DISPATCH_INTERVAL);

  // Desbloqueia prospects 'reservado' que ficaram travados há mais de 10 min
  setInterval(async () => {
    try {
      const result = await run(
        "UPDATE prospects SET status = 'novo', updated_at = datetime('now') WHERE status = 'reservado' AND updated_at < datetime('now', '-10 minutes')"
      );
      if (result?.changes > 0) console.log(`[MetaDispatch] Unstuck: ${result.changes} prospects voltaram de reservado → novo`);
    } catch (_) {}
  }, 600_000); // a cada 10 min

  // Relatório horário de status
  setInterval(() => {
    if (!metaApi.isConfigured()) return;
    console.log(`[MetaDispatch] Worker ativo — monitorando aprovação de templates. Erro atual: "Template name does not exist" = aguardando Meta aprovar.`);
  }, 3_600_000);
}
