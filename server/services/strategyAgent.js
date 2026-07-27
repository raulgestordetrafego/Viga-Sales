/**
 * Strategy Agent v2 — Analisa tudo e gera relatório estratégico semanal
 * Roda domingo às 18h. Chief of Staff autônomo.
 * v2: DeepSeek + skills oficiais Owl-Listener
 */

import { query, queryOne } from '../db/database.js';
import axios from 'axios';
import { chatContent } from './llm.js';
import { loadSkills } from './skillLoader.js';

const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const AGENTS_GROUP = process.env.GROUP_COMANDO_ID || "120363428115495870@g.us";

let running = false;

async function getFullStats() {
  const [
    weeklySends, weeklyResponses, weeklyDesk, monthlySends, monthlyResponses,
    templates, campaigns, totalProspects, respondedProspects,
    dailyBreakdown, responseRateByDay
  ] = await Promise.all([
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND responded_at::timestamp >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'descartado' AND updated_at >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '30 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu'"),
    query("SELECT name, sent_count, max_sends, paused FROM meta_templates ORDER BY sent_count DESC"),
    query("SELECT name, status, daily_limit, sent_today FROM prospecting_campaigns ORDER BY status, name"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu'"),
    query("SELECT DATE(created_at) as dia, COUNT(*) as envios FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY dia"),
    query("SELECT DATE(responded_at::timestamp) as dia, COUNT(*) as respostas FROM prospects WHERE status = 'respondeu' AND responded_at::timestamp >= NOW() - INTERVAL '7 days' GROUP BY DATE(responded_at::timestamp) ORDER BY dia"),
  ]);

  const weekSent = parseInt(weeklySends?.cnt || '0');
  const weekResp = parseInt(weeklyResponses?.cnt || '0');
  const weekDesk = parseInt(weeklyDesk?.cnt || '0');
  const monthSent = parseInt(monthlySends?.cnt || '0');
  const allResp = parseInt(monthlyResponses?.cnt || '0');
  const allProsp = parseInt(totalProspects?.cnt || '0');
  const allRespTotal = parseInt(respondedProspects?.cnt || '0');

  return {
    week: { sent: weekSent, responses: weekResp, discarded: weekDesk, 
            responseRate: weekSent > 0 ? (weekResp/weekSent*100).toFixed(1) : '0',
            cost: (weekSent * parseFloat(process.env.COST_PER_MSG || '0.071') * parseFloat(process.env.USD_TO_BRL || '5.5')).toFixed(2) },
    month: { sent: monthSent, cost: (monthSent * parseFloat(process.env.COST_PER_MSG || '0.071') * parseFloat(process.env.USD_TO_BRL || '5.5')).toFixed(2) },
    allTime: { responses: allResp, prospects: allProsp, 
               overallRate: allProsp > 0 ? (allRespTotal/allProsp*100).toFixed(1) : '0' },
    templates,
    campaigns,
    daily: dailyBreakdown,
  };
}

async function generateStrategy(stats) {
  if (!OPENAI_KEY) return null;

  const topTemplates = (stats.templates || [])
    .slice(0, 5)
    .map(t => `${t.name}: ${t.sent_count} envios, pausado=${t.paused ? 'sim' : 'não'}`)
    .join('\n');

  const campList = (stats.campaigns || [])
    .map(c => `${c.name}: ${c.status}, limite=${c.daily_limit}/dia, enviados hoje=${c.sent_today}`)
    .join('\n');

  const dailySummary = (stats.daily || [])
    .map(d => `${d.dia}: ${d.envios} disparos`)
    .join(', ');

  const prompt = `Você é o Chief Strategy Officer da Viga Sales, empresa que ajuda construtoras e engenheiros a automatizar atendimento e captar clientes via WhatsApp.

RELATÓRIO SEMANAL:
- Enviados esta semana: ${stats.week.sent} (custo: R$ ${stats.week.cost})
- Respostas esta semana: ${stats.week.responses} (taxa: ${stats.week.responseRate}%)
- Descartados (duplicados): ${stats.week.discarded}
- Enviados no mês: ${stats.month.sent} (custo: R$ ${stats.month.cost})
- Total de prospects: ${stats.allTime.prospects}
- Respostas totais: ${stats.allTime.responses}
- Taxa geral: ${stats.allTime.overallRate}%

TEMPLATES:
${topTemplates}

CAMPANHAS:
${campList}

DIÁRIO:
${dailySummary}

TAREFA:
1. Faça um diagnóstico estratégico em 2-3 frases
2. Aponte 2-3 problemas ou oportunidades que você enxerga
3. Recomende 2-3 ações concretas para a próxima semana
4. Dê uma nota de 1-10 para a operação atual e justifique

Responda em português, tom executivo mas direto, adequado pra WhatsApp. Use emojis com moderação. Máximo 800 caracteres.`;

  try {
    const content = await chatContent({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: loadSkills('strategy') }, { role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    });
    return content || null;
  } catch (err) {
    console.error('[StrategyAgent] Erro:', err.message);
    return null;
  }
}

async function sendToGroup(stats, analysis) {
  if (!analysis) return;

  const msg = `📊 *Relatório Estratégico Semanal*\n\n` +
    `📤 Enviados: ${stats.week.sent} (semana) | ${stats.month.sent} (mês)\n` +
    `📥 Respostas: ${stats.week.responses} (${stats.week.responseRate}%)\n` +
    `💰 Custo: R$ ${stats.week.cost} (semana) | R$ ${stats.month.cost} (mês)\n\n` +
    `🧠 *Análise:*\n${analysis}`;

  try {
    await axios.post(`${EVO_URL}/message/sendText/Raul%20Santos`, {
      number: AGENTS_GROUP, text: msg, delay: 1200,
    }, { headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
    console.log('[StrategyAgent] Relatório enviado');
  } catch (err) {
    console.error('[StrategyAgent] Erro ao enviar:', err.message);
  }
}

export async function runStrategyAgent() {
  if (running) return;
  running = true;
  try {
    console.log('[StrategyAgent] Gerando relatório estratégico...');
    const stats = await getFullStats();
    const analysis = await generateStrategy(stats);
    await sendToGroup(stats, analysis);
  } catch (err) {
    console.error('[StrategyAgent] Erro:', err.message);
  }
  running = false;
}

export function startStrategyAgent() {
  if (!OPENAI_KEY) {
    console.log('[StrategyAgent] OpenAI não configurada — offline');
    return;
  }

  const check = () => {
    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const brDay = now.getUTCDay();
    const brMin = now.getMinutes();
    // Domingo, 18:00
    if (brDay === 0 && brHour === 18 && brMin < 5) {
      runStrategyAgent();
    }
  };

  setInterval(check, 300_000);
  console.log('[StrategyAgent] Agente iniciado — dom às 18h');
}
