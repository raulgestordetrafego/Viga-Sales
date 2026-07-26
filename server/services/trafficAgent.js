/**
 * Traffic Agent — Especialista em Tráfego Pago com Cérebro Próprio
 *
 * Funcionalidades:
 * 1. Consulta o cérebro de tráfego (brain/) para conhecimento especializado
 * 2. Atualização semanal automática: busca web/YouTube por novos conteúdos
 * 3. Análise de campanhas: recebe dados de APIs Google/Meta e diagnostica com o cérebro
 * 4. Integração com bossMode e chiefAgent
 *
 * Agendamento:
 * - Domingo 10h: busca novos conteúdos e atualiza o cérebro
 * - On-demand: análise de campanhas via comando do Raul
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUERY_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'query_brain.py');
const UPDATE_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'update_brain.py');

let running = false;
let lastBrainUpdate = null;

// ─── BRAIN QUERY ────────────────────────────────────────────

function python(args, timeout = 15000) {
  // Tenta python3.11 (Mac), fallback python3 (Alpine Docker)
  for (const pyBin of ['python3.11', 'python3']) {
    try {
      const cmd = `${pyBin} "${QUERY_SCRIPT}" ${args}`;
      const stdout = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout });
      return JSON.parse(stdout);
    } catch (e) {
      if (pyBin === 'python3') {
        console.error('[TrafficAgent] Erro:', e.message);
        return { error: e.message };
      }
    }
  }
}

export const TOPICS = {
  fundamentos: '12 conceitos universais, PÃO E OVO, leilão, ICP, pixel, RETINA, escala',
  'meta-ads': 'Facebook/Instagram Ads: estrutura, segmentação, orçamentos, lances, criativos',
  'google-ads': 'Google Ads: pesquisa, display, YouTube, PMax, lances, palavras-chave',
  otimizacao: 'Rotina de otimização, 19 métricas, lances, segmentações, criativos, landing pages',
  estrategia: 'Planejamento por tipo de negócio, hierarquia de públicos, distribuição de conteúdo',
  'youtube-lives': '29+ lives YouTube processadas por IA',
};

/**
 * Busca no cérebro por tópicos relevantes para uma query.
 */
export function queryBrain(queryText) {
  const result = python(`"${queryText.replace(/"/g, '\\"')}"`);
  if (result.error) return result;

  return {
    query: result.query,
    matched_topics: (result.results || []).slice(0, 3).map(r => ({
      topic: r.topico,
      score: r.score,
      description: r.descricao,
      summary: r.summary,
      sections: r.secoes,
      file: r.arquivo,
    })),
    total_topics: result.total_topics,
  };
}

/**
 * Retorna o conteúdo completo de um tópico específico para deep-dive.
 */
export function getTopicContent(topicName) {
  const result = python(`--topic ${topicName}`);
  if (result.error) return result;

  return {
    topic: topicName,
    description: result.descricao,
    summary: result.summary,
    keywords: result.keywords,
    sections: result.secoes,
    fullContent: result.conteudo_completo,
    file: result.arquivo,
  };
}

/**
 * Retorna visão geral do cérebro (tópicos + rotas inteligentes).
 */
export function getBrainOverview() {
  const result = python('--list');
  if (result.error) return result;
  return {
    topics: result.topics,
    smart_routes: result.rotas,
    total_topics: Object.keys(result.topics || {}).length,
  };
}

// ─── CAMPAIGN ANALYSIS ──────────────────────────────────────

/**
 * Analisa uma campanha individual com dados reais de API.
 * Usa o cérebro para diagnóstico especializado.
 *
 * @param {object} campaign - dados da campanha
 * @param {string} campaign.platform - 'google' ou 'meta'
 * @param {string} campaign.name - nome da campanha
 * @param {object} campaign.metrics - métricas (impressions, clicks, ctr, cpc, cpm, conversions, cpa, spend, roas)
 * @param {string} campaign.objective - objetivo (conversions, traffic, awareness, etc.)
 * @param {string} campaign.status - status atual
 * @param {number} campaign.daily_budget - orçamento diário
 * @returns {object} diagnóstico especializado
 */
