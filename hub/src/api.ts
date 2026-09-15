import axios from 'axios';

// Base da API: em produção o hub roda em outro domínio (hub.vigasales.shop)
// e fala com a API do CRM em https://vigasales.shop/api.
// Em dev usa o proxy do Vite ('/api' → localhost:3000).
export const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('crm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

// ── API do Hub — todas devolvem objetos já com o id no campo esperado ───────
export const hubApi = {
  clientes: {
    list: () => api.get('/hub/clientes').then(r => r.data),
    create: (d) => api.post('/hub/clientes', d).then(r => r.data),
    update: (id, d) => api.put(`/hub/clientes/${id}`, d).then(r => r.data),
    remove: (id) => api.delete(`/hub/clientes/${id}`).then(r => r.data),
  },
  leads: {
    list: () => api.get('/hub/leads').then(r => r.data),
    create: (d) => api.post('/hub/leads', d).then(r => r.data),
    update: (id, d) => api.put(`/hub/leads/${id}`, d).then(r => r.data),
    remove: (id) => api.delete(`/hub/leads/${id}`).then(r => r.data),
  },
  criativos: {
    list: () => api.get('/hub/criativos').then(r => r.data),
    create: (d) => api.post('/hub/criativos', d).then(r => r.data),
    update: (id, d) => api.put(`/hub/criativos/${id}`, d).then(r => r.data),
    remove: (id) => api.delete(`/hub/criativos/${id}`).then(r => r.data),
  },
  solicitacoes: {
    list: () => api.get('/hub/solicitacoes').then(r => r.data),
    create: (d) => api.post('/hub/solicitacoes', d).then(r => r.data),
    update: (id, d) => api.put(`/hub/solicitacoes/${id}`, d).then(r => r.data),
    remove: (id) => api.delete(`/hub/solicitacoes/${id}`).then(r => r.data),
  },
  otimizacoes: {
    list: () => api.get('/hub/otimizacoes').then(r => r.data),
    create: (d) => api.post('/hub/otimizacoes', d).then(r => r.data),
    update: (id, d) => api.put(`/hub/otimizacoes/${id}`, d).then(r => r.data),
    remove: (id) => api.delete(`/hub/otimizacoes/${id}`).then(r => r.data),
  },
  relatorios: {
    list: () => api.get('/hub/relatorios').then(r => r.data),
    create: (d) => api.post('/hub/relatorios', d).then(r => r.data),
    update: (id, d) => api.put(`/hub/relatorios/${id}`, d).then(r => r.data),
    remove: (id) => api.delete(`/hub/relatorios/${id}`).then(r => r.data),
  },
  investimentos: {
    list: () => api.get('/hub/investimentos').then(r => r.data),
    create: (d) => api.post('/hub/investimentos', d).then(r => r.data),
    update: (id, d) => api.put(`/hub/investimentos/${id}`, d).then(r => r.data),
    remove: (id) => api.delete(`/hub/investimentos/${id}`).then(r => r.data),
  },
  mensagens: {
    list: (channel = 'global') => api.get('/hub/chat', { params: { channel } }).then(r => r.data),
    create: (d) => api.post('/hub/chat', d).then(r => r.data),
    remove: (id) => api.delete(`/hub/chat/${id}`).then(r => r.data),
  },
  notificacoes: {
    list: (userId) => api.get('/hub/notificacoes', { params: { userId } }).then(r => r.data),
    create: (d) => api.post('/hub/notificacoes', d).then(r => r.data),
    marcarLida: (id) => api.put(`/hub/notificacoes/${id}/read`).then(r => r.data),
    marcarTodasLidas: () => api.put('/hub/notificacoes/read-all').then(r => r.data),
    remove: (id) => api.delete(`/hub/notificacoes/${id}`).then(r => r.data),
  },
  config: {
    get: (key) => api.get(`/hub/config/${key}`).then(r => r.data),
    set: (key, value) => api.put(`/hub/config/${key}`, { value }).then(r => r.data),
  },
  ai: {
    perguntar: (payload) => api.post('/hub/ai', payload).then(r => r.data),
  },
  usuarios: {
    list: () => api.get('/hub/usuarios').then(r => r.data),
  },
  meta: {
    insights: (clienteId) => api.get(`/hub/meta/insights/${clienteId}`).then(r => r.data),
    // Leitura ao vivo via backend (token do servidor) — sem token no cliente.
    liveInsights: (account, params = {}) => api.get('/hub/meta/live/insights', { params: { account, ...params } }).then(r => r.data),
    liveCampaigns: (account, params = {}) => api.get('/hub/meta/live/campaigns', { params: { account, ...params } }).then(r => r.data),
    liveDailyHistory: (account, params = {}) => api.get('/hub/meta/live/daily-history', { params: { account, ...params } }).then(r => r.data),
    // Descoberta automática das contas visíveis ao System User + vínculo por cliente
    accounts: () => api.get('/hub/meta/accounts').then(r => r.data),
    linkAccount: (accountId, clienteId) => api.post('/hub/meta/accounts/link', { accountId, clienteId }).then(r => r.data),
  },
  desempenho: {
    list: () => api.get('/hub/desempenho').then(r => r.data),
    save: (clienteId, d) => api.put(`/hub/desempenho/${clienteId}`, d).then(r => r.data),
  },
  cerebro: {
    overview: () => api.get('/hub/cerebro/overview').then(r => r.data),
    topic: (topic) => api.get('/hub/cerebro/topic', { params: { topic } }).then(r => r.data),
    query: (query) => api.post('/hub/cerebro/query', { query }).then(r => r.data),
    analyze: (campaign) => api.post('/hub/cerebro/analyze', { campaign }).then(r => r.data),
    account: (platform, campaigns) => api.post('/hub/cerebro/account', { platform, campaigns }).then(r => r.data),
    knowledge: (query, maxTopics) => api.post('/hub/cerebro/knowledge', { query, maxTopics }).then(r => r.data),
  },
};

export default api;
