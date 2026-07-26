/**
 * BOSS MODE — Raul conversa com os agentes via WhatsApp
 * Áudio, imagem, texto, delegação, confirmação
 */

import { query, queryOne, run } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const pendingActions = new Map();

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

  if (/artigo\s*(sobre|de)\s+|cria\s*artigo|novo\s*artigo|escreve\s*artigo/.test(lower) || /blog\s*(sobre|de)\s+/.test(lower)) {
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
    const r = await axios.post('https://api.openai.com/v1/chat/completions', {
      model:'gpt-4o-mini', max_tokens:50,
      messages:[{role:'user',content:`Título do artigo. Se não houver tema, "null". Pedido: "${cmd}"`}],
    },{headers:{'Authorization':`Bearer ${OPENAI_KEY}`,'Content-Type':'application/json'},timeout:8000});
    topic = r.data?.choices?.[0]?.message?.content?.trim().replace(/["']/g,'');
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
    const r = await axios.post('https://api.openai.com/v1/chat/completions', {
      model:'gpt-4o-mini', max_tokens:150,
      messages:[{role:'user',content:`JSON: {"slug":"slug","instrucoes":"o que fazer"}. ${isDelete?'EXCLUIR artigo.':''} Pedido: "${cmd}"`}],
    },{headers:{'Authorization':`Bearer ${OPENAI_KEY}`,'Content-Type':'application/json'},timeout:8000});
    const data = JSON.parse(r.data?.choices?.[0]?.message?.content||'{}');
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
    const r = await axios.post('https://api.openai.com/v1/chat/completions', {
      model:'gpt-4o-mini', max_tokens:200,
      messages:[{role:'user',content:`JSON: {"titulo":"título","descricao":"detalhes","prioridade":"alta/media/baixa"}. Pedido: "${cmd}"`}],
    },{headers:{'Authorization':`Bearer ${OPENAI_KEY}`,'Content-Type':'application/json'},timeout:10000});
    const t = JSON.parse(r.data?.choices?.[0]?.message?.content||'{}');
    if (t.titulo) {
      const cats={metaDispatcher:'prospeccao',emailDispatcher:'prospeccao',blogAgent:'conteudo',securityAgent:'tecnico',chiefAgent:'coaching',agente_sdr:'vendas',agente_agendador:'vendas',insightsAgent:'estrategia',strategyAgent:'estrategia'};
      await run("INSERT INTO chief_tasks (id, title, description, category, priority, status, week_start) VALUES ($1,$2,$3,$4,$5,'pendente',CURRENT_DATE)",
        [uuidv4(), t.titulo, t.descricao||'', cats[agentId]||'geral', t.prioridade||'media']);
      await metaApi.sendText(phone, `✅ Tarefa criada!\n📋 ${t.titulo}\n📂 ${cats[agentId]||'geral'}`);
    }
  } catch { await metaApi.sendText(phone, '✅ Tarefa delegada.'); }
}

async function chatResponse(phone, cmd, name, metaApi, imageUrl) {
  if (!OPENAI_KEY) return metaApi.sendText(phone, '🤖 IA offline.');

  const intel = await getIntel();
  const tasks = await query("SELECT title, priority FROM chief_tasks WHERE status='pendente' LIMIT 5").catch(()=>[]);
  const sysPrompt = `Hub Viga Sales. Dados: WPP ${intel.wpp.hoje} hj, ${intel.wpp.semana} sem, ${intel.wpp.rate}% tx. Email ${intel.email} env. Blog ${intel.blog} posts. Tarefas: ${tasks.map(t=>`${t.priority==='alta'?'🔴':'🟡'} ${t.title}`).join('|')||'nenhuma'}. Máx 400 chars. Natural, como colega de trabalho.`;

  try {
    const msgs = [{role:'system',content:sysPrompt}];
    if (imageUrl) msgs.push({role:'user',content:[{type:'text',text:cmd||'Descreva esta imagem'},{type:'image_url',image_url:{url:imageUrl}}]});
    else msgs.push({role:'user',content:cmd});

    const r = await axios.post('https://api.openai.com/v1/chat/completions', {
      model:imageUrl?'gpt-4o':'gpt-4o-mini', messages:msgs, temperature:0.8, max_tokens:600,
    },{headers:{'Authorization':`Bearer ${OPENAI_KEY}`,'Content-Type':'application/json'},timeout:20000});

    const resp = r.data?.choices?.[0]?.message?.content || 'Pode repetir?';
    // Save memory
    await run("INSERT INTO boss_memory (id, phone, role, content) VALUES ($1,$2,'user',$3)", [uuidv4(), phone, cmd?.substring(0,500)||'']).catch(()=>{});
    await run("INSERT INTO boss_memory (id, phone, role, content) VALUES ($1,$2,'assistant',$3)", [uuidv4(), phone, resp?.substring(0,1000)||'']).catch(()=>{});
    await metaApi.sendText(phone, resp);
  } catch(e) { console.error('[BOSS] chat:', e.message); await metaApi.sendText(phone, '⚠️ Erro.'); }
}

async function getIntel() {
  const [a,b,c,d,e,f,g] = await Promise.all([
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action='enviado_meta' AND DATE(created_at)=CURRENT_DATE"),
    queryOne("SELECT COUNT(*) as cnt FROM prospecting_logs WHERE action='enviado_meta' AND created_at>=NOW()-INTERVAL'7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='respondeu' AND responded_at::timestamp>=NOW()-INTERVAL'7 days'"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status='sent'"),
    queryOne("SELECT COUNT(*) as cnt FROM email_send_logs WHERE status='opened'"),
    queryOne("SELECT COUNT(*) as cnt FROM blog_posts WHERE status='published'"),
    queryOne("SELECT COUNT(*) as cnt FROM prospects WHERE status='novo'"),
  ]);
  const C=v=>parseInt(v?.cnt||'0');
  return {wpp:{hoje:C(a),semana:C(b),rate:C(b)>0?((C(c)/C(b))*100).toFixed(1):'0'},email:C(d),blog:C(e),fila:C(g)};
}

// Whisper transcription
export async function transcribeAudio(audioUrl, metaToken) {
  if (!OPENAI_KEY) return null;
  try {
    const r = await axios.get(audioUrl, {responseType:'arraybuffer',timeout:30000,headers:{'Authorization':`Bearer ${metaToken}`}});
    const buf = Buffer.from(r.data);
    const b = `----Whisper${Date.now()}`;
    const h = `--${b}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${b}\r\nContent-Disposition: form-data; name="language"\r\n\r\npt\r\n--${b}\r\nContent-Disposition: form-data; name="file"; filename="audio.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`;
    const body = Buffer.concat([Buffer.from(h), buf, Buffer.from(`\r\n--${b}--\r\n`)]);
    const res = await axios.post('https://api.openai.com/v1/audio/transcriptions', body, {
      headers:{'Authorization':`Bearer ${OPENAI_KEY}`,'Content-Type':`multipart/form-data; boundary=${b}`},timeout:30000});
    return res.data?.text || null;
  } catch(e) { console.error('[BOSS] Whisper:', e.message); return null; }
}