export function analyzeCampaign(campaign) {
  const { platform, name, metrics = {}, objective, status, daily_budget } = campaign;
  const {
    impressions = 0, clicks = 0, ctr = 0, cpc = 0, cpm = 0,
    conversions = 0, cpa = 0, spend = 0, roas = 0
  } = metrics;

  // Diagnóstico automático baseado em thresholds do cérebro
  const issues = [];
  const recommendations = [];

  // CTR baixo → problema de criativo/segmentação
  if (ctr > 0 && ctr < 0.5) {
    issues.push({ severity: 'alta', metric: 'CTR', value: ctr, threshold: '0.5%', area: 'criativo' });
    recommendations.push('Testar novos criativos com ganchos diferentes (GCC: Gancho + Corpo + CTA)');
    recommendations.push('Revisar segmentação: anúncio deve ser FILTRO, não ímã');
  }

  // CPA alto → problema de funil/conversão
  if (cpa > 0 && daily_budget > 0 && cpa > daily_budget * 0.5) {
    issues.push({ severity: 'alta', metric: 'CPA', value: cpa, threshold: `${daily_budget * 0.3}`, area: 'conversão' });
    recommendations.push('O CPA está acima do ideal. Verifique: landing page, velocidade, CTAs, congruência anúncio↔destino');
  }

  // CPM muito alto → saturação ou segmentação restrita
  if (cpm > 0 && platform === 'meta' && cpm > 50) {
    issues.push({ severity: 'média', metric: 'CPM', value: cpm, threshold: 'R$50', area: 'segmentação' });
    recommendations.push('CPM alto: expandir públicos, testar Advantage+, revisar qualidade do anúncio');
  }

  // Campanha não gasta → lance baixo ou segmentação restrita
  if (spend < daily_budget * 0.3 && status === 'active') {
    issues.push({ severity: 'alta', metric: 'spend', value: spend, threshold: `${daily_budget * 0.7}`, area: 'lance' });
    if (platform === 'google') {
      recommendations.push('Google Ads: reduzir orçamento e aumentar lances agressivamente');
    } else {
      recommendations.push('Meta Ads: aumentar orçamento ou expandir públicos');
    }
  }

  // Sem conversões → verificar pixel/tag
  if (conversions === 0 && spend > daily_budget * 2) {
    issues.push({ severity: 'crítica', metric: 'conversions', value: 0, threshold: '>0', area: 'tracking' });
    recommendations.push('Verificar se pixel/tag está instalado corretamente (Meta Pixel Helper / Tag Assistant)');
    recommendations.push('Verificar se API de Conversões está ativa');
  }

  // ROAS baixo
  if (roas > 0 && roas < 1.0) {
    issues.push({ severity: 'crítica', metric: 'ROAS', value: roas, threshold: '1.0', area: 'retorno' });
    recommendations.push('ROAS abaixo de 1 = prejuízo. Aumentar ticket médio, melhorar conversão ou pausar');
  }

  // Busca conhecimento relevante no cérebro baseado nos issues encontrados
  const problemAreas = [...new Set(issues.map(i => i.area))];
  let brainInsights = [];
  for (const area of problemAreas) {
    const search = queryBrain(`${area} ${platform} campanha otimizacao`);
    if (!search.error && search.matched_topics) {
      brainInsights.push(...search.matched_topics.slice(0, 1));
    }
  }

  return {
    campaign: { platform, name, objective, status, daily_budget },
    metrics,
    diagnosis: {
      issues,
      recommendations: [...new Set(recommendations)],
      brain_insights: brainInsights.slice(0, 2),
    },
    analyzed_at: new Date().toISOString(),
  };
}

/**
 * Analisa múltiplas campanhas e retorna ranking de prioridades.
 */
export function analyzeAccount(accountData) {
  const { platform, campaigns = [] } = accountData;
  const analyses = campaigns.map(c => analyzeCampaign({ ...c, platform }));

  // Prioriza: críticas → altas → médias
  const priorityOrder = { 'crítica': 0, 'alta': 1, 'média': 2 };
  const ranked = analyses
    .filter(a => a.diagnosis.issues.length > 0)
    .sort((a, b) => {
      const aMax = Math.min(...a.diagnosis.issues.map(i => priorityOrder[i.severity] || 99));
      const bMax = Math.min(...b.diagnosis.issues.map(i => priorityOrder[i.severity] || 99));
      return aMax - bMax;
    });

  return {
    platform,
    total_campaigns: campaigns.length,
    campaigns_with_issues: ranked.length,
    healthy_campaigns: campaigns.length - ranked.length,
    priority_actions: ranked.slice(0, 5).map(a => ({
      campaign: a.campaign.name,
      top_issue: a.diagnosis.issues[0],
      top_recommendation: a.diagnosis.recommendations[0],
    })),
    full_analysis: ranked,
    analyzed_at: new Date().toISOString(),
  };
}

// ─── BRAIN UPDATE (SEMANAL) ─────────────────────────────────

/**
 * Atualiza o cérebro buscando novos conteúdos no YouTube.
 * Chamado automaticamente todo domingo.
 */
