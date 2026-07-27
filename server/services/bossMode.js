/**
 * BOSS MODE — Raul conversa com os agentes via WhatsApp
 * Áudio, imagem, texto, delegação, confirmação
 */

import { query, queryOne, run } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import https from 'https';
import { loadSkills } from './skillLoader.js';

const pendingActions = new Map();

function deepseek(messages, maxTokens = 600) {
  const key = process.env.DEEPSEEK_API_KEY || '';
  if (!key) return Promise.reject(new Error('No API key'));
  const body = JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: maxTokens, temperature: 0.8 });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 20000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) reject(new Error(`DeepSeek ${res.statusCode}: ${data.substring(0, 200)}`));
          else resolve(JSON.parse(data));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('DeepSeek timeout')); });
    req.write(body);
    req.end();
  });
}

export async function handleBossCommand(phone, cmd, name, metaApi, imageUrl = null) {
  console.log(`[BOSS] ${name}: "${(cmd || '').substring(0, 80)}"`);
  const lower = (cmd || '').toLowerCase();

  // ── CONFIRMAÇÃO ──
  const pending = pendingActions.get(phone);
  if (pending && Date.now() < pending.expires) {
    if (/^(sim|yes|ok|pode|confirmo|isso|correto|certo|uhum)/i.test(lower.trim())) {
      pendingActions.delete(phone);
      return executeAction(pending.action, pending.data, phone, metaApi);
    }
    if (/^(não|nao|nop|cancelar|para|deixa|depois)/i.test(lower.trim())) {
      pendingActions.delete(phone);
      await metaApi.sendText(phone, '👍 Ok, cancelei.');
      return;
    }
    pendingActions.delete(phone);
  }

  // ── DELEGAÇÃO ──
  const delMatch = lower.match(/(?:chefe\s*[,:]?\s*)?(?:manda|fala\s*(?:pro|pra)|pede\s*(?:pro|pra)|diz\s*(?:pro|pra)|aciona)\s*(?:o\s*|a\s*)?(\w+)\s*(?:fazer|executar|rodar|criar|aumentar|diminuir|parar|pausar|escrever|publicar|gerar|editar|corrigir|arrumar|revisar|excluir|deletar|apagar|remover)/);
  const targets = {
    dante:'metaDispatcher',disparador:'metaDispatcher',wpp:'metaDispatcher',whatsapp:'metaDispatcher',
    rita:'emailDispatcher',carteira:'emailDispatcher',email:'emailDispatcher',
    clarice:'blogAgent',escritora:'blogAgent',blog:'blogAgent',blogueira:'blogAgent',
    nascimento:'securityAgent',segurança:'securityAgent',security:'securityAgent',
    maria:'agente_sdr',sdr:'agente_sdr',vendedora:'agente_sdr',
    tobias:'agente_agendador',agendador:'agente_agendador',agendinha:'agente_agendador',
    ivone:'insightsAgent',analista:'insightsAgent',general:'strategyAgent',estrategista:'strategyAgent',
    carmem:'chiefAgent',coach:'chiefAgent',traffic:'trafficAgent',trafego:'trafficAgent',tráfego:'trafficAgent',cérebro:'trafficAgent',cerebro:'trafficAgent',
    ela:null,ele:null
  };

  if (delMatch) {
    let agentId = targets[delMatch[1].toLowerCase()];
    if (agentId === null) {
      if (/artigo|blog|post|escrever|publicar|clarice/.test(lower)) agentId = 'blogAgent';
      else if (/whatsapp|wpp|template|disparo|dante/.test(lower)) agentId = 'metaDispatcher';
      else if (/email|rita/.test(lower)) agentId = 'emailDispatcher';
      else if (/segurança|scan|nascimento/.test(lower)) agentId = 'securityAgent';
    }
    if (!agentId) return await chatResponse(phone, cmd, name, metaApi, imageUrl);

    if (agentId === 'blogAgent') {
      if (/criar|escrever|gerar|publicar|fazer\s*artigo|artigo\s*novo|novo\s*artigo/.test(lower))
        return confirmBlogCreate(phone, cmd, metaApi);
      if (/editar|corrigir|arrumar|revisar|atualizar|mudar|alterar|reescrever/)
        return confirmBlogAction(phone, cmd, metaApi, 'blogEdit');
      if (/excluir|deletar|apagar|remover/)
        return confirmBlogAction(phone, cmd, metaApi, 'blogDelete');
    }

    if (agentId === 'securityAgent' && /rodar|scan|escanear|verificar|checar/.test(lower)) {
      const { runSecurityAgent } = await import('./securityAgent.js');
      runSecurityAgent().catch(()=>{});
      return await metaApi.sendText(phone, '🛡️ Scan iniciado!');
    }

    if (agentId === 'trafficAgent') {
      const { queryBrain, TOPICS } = await import('./trafficAgent.js');
      // Extrai a pergunta sobre tráfego do comando
      const qMatch = cmd.match(/(?:pergunta|dúvida|duvida|sobre|como|por que|quando|onde|qual|quanto|otimizar|melhorar|campanha|anúncio|anuncio|google|meta|facebook|instagram|pixel|público|publico|segmentação|segmentacao|orçamento|orcamento|lance|criativo|conversão|conversao|ROAS|CPA|CPM|CTR|lead|whatsapp|PMax|display|pesquisa|youtube)/i);
      const question = qMatch ? cmd.substring(cmd.search(qMatch[0])) : cmd;
      const result = queryBrain(question);

      if (result.error) {
        return await metaApi.sendText(phone, '🧠 *Cérebro de Tráfego:* Erro na consulta. Tente reformular.');
      }

      const topics = result.matched_topics || [];
      if (topics.length === 0) {
        return await metaApi.sendText(phone, `🧠 *Cérebro de Tráfego:* Não encontrei conhecimento específico sobre "${question.substring(0, 80)}...".\n\nTópicos disponíveis:\n${Object.entries(TOPICS).map(([k,v]) => `• *${k}*: ${v}`).join('\n')}`);
      }

      let resp = `🧠 *Cérebro de Tráfego*\n\n`;
      resp += `📚 Tópicos mais relevantes para sua dúvida:\n\n`;
      for (const t of topics.slice(0, 3)) {
        resp += `*${t.topic}* (score: ${t.score})\n${t.description}\n`;
        if (t.summary) resp += `_${t.summary.substring(0, 200)}..._\n`;
        resp += `📄 \`${t.file}\`\n\n`;
      }
      resp += `💡 _Peça "cérebro deep-dive [tópico]" para ver o conteúdo completo._`;
      return await metaApi.sendText(phone, resp);
    }

    // Tarefa genérica
    return createDelegationTask(phone, cmd, agentId, metaApi);
  }

  // ── AÇÕES DIRETAS ──
  if (/criar?\s*tarefa|nova\s*tarefa|planejar|plano|briefing/.test(lower)) {
    const { runChiefAgent } = await import('./chiefAgent.js');
    runChiefAgent().catch(()=>{});
    await metaApi.sendText(phone, '👔 Chief acionado! Tarefas em ~30s.');
    setTimeout(async () => {
      const tasks = await query("SELECT title, priority FROM chief_tasks ORDER BY created_at DESC LIMIT 5").catch(()=>[]);
      if (tasks.length) {
        let m = '📋 *Tarefas:*\n\n';
        tasks.forEach((t,i) => { m += `${i+1}. ${t.priority==='alta'?'🔴':'🟡'} ${t.title}\n`; });
        await metaApi.sendText(phone, m);
      }
    }, 30000);
    return;
  }

  if (/artigo\s*(sobre|de)\s+|cri[ae]r?\s+(?:um\s+|uma\s+|o\s+|a\s+)?(?:novo\s+|nova\s+)?artigo|escreve\s+(?:um\s+|uma\s+)?artigo|vamos\s+criar\s+artigo/.test(lower) || /blog\s*(sobre|de)\s+/.test(lower)) {
    return confirmBlogCreate(phone, cmd, metaApi);
  }

  // ── CONVERSA NATURAL ──
  return chatResponse(phone, cmd, name, metaApi, imageUrl);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function confirmBlogCreate(phone, cmd, metaApi) {
  let topic = null;
  try {
    const r = await deepseek([{role:'user',content:`Título do artigo. Se não houver tema, "null". Pedido: "${cmd}"`}], 50);
    topic = r.choices?.[0]?.message?.content?.trim().replace(/["']/g,'');
    if (topic === 'null' || !topic || topic.length < 5) topic = null;
  } catch {}

  pendingActions.set(phone, {action:'blogCreate', data:{topic}, expires:Date.now()+120000});
  const msg = topic
    ? `✍️ *Confirmar artigo?*\nTema: "${topic}"\n\nResponda "sim" ou "não".`
    : '✍️ *Confirmar artigo?*\nPesquisarei um tema.\n\nResponda "sim" ou "não".';
  await metaApi.sendText(phone, msg);
}

async function confirmBlogAction(phone, cmd, metaApi, action) {
  const isDelete = action === 'blogDelete';
  try {
    const r = await deepseek([{role:'user',content:`JSON: {"slug":"slug","instrucoes":"o que fazer"}. ${isDelete?'EXCLUIR artigo.':''} Pedido: "${cmd}"`}], 150);
    const data = JSON.parse(r.choices?.[0]?.message?.content||'{}');
    if (data.slug) {
      pendingActions.set(phone, {action, data, expires:Date.now()+120000});
      const msg = isDelete
        ? `🗑️ *Confirmar exclusão?*\nArtigo: ${data.slug}\n⚠️ Irreversível!\n"sim" ou "não".`
        : `✏️ *Confirmar edição?*\nArtigo: ${data.slug}\nAção: ${data.instrucoes?.substring(0,80)}...\n"sim" ou "não".`;
      await metaApi.sendText(phone, msg);
    } else { await metaApi.sendText(phone, '❌ Não identifiquei o artigo.'); }
  } catch { await metaApi.sendText(phone, '❌ Erro ao processar.'); }
}

async function executeAction(action, data, phone, metaApi) {
  try {
    if (action === 'blogCreate') {
      const { generateAndPublish } = await import('./blogAgent.js');
      if (data.topic) await metaApi.sendText(phone, `✍️ Criando artigo sobre: "${data.topic}"\n⏳ Isso leva ~2 minutos...`);
      
      // Espera o artigo ficar pronto
      const article = await generateAndPublish(data.topic);
      if (article) {
        await metaApi.sendText(phone, `✅ *Artigo publicado!*\n📝 ${article.title}\n🔗 https://blog.vigasales.com.br/${article.slug||''}`);
        console.log(`[BOSS] Artigo criado: ${article.title}`);
      } else {
        await metaApi.sendText(phone, '❌ Falha ao gerar artigo. Tente novamente.');
        console.error('[BOSS] generateAndPublish retornou null');
      }
    } else if (action === 'blogEdit') {
      await metaApi.sendText(phone, `✏️ Editando "${data.slug}"...`);
      const { editArticle } = await import('./blogAgent.js');
      const r = await editArticle(data.slug, data.instrucoes);
      await metaApi.sendText(phone, r ? `✅ ${r.title}\n🔗 https://blog.vigasales.com.br/${r.slug||data.slug}` : '❌ Não encontrado.');
    } else if (action === 'blogDelete') {
      await metaApi.sendText(phone, `🗑️ Excluindo "${data.slug}"...`);
      const { deleteArticle } = await import('./blogAgent.js');
      const r = await deleteArticle(data.slug);
      await metaApi.sendText(phone, r ? `✅ Excluído: ${r.title}` : '❌ Não encontrado.');
    }
  } catch(e) { console.error('[BOSS] executeAction:', e.message); }
}

async function createDelegationTask(phone, cmd, agentId, metaApi) {
  try {
    const r = await deepseek([{role:'user',content:`JSON: {"titulo":"título","descricao":"detalhes","prioridade":"alta/media/baixa"}. Pedido: "${cmd}"`}], 200);
    const t = JSON.parse(r.choices?.[0]?.message?.content||'{}');
    if (t.titulo) {
      const cats={metaDispatcher:'prospeccao',emailDispatcher:'prospeccao',blogAgent:'conteudo',securityAgent:'tecnico',chiefAgent:'coaching',agente_sdr:'vendas',agente_agendador:'vendas',insightsAgent:'estrategia',strategyAgent:'estrategia'};
      await run("INSERT INTO chief_tasks (id, title, description, category, priority, status, week_start) VALUES ($1,$2,$3,$4,$5,'pendente',CURRENT_DATE)",
        [uuidv4(), t.titulo, t.descricao||'', cats[agentId]||'geral', t.prioridade||'media']);
      await metaApi.sendText(phone, `✅ Tarefa criada!\n📋 ${t.titulo}\n📂 ${cats[agentId]||'geral'}`);
    }
  } catch { await metaApi.sendText(phone, '✅ Tarefa delegada.'); }
}

async function chatResponse(phone, cmd, name, metaApi, imageUrl) {
  if (!process.env.DEEPSEEK_API_KEY) return metaApi.sendText(phone, '🤖 IA offline.');

  const intel = await getIntel();
  const tasks = await query("SELECT title, priority, category FROM chief_tasks WHERE status='pendente' LIMIT 8").catch(()=>[]);
  const okrs = await query("SELECT objetivo, key_result, progresso_atual FROM chief_okrs WHERE status='ativo' LIMIT 5").catch(()=>[]);
  const lastBriefing = await queryOne("SELECT panorama, acao_principal, created_at FROM chief_briefings ORDER BY created_at DESC LIMIT 1").catch(()=>null);
  const memory = await query("SELECT role, content FROM boss_memory WHERE phone=$1 ORDER BY created_at DESC LIMIT 6", [phone]).catch(()=>[]);

  let chiefBrain = '';
  try {
    const { execSync } = await import('child_process');
    const result = execSync(`python3 scripts/query_chief_brain.py "${cmd.replace(/"/g, '\\"').substring(0, 200)}"`, {
      encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 10000,
    });
    const data = JSON.parse(result);
    if (data.results?.length) {
      chiefBrain = 'CONHECIMENTO DO CEO:\n' + data.results.slice(0, 2).map(r => `[${r.topico}] ${r.summary?.substring(0, 300) || r.descricao}`).join('\n\n');
    }
  } catch (e) { /* brain offline */ }

  const pipelineTotal = (intel.pipeline || []).reduce((s, p) => s + (p.valor || 0), 0);
  const pipelineStr = (intel.pipeline || []).map(p => `${p.etapa}: ${p.total} leads (R$${p.valor?.toLocaleString?.('pt-BR') || 0})`).join(', ') || 'vazio';
  const tasksStr = tasks.map(t => `${t.priority==='alta'?'🔴':'🟡'} ${t.title} [${t.category}]`).join(' | ') || 'nenhuma';
  const okrsStr = okrs.map(o => `${o.objetivo} → ${o.key_result} (${o.progresso_atual || '0%'})`).join(' | ') || 'nenhum';
  const memStr = memory.reverse().map(m => `${m.role==='user'?'Raul':'Chief'}: ${m.content?.substring(0, 80)}`).join('\n');

  const sysPrompt = `Voce e o CHIEF — CEO da Viga Sales, empresa de automacao B2B (WhatsApp, CRM, trafego pago, sites) para construtoras.
O Raul e o DONO. Voce TRABALHA PRA ELE. Obedece ordens. Executa acoes. Reporta resultados.
Seja DIRETO, sem enrolacao. Nada de "otimo!" ou "excelente pergunta!".

DADOS:
📱 WPP: ${intel.wpp.hoje} hj | ${intel.wpp.semana} sem | ${intel.wpp.rate}% tx
📧 Email: ${intel.email} env | 📝 Blog: ${intel.blog} posts
🤝 Reunioes: ${intel.reunioes?.hoje || 0} hj | ${intel.reunioes?.semana || 0} sem
📦 Fila: ${intel.fila} leads | 💼 Pipeline: R$ ${pipelineTotal.toLocaleString('pt-BR')} — ${pipelineStr}
📋 Tarefas: ${tasksStr} | 🎯 OKRs: ${okrsStr}
${chiefBrain ? `\n${chiefBrain}\n` : ''}
${memStr ? `\nULTIMAS MENSAGENS:\n${memStr}\n` : ''}

VOÇE TEM FERRAMENTAS. Use-as quando o Raul pedir algo acionavel. Nao prometa — execute.
VOCE TEM SKILLS (habilidades especiais). Aplique-as em cada resposta.
NUNCA invente eventos passados. NUNCA diga que o Raul "interrompeu", "cancelou" ou "desistiu" de algo — a menos que ele tenha dito isso EXPLICITAMENTE. Se nao sabe o que aconteceu, pergunte.

${loadSkills('chief')}
${loadSkills('chat')}`;

  const tools = [
    { type: 'function', function: { name: 'search_contacts', description: 'Busca contatos no CRM por nome, empresa ou telefone', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Termo de busca (nome, empresa, ou parte)' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'create_task', description: 'Cria uma tarefa no sistema', parameters: { type: 'object', properties: { title: { type: 'string', description: 'Titulo da tarefa' }, description: { type: 'string', description: 'Descricao detalhada' }, priority: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Prioridade' }, category: { type: 'string', enum: ['prospeccao', 'conteudo', 'vendas', 'tecnico', 'estrategia', 'coaching'], description: 'Categoria' } }, required: ['title'] } } },
    { type: 'function', function: { name: 'run_briefing', description: 'Gera um briefing estrategico completo com tarefas e OKRs', parameters: { type: 'object', properties: { weekly: { type: 'boolean', description: 'true para planejamento semanal, false para diario' } } } } },
    { type: 'function', function: { name: 'run_security_scan', description: 'Executa varredura de seguranca no sistema', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'run_sql', description: 'Executa uma consulta SQL no banco de dados (somente SELECT)', parameters: { type: 'object', properties: { question: { type: 'string', description: 'O que voce quer saber? Ex: "quantos leads novos hoje", "templates com taxa de resposta < 1%"' } }, required: ['question'] } } },
  ];

  const messages = [{ role: 'system', content: sysPrompt }, { role: 'user', content: cmd }];

  try {
    console.log('[BOSS] chamando DeepSeek (com tools)...');
    const r = await deepseekWithTools(messages, tools);
    const msg = r.choices?.[0]?.message;

    if (msg?.tool_calls?.length) {
      await metaApi.sendText(phone, '👔 Executando...');
      for (const tc of msg.tool_calls) {
        const result = await executeTool(tc.function.name, JSON.parse(tc.function.arguments || '{}'), phone, metaApi);
        messages.push(msg);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      const r2 = await deepseekWithTools(messages, tools);
      const resp2 = r2.choices?.[0]?.message?.content || 'Feito, chefe.';
      console.log('[BOSS] Resposta final:', resp2.substring(0, 200));
      await metaApi.sendText(phone, resp2);
    } else {
      const resp = msg?.content || 'Pode repetir, chefe?';
      console.log('[BOSS] Resposta:', resp.substring(0, 200));
      await metaApi.sendText(phone, resp);
    }

    await run("INSERT INTO boss_memory (id, phone, role, content) VALUES ($1,$2,'user',$3)", [uuidv4(), phone, cmd?.substring(0, 500)||'']).catch(()=>{});
    await run("INSERT INTO boss_memory (id, phone, role, content) VALUES ($1,$2,'assistant',$3)", [uuidv4(), phone, (msg?.content || 'acao executada')?.substring(0, 1500)||'']).catch(()=>{});
  } catch(e) {
    const details = e.response ? `${e.response.status} ${JSON.stringify(e.response.data).substring(0, 300)}` : e.message;
    console.error('[BOSS] chat ERROR:', details);
    await metaApi.sendText(phone, '⚠️ Erro ao processar.');
  }
}

async function executeTool(name, args, phone, metaApi) {
  console.log('[BOSS] Tool:', name, JSON.stringify(args).substring(0, 100));
  try {
    if (name === 'search_contacts') {
      const contacts = await query(
        "SELECT name, company, phone, status, email FROM contacts WHERE name ILIKE $1 OR company ILIKE $1 OR phone LIKE $1 LIMIT 10",
        [`%${args.query || ''}%`]
      ).catch(() => []);
      return { found: contacts?.length || 0, contacts: contacts || [] };
    }
    if (name === 'create_task') {
      const { v4: uuidv4 } = await import('uuid');
      await run("INSERT INTO chief_tasks (id, title, description, category, priority, status, week_start) VALUES ($1,$2,$3,$4,$5,'pendente',CURRENT_DATE)",
        [uuidv4(), args.title, args.description || '', args.category || 'geral', args.priority || 'media']);
      return { ok: true, task: args.title };
    }
    if (name === 'run_briefing') {
      const { runChiefAgent } = await import('./chiefAgent.js');
      setTimeout(() => runChiefAgent().catch(()=>{}), 100);
      return { ok: true, message: 'Briefing iniciado. Tarefas em ~30s.' };
    }
    if (name === 'run_security_scan') {
      const { runSecurityAgent } = await import('./securityAgent.js');
      setTimeout(() => runSecurityAgent().catch(()=>{}), 100);
      return { ok: true, message: 'Scan de seguranca iniciado.' };
    }
    if (name === 'run_sql') {
      const q = args.question?.toLowerCase() || '';
      if (/templates|template/.test(q)) {
        const temps = await query("SELECT name, sent_count, max_sends, paused FROM meta_templates ORDER BY sent_count DESC LIMIT 10");
        return { result: temps };
      }
      if (/leads?\s*novos|fila|prospects/.test(q)) {
        const r = await queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='novo'");
        return { novos: parseInt(r?.cnt || '0') };
      }
      if (/resposta|taxa|response/.test(q)) {
        const sent = await queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action='enviado_meta' AND created_at>=NOW()-INTERVAL'7 days'");
        const resp = await queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='respondeu' AND responded_at::timestamp>=NOW()-INTERVAL'7 days'");
        const s = parseInt(sent?.cnt || '0'), r2 = parseInt(resp?.cnt || '0');
        return { sent: s, responses: r2, rate: s > 0 ? ((r2/s)*100).toFixed(1)+'%' : '0%' };
      }
      if (/reuniao|meeting|agendada/.test(q)) {
        const r = await queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='reuniao_agendada'");
        return { reunioes_agendadas: parseInt(r?.cnt || '0') };
      }
      if (/blog|artigo|post/.test(q)) {
        const r = await queryOne("SELECT COUNT(*) as cnt FROM blog_posts WHERE status='published'");
        return { artigos_publicados: parseInt(r?.cnt || '0') };
      }
      return { error: 'Nao entendi a consulta. Tente: templates, leads novos, taxa de resposta, reunioes, artigos' };
    }
    return { error: 'Ferramenta nao encontrada' };
  } catch (e) {
    return { error: e.message };
  }
}

function deepseekWithTools(messages, tools) {
  const key = process.env.DEEPSEEK_API_KEY || '';
  const body = JSON.stringify({ model: 'deepseek-chat', messages, tools, temperature: 0.7, max_tokens: 800 });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) reject(new Error(`API ${res.statusCode}`));
          else resolve(JSON.parse(data));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', e => reject(e));
    req.write(body);
    req.end();
  });
}

