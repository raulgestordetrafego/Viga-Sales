/**
 * CHIEF v4 — CEO completo: Estrategia, Gestao, Financas, Coaching, Execucao
 * Roda 2x/dia (briefing 8h/20h) + Domingo 20h (planejamento semanal)
 * v4: pipeline de vendas, cross-agent intel, memoria, OKRs, lead scoring, task follow-up, coach integrado, cerebro proprio
 */

import { query, queryOne, run } from '../db/database.js';
import pg from 'pg';
import axios from 'axios';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHIEF_BRAIN_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'query_chief_brain.py');

const { Pool } = pg;
const LEADS_DB_URL = process.env.DATABASE_LEADS_URL;

let running = false;
let leadsPool = null;

function getLeadsPool() {
  if (!leadsPool && LEADS_DB_URL) {
    leadsPool = new Pool({ connectionString: LEADS_DB_URL, connectionTimeoutMillis: 5000 });
  }
  return leadsPool;
}
async function queryLeads(sql, params = []) {
  const pool = getLeadsPool();
  if (!pool) return [];
  const { rows } = await pool.query(sql, params);
  return rows;
}

const BUSINESS_KNOWLEDGE = `
FRAMEWORKS QUE VOCE DOMINA E APLICA:

1. GESTAO DE CRESCIMENTO (Growth):
- Funil AAARRR (Awareness, Acquisition, Activation, Revenue, Retention, Referral)
- Growth Loops: como cada canal alimenta o proximo
- North Star Metric: reunioes agendadas → propostas enviadas → contratos fechados
- Canais da Viga Sales: WhatsApp frio, Email frio, Blog/SEO, LinkedIn, Instagram
- CAC (Custo de Aquisicao) por canal
- LTV estimado por cliente de automacao (R$ 1.500-5.000/mes)

2. ESTRATEGIA DE VENDAS B2B:
- SPIN Selling: Situacao, Problema, Implicacao, Necessidade
- Challenger Sale: ensinar, adaptar, controlar
- BANT: Budget, Authority, Need, Timeline
- ICP: Construtoras e engenheiros com 5+ funcionarios, faturamento > R$100k/mes
- Ciclo de venda tipico: 2-4 semanas (automacao), 1-2 semanas (trafego pago)

3. GESTAO FINANCEIRA:
- MRR (Receita Recorrente Mensal)
- Churn rate
- CAC Payback
- Margem de contribuicao
- Break-even de campanhas
- Precificacao: automacao R$1.500-5.000, trafego R$2.000-8.000, sites R$3.000-15.000

4. COACHING E LIDERANCA:
- OKRs (Objectives and Key Results)
- Matriz Eisenhower (urgente vs importante)
- Regra 80/20: 20% das acoes trazem 80% dos resultados
- Deep Work: blocos de 2h sem interrupcao
- Feedback loop: medir → aprender → ajustar → repetir

5. MARKETING DE CONTEUDO:
- Blog: 1 artigo/semana, SEO para "automacao WhatsApp construtoras"
- Social proof: cases de sucesso, depoimentos, metricas reais
- Funil de conteudo: topo (blog) → meio (case) → fundo (proposta)

6. METRICAS ACOMPANHADAS:
- Volume de prospeccao por canal (diario/semanal/mensal)
- Taxa de resposta por canal
- Taxa de conversao: lead → reuniao → proposta → fechamento
- Velocidade do funil (dias entre cada etapa)
- ROI por canal (receita gerada / custo do canal)
- Saude dos agentes (uptime, erros, volume processado)
`;

