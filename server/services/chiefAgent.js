/**
 * CHIEF v3 — CEO completo: Estratégia, Gestão, Finanças, Coaching, Execução
 * Roda 2x/dia (briefing) + Domingo 20h (planejamento semanal)
 * Conhecimento: frameworks de negócio, growth, vendas B2B, construção civil
 */

import { query, queryOne, run } from '../db/database.js';
import pg from 'pg';
import axios from 'axios';

const { Pool } = pg;
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution.vigasales.shop';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const AGENTS_GROUP = process.env.GROUP_COMANDO_ID || "120363428115495870@g.us";
const LEADS_DB_URL = process.env.DATABASE_LEADS_URL;
const USD_TO_BRL = 5.5;
const COST_PER_MSG = 0.071;

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

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE — frameworks de negócio que o Chief domina
// ═══════════════════════════════════════════════════════════════════════════════
const BUSINESS_KNOWLEDGE = `
FRAMEWORKS QUE VOCÊ DOMINA E APLICA:

1. GESTÃO DE CRESCIMENTO (Growth):
- Funil AAARRR (Awareness, Acquisition, Activation, Revenue, Retention, Referral)
- Growth Loops: como cada canal alimenta o próximo
- North Star Metric: reuniões agendadas → propostas enviadas → contratos fechados
- Canais da Viga Sales: WhatsApp frio, Email frio, Blog/SEO, LinkedIn, Instagram
- CAC (Custo de Aquisição) por canal
- LTV estimado por cliente de automação (R$ 1.500-5.000/mês)

2. ESTRATÉGIA DE VENDAS B2B:
- SPIN Selling: Situação, Problema, Implicação, Necessidade
- Challenger Sale: ensinar, adaptar, controlar
- BANT: Budget, Authority, Need, Timeline
- Perfil ideal de cliente (ICP): Construtoras e engenheiros com 5+ funcionários, faturamento > R$100k/mês
- Ciclo de venda típico: 2-4 semanas (automação), 1-2 semanas (tráfego pago)

3. GESTÃO FINANCEIRA:
- Receita recorrente mensal (MRR)
- Churn rate
- CAC Payback (meses para recuperar custo de aquisição)
- Margem de contribuição por serviço
- Break-even de campanhas (quantos clientes precisa fechar pra pagar o custo)
- Precificação: automação R$1.500-5.000, tráfego R$2.000-8.000, sites R$3.000-15.000

4. COACHING E LIDERANÇA:
- OKRs (Objectives and Key Results)
- Priorização: matriz Eisenhower (urgente vs importante)
- Regra 80/20: 20% das ações trazem 80% dos resultados
- Deep Work: blocos de 2h sem interrupção para tarefas de alto valor
- Feedback loop: medir → aprender → ajustar → repetir

5. MARKETING DE CONTEÚDO:
- Blog: 1 artigo/semana, SEO para "automação WhatsApp construtoras", "CRM para engenharia"
- Social proof: cases de sucesso, depoimentos, métricas reais
- Funil de conteúdo: topo (blog) → meio (case) → fundo (proposta)
- Remarketing: email para quem abriu mas não respondeu

6. MÉTRICAS QUE VOCÊ ACOMPANHA:
- Volume de prospecção por canal (diário/semanal/mensal)
- Taxa de resposta por canal
- Taxa de conversão: lead → reunião → proposta → fechamento
- Velocidade do funil (dias entre cada etapa)
- ROI por canal (receita gerada / custo do canal)
- Saúde dos agentes (uptime, erros, volume processado)
`;

