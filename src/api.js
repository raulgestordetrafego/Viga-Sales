import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
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
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

// ─── Contacts ─────────────────────────────────────────────────────────────────
export const contacts = {
  list:    (params) => api.get('/contacts', { params }).then(r => r.data),
  get:     (id)     => api.get(`/contacts/${id}`).then(r => r.data),
  create:  (data)   => api.post('/contacts', data).then(r => r.data),
  update:  (id, d)  => api.put(`/contacts/${id}`, d).then(r => r.data),
  delete:  (id)     => api.delete(`/contacts/${id}`).then(r => r.data),
  setStage:(id, s)  => api.patch(`/contacts/${id}/stage`, { stage: s }).then(r => r.data),
  addActivity:(id, d) => api.post(`/contacts/${id}/activities`, d).then(r => r.data),
  pipelineStats: () => api.get('/contacts/stats/pipeline').then(r => r.data),
};

// ─── Conversations ────────────────────────────────────────────────────────────
export const conversations = {
  list:        (p)     => api.get('/conversations', { params: p }).then(r => r.data),
  messages:    (id, p) => api.get(`/conversations/${id}/messages`, { params: p }).then(r => r.data),
  sendMessage: (id, d) => api.post(`/conversations/${id}/messages`, d).then(r => r.data),
  orCreate:    (cId)   => api.get(`/conversations/or-create/${cId}`).then(r => r.data),
  setStatus:   (id, s) => api.patch(`/conversations/${id}/status`, { status: s }).then(r => r.data),
  markRead:    (id)    => api.put(`/conversations/${id}/read`).then(r => r.data),
};

// ─── Broadcasts ───────────────────────────────────────────────────────────────
export const broadcasts = {
  list:   ()        => api.get('/broadcasts').then(r => r.data),
  get:    (id)      => api.get(`/broadcasts/${id}`).then(r => r.data),
  create: (data)    => api.post('/broadcasts', data).then(r => r.data),
  send:   (id)      => api.post(`/broadcasts/${id}/send`).then(r => r.data),
  delete: (id)      => api.delete(`/broadcasts/${id}`).then(r => r.data),
};

// ─── Stats / WhatsApp ─────────────────────────────────────────────────────────
export const stats   = () => api.get('/stats').then(r => r.data);
export const wpStatus= () => api.get('/whatsapp/status').then(r => r.data);
export const wpQR    = () => api.get('/whatsapp/qrcode').then(r => r.data);
export const pipeline= {
  stages: () => api.get('/pipeline/stages').then(r => r.data),
};

export default api;
