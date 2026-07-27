/**
 * Idea Agent v2 — Analisa performance dos templates e gera novas ideias de mensagem
 * Roda 2x por semana (segunda e quinta) e envia sugestões pro grupo de notificações
 * v2: DeepSeek + skills oficiais Owl-Listener
 */

import { query } from '../db/database.js';
import axios from 'axios';
import { chatContent } from './llm.js';
import { loadSkills } from './skillLoader.js';

const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const AGENTS_GROUP = process.env.AGENTS_GROUP_ID || '120363428115495870@g.us';

let running = false;

async function getTemplateStats() {
  const templates = await query(`
    SELECT name, sent_count, max_sends, paused, body
    FROM meta_templates ORDER BY sent_count DESC
  `);
  
  const responses = await query(`
    SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu'
  `);
  
  const totalSent = await query(`
    SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta'
  `);

  return {
    templates: templates.slice(0, 6),
    totalResponses: responses[0]?.cnt || 0,
    totalSent: totalSent[0]?.cnt || 0,
    responseRate: totalSent[0]?.cnt > 0 
      ? ((responses[0]?.cnt || 0) / totalSent[0].cnt * 100).toFixed(1)
      : '0'
  };
}

async function generateIdeas(stats) {
  const templateList = stats.templates
    .map(t => `"${t.name}": ${t.sent_count} envios, pausado=${t.paused ? 'sim' : 'não'}`)
    .join('\n');

  const prompt = `Você é um especialista em copywriting e prospecção B2B para uma empresa chamada Viga Sales, que vende automação de atendimento e captação de clientes para construtoras e engenheiros.

DADOS ATUAIS:
- Templates ativos e performance:
${templateList}
- Total de respostas: ${stats.totalResponses}
- Total de envios: ${stats.totalSent}
- Taxa de resposta geral: ${stats.responseRate}%

TAREFA:
1. Analise brevemente o que está funcionando ou não
2. Sugira 3 novas ideias de templates de WhatsApp (primeira mensagem fria) com:
   - Nome sugestivo
   - Corpo da mensagem (com {{1}} para nome e {{2}} para empresa quando relevante)
   - Por que essa abordagem pode converter melhor
3. Sugira 2 variações para melhorar templates existentes (mudanças pontuais)

Responda em português, formato WhatsApp-friendly, tom direto e acionável.`;

  try {
    const content = await chatContent({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: loadSkills('idea') }, { role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 1500,
    });
    return content || null;
  } catch (err) {
    console.error('[IdeaAgent] Erro:', err.message);
    return null;
  }
}

async function sendToGroup(text) {
  if (!text) return;
  const msg = `🧠 *Agente de Ideias*\n\n${text}`;
  try {
    await axios.post(`${EVO_URL}/message/sendText/Raul%20Santos`, {
      number: AGENTS_GROUP, text: msg, delay: 1200,
    }, { headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
    console.log('[IdeaAgent] Ideias enviadas para o grupo');
  } catch (err) {
    console.error('[IdeaAgent] Erro ao enviar:', err.message);
  }
}

export async function runIdeaAgent() {
  if (running) return;
  running = true;
  try {
    console.log('[IdeaAgent] Gerando ideias...');
    const stats = await getTemplateStats();
    const ideas = await generateIdeas(stats);
    await sendToGroup(ideas);
  } catch (err) {
    console.error('[IdeaAgent] Erro:', err.message);
  }
  running = false;
}

export function startIdeaAgent() {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.log('[IdeaAgent] DeepSeek nao configurada — offline');
    return;
  }

  const check = () => {
    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const brDay = now.getUTCDay();
    const brMin = now.getMinutes();
    // Segunda e quinta, 10:00
    if ([1, 4].includes(brDay) && brHour === 10 && brMin < 5) {
      runIdeaAgent();
    }
  };

  setInterval(check, 300_000);
  console.log('[IdeaAgent] Agente iniciado — seg e qui às 10h');
}
