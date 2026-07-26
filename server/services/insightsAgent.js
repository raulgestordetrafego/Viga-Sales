/**
 * Insights Agent — Análise diária de disparos, templates, custos e sugestões
 * Envia relatório no WhatsApp do Raul todo dia às 8:30 e às 18:00
 */

import { query, queryOne } from '../db/database.js';
import axios from 'axios';

const RAUL_PHONE = '61981362382';
const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';

async function sendToRaul(message) {
  try {
    await axios.post(`${EVO_URL}/message/sendText/Raul%20Santos`, {
      number: '5561981362382',
      text: message,
      delay: 1200,
    }, {
      headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    console.log('[Insights] Mensagem enviada para Raul');
  } catch (err) {
    console.error('[Insights] Falha ao enviar:', err.response?.status || err.message);
  }
}
const META_COST_PER_CONVERSATION = 0.071; // USD por conversa de marketing
const USD_TO_BRL = 5.5;

async function getDailyStats() {
  const today = new Date().toISOString().split('T')[0];

  const [sentToday, sentWeek, responses, responsesWeek, desk, templates, campaign] = await Promise.all([
    queryOne(
      "SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND DATE(created_at) = CURRENT_DATE"
    ),
    queryOne(
      "SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '7 days'"
    ),
    queryOne(
      "SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND DATE(responded_at::timestamp) = CURRENT_DATE"
    ),
    queryOne(
      "SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND responded_at::timestamp >= NOW() - INTERVAL '7 days'"
    ),
    queryOne(
      "SELECT COUNT(*) as cnt FROM prospects WHERE status = 'descartado' AND DATE(updated_at) = CURRENT_DATE"
    ),
    query(
      "SELECT name, sent_count, max_sends, paused FROM meta_templates ORDER BY sent_count DESC"
    ),
    queryOne(
      "SELECT name, sent_today, daily_limit FROM prospecting_campaigns WHERE status = 'active' LIMIT 1"
    ),
  ]);

  const totalSent = parseInt(sentToday?.cnt || '0');
  const totalWeek = parseInt(sentWeek?.cnt || '0');
  const totalResponses = parseInt(responses?.cnt || '0');
  const totalResponsesWeek = parseInt(responsesWeek?.cnt || '0');
  const totalDesk = parseInt(desk?.cnt || '0');

  // Custo estimado
  const costUSD = (totalSent * META_COST_PER_CONVERSATION).toFixed(2);
  const costBRL = (totalSent * META_COST_PER_CONVERSATION * USD_TO_BRL).toFixed(2);
  const costWeekBRL = (totalWeek * META_COST_PER_CONVERSATION * USD_TO_BRL).toFixed(2);

  // Taxa de resposta
  const responseRate = totalSent > 0 ? ((totalResponses / totalSent) * 100).toFixed(1) : '0';
  const responseRateWeek = totalWeek > 0 ? ((totalResponsesWeek / totalWeek) * 100).toFixed(1) : '0';

  // Templates com melhor desempenho
  const activeTemplates = (templates || []).filter(t => !t.paused && t.sent_count > 0);
  const topTemplate = activeTemplates[0];
  const lowestTemplate = activeTemplates[activeTemplates.length - 1];

  // Fila restante
  const queueTotal = await queryOne(
    "SELECT COUNT(*) as cnt FROM prospects WHERE status = 'novo'"
  );
  const daysToFinish = totalSent > 0 ? Math.ceil((queueTotal?.cnt || 0) / totalSent) : '∞';

  return {
    date: today,
    sent: { today: totalSent, week: totalWeek },
    responses: { today: totalResponses, week: totalResponsesWeek },
    discarded: totalDesk,
    costs: { todayUSD: costUSD, todayBRL: costBRL, weekBRL: costWeekBRL },
    responseRate: { today: responseRate, week: responseRateWeek },
    templates: { active: activeTemplates.length, total: (templates || []).length, top: topTemplate?.name, topSends: topTemplate?.sent_count, bottom: lowestTemplate?.name },
    queue: { remaining: queueTotal?.cnt || 0, daysToFinish },
    campaign: campaign,
  };
}

function buildMorningReport(stats) {
  const { sent, responses, costs, responseRate, templates, queue, campaign } = stats;

  let msg = `☀️ *Bom dia, Raul!*\n`;
  msg += `📅 ${stats.date}\n\n`;

  msg += `📊 *Ontem:*\n`;
  msg += `├ Disparos: ${sent.today} (limite: ${campaign?.daily_limit || 50})\n`;
  msg += `├ Respostas: ${responses.today}\n`;
  msg += `├ Taxa: ${responseRate.today}%\n`;
  msg += `└ Custo: R$ ${costs.todayBRL}\n\n`;

  msg += `📈 *Últimos 7 dias:*\n`;
  msg += `├ Disparos: ${sent.week}\n`;
  msg += `├ Respostas: ${responses.week}\n`;
  msg += `├ Taxa: ${responseRate.week}%\n`;
  msg += `└ Custo: R$ ${costs.weekBRL}\n\n`;

  msg += `🎯 *Templates:*\n`;
  msg += `├ Ativos: ${templates.active}/${templates.total}\n`;
  msg += `├ Destaque: ${templates.top || '—'} (${templates.topSends || 0} envios)\n`;
  msg += `└ Substituto: ${templates.bottom || '—'} precisa rodar mais\n\n`;

  msg += `📦 *Fila:* ${queue.remaining} prospects\n`;
  msg += `⏳ Ritmo atual: ~${queue.daysToFinish} dias pra zerar\n\n`;

  // Sugestões
  msg += `💡 *Sugestões:*\n`;
  if (parseFloat(responseRate.today) === 0 && sent.today > 0) {
    msg += `• Templates atuais com 0% de resposta — considerar testar outros modelos\n`;
  }
  if (queue.daysToFinish > 20) {
    msg += `• Fila longa (${queue.daysToFinish} dias) — considere subir limite diário\n`;
  }
  if (sent.today >= (campaign?.daily_limit || 50)) {
    msg += `• Limite de ${campaign?.daily_limit}/dia batido — campanha saudável\n`;
  }
  if (templates.active < 4) {
    msg += `• Apenas ${templates.active} templates ativos — ative mais pra variar conteúdo\n`;
  }

  return msg;
}

function buildEveningReport(stats) {
  const { sent, responses, costs, responseRate, queue, desk } = stats;

  let msg = `🌙 *Balanço do Dia*\n\n`;
  msg += `📤 Enviados: ${sent.today}\n`;
  msg += `📥 Respostas: ${responses.today} (${responseRate.today}%)\n`;
  msg += `🗑️ Descartados: ${desk || 0}\n`;
  msg += `💰 Custo: R$ ${costs.todayBRL}\n`;
  msg += `📦 Fila: ${queue.remaining} restantes\n\n`;

  msg += `🔮 *Amanhã:* mais ${sent.today > 0 ? sent.today : '50'} disparos previstos.`;

  return msg;
}

export async function generateInsights() {
  try {
    const stats = await getDailyStats();
    if (!stats) return;

    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const isMorning = brHour >= 6 && brHour < 12;

    const message = isMorning ? buildMorningReport(stats) : buildEveningReport(stats);

    await sendToRaul(message);
    console.log(`[Insights] Relatório enviado (${isMorning ? 'manhã' : 'tarde'})`);
    return stats;
  } catch (err) {
    console.error('[Insights] Erro:', err.message);
    return null;
  }
}

export function startInsightsAgent() {
  if (!EVO_URL || !EVO_KEY) {
    console.log('[Insights] Evolution API não configurada — offline');
    return;
  }

  const run = async () => {
    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const brMin = now.getMinutes();

    // Envia às 8:30 (manhã) e 18:00 (tarde) — janela de 5 min
    const isReportTime = (brHour === 8 && brMin < 5) || (brHour === 18 && brMin < 5);
    if (!isReportTime) return;

    await generateInsights();
  };

  setInterval(run, 300_000); // verifica a cada 5 min
  console.log('[Insights] Agente iniciado — relatórios às 8:30 e 18:00');
}
