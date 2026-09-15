/**
 * Rotas dos agentes — notas de voz (TTS ElevenLabs) para o SDR inbound.
 *
 * POST /api/agents/voice-reply  { phone, text, send? }
 *   Sintetiza o texto na voz clonada e (por padrão) envia como PTT via Evolution.
 *
 * GET  /api/agents/voice/status   → { configured, voice_id }
 * GET  /api/agents/voice/voices   → lista as vozes da conta (achar/confirmar voice_id)
 *
 * Todas exigem o token interno (x-internal-key), o mesmo usado pelas automações n8n.
 */

import express from 'express';
import pg from 'pg';
import evolutionApi from '../services/evolutionApi.js';
import { synthesizeSpeech, listVoices, isConfigured, getUsage } from '../services/elevenLabsService.js';
import { polishForSpeech } from '../services/voiceScriptService.js';
import { chatContent } from '../services/llm.js';

const router = express.Router();

// ── Conexão com o banco do Agente (leads / dossiê) ───────────────────────────
let agentePool = null;
function getAgentePool() {
  if (!agentePool) {
    const url = process.env.DATABASE_AGENTE_URL;
    if (!url) return null;
    agentePool = new pg.Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 5000 });
  }
  return agentePool;
}

function appBaseUrl() {
  return (process.env.APP_URL || 'https://vigasales.shop').replace(/\/$/, '');
}