async function getIntel() {
  const [a, b, c, d, e, f, g, pipeline, reunioesHj, reunioesSem] = await Promise.all([
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action='enviado_meta' AND DATE(created_at)=CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action='enviado_meta' AND created_at>=NOW()-INTERVAL'7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='respondeu' AND responded_at::timestamp>=NOW()-INTERVAL'7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status='sent'"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status='opened'"),
    queryOne("SELECT COUNT(*) as cnt FROM blog_posts WHERE status='published'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='novo'"),
    query("SELECT ps.name as etapa, COUNT(*) as total, COALESCE(SUM(c.pipeline_value),0) as valor FROM contacts c LEFT JOIN pipeline_stages ps ON c.pipeline_stage = ps.id WHERE c.pipeline_stage IS NOT NULL AND c.pipeline_stage != '' GROUP BY ps.name, ps.position ORDER BY ps.position").catch(()=>[]),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='reuniao_agendada' AND DATE(updated_at::timestamp)=CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='reuniao_agendada' AND updated_at::timestamp>=NOW()-INTERVAL'7 days'"),
  ]);
  const C = v => parseInt(v?.cnt || '0');
  return {
    wpp: { hoje: C(a), semana: C(b), rate: C(b) > 0 ? ((C(c) / C(b)) * 100).toFixed(1) : '0' },
    email: C(d),
    blog: C(e),
    fila: C(g),
    pipeline: (pipeline || []).map(p => ({ etapa: p.etapa, total: parseInt(p.total), valor: parseFloat(p.valor || '0') })),
    reunioes: { hoje: C(reunioesHj), semana: C(reunioesSem) },
  };
}

// Whisper transcription
export async function transcribeAudio(audioUrl, metaToken) {
  const openaiKey = process.env.OPENAI_API_KEY || '';
  if (!openaiKey) return null;
  try {
    const r = await axios.get(audioUrl, {responseType:'arraybuffer',timeout:30000,headers:{'Authorization':`Bearer ${metaToken}`}});
    const buf = Buffer.from(r.data);
    const b = `----Whisper${Date.now()}`;
    const h = `--${b}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${b}\r\nContent-Disposition: form-data; name="language"\r\n\r\npt\r\n--${b}\r\nContent-Disposition: form-data; name="file"; filename="audio.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`;
    const body = Buffer.concat([Buffer.from(h), buf, Buffer.from(`\r\n--${b}--\r\n`)]);
    const res = await axios.post('https://api.openai.com/v1/audio/transcriptions', body, {
      headers:{'Authorization':`Bearer ${openaiKey}`,'Content-Type':`multipart/form-data; boundary=${b}`},timeout:30000});
    return res.data?.text || null;
  } catch(e) { console.error('[BOSS] Whisper:', e.message); return null; }
}
