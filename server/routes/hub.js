import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run } from '../db/database.js';
import { chatContent } from '../services/llm.js';
import {
  fetchInsights as fetchMetaInsightsLive,
  fetchCampaigns as fetchMetaCampaignsLive,
  fetchDailyHistory as fetchMetaDailyHistoryLive,
  listAdAccounts as listMetaAdAccounts,
  isConfigured as isMetaConfigured,
} from '../services/metaHubService.js';
import {
  queryBrain,
  getTopicContent,
  getBrainOverview,
  analyzeCampaign,
  analyzeAccount,
  getKnowledgeForPrompt,
  TOPICS,
} from '../services/trafficAgent.js';

const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────────────
// Cada entidade é guardada como JSON em `data` e o id é devolvido no campo
// camelCase que o frontend do hub espera (ex: ClienteID, LeadID, CriativoID...).
function withId(row, idField) {
  if (!row) return null;
  let d = {};
  try { d = JSON.parse(row.data || '{}'); } catch {}
  d[idField] = row.id;
  return d;
}

function stripId(payload, idField) {
  const { [idField]: _omit, ...rest } = payload || {};
  return rest;
}

// Factory CRUD genérico por entidade
function crudFor({ path, table, idField, clienteRef }) {
  // Lista (opcionalmente filtrando por cliente)
  router.get(`/${path}`, async (req, res) => {
    try {
      const { clienteId } = req.query;
      let rows;
      if (clienteId && clienteRef) {
        rows = await query(`SELECT * FROM ${table} WHERE cliente_id = ? ORDER BY created_at DESC`, [clienteId]);
      } else {
        rows = await query(`SELECT * FROM ${table} ORDER BY created_at DESC`);
      }
      res.json(rows.map(r => withId(r, idField)));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Cria
  router.post(`/${path}`, async (req, res) => {
    try {
      const id = uuidv4();
      const data = stripId(req.body || {}, idField);
      const clienteId = clienteRef ? (req.body?.[clienteRef] || data[clienteRef] || req.body?.cliente_id || null) : null;
      if (clienteRef) {
        await run(`INSERT INTO ${table} (id, cliente_id, data) VALUES (?, ?, ?)`, [id, clienteId, JSON.stringify(data)]);
      } else {
        await run(`INSERT INTO ${table} (id, data) VALUES (?, ?)`, [id, JSON.stringify(data)]);
      }
      res.json(withId({ id, data: JSON.stringify(data) }, idField));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Atualiza
  router.put(`/${path}/:id`, async (req, res) => {
    try {
      const data = stripId(req.body || {}, idField);
      const clienteId = clienteRef ? (req.body?.[clienteRef] || data[clienteRef] || req.body?.cliente_id || null) : null;
      if (clienteRef) {
        await run(`UPDATE ${table} SET data = ?, cliente_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [JSON.stringify(data), clienteId, req.params.id]);
      } else {
        await run(`UPDATE ${table} SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [JSON.stringify(data), req.params.id]);
      }
      res.json(withId({ id: req.params.id, data: JSON.stringify(data) }, idField));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Remove
  router.delete(`/${path}/:id`, async (req, res) => {
    try {
      await run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}

crudFor({ path: 'clientes', table: 'hub_clientes', idField: 'ClienteID' });
crudFor({ path: 'leads', table: 'hub_leads', idField: 'LeadID', clienteRef: 'ClienteID' });
crudFor({ path: 'criativos', table: 'hub_criativos', idField: 'CriativoID', clienteRef: 'ClienteID' });
crudFor({ path: 'solicitacoes', table: 'hub_solicitacoes', idField: 'RequestID', clienteRef: 'ClienteID' });
crudFor({ path: 'otimizacoes', table: 'hub_otimizacoes', idField: 'OtimizacaoID', clienteRef: 'ClienteID' });
crudFor({ path: 'relatorios', table: 'hub_relatorios', idField: 'ReportID', clienteRef: 'ClienteID' });
crudFor({ path: 'investimentos', table: 'hub_investimentos', idField: 'InvestimentoID', clienteRef: 'ClienteID' });

// ── Desempenho diário (report diário por cliente) ────────────────────────────
// data: { nome, ultimoSync, ativo, history: { "YYYY-MM-DD": {data, spend, leads, cpl, ...} } }
router.get('/desempenho', async (req, res) => {
  try {
    const rows = await query(`SELECT * FROM hub_desempenho ORDER BY updated_at DESC`);
    res.json(rows.map(r => {
      let d = {};
      try { d = JSON.parse(r.data || '{}'); } catch {}
      d.id = r.id;
      d.ClienteID = r.id;
      return d;
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/desempenho/:clienteId', async (req, res) => {
  try {
    const existing = await queryOne(`SELECT data FROM hub_desempenho WHERE id = ?`, [req.params.clienteId]);
    let merged = {};
    if (existing) { try { merged = JSON.parse(existing.data || '{}'); } catch {} }
    const body = req.body || {};
    // Mescla history (dias novos sobrescrevem)
    merged.nome = body.nome ?? merged.nome;
    merged.ultimoSync = body.ultimoSync ?? merged.ultimoSync;
    merged.ativo = body.ativo ?? merged.ativo;
    merged.history = { ...(merged.history || {}), ...(body.history || {}) };
    await run(
      `INSERT INTO hub_desempenho (id, cliente_id, data) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
      [req.params.clienteId, req.params.clienteId, JSON.stringify(merged)]
    );
    res.json({ id: req.params.clienteId, ClienteID: req.params.clienteId, ...merged });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Chat interno (canal global ou squad) ─────────────────────────────────────
router.get('/chat', async (req, res) => {
  try {
    const channel = req.query.channel || 'global';
    const rows = await query(
      `SELECT * FROM hub_mensagens WHERE channel_id = ? ORDER BY created_at ASC LIMIT 500`,
      [channel]
    );
    res.json(rows.map(r => {
      const obj = withId(r, 'id');
      obj.timestamp = { seconds: Math.floor(new Date(r.created_at).getTime() / 1000) };
      return obj;
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/chat', async (req, res) => {
  try {
    const { channelId = 'global', text } = req.body;
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'Mensagem vazia' });
    const user = req.user || {};
    const msg = {
      text,
      senderId: user.userId || 'system',
      senderName: user.name || 'Sistema',
      senderRole: user.role || 'system',
      channelId,
    };
    const id = uuidv4();
    await run(`INSERT INTO hub_mensagens (id, channel_id, user_id, data) VALUES (?, ?, ?, ?)`, [id, channelId, msg.senderId, JSON.stringify(msg)]);
    const created = new Date().toISOString();
    res.json({ ...msg, id, timestamp: { seconds: Math.floor(Date.now() / 1000), _iso: created } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/chat/:id', async (req, res) => {
  try {
    await run(`DELETE FROM hub_mensagens WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Notificações ─────────────────────────────────────────────────────────────
router.get('/notificacoes', async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.userId || '';
    let rows;
    if (userId) {
      rows = await query(
        `SELECT * FROM hub_notificacoes WHERE user_id = ? OR user_id = 'all' ORDER BY created_at DESC LIMIT 100`,
        [userId]
      );
    } else {
      rows = await query(`SELECT * FROM hub_notificacoes ORDER BY created_at DESC LIMIT 100`);
    }
    const items = rows.map(r => {
      const obj = withId(r, 'id');
      obj.read = !!r.is_read;
      obj.timestamp = { seconds: Math.floor(new Date(r.created_at).getTime() / 1000) };
      return obj;
    });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/notificacoes', async (req, res) => {
  try {
    const body = req.body || {};
    const userId = body.userId || req.user?.userId || 'all';
    const id = uuidv4();
    const data = {
      title: body.title || '',
      message: body.message || '',
      type: body.type || 'chat',
      link: body.link || null,
      read: false,
    };
    await run(`INSERT INTO hub_notificacoes (id, user_id, data) VALUES (?, ?, ?)`, [id, userId, JSON.stringify(data)]);
    res.json({ ...data, id, userId, timestamp: { seconds: Math.floor(Date.now() / 1000) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/notificacoes/:id/read', async (req, res) => {
  try {
    await run(`UPDATE hub_notificacoes SET is_read = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/notificacoes/:id', async (req, res) => {
  try {
    await run(`DELETE FROM hub_notificacoes WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/notificacoes/read-all', async (req, res) => {
  try {
    const userId = req.user?.userId || '';
    await run(`UPDATE hub_notificacoes SET is_read = 1 WHERE user_id = ?`, [userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Config (ex: system prompt do Jarvis) ─────────────────────────────────────
router.get('/config/:key', async (req, res) => {
  try {
    const row = await queryOne(`SELECT value FROM hub_config WHERE key = ?`, [req.params.key]);
    res.json({ key: req.params.key, value: row?.value ?? null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/config/:key', async (req, res) => {
  try {
    const { value } = req.body || {};
    await run(`INSERT INTO hub_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, [req.params.key, value === undefined ? null : String(value)]);
    res.json({ key: req.params.key, value });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── IA (Jarvis) — usa o LLM do backend, sem expor chave no frontend ─────────
router.post('/ai', async (req, res) => {
  try {
    const { messages = [], systemPrompt, model } = req.body || {};
    const msgs = [];
    if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
    for (const m of (Array.isArray(messages) ? messages : [])) {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      msgs.push({ role, content: String(m.content || m.text || '') });
    }
    const content = await chatContent({ messages: msgs, model: model || 'deepseek-chat', max_tokens: 1500 });
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Usuários (para chat/notificações/settings) ───────────────────────────────
router.get('/usuarios', async (req, res) => {
  try {
    const rows = await query(`SELECT id, name, email, role, status FROM users ORDER BY name`);
    res.json(rows.map(u => ({ uid: u.id, email: u.email, displayName: u.name, role: u.role, status: u.status })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Meta Insights (passa pelo token salvo no cliente) ────────────────────────
router.get('/meta/insights/:clienteId', async (req, res) => {
  try {
    const row = await queryOne(`SELECT data FROM hub_clientes WHERE id = ?`, [req.params.clienteId]);
    if (!row) return res.status(404).json({ error: 'Cliente não encontrado' });
    let d = {};
    try { d = JSON.parse(row.data || '{}'); } catch {}
    res.json({
      lastMetaInsights: d.lastMetaInsights ?? null,
      lastMetaCampaigns: d.lastMetaCampaigns ?? null,
      lastMetaSync: d.lastMetaSync ?? null,
      metaAdAccountId: d.metaAdAccountId ?? null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Meta LIVE (token do servidor — não guarda token por cliente) ─────────────
// O Hub manda só o `account` (id da conta de anúncios) + período.
router.get('/meta/live/insights', async (req, res) => {
  try {
    const { account, since, until, filterKeyword, filterType } = req.query;
    if (!account) return res.status(400).json({ error: 'Informe ?account=' });
    const data = await fetchMetaInsightsLive(account, {
      range: since && until ? { since, until } : undefined,
      filterKeyword, filterType,
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/meta/live/campaigns', async (req, res) => {
  try {
    const { account, since, until, filterKeyword } = req.query;
    if (!account) return res.status(400).json({ error: 'Informe ?account=' });
    const data = await fetchMetaCampaignsLive(account, {
      range: since && until ? { since, until } : undefined,
      filterKeyword,
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/meta/live/daily-history', async (req, res) => {
  try {
    const { account, since, until, filterKeyword } = req.query;
    if (!account) return res.status(400).json({ error: 'Informe ?account=' });
    const data = await fetchMetaDailyHistoryLive(account, {
      range: since && until ? { since, until } : undefined,
      filterKeyword,
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Meta: contas de anúncio (descoberta automática + vínculo por cliente) ─────
// Lê as contas visíveis para o token do System User e cruza com o
// `metaAdAccountId` salvo em cada cliente do hub.
async function mapAdAccountLinks() {
  const rows = await query(`SELECT id, data FROM hub_clientes`);
  const byAccount = new Map();
  for (const r of rows) {
    let d = {};
    try { d = JSON.parse(r.data || '{}'); } catch {}
    const acc = String(d.metaAdAccountId || '').replace(/[^0-9]/g, '');
    if (acc) byAccount.set(acc, { clienteId: r.id, clienteNome: d.Nome || null });
  }
  return byAccount;
}

router.get('/meta/accounts', async (req, res) => {
  try {
    const accounts = await listMetaAdAccounts();
    const links = await mapAdAccountLinks();
    res.json({
      configured: isMetaConfigured(),
      accounts: accounts.map(a => ({
        ...a,
        linkedClienteId: links.get(a.id)?.clienteId || null,
        linkedClienteNome: links.get(a.id)?.clienteNome || null,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Vincula (ou desvincula, com clienteId null) uma conta a um cliente.
// Uma conta pertence a no máximo um cliente: remove o vínculo anterior.
router.post('/meta/accounts/link', async (req, res) => {
  try {
    const accountId = String(req.body?.accountId || '').replace(/[^0-9]/g, '').trim();
    const clienteId = req.body?.clienteId || null;
    if (!accountId) return res.status(400).json({ error: 'accountId obrigatório' });

    const rows = await query(`SELECT id, data FROM hub_clientes`);
    for (const r of rows) {
      let d = {};
      try { d = JSON.parse(r.data || '{}'); } catch {}
      if (String(d.metaAdAccountId || '').replace(/[^0-9]/g, '') !== accountId) continue;
      if (clienteId && r.id === clienteId) continue; // já é o alvo
      delete d.metaAdAccountId;
      await run(`UPDATE hub_clientes SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [JSON.stringify(d), r.id]);
    }

    if (clienteId) {
      const target = rows.find(r => r.id === clienteId);
      if (!target) return res.status(404).json({ error: 'Cliente não encontrado' });
      let d = {};
      try { d = JSON.parse(target.data || '{}'); } catch {}
      d.metaAdAccountId = accountId;
      await run(`UPDATE hub_clientes SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [JSON.stringify(d), clienteId]);
    }

    res.json({ ok: true, accountId, clienteId: clienteId || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cérebro de Tráfego (trafficAgent + brain/) ───────────────────────────────
// Visão geral (tópicos disponíveis)
router.get('/cerebro/overview', async (req, res) => {
  try {
    const overview = getBrainOverview();
    if (overview.error) return res.status(500).json({ error: overview.error });
    res.json({ ...overview, topics_fallback: TOPICS });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Conteúdo completo de um tópico
router.get('/cerebro/topic', async (req, res) => {
  try {
    const topic = req.query.topic;
    if (!topic) return res.status(400).json({ error: 'Informe ?topic=' });
    const result = getTopicContent(topic);
    if (result.error) return res.status(500).json({ error: result.error });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Consulta livre ao cérebro
router.post('/cerebro/query', async (req, res) => {
  try {
    const { query: q } = req.body || {};
    if (!q || !String(q).trim()) return res.status(400).json({ error: 'Informe a pergunta' });
    const result = queryBrain(String(q).trim());
    if (result.error) return res.status(500).json({ error: result.error });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Diagnóstico de campanha
router.post('/cerebro/analyze', async (req, res) => {
  try {
    const { campaign } = req.body || {};
    if (!campaign) return res.status(400).json({ error: 'Informe a campanha' });
    res.json(analyzeCampaign(campaign));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Diagnóstico de conta (múltiplas campanhas)
router.post('/cerebro/account', async (req, res) => {
  try {
    const { platform, campaigns } = req.body || {};
    if (!platform || !Array.isArray(campaigns)) return res.status(400).json({ error: 'Informe platform e campaigns[]' });
    res.json(analyzeAccount({ platform, campaigns }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Conhecimento injetável em prompts (usado pela Viga AI)
router.post('/cerebro/knowledge', async (req, res) => {
  try {
    const { query: q, maxTopics } = req.body || {};
    if (!q) return res.status(400).json({ error: 'Informe a query' });
    res.json({ knowledge: getKnowledgeForPrompt(String(q), maxTopics || 2) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