// ═══════════════════════════════════════════════════════════════════════════════
// INTELIGENCIA — coleta de dados de todos os bancos (v4: pipeline + cross-agent + leads quentes)
// ═══════════════════════════════════════════════════════════════════════════════
async function getDeepIntel() {
  const calc = (val) => parseInt(val?.cnt || '0');

  const [
    sentToday, sentYesterday, sentWeek, sentMonth,
    respToday, respYesterday, respWeek, respTotal,
    prospectsNew, prospectsTotal, prospectsDesk, prospectsEnviados,
    activeTemplates, allTemplates,
    daily14,
    blogPosts, lastBlogPosts,
    emailsSent, emailsOpened, emailsReplied, emailsFailed,
    meetingsToday, meetingsWeek, meetingsTotal,
    leadsSemResposta,
    pipeline,
    pendingTasks,
    lastBriefing,
    currentOkrs,
    hotLeads,
  ] = await Promise.all([
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND DATE(created_at) = CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '30 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND DATE(responded_at::timestamp) = CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND DATE(responded_at::timestamp) = CURRENT_DATE - INTERVAL '1 day'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND responded_at::timestamp >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'novo'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'descartado'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'enviado'"),
    query("SELECT name, sent_count, max_sends, paused FROM meta_templates ORDER BY sent_count DESC"),
    query("SELECT COUNT(*) as cnt FROM meta_templates"),
    query("SELECT DATE(created_at) as dia, COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '14 days' GROUP BY DATE(created_at) ORDER BY dia"),
    queryOne("SELECT COUNT(*) as cnt FROM blog_posts WHERE status = 'published'"),
    query("SELECT id, title, slug, published_at FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 5"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'sent'"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'opened'"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'replied'"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'failed'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'reuniao_agendada' AND DATE(updated_at::timestamp) = CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'reuniao_agendada' AND updated_at::timestamp >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'reuniao_agendada'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'enviado' AND sent_at::timestamp < NOW() - INTERVAL '3 days'"),
    query("SELECT ps.name as etapa, COUNT(*) as total, COALESCE(SUM(c.pipeline_value), 0) as valor FROM contacts c LEFT JOIN pipeline_stages ps ON c.pipeline_stage = ps.id WHERE c.pipeline_stage IS NOT NULL AND c.pipeline_stage != '' GROUP BY ps.name, ps.position ORDER BY ps.position"),
    query("SELECT title, priority, category, status FROM chief_tasks WHERE status = 'pendente' ORDER BY created_at DESC LIMIT 10"),
    queryOne("SELECT panorama, alerta, estrategia, acao_principal, coaching, financeiro, score, created_at FROM chief_briefings ORDER BY created_at DESC LIMIT 1"),
    query("SELECT objetivo, key_result, meta_numerica, progresso_atual, status FROM chief_okrs WHERE status = 'ativo' ORDER BY created_at DESC LIMIT 10"),
    query("SELECT p.name, p.company, p.phone, p.segment, p.status, p.responded_at, p.notes FROM prospects p WHERE (p.status = 'respondeu' OR p.status = 'reuniao_agendada') AND p.responded_at IS NOT NULL AND p.responded_at::timestamp < NOW() - INTERVAL '2 days' ORDER BY p.responded_at DESC LIMIT 5"),
  ]);

  return {
    wpp: {
      hoje: { sent: calc(sentToday), resp: calc(respToday), rate: calc(sentToday) > 0 ? (calc(respToday) / calc(sentToday) * 100).toFixed(1) : '0' },
      ontem: { sent: calc(sentYesterday), resp: calc(respYesterday), rate: calc(sentYesterday) > 0 ? (calc(respYesterday) / calc(sentYesterday) * 100).toFixed(1) : '0' },
      semana: { sent: calc(sentWeek), resp: calc(respWeek), rate: calc(sentWeek) > 0 ? (calc(respWeek) / calc(sentWeek) * 100).toFixed(1) : '0' },
      mes: { sent: calc(sentMonth) },
      custoHoje: (calc(sentToday) * parseFloat(process.env.COST_PER_MSG || '0.071') * parseFloat(process.env.USD_TO_BRL || '5.5')).toFixed(2),
      custoSemana: (calc(sentWeek) * parseFloat(process.env.COST_PER_MSG || '0.071') * parseFloat(process.env.USD_TO_BRL || '5.5')).toFixed(2),
      custoMes: (calc(sentMonth) * parseFloat(process.env.COST_PER_MSG || '0.071') * parseFloat(process.env.USD_TO_BRL || '5.5')).toFixed(2),
      totalResp: calc(respTotal),
    },
    fila: { novos: calc(prospectsNew), total: calc(prospectsTotal), descartados: calc(prospectsDesk), enviados: calc(prospectsEnviados) },
    templates: { ativos: (activeTemplates || []).filter(t => !t.paused).length, total: allTemplates?.[0]?.cnt || 0, top5: (activeTemplates || []).slice(0, 5) },
    diario: daily14,
    blog: { total: calc(blogPosts), recentes: (lastBlogPosts || []).slice(0, 3) },
    email: {
      sent: calc(emailsSent), opened: calc(emailsOpened), replied: calc(emailsReplied), failed: calc(emailsFailed),
      openRate: calc(emailsSent) > 0 ? ((calc(emailsOpened) / calc(emailsSent)) * 100).toFixed(0) : '0',
    },
    reunioes: { hoje: calc(meetingsToday), semana: calc(meetingsWeek), total: calc(meetingsTotal) },
    leadsParados: calc(leadsSemResposta),
    pipeline: (pipeline || []).map(p => ({ etapa: p.etapa, total: parseInt(p.total), valor: parseFloat(p.valor || '0') })),
    tarefasPendentes: pendingTasks || [],
    lastBriefing,
    okrs: currentOkrs || [],
    hotLeads: (hotLeads || []).map(l => ({ nome: l.name, empresa: l.company, status: l.status, ultimoContato: l.responded_at, segmento: l.segment })),
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CEREBRO DO CHIEF — busca conhecimento proprio (playbooks, estrategia, mercado)
// ═══════════════════════════════════════════════════════════════════════════════
function queryChiefBrain(queryText) {
  try {
    const result = execSync(`python3 "${CHIEF_BRAIN_SCRIPT}" "${queryText.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15000,
    });
    return JSON.parse(result);
  } catch (e) {
    console.error('[ChiefBrain] Erro:', e.message);
    return { error: e.message };
  }
}

function getChiefKnowledgeForPrompt(query, maxTopics = 2) {
  const search = queryChiefBrain(query);
  if (search.error || !search.results || !search.results.length) return '';

  const relevant = search.results.slice(0, maxTopics);
  let knowledge = '=== CONHECIMENTO DO CEO (CEREBRO DO CHIEF) ===\n';
  knowledge += 'Fonte: Playbooks, estrategia, historico de decisoes, mercado\n\n';

  for (const topic of relevant) {
    knowledge += `## ${topic.topico.toUpperCase()}\n${topic.summary || topic.descricao}\n\n`;
  }

  return knowledge;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-AGENT INTEL — busca conhecimento dos outros agentes
// ═══════════════════════════════════════════════════════════════════════════════
async function getCrossAgentIntel() {
  let trafficKnowledge = '';
  let strategyReport = '';
  let chiefBrainKnowledge = '';

  try {
    const { getKnowledgeForPrompt } = await import('./trafficAgent.js');
    trafficKnowledge = getKnowledgeForPrompt('otimizacao campanhas trafego pago vendas B2B construcao', 1);
  } catch (e) { console.error('[Chief] TrafficAgent indisponivel:', e.message); }

  try {
    const lastStrategy = await queryOne("SELECT panorama, alerta, estrategia, coaching, created_at FROM chief_briefings WHERE type = 'semanal' ORDER BY created_at DESC LIMIT 1");
    if (lastStrategy) {
      strategyReport = `Ultimo diagnostico estrategico (${lastStrategy.created_at}): ${lastStrategy.estrategia || lastStrategy.panorama || ''}`;
    }
  } catch (e) { /* silencioso */ }

  try {
    chiefBrainKnowledge = getChiefKnowledgeForPrompt('estrategia vendas pipeline financas processos precificacao ICP', 3);
  } catch (e) { console.error('[Chief] Cerebro do Chief indisponivel:', e.message); }

  return { trafficKnowledge, strategyReport, chiefBrainKnowledge };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CEO BRIEFING — o Chief analisa e decide (v4: pipeline + cross-agent + memoria + OKRs + leads)
// ═══════════════════════════════════════════════════════════════════════════════
async function ceoBriefing(intel, crossIntel, isWeekly) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY || '';
  if (!deepseekKey) return null;

  const t = intel;
  const model = isWeekly ? (process.env.CHIEF_WEEKLY_MODEL || 'deepseek-chat') : (process.env.CHIEF_MODEL || 'deepseek-chat');

  const tendencia = (t.diario || []).slice(-7).map(d => {
    const dia = d.dia instanceof Date ? d.dia.toISOString().slice(5, 10) : String(d.dia || '').slice(5, 10);
    return `${dia}:${d.cnt}`;
  }).join(' ');

  const modo = isWeekly ? 'PLANEJAMENTO SEMANAL (domingo 20h)' : 'BRIEFING DIARIO';
  const templateList = (t.templates.top5 || []).map(f => `${f.name}: ${f.sent_count}/${f.max_sends} ${f.paused ? '(PAUSADO)' : ''}`).join('\n');

  const pipelineInfo = (t.pipeline || []).map(p => `${p.etapa}: ${p.total} leads — R$ ${(p.valor || 0).toLocaleString('pt-BR')}`).join('\n');
  const pipelineTotal = (t.pipeline || []).reduce((sum, p) => sum + (p.valor || 0), 0);
  const pipelineCount = (t.pipeline || []).reduce((sum, p) => sum + (p.total || 0), 0);

  const tasksContext = (t.tarefasPendentes || []).length
    ? `TAREFAS PENDENTES: ${(t.tarefasPendentes || []).map(tk => `${tk.priority === 'alta' ? '🔴' : '🟡'} ${tk.title} [${tk.category}]`).join(' | ')}`
    : 'Nenhuma tarefa pendente.';

  const okrContext = (t.okrs || []).length
    ? `OKRs ATIVOS: ${(t.okrs || []).map(o => `${o.objetivo} → ${o.key_result} (progresso: ${o.progresso_atual || '0'})`).join(' | ')}`
    : 'Nenhum OKR ativo esta semana.';

  const hotLeadsContext = (t.hotLeads || []).length
    ? `LEADS QUENTES (responderam e estao parados >2 dias):\n${(t.hotLeads || []).map((l, i) => `${i + 1}. ${l.nome}${l.empresa ? ` (${l.empresa})` : ''} — ${l.status}, ultimo contato ${l.ultimoContato?.toString().slice(0, 10)}`).join('\n')}`
    : 'Nenhum lead quente parado.';

  const memoriaContext = t.lastBriefing
    ? `ULTIMO BRIEFING (${t.lastBriefing.created_at?.toString().slice(0, 16)}): "${t.lastBriefing.panorama}" — Acao: "${t.lastBriefing.acao_principal}"`
    : '';

  const blogList = (t.blog.recentes || []).map(b => `${b.title} (${b.published_at?.toString().slice(0, 10)})`).join('\n');

  const prompt = `Voce e O CEO da Viga Sales — uma empresa de automacao comercial B2B que vende automacao de WhatsApp, CRM, trafego pago e sites para construtoras e engenheiros no Brasil.

${BUSINESS_KNOWLEDGE}

${crossIntel.trafficKnowledge ? `CONHECIMENTO DE TRAFEGO PAGO:\n${crossIntel.trafficKnowledge}` : ''}
${crossIntel.strategyReport ? `CONTEXTO ESTRATEGICO:\n${crossIntel.strategyReport}` : ''}
${crossIntel.chiefBrainKnowledge ? `${crossIntel.chiefBrainKnowledge}` : ''}

MEMORIA: ${memoriaContext}

SEU PAPEL HOJE: ${modo}
${isWeekly ? 'Faca um planejamento estrategico completo para a semana. Analise pipeline, defina OKRs, prioridades e tarefas taticas.' : 'Analise os numeros e de direcao. Seja direto e acionavel. Inclua coaching.'}

DADOS DA OPERACAO:

WHATSAPP:
- Hoje: ${t.wpp.hoje.sent} envios, ${t.wpp.hoje.resp} respostas (${t.wpp.hoje.rate}%), R$${t.wpp.custoHoje}
- Ontem: ${t.wpp.ontem.sent} envios, ${t.wpp.ontem.resp} respostas (${t.wpp.ontem.rate}%)
- Semana: ${t.wpp.semana.sent} envios, ${t.wpp.semana.resp} respostas (${t.wpp.semana.rate}%), R$${t.wpp.custoSemana}
- Mes: ${t.wpp.mes.sent} envios, R$${t.wpp.custoMes}
- Respostas totais: ${t.wpp.totalResp}

FILA WPP: ${t.fila.novos.toLocaleString()} novos / ${t.fila.total.toLocaleString()} total / ${t.fila.enviados.toLocaleString()} enviados
TEMPLATES: ${t.templates.ativos}/${t.templates.total} ativos
${templateList}
TENDENCIA 7D: ${tendencia}

EMAIL:
- ${t.email.sent.toLocaleString()} enviados, ${t.email.openRate}% abertura, ${t.email.replied} replies, ${t.email.failed} falhas

BLOG: ${t.blog.total} artigos publicados
${blogList ? `Recentes: ${blogList}` : ''}

REUNIOES: ${t.reunioes.hoje} hoje, ${t.reunioes.semana} semana, ${t.reunioes.total} total

PIPELINE DE VENDAS (R$ ${pipelineTotal.toLocaleString('pt-BR')} em ${pipelineCount} negocios):
${pipelineInfo}

╔═══════════════════════╗
║  LEADS PARADOS >3d: ${t.leadsParados.toLocaleString()}  ║
║  CONVERSAO: ${t.fila.enviados > 0 ? ((t.reunioes.semana / t.wpp.semana.sent) * 100).toFixed(1) : '0'}% envios → reuniao  ║
╚═══════════════════════╝

${hotLeadsContext}

${tasksContext}

${okrContext}

${isWeekly ? `
ANALISE ESTRATEGICA DA SEMANA:
- Faca uma analise SWOT realista da semana que passou
- Revise os OKRs anteriores (se existirem) e defina NOVOS OKRs (max 3 objetivos, cada um com 1-2 key results e meta numerica)
- Identifique o MAIOR gargalo de crescimento AGORA
- Qual o experimento mais importante para rodar essa semana?
- Analise o pipeline: onde estao os gargalos? Quanto $$$ esta travado em cada etapa?
` : ''}

Responda APENAS com JSON valido:
{
  "panorama": "2-3 frases do estado real. Sem acucar.",
  "alerta": "O que e critico AGORA. Se nada, diga o que merece atencao.",
  "estrategia": "${isWeekly ? 'Plano estrategico da semana: OKRs + acoes + experimentos + analise de pipeline' : 'Direcao tatica para hoje'}",
  "acao_principal": "A coisa MAIS importante que o Raul precisa fazer nas proximas 24h. Especifica. Inclua leads quentes se houver.",
  "coaching": "1 feedback direto pro Raul. O que ele esta fazendo bem? O que precisa melhorar? Como melhorar?",
  "financeiro": "Analise rapida: o custo dos canais esta justificado? Qual o valor do pipeline e estado do funil?",
  "score": ${isWeekly ? 'nota de 1-10 para a semana' : 'null'},
  "tarefas": [
    {"titulo": "...", "descricao": "...", "prioridade": "alta/media/baixa", "categoria": "prospeccao/conteudo/vendas/tecnico/estrategia/coaching"},
    {"titulo": "...", "descricao": "...", "prioridade": "alta/media/baixa", "categoria": "prospeccao/conteudo/vendas/tecnico/estrategia/coaching"}
  ]${isWeekly ? `,
  "okrs": [
    {"objetivo": "...", "key_results": ["KR1: ...", "KR2: ..."], "meta_numerica": "..."},
    {"objetivo": "...", "key_results": ["KR1: ..."], "meta_numerica": "..."}
  ]` : ''}
}`;

  try {
    const res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model,
      messages: [{ role: 'system', content: 'Voce e um CEO experiente em B2B SaaS, growth e vendas para construcao civil. Responda sempre em JSON valido.' }, { role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    }, { headers: { 'Authorization': `Bearer ${deepseekKey}`, 'Content-Type': 'application/json' }, timeout: 90000 });

    const text = res.data?.choices?.[0]?.message?.content;
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.error('[Chief] CEO Briefing error:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORIA — salva o briefing para contexto futuro
// ═══════════════════════════════════════════════════════════════════════════════
async function saveBriefing(plan, intel, isWeekly) {
  try {
    const { v4: uuid } = await import('uuid');
    await run(
      `INSERT INTO chief_briefings (id, type, panorama, alerta, estrategia, acao_principal, coaching, financeiro, score, tarefas, intel) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        uuid(),
        isWeekly ? 'semanal' : 'daily',
        plan.panorama || '',
        plan.alerta || '',
        plan.estrategia || '',
        plan.acao_principal || '',
        plan.coaching || '',
        plan.financeiro || '',
        plan.score || null,
        JSON.stringify(plan.tarefas || []),
        JSON.stringify(intel),
      ]
    );
    console.log('[Chief] Briefing salvo na memoria');
  } catch (err) { console.error('[Chief] Erro ao salvar briefing:', err.message); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OKRs — salva os objetivos da semana
// ═══════════════════════════════════════════════════════════════════════════════
async function saveOkrs(okrs) {
  if (!okrs?.length) return 0;
  const { v4: uuid } = await import('uuid');
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

  // Marca OKRs anteriores como concluidos
  await run("UPDATE chief_okrs SET status = 'concluido', completed_at = CURRENT_TIMESTAMP WHERE status = 'ativo'").catch(() => {});

  let saved = 0;
  for (const okr of okrs) {
    const krs = Array.isArray(okr.key_results) ? okr.key_results.join('; ') : (okr.key_result || '');
    try {
      await run(
        `INSERT INTO chief_okrs (id, objetivo, key_result, meta_numerica, progresso_atual, semana_referencia, status) VALUES ($1, $2, $3, $4, '0', $5, 'ativo')`,
        [uuid(), okr.objetivo, krs, okr.meta_numerica || '', weekStart.toISOString().slice(0, 10)]
      );
      saved++;
    } catch (err) { console.error('[Chief] Erro OKR:', err.message); }
  }
  return saved;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUCAO — salva tarefas
// ═══════════════════════════════════════════════════════════════════════════════
async function saveTasks(tarefas) {
  if (!tarefas?.length) return 0;
  const { v4: uuid } = await import('uuid');
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

  let saved = 0;
  for (const t of tarefas) {
    try {
      await run(
        `INSERT INTO chief_tasks (id, title, description, category, priority, status, week_start) VALUES ($1, $2, $3, $4, $5, 'pendente', $6)`,
        [uuid(), t.titulo, t.descricao || '', t.categoria || 'geral', t.prioridade || 'media', weekStart.toISOString().slice(0, 10)]
      );
      saved++;
    } catch (err) { console.error('[Chief] Erro task:', err.message); }
  }
  return saved;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHATSAPP — envia relatorio formatado
// ═══════════════════════════════════════════════════════════════════════════════
async function sendToWhatsApp(intel, plan, isWeekly) {
  const evoUrl = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
  const evoKey = process.env.EVOLUTION_API_KEY || '';
  if (!evoKey || !evoUrl) return;

  const t = intel;
  const icon = isWeekly ? '📅' : '☀️';
  const title = isWeekly ? 'PLANEJAMENTO SEMANAL' : 'CEO BRIEFING';
  const date = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const pipelineTotal = (t.pipeline || []).reduce((sum, p) => sum + (p.valor || 0), 0);

  // Mensagem principal — grupo Comando
  const msg = [
    `${icon} *${title}* — ${date}`,
    ``,
    `┌─────────────────────────────┐`,
    `│ 📊 *PANORAMA*`,
    `│ ${plan.panorama}`,
    `├─────────────────────────────┤`,
    `│ ⚠️ *ALERTA*`,
    `│ ${plan.alerta}`,
    `├─────────────────────────────┤`,
    `│ 🔥 *ACAO DO DIA*`,
    `│ ${plan.acao_principal}`,
    `├─────────────────────────────┤`,
    `│ 🧠 *COACHING*`,
    `│ ${plan.coaching}`,
    `├─────────────────────────────┤`,
    `│ 💰 *FINANCEIRO*`,
    `│ ${plan.financeiro}`,
    `├─────────────────────────────┤`,
    `│ 📱 WPP: ${t.wpp.hoje.sent} hj | ${t.wpp.semana.sent} sem (${t.wpp.semana.rate}%) | R$${t.wpp.custoSemana}`,
    `│ 📧 Email: ${t.email.sent} env | ${t.email.openRate}% ab`,
    `│ 📦 Fila: ${t.fila.novos.toLocaleString()} novos | ${t.fila.total.toLocaleString()} total`,
    `│ 🤝 Reunioes: ${t.reunioes.hoje} hj | ${t.reunioes.semana} sem | ${t.reunioes.total} total`,
    `│ 📝 Blog: ${t.blog.total} posts publicados`,
    `├─────────────────────────────┤`,
    `│ 💼 *PIPELINE:* R$ ${pipelineTotal.toLocaleString('pt-BR')}`,
    (t.pipeline || []).slice(0, 4).map(p => `│ ${p.etapa}: ${p.total} leads | R$ ${(p.valor || 0).toLocaleString('pt-BR')}`).join('\n'),
    `└─────────────────────────────┘`,
  ];

  if (isWeekly && plan.score) {
    msg.push(``, `📈 *SCORE DA SEMANA:* ${plan.score}/10`);
  }

  if (t.hotLeads?.length) {
    msg.push(``, `🔔 *LEADS QUENTES PARADOS:*`);
    t.hotLeads.slice(0, 3).forEach((l, i) => {
      msg.push(`${i + 1}. ${l.nome}${l.empresa ? ` (${l.empresa})` : ''} — ${l.status}`);
    });
  }

  const fullMsg = msg.filter(Boolean).join('\n');

  try {
    await axios.post(`${evoUrl}/message/sendText/Raul%20Santos`, {
      number: process.env.GROUP_COMANDO_ID || '120363428115495870@g.us', text: fullMsg, delay: 1200,
    }, { headers: { apikey: evoKey, 'Content-Type': 'application/json' }, timeout: 15000 });
    console.log('[Chief] Relatorio enviado — grupo Comando');
  } catch (err) {
    console.error('[Chief] Erro WhatsApp (Comando):', err.message);
  }

  // Coach matinal — envia so coaching no grupo Conteudo (6h/8h)
  const now = new Date();
  const brHour = (now.getUTCHours() - 3 + 24) % 24;
  if (brHour === 8 || brHour === 6) {
    const coachingMsg = `☀️ *Coach — ${new Date().toLocaleDateString('pt-BR')}*\n\n` +
      `${plan.coaching}\n\n` +
      `🔥 Acao do dia:\n${plan.acao_principal}`;

    try {
      await axios.post(`${evoUrl}/message/sendText/Raul%20Santos`, {
        number: process.env.GROUP_CONTEUDO_ID || '120363429703736599@g.us', text: coachingMsg, delay: 1200,
      }, { headers: { apikey: evoKey, 'Content-Type': 'application/json' }, timeout: 15000 });
      console.log('[Chief] Coaching enviado — grupo Conteudo');
    } catch (err) {
      console.error('[Chief] Erro WhatsApp (Conteudo):', err.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
export async function runChiefAgent() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const isWeekly = now.getUTCDay() === 0 && brHour >= 12;

    console.log(`[Chief] CEO Briefing (${isWeekly ? 'planejamento semanal' : 'diario'}, modelo: ${isWeekly ? (process.env.CHIEF_WEEKLY_MODEL || 'deepseek-chat') : (process.env.CHIEF_MODEL || 'deepseek-chat')})...`);

    const [intel, crossIntel] = await Promise.all([
      getDeepIntel(),
      getCrossAgentIntel(),
    ]);

    const plan = await ceoBriefing(intel, crossIntel, isWeekly);

    if (plan) {
      console.log(`[Chief] Panorama: ${plan.panorama?.substring(0, 80)}...`);

      await saveBriefing(plan, intel, isWeekly);

      if (plan.tarefas?.length) {
        const saved = await saveTasks(plan.tarefas);
        console.log(`[Chief] ${saved} tarefas estrategicas salvas`);
      }

      if (isWeekly && plan.okrs?.length) {
        const okrSaved = await saveOkrs(plan.okrs);
        console.log(`[Chief] ${okrSaved} OKRs da semana salvos`);
      }

      await sendToWhatsApp(intel, plan, isWeekly);
    }
  } catch (err) {
    console.error('[Chief] Erro:', err.message);
  }
  running = false;
}

export function startChiefAgent() {
  if (!process.env.DEEPSEEK_API_KEY) { console.log('[Chief] DeepSeek nao configurada'); return; }

  const check = () => {
    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const brMin = now.getUTCMinutes();

    // 8:00 e 20:00 BRT — briefing diario
    if ((brHour === 8 || brHour === 20) && brMin < 5) runChiefAgent();
    // Domingo 20:00 BRT — planejamento semanal (isWeekly detectado dentro de runChiefAgent)
  };

  setInterval(check, 300_000);
  // Executa no startup para ter o primeiro briefing
  setTimeout(runChiefAgent, 15000);
  console.log('[Chief] CEO ativo — briefings 8h/20h | Planejamento: dom 20h | Coach integrado');
}