// Gera um recado FALADO de resumo a partir do dossiê do lead (para a reunião)
async function buildMeetingSummary(lead) {
  const nome = (lead.name || '').trim() || 'tudo bem';
  const notes = String(lead.notes || '').trim();
  const fallback = `Oi, ${nome}! Sua reunião de diagnóstico com a Viga Sales está confirmada. Já deixei tudo anotado pra gente aproveitar bem esse tempo. Qualquer coisa, me chama por aqui. Até lá!`;
  if (!notes) return fallback;
  try {
    const out = await chatContent({
      model: process.env.ELEVENLABS_POLISH_MODEL || 'deepseek-chat',
      temperature: 0.5,
      max_tokens: 400,
      messages: [
        { role: 'system', content: 'Você escreve recados FALADOS curtos, calorosos e naturais em português do Brasil, em primeira pessoa, como o Raul da Viga Sales.' },
        { role: 'user', content: `Resuma o dossiê do lead em um recado falado de 3 a 5 frases para enviar por áudio confirmando a reunião agendada com ${nome}. Cite os pontos-chave (empresa, dor principal, o que vamos tratar) de forma objetiva e calorosa. Não invente informação que não esteja no dossiê. Responda APENAS com o texto do recado.\n\nDOSSÊ:\n${notes}` },
      ],
    });
    const txt = String(out || '').trim().replace(/^["']|["']$/g, '');
    return txt || fallback;
  } catch (err) {
    console.warn('[StrategicVoice] Falha ao gerar resumo, usando fallback:', err.message);
    return fallback;
  }
}

function internalAuth(req, res, next) {
  const expected = process.env.VIGA_INTERNAL_TOKEN || process.env.N8N_AUTH_TOKEN;
  if (!expected) return res.status(503).json({ error: 'VIGA_INTERNAL_TOKEN não configurado' });
  const bearer = (req.headers.authorization || '').replace('Bearer ', '');
  const token = req.headers['x-internal-key'] || req.query.internal_key || req.query.token || bearer;
  if (token !== expected) return res.status(401).json({ error: 'Token interno inválido' });
  next();
}

// GET /api/agents/voice/status
router.get('/voice/status', internalAuth, (req, res) => {
  res.json({
    configured: isConfigured(),
    voice_id: process.env.ELEVENLABS_VOICE_ID || null,
    model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5',
    usage: getUsage(),
  });
});

// GET /api/agents/voice/voices — lista vozes (debug / descobrir voice_id)
router.get('/voice/voices', internalAuth, async (req, res) => {
  try {
    res.json({ voices: await listVoices() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/voice/preview?text=... — só gera o áudio, não envia
router.get('/voice/preview', internalAuth, async (req, res) => {
  try {
    const text = String(req.query.text || 'Oi! Aqui é o Raul, da Viga Sales.');
    const spoken = req.query.polish === 'false' ? text : await polishForSpeech(text);
    const tts = await synthesizeSpeech(spoken, {
      modelId: req.query.modelId,
      speed: req.query.speed ? parseFloat(req.query.speed) : undefined,
      stability: req.query.stability ? parseFloat(req.query.stability) : undefined,
      style: req.query.style ? parseFloat(req.query.style) : undefined,
    });
    const appUrl = (process.env.APP_URL || 'https://vigasales.shop').replace(/\/$/, '');
    res.json({ ok: true, audio_url: `${appUrl}${tts.url}`, cached: tts.cached, text_spoken: spoken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/voice-reply  { phone, text, send }
router.post('/voice-reply', internalAuth, async (req, res) => {
  try {
    const { phone, text, send = true, modelId, speed, polish, stability, style } = req.body || {};
    if (!phone || !text) return res.status(400).json({ error: 'phone e text são obrigatórios' });

    const spoken = polish === false ? String(text) : await polishForSpeech(String(text));
    const tts = await synthesizeSpeech(spoken, {
      modelId,
      speed: speed !== undefined ? parseFloat(speed) : undefined,
      stability: stability !== undefined ? parseFloat(stability) : undefined,
      style: style !== undefined ? parseFloat(style) : undefined,
    });
    const appUrl = (process.env.APP_URL || 'https://vigasales.shop').replace(/\/$/, '');
    const audioUrl = `${appUrl}${tts.url}`;

    let sent = false;
    if (send) {
      await evolutionApi.sendAudioMessage(phone, audioUrl);
      sent = true;
      console.log(`[VoiceReply] Áudio enviado para ${phone} (${tts.filename}${tts.cached ? ', cache' : ''})`);
    }

    res.json({ ok: true, audio_url: audioUrl, cached: tts.cached, sent, text_spoken: spoken });
  } catch (err) {
    console.error('[VoiceReply] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/strategic-voice  { phone }
// Decide, por gatilho, se manda áudio agora (1 áudio por momento estratégico):
//  - Saudação: nome preenchido e ainda não saudado
//  - Resumo: reunião agendada e ainda não resumido
router.post('/strategic-voice', internalAuth, async (req, res) => {
  try {
    const { phone, message } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
    const digits = String(phone).replace(/\D/g, '');
    const tail = digits.slice(-8);
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const pool = getAgentePool();
    const { rows } = await pool.query(
      `SELECT phone, name, lead_stage, notes, voice_greeting_sent, voice_summary_sent
         FROM leads
        WHERE regexp_replace(phone,'[^0-9]','','g') LIKE '%' || $1 || '%'
        ORDER BY updated_at DESC LIMIT 1`,
      [tail]
    );
    const lead = rows[0];
    if (!lead) return res.json({ ok: true, skipped: 'lead_not_found' });

    const result = { greeting: false, summary: false };

    // Gatilho 1 — saudação animada SÓ quando o lead informa o nome na própria mensagem
    const firstName = String(lead.name || '').trim().split(/\s+/)[0];
    const nameInMessage = message ? norm(message).includes(norm(firstName)) : true;
    if (lead.name && firstName && lead.voice_greeting_sent !== true && nameInMessage) {
      const text = `Oi, ${String(lead.name).trim()}! Que bom falar com você! Aqui é o Raul, da Viga Sales. A gente ajuda empresas a vender mais pela internet, com tráfego pago, sites e atendimento no WhatsApp. Me conta rapidinho o que você precisa que eu já te mostro como funciona!`;
      const tts = await synthesizeSpeech(text);
      await evolutionApi.sendAudioMessage(lead.phone, `${appBaseUrl()}${tts.url}`);
      await pool.query('UPDATE leads SET voice_greeting_sent = true WHERE phone = $1', [lead.phone]);
      // Sincroniza a memória do agente: no n8n o texto desse turno é suprimido
      // (só o áudio vai). Substitui a última mensagem de IA (que o lead não
      // recebeu) pelo texto realmente falado no áudio.
      await pool.query(
        `UPDATE chat_history_viga
            SET message = jsonb_set(message, '{content}', to_jsonb($1::text))
          WHERE id = (
            SELECT id FROM chat_history_viga
             WHERE session_id LIKE '%' || $2 || '%'
               AND message->>'type' = 'ai'
             ORDER BY id DESC LIMIT 1)`,
        [text, tail]
      ).catch(e => console.error('[StrategicVoice] Falha ao sincronizar memória:', e.message));
      result.greeting = true;
      console.log(`[StrategicVoice] Saudação enviada para ${lead.phone}`);
    }

    // Gatilho 2 — resumo do dossiê após agendar a reunião
    if (lead.lead_stage === 'reuniao_marcada' && lead.voice_summary_sent !== true) {
      const summary = await buildMeetingSummary(lead);
      const tts = await synthesizeSpeech(summary);
      await evolutionApi.sendAudioMessage(lead.phone, `${appBaseUrl()}${tts.url}`);
      await pool.query('UPDATE leads SET voice_summary_sent = true WHERE phone = $1', [lead.phone]);
      result.summary = true;
      console.log(`[StrategicVoice] Resumo enviado para ${lead.phone}`);
    }

    res.json({ ok: true, ...result, lead: { name: lead.name, stage: lead.lead_stage } });
  } catch (err) {
    console.error('[StrategicVoice] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