// ═══════════════════════════════════════════════════════════════════════════════
// INTELIGÊNCIA — coleta de dados de todos os bancos
// ═══════════════════════════════════════════════════════════════════════════════
async function getDeepIntel() {
  const [
    sentToday, sentYesterday, sentWeek, sentMonth,
    respToday, respYesterday, respWeek, respTotal,
    prospectsNew, prospectsTotal, prospectsDesk, prospectsEnviados,
    activeTemplates, allTemplates,
    daily14, costsByTemplate,
    blogPosts,
    emailsSent, emailsOpened, emailsReplied, emailsFailed,
    emailCampaigns,
    meetingsToday, meetingsWeek, meetingsTotal,
    // Novas queries de negócio
    reuniõesTaxaConversao,
    leadsSemResposta,
    prospectsPorDia,
  ] = await Promise.all([
    // WPP envios
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND DATE(created_at) = CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '30 days'"),
    // WPP respostas
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND DATE(responded_at::timestamp) = CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND DATE(responded_at::timestamp) = CURRENT_DATE - INTERVAL '1 day'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu' AND responded_at::timestamp >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'respondeu'"),
    // Fila
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'novo'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'descartado'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'enviado'"),
    // Templates
    query("SELECT name, sent_count, max_sends, paused FROM meta_templates ORDER BY sent_count DESC"),
    query("SELECT COUNT(*) as cnt FROM meta_templates"),
    // Tendência 14 dias
    query("SELECT DATE(created_at) as dia, COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '14 days' GROUP BY DATE(created_at) ORDER BY dia"),
    query("SELECT name, sent_count FROM meta_templates ORDER BY sent_count DESC LIMIT 6"),
    // Blog
    queryOne("SELECT COUNT(*) as cnt FROM blog_posts WHERE status = 'published'"),
    // Email
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'sent'"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'opened'"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'replied'"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status = 'failed'"),
    query("SELECT name, status, sent_count, opened_count, replied_count FROM email_campaigns ORDER BY sent_count DESC LIMIT 5"),
    // Reuniões
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'reuniao_agendada' AND DATE(updated_at::timestamp) = CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'reuniao_agendada' AND updated_at::timestamp >= NOW() - INTERVAL '7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'reuniao_agendada'"),
    // Negócio
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'reuniao_agendada'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status = 'enviado' AND sent_at::timestamp < NOW() - INTERVAL '3 days'"),
    query("SELECT DATE(created_at) as dia, COUNT(*) as cnt FROM prospecting_logs WHERE action = 'enviado_meta' AND created_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY dia"),
  ]);

  const calc = (val) => parseInt(val?.cnt || '0');

  return {
    wpp: {
      hoje: { sent: calc(sentToday), resp: calc(respToday), rate: calc(sentToday)>0?(calc(respToday)/calc(sentToday)*100).toFixed(1):'0' },
      ontem: { sent: calc(sentYesterday), resp: calc(respYesterday), rate: calc(sentYesterday)>0?(calc(respYesterday)/calc(sentYesterday)*100).toFixed(1):'0' },
      semana: { sent: calc(sentWeek), resp: calc(respWeek), rate: calc(sentWeek)>0?(calc(respWeek)/calc(sentWeek)*100).toFixed(1):'0' },
      mes: { sent: calc(sentMonth) },
      custoHoje: (calc(sentToday)*COST_PER_MSG*USD_TO_BRL).toFixed(2),
      custoSemana: (calc(sentWeek)*COST_PER_MSG*USD_TO_BRL).toFixed(2),
      custoMes: (calc(sentMonth)*COST_PER_MSG*USD_TO_BRL).toFixed(2),
    },
    fila: { novos: calc(prospectsNew), total: calc(prospectsTotal), descartados: calc(prospectsDesk), enviados: calc(prospectsEnviados) },
    templates: { ativos: (activeTemplates||[]).filter(t=>!t.paused).length, total: allTemplates?.[0]?.cnt||0, top3: (activeTemplates||[]).slice(0,3) },
    diario: daily14,
    blog: calc(blogPosts),
    email: {
      sent: calc(emailsSent), opened: calc(emailsOpened), replied: calc(emailsReplied), failed: calc(emailsFailed),
      openRate: calc(emailsSent)>0?((calc(emailsOpened)/calc(emailsSent))*100).toFixed(0):'0',
      campaigns: (emailCampaigns||[]).map(c=>({...c,sent:parseInt(c.sent_count||'0'),opened:parseInt(c.opened_count||'0'),replied:parseInt(c.replied_count||'0')})),
    },
    reunioes: { hoje: calc(meetingsToday), semana: calc(meetingsWeek), total: calc(meetingsTotal) },
    negocio: {
      conversaoReuniao: calc(sentWeek)>0?((calc(meetingsWeek)/calc(sentWeek))*100).toFixed(1):'0',
      leadsParados: calc(leadsSemResposta),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CEO BRIEFING — o Chief analisa e decide
// ═══════════════════════════════════════════════════════════════════════════════
async function ceoBriefing(intel, isWeekly) {
  if (!OPENAI_KEY) return null;

  const t = intel;
  const tendencia = (t.diario||[]).slice(-7).map(d=>{
    const dia = d.dia instanceof Date ? d.dia.toISOString().slice(5,10) : String(d.dia||'').slice(5,10);
    return `${dia}:${d.cnt}`;
  }).join(' ');

  const modo = isWeekly ? 'PLANEJAMENTO SEMANAL (domingo 20h)' : 'BRIEFING DIÁRIO';
  
  const prompt = `Você é O CEO da Viga Sales — uma empresa de automação comercial B2B que vende automação de WhatsApp, CRM, tráfego pago e sites para construtoras e engenheiros no Brasil.

${BUSINESS_KNOWLEDGE}

SEU PAPEL HOJE: ${modo}
${isWeekly ? 'Faça um planejamento estratégico completo para a semana. Defina OKRs, prioridades, e tarefas táticas.' : 'Analise os números de hoje e dê direção. Seja direto e acionável.'}

DADOS DA OPERAÇÃO:

📱 WHATSAPP:
- Hoje: ${t.wpp.hoje.sent} envios, ${t.wpp.hoje.resp} respostas (${t.wpp.hoje.rate}%), R$${t.wpp.custoHoje}
- Ontem: ${t.wpp.ontem.sent} envios, ${t.wpp.ontem.resp} respostas (${t.wpp.ontem.rate}%)
- Semana: ${t.wpp.semana.sent} envios, ${t.wpp.semana.resp} respostas (${t.wpp.semana.rate}%), R$${t.wpp.custoSemana}
- Mês: ${t.wpp.mes.sent} envios, R$${t.wpp.custoMes}

📦 FILA WPP: ${t.fila.novos.toLocaleString()} novos / ${t.fila.total.toLocaleString()} total / ${t.fila.enviados.toLocaleString()} enviados
🎯 Templates: ${t.templates.ativos}/${t.templates.total} ativos
📈 Tendência 7d: ${tendencia}

📧 EMAIL:
- ${t.email.sent.toLocaleString()} enviados, ${t.email.openRate}% abertura, ${t.email.replied} replies, ${t.email.failed} falhas
- Campanhas: ${t.email.campaigns?.map(c=>`${c.name}: ${c.sent} env, ${Math.round(c.opened/c.sent*100)||0}% ab`).join(' | ')||'Nenhuma'}

📝 BLOG: ${t.blog} artigos publicados
🤝 REUNIÕES: ${t.reunioes.hoje} hoje, ${t.reunioes.semana} semana, ${t.reunioes.total} total
⚡ CONVERSÃO: ${t.negocio.conversaoReuniao}% dos envios → reunião
⚠️ LEADS PARADOS >3 dias: ${t.negocio.leadsParados}

${isWeekly ? `
ANÁLISE ESTRATÉGICA DA SEMANA:
- Faça uma análise SWOT realista
- Defina OKRs para a semana (máx 3 objetivos, cada um com 2-3 key results)
- Identifique o MAIOR gargalo de crescimento AGORA
- Qual o experimento mais importante para rodar essa semana?
` : ''}

Responda APENAS com JSON:
{
  "panorama": "2-3 frases do estado real. Sem açúcar.",
  "alerta": "O que é crítico AGORA. Se nada, diga o que merece atenção.",
  "estrategia": "${isWeekly ? 'Plano estratégico da semana: OKRs + ações + experimentos' : 'Direção tática para hoje'}",
  "acao_principal": "A coisa MAIS importante que o Raul precisa fazer nas próximas 24h. Específica.",
  "coaching": "1 feedback direto pro Raul. O que ele tá fazendo bem? O que precisa melhorar? Como melhorar?",
  "financeiro": "Análise rápida: o custo dos canais está justificado? O RoI tá positivo?",
  "tarefas": [
    {"titulo": "...", "descricao": "...", "prioridade": "alta/media/baixa", "categoria": "prospeccao/conteudo/vendas/tecnico/estrategia"},
    {"titulo": "...", "descricao": "...", "prioridade": "alta/media/baixa", "categoria": "prospeccao/conteudo/vendas/tecnico/estrategia"}
  ]
}`;

  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [{ role: 'system', content: 'Você é um CEO experiente em B2B SaaS, growth e vendas para construção civil. Responda sempre em JSON.' }, { role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }, { headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }, timeout: 60000 });

    const text = res.data?.choices?.[0]?.message?.content;
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.error('[Chief] CEO Briefing error:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUÇÃO — salva tarefas, envia ordens
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
// WHATSAPP — envia relatório pro grupo
// ═══════════════════════════════════════════════════════════════════════════════
async function sendToWhatsApp(intel, plan, isWeekly) {
  if (!EVO_KEY || !EVO_URL) return;
  const t = intel;
  const icon = isWeekly ? '📅' : '☀️';
  const title = isWeekly ? 'PLANEJAMENTO SEMANAL' : 'CEO BRIEFING';

  const msg = `${icon} *${title}*\n\n` +
    `📱 WPP: ${t.wpp.hoje.sent}hj | ${t.wpp.semana.sent}sem | ${t.wpp.semana.rate}% tx resp\n` +
    `📧 Email: ${t.email.sent} env | ${t.email.openRate}% ab | ${t.fila.novos.toLocaleString()} fila\n` +
    `🤝 Reuniões: ${t.reunioes.hoje}hj | ${t.reunioes.total} total\n` +
    `💰 Custo WPP: R$${t.wpp.custoHoje}hj | R$${t.wpp.custoSemana}sem\n\n` +
    `🔥 *Panorama:* ${plan.panorama}\n` +
    `⚠️ *Alerta:* ${plan.alerta}\n` +
    `💸 *Ação:* ${plan.acao_principal}\n` +
    `🧠 *Coaching:* ${plan.coaching}\n` +
    (plan.estrategia ? `📋 *Estratégia:* ${plan.estrategia}\n` : '') +
    `💵 *Financeiro:* ${plan.financeiro}`;

  try {
    await axios.post(`${EVO_URL}/message/sendText/Raul%20Santos`, {
      number: AGENTS_GROUP, text: msg, delay: 1200,
    }, { headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
    console.log('[Chief] Relatório enviado via WhatsApp');
  } catch (err) {
    console.error('[Chief] Erro WhatsApp:', err.message);
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

    console.log(`[Chief] CEO Briefing (${isWeekly ? 'planejamento semanal' : 'diário'})...`);
    const intel = await getDeepIntel();
    const plan = await ceoBriefing(intel, isWeekly);

    if (plan) {
      console.log(`[Chief] Panorama: ${plan.panorama?.substring(0, 80)}...`);

      if (plan.tarefas?.length) {
        const saved = await saveTasks(plan.tarefas);
        console.log(`[Chief] ${saved} tarefas estratégicas salvas`);
      }

      await sendToWhatsApp(intel, plan, isWeekly);
    }
  } catch (err) {
    console.error('[Chief] Erro:', err.message);
  }
  running = false;
}

export function startChiefAgent() {
  if (!OPENAI_KEY) { console.log('[Chief] OpenAI não configurada'); return; }

  const check = () => {
    const now = new Date();
    const brHour = (now.getUTCHours() - 3 + 24) % 24;
    const brMin = now.getMinutes();

    // 8:00 e 20:00 BRT — briefing diário
    if ((brHour === 8 || brHour === 20) && brMin < 5) runChiefAgent();
    // Domingo 20:00 BRT — planejamento semanal (forçado pelo isWeekly flag)
  };

  setInterval(check, 300_000);
  // Executa imediatamente no startup também
  setTimeout(runChiefAgent, 10000);
  console.log('[Chief] CEO ativo — briefings 8h/20h | Planejamento: dom 20h');
}
