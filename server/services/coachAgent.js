/**
 * DEPRECATED — Coach Agent absorvido pelo ChiefAgent v4
 * O coaching matinal agora faz parte do CEO Briefing das 8h.
 * Mantido como fallback. Para descontinuar: remover import em index.ts.
 */

import { query, queryOne } from '../db/database.js';
import axios from 'axios';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const AGENTS_GROUP = process.env.GROUP_CONTEUDO_ID || "120363429703736599@g.us";
const USD_TO_BRL = 5.5;
const COST_PER_MSG = 0.071;

let running = false;

async function getFullSnapshot() {
  const [
    sentToday, sentWeek, sentMonth,
    respToday, respWeek, respTotal,
    prospectsNew, prospectsTotal, prospectsDesk,
    templates, campaigns,
    daily7
  ] = await Promise.all([
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND DATE(created_at) = CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '30 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND DATE(responded_at::timestamp) = CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND responded_at::timestamp >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'novo'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'descartado'"),
    query("SELECT name, sent_count, max_sends, paused FROM meta_templates ORDER BY sent_count DESC"),
    query("SELECT name, status, daily_limit, sent_today FROM prospecting_campaigns ORDER BY status, name"),
    query("SELECT DATE(created_at) as dia, COUNT(*) as envios FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY dia"),
  ]);

  const st = parseInt(sentToday?.cnt || '0');
  const sw = parseInt(sentWeek?.cnt || '0');
  const sm = parseInt(sentMonth?.cnt || '0');
  const rt = parseInt(respToday?.cnt || '0');
  const rw = parseInt(respWeek?.cnt || '0');
  const ra = parseInt(respTotal?.cnt || '0');

  return {
    today: { sent: st, responses: rt, rate: st > 0 ? (rt/st*100).toFixed(1) : '0', cost: (st * COST_PER_MSG * USD_TO_BRL).toFixed(2) },
    week: { sent: sw, responses: rw, rate: sw > 0 ? (rw/sw*100).toFixed(1) : '0', cost: (sw * COST_PER_MSG * USD_TO_BRL).toFixed(2) },
    month: { sent: sm, cost: (sm * COST_PER_MSG * USD_TO_BRL).toFixed(2) },
    allTime: { responses: ra },
    queue: { new: parseInt(prospectsNew?.cnt || '0'), total: parseInt(prospectsTotal?.cnt || '0'), discarded: parseInt(prospectsDesk?.cnt || '0') },
    templates: (templates || []).slice(0, 6),
    campaigns,
    daily: daily7,
  };
}

async function generateCoaching(snapshot) {
  if (!OPENAI_KEY) return null;

  const tmpl = snapshot.templates.map(t => `${t.name}: ${t.sent_count}/${t.max_sends} ${t.paused ? '⏸' : '▶'}`).join('\n');
  const camps = (snapshot.campaigns || []).map(c => `${c.name}: ${c.status} ${c.sent_today}/${c.daily_limit}`).join('\n');
  const trend = (snapshot.daily || []).map(d => `${d.dia?.slice(5)}: ${d.envios}`).join(' ');

  const prompt = `Você é o COACH pessoal do Raul, um empresário brasileiro que:
- Vende automação de atendimento e captação de clientes (Viga Sales)
- É gestor de tráfego pago (Meta Ads)
- Cria sites e automações para clientes
- Usa WhatsApp e email como canais de prospecção

O Raul acordou agora (6h) e precisa de direção clara do que fazer hoje.

DADOS DA OPERAÇÃO:
📤 Hoje: ${snapshot.today.sent} envios, ${snapshot.today.responses} respostas (${snapshot.today.rate}%), custo R$${snapshot.today.cost}
📤 Semana: ${snapshot.week.sent} envios, ${snapshot.week.responses} respostas (${snapshot.week.rate}%), custo R$${snapshot.week.cost}
📤 Mês: ${snapshot.month.sent} envios, custo R$${snapshot.month.cost}
📦 Fila: ${snapshot.queue.new} leads novos (${snapshot.queue.total} total, ${snapshot.queue.discarded} descartados)
📥 Respostas totais: ${snapshot.allTime.responses}

TEMPLATES:
${tmpl}

CAMPANHAS:
${camps}

TENDÊNCIA 7D: ${trend}

TAREFA:
1. Dê um panorama rápido (1-2 frases) de como está a operação
2. Aponte a ação #1 mais importante pro Raul fazer HOJE (algo concreto e executável)
3. Sugira 1 melhoria nos templates ou abordagem de vendas
4. Se algo está ruim, diga com franqueza. Se está bom, reconheça.
5. Termine com uma frase motivacional curta

TOM: direto, amigo inteligente que fala a real, sem enrolação. Português do Brasil. Máximo 600 caracteres. Use emojis com moderação.`;

  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 800,
    }, { headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' } });

    return res.data?.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[Coach] OpenAI error:', err.message);
    return null;
  }
}

async function sendToGroup(snapshot, coaching) {
  if (!coaching) return;

  const msg = `☀️ *Coach Matinal — ${new Date().toLocaleDateString('pt-BR')}*\n\n` +
    `📊 Ontem: ${snapshot.today.sent} envios | ${snapshot.today.responses} respostas (${snapshot.today.rate}%) | R$ ${snapshot.today.cost}\n` +
    `📦 Fila: ${snapshot.queue.new} leads\n\n` +
    `🧠 *Direção de hoje:*\n${coaching}`;

  try {
    await axios.post(`${EVO_URL}/message/sendText/Raul%20Santos`, {
      number: AGENTS_GROUP, text: msg, delay: 1200,
    }, { headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
    console.log('[Coach] Coaching enviado');
  } catch (err) {
    console.error('[Coach] Erro ao enviar:', err.message);
  }
}

export async function runCoachAgent() {
  if (running) return;
  running = true;
  try {
    console.log('[Coach] Preparando coaching...');
    const snapshot = await getFullSnapshot();
    const coaching = await generateCoaching(snapshot);
    await sendToGroup(snapshot, coaching);
  } catch (err) {
    console.error('[Coach] Erro:', err.message);
  }
  running = false;
}

export function startCoachAgent() {
  if (!OPENAI_KEY) {
    console.log('[Coach] OpenAI não configurada — offline');
    return;
  }

  const check = () => {
    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const brMin = now.getMinutes();
    // Todo dia às 6:00 BRT
    if (brHour === 6 && brMin < 5) {
      runCoachAgent();
    }
  };

  setInterval(check, 300_000);
  console.log('[Coach] Agente iniciado — todo dia às 6h');
}