export async function weeklyBrainUpdate(metaApi = null, groupId = null) {
  if (running) {
    console.log('[TrafficAgent] Atualização já em andamento...');
    return;
  }
  running = true;

  try {
    console.log('[TrafficAgent] 🧠 Iniciando atualização semanal do cérebro...');

    // Busca 4 tópicos, 2 vídeos cada = até 8 novos vídeos/semana
    const pyBin = (() => { try { execSync('python3.11 --version', { timeout: 3000 }); return 'python3.11'; } catch { return 'python3'; } })();
    const cmd = `${pyBin} "${UPDATE_SCRIPT}" --max 2 --full`;
    const stdout = execSync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 600000 }); // 10 min timeout

    console.log('[TrafficAgent] Resultado:\n' + stdout.split('\n').slice(-10).join('\n'));

    // Parse do resultado
    const lines = stdout.split('\n');
    const newCount = lines.find(l => l.includes('Vídeos novos:'))?.match(/\d+/)?.[0] || '0';

    lastBrainUpdate = new Date().toISOString();

    // Notifica via WhatsApp se disponível
    if (metaApi && groupId && parseInt(newCount) > 0) {
      const overview = getBrainOverview();
      const totalRaw = overview.total_raw || '?';
      await metaApi.sendText(groupId,
        `🧠 *Atualização Semanal do Cérebro de Tráfego*\n\n` +
        `📹 *${newCount}* novos vídeos adicionados\n` +
        `📚 Total: ${totalRaw} conteúdos no cérebro\n` +
        `🔍 6 tópicos especializados disponíveis\n` +
        `📅 Próxima atualização: próximo domingo`
      ).catch(() => {});
    }

    console.log(`[TrafficAgent] ✅ Atualização concluída. ${newCount} vídeos novos.`);
    return { success: true, new_videos: parseInt(newCount), updated_at: lastBrainUpdate };
  } catch (e) {
    console.error('[TrafficAgent] ❌ Erro na atualização:', e.message);
    return { success: false, error: e.message };
  } finally {
    running = false;
  }
}

// ─── KNOWLEDGE FORMATTERS ───────────────────────────────────

/**
 * Injeta conhecimento do cérebro em um prompt de IA.
 * Útil para chiefAgent, coachAgent, bossMode usarem conhecimento especializado.
 *
 * @param {string} query - a pergunta/situação
 * @param {number} maxTopics - máximo de tópicos (default 2)
 * @returns {string} conhecimento formatado para prompt
 */
export function getKnowledgeForPrompt(query, maxTopics = 2) {
  const search = queryBrain(query);
  if (search.error || !search.matched_topics) return '';

  const relevant = search.matched_topics.slice(0, maxTopics);
  let knowledge = '=== CONHECIMENTO ESPECIALIZADO DE TRÁFEGO PAGO ===\n';
  knowledge += 'Fonte: Cérebro de Tráfego Viga Sales (75 PDFs + lives YouTube)\n\n';

  for (const topic of relevant) {
    knowledge += `## ${topic.topic.toUpperCase()}\n${topic.summary}\n\n`;
  }

  return knowledge;
}

// ─── SCHEDULER ──────────────────────────────────────────────

let weeklyTimer = null;

export function startTrafficAgent(metaApi = null, groupId = null) {
  console.log('[TrafficAgent] 🧠 Iniciando agente especialista de tráfego...');

  // Carrega última atualização
  const logPath = path.join(__dirname, '..', '..', 'brain', 'updates_log.json');
  if (fs.existsSync(logPath)) {
    try {
      const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      if (log.length > 0) {
        lastBrainUpdate = log[log.length - 1].date;
        console.log(`[TrafficAgent] Última atualização: ${lastBrainUpdate}`);
      }
    } catch {}
  }

  const overview = getBrainOverview();
  if (!overview.error) {
    console.log(`[TrafficAgent] Cérebro: ${overview.total_topics} tópicos especializados`);
  }

  // Agenda atualização semanal: Domingo 10h BRT
  scheduleNextUpdate(metaApi, groupId);
  console.log('[TrafficAgent] ✅ Agendado: atualização semanal (domingo 10h)');

  return { status: 'active', topics: overview };
}

function scheduleNextUpdate(metaApi, groupId) {
  if (weeklyTimer) clearTimeout(weeklyTimer);

  const now = new Date();
  // Próximo domingo 10h BRT (13h UTC)
  const next = new Date(now);
  next.setUTCHours(13, 0, 0, 0); // 10h BRT = 13h UTC
  const dayDiff = (7 - now.getUTCDay()) % 7;
  next.setUTCDate(next.getUTCDate() + dayDiff);

  // Se já passou hoje, vai pro próximo
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 7);
  }

  const msUntil = next.getTime() - now.getTime();
  const hoursUntil = Math.round(msUntil / 3600000);
  console.log(`[TrafficAgent] Próxima atualização em ~${hoursUntil}h (${next.toISOString()})`);

  weeklyTimer = setTimeout(() => {
    weeklyBrainUpdate(metaApi, groupId).then(() => {
      scheduleNextUpdate(metaApi, groupId); // Reagenda
    });
  }, msUntil);
}

export function stopTrafficAgent() {
  if (weeklyTimer) {
    clearTimeout(weeklyTimer);
    weeklyTimer = null;
  }
  console.log('[TrafficAgent] Agente pausado.');
}

export default {
  queryBrain,
  getTopicContent,
  getBrainOverview,
  analyzeCampaign,
  analyzeAccount,
  weeklyBrainUpdate,
  getKnowledgeForPrompt,
  startTrafficAgent,
  stopTrafficAgent,
  TOPICS,
};
