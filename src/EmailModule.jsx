import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from './api';
import {
  Mail, BarChart3, List, FileText, Send, Plus, Trash2,
  Edit3, Play, Pause, RefreshCw, Upload, Download, Eye,
  Users, TrendingUp, MousePointerClick, Reply, AlertTriangle, X,
} from 'lucide-react';

const C = {
  bg: '#07101e', surface: '#0c1829', card: '#101f34', border: '#1a3050',
  text: '#e8edf5', muted: '#7a90b0', dim: '#3a5270',
  primary: '#E67E22', success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
  teal: '#14b8a6', purple: '#2E6DA4',
};

const statCards = {
  totalSent:     { label: 'Enviados', icon: Send, color: C.purple },
  totalOpened:   { label: 'Abertos', icon: Eye, color: C.primary },
  totalClicked:  { label: 'Clicks', icon: MousePointerClick, color: C.teal },
  totalReplied:  { label: 'Respostas', icon: Reply, color: C.success },
  totalFailed:   { label: 'Falhas', icon: AlertTriangle, color: C.danger },
  activeCampaigns: { label: 'Ativas', icon: TrendingUp, color: C.warning },
  totalListas:   { label: 'Listas', icon: List, color: C.purple },
  totalRecipients: { label: 'Contatos', icon: Users, color: C.muted },
};

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function StatCard({ icon: Icon, label, value, color, extra }) {
  return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{value?.toLocaleString() || 0}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{label}</div>
        {extra && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>{extra}</div>}
      </div>
    </div>
  );
}

function Btn({ children, variant = 'primary', size = 'md', onClick, disabled, style: xs = {} }) {
  const sz = { sm: { padding: '6px 12px', fontSize: 12 }, md: { padding: '9px 18px', fontSize: 13 }, lg: { padding: '12px 24px', fontSize: 14 } };
  const vars = {
    primary: { background: C.primary, color: '#fff' },
    secondary: { background: C.card, color: C.text, border: `1px solid ${C.border}` },
    ghost: { background: 'transparent', color: C.muted, border: 'none' },
    danger: { background: C.danger, color: '#fff' },
    success: { background: C.success, color: '#fff' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: 9, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s', border: 'none', outline: 'none',
      opacity: disabled ? 0.5 : 1, ...sz[size], ...vars[variant], ...xs,
    }}>{children}</button>
  );
}

function Modal({ open, onClose, title, children, maxWidth = 640 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20, backdropFilter: 'blur(6px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, width: '100%', maxWidth: maxWidth, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{title}</h3>
          <button onClick={onClose} style={{ background: C.border, border: 'none', color: C.muted, cursor: 'pointer', borderRadius: 7, padding: '4px 9px', fontSize: 12 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder, textarea, rows = 3, required, hint }) {
  const [focused, setFocused] = useState(false);
  const s = {
    width: '100%', background: C.surface, border: `1px solid ${focused ? C.primary : C.border}`,
    borderRadius: 9, padding: '10px 13px', color: C.text, fontSize: 13, outline: 'none',
    boxShadow: focused ? `0 0 0 3px ${C.primary}22` : 'none', fontFamily: 'inherit', resize: 'vertical',
    boxSizing: 'border-box',
  };
  return (
    <div>
      {label && <label style={{ display: 'block', color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}{required && <span style={{ color: C.danger }}> *</span>}</label>}
      {textarea
        ? <textarea placeholder={placeholder} value={value} onChange={onChange} rows={rows} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ ...s, minHeight: 100 }} />
        : <input type={type} placeholder={placeholder} value={value} onChange={onChange} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={s} />}
      {hint && <p style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>{hint}</p>}
    </div>
  );
}

function Badge({ status }) {
  const colors = {
    draft: { bg: C.dim, color: '#e8edf5' },
    active: { bg: C.success, color: '#fff' },
    paused: { bg: C.warning, color: '#000' },
    completed: { bg: C.purple, color: '#fff' },
    sent: { bg: C.success, color: '#fff' },
    opened: { bg: C.primary, color: '#fff' },
    clicked: { bg: C.teal, color: '#fff' },
    replied: { bg: C.success, color: '#fff' },
    failed: { bg: C.danger, color: '#fff' },
    pending: { bg: C.border, color: C.muted },
    bounced: { bg: C.danger, color: '#fff' },
  };
  const c = colors[status] || { bg: C.border, color: C.muted };
  return <span style={{ background: `${c.bg}25`, color: c.bg, border: `1px solid ${c.bg}40`, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{status}</span>;
}

// ─── EmailModule ─────────────────────────────────────────────────────────────
export default function EmailModule() {
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState(null);

  // Lists
  const [lists, setLists] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [listName, setListName] = useState('');
  const fileRef = useRef(null);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [tplName, setTplName] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');

  // Campaigns
  const [campaigns, setCampaigns] = useState([]);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campName, setCampName] = useState('');
  const [campSubject, setCampSubject] = useState('');
  const [campBody, setCampBody] = useState('');
  const [campListId, setCampListId] = useState('');
  const [campTplId, setCampTplId] = useState('');
  const [campSenderName, setCampSenderName] = useState('Viga Sales');
  const [campSenderEmail, setCampSenderEmail] = useState('contato@vigasales.com.br');
  const [campReplyTo, setCampReplyTo] = useState('');
  const [campDailyLimit, setCampDailyLimit] = useState(50);
  const [campTimeStart, setCampTimeStart] = useState('08:00');
  const [campTimeEnd, setCampTimeEnd] = useState('18:00');
  const [campDays, setCampDays] = useState([1, 2, 3, 4, 5]);
  const [campMinDelay, setCampMinDelay] = useState(30);
  const [campMaxDelay, setCampMaxDelay] = useState(120);
  const [campUseAI, setCampUseAI] = useState(false);
  const [campAIPrompt, setCampAIPrompt] = useState('');

  // Logs
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsCampaignId, setLogsCampaignId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, l, t, c] = await Promise.all([
        api.get('/email/stats').then(r => r.data).catch(() => null),
        api.get('/email/lists').then(r => r.data).catch(() => []),
        api.get('/email/templates').then(r => r.data).catch(() => []),
        api.get('/email/campaigns').then(r => r.data).catch(() => []),
      ]);
      setStats(s);
      setLists(l || []);
      setTemplates(t || []);
      setCampaigns(c || []);
    } catch (_) {}
    setLoading(false);
  }

  async function uploadList() {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error('Selecione um arquivo CSV');
    if (!listName.trim()) return toast.error('Dê um nome para a lista');

    const form = new FormData();
    form.append('file', file);
    form.append('name', listName);

    try {
      await api.post('/email/upload-list', form);
      toast.success('Lista importada com sucesso!');
      setShowUploadModal(false);
      setListName('');
      if (fileRef.current) fileRef.current.value = '';
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao importar lista');
    }
  }

  async function deleteList(id) {
    if (!confirm('Excluir esta lista e todos os destinatários?')) return;
    try {
      await api.delete(`/email/lists/${id}`);
      toast.success('Lista excluída');
      loadAll();
    } catch (err) { toast.error('Erro ao excluir lista'); }
  }

  async function saveTemplate() {
    if (!tplName || !tplSubject || !tplBody) return toast.error('Preencha todos os campos');
    try {
      if (editingTemplate) {
        await api.put(`/email/templates/${editingTemplate.id}`, { name: tplName, subject: tplSubject, body_html: tplBody });
      } else {
        await api.post('/email/templates', { name: tplName, subject: tplSubject, body_html: tplBody });
      }
      toast.success(editingTemplate ? 'Template atualizado' : 'Template criado');
      setShowTemplateModal(false);
      loadAll();
    } catch (err) { toast.error('Erro ao salvar template'); }
  }

  async function deleteTemplate(id) {
    if (!confirm('Excluir este template?')) return;
    try {
      await api.delete(`/email/templates/${id}`);
      toast.success('Template excluído');
      loadAll();
    } catch (err) { toast.error('Erro ao excluir template'); }
  }

  function openTemplateEditor(tpl) {
    setEditingTemplate(tpl);
    setTplName(tpl?.name || '');
    setTplSubject(tpl?.subject || '');
    setTplBody(tpl?.body_html || '');
    setShowTemplateModal(true);
  }

  async function saveCampaign() {
    if (!campName || !campSubject || !campBody || !campListId) return toast.error('Preencha os campos obrigatórios');
    try {
      const payload = {
        name: campName, subject: campSubject, body_html: campBody,
        list_id: campListId, template_id: campTplId || null,
        sender_name: campSenderName, sender_email: campSenderEmail, reply_to: campReplyTo || null,
        daily_limit: campDailyLimit, time_start: campTimeStart, time_end: campTimeEnd,
        days_of_week: campDays, min_delay_sec: campMinDelay, max_delay_sec: campMaxDelay,
        use_ai_variation: campUseAI, ai_variation_prompt: campAIPrompt || null,
      };
      if (editingCampaign) {
        await api.put(`/email/campaigns/${editingCampaign.id}`, payload);
      } else {
        await api.post('/email/campaigns', payload);
      }
      toast.success(editingCampaign ? 'Campanha atualizada' : 'Campanha criada');
      setShowCampaignModal(false);
      loadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao salvar campanha'); }
  }

  function openCampaignEditor(camp) {
    setEditingCampaign(camp);
    setCampName(camp?.name || '');
    setCampSubject(camp?.subject || '');
    setCampBody(camp?.body_html || '');
    setCampListId(camp?.list_id || '');
    setCampTplId(camp?.template_id || '');
    setCampSenderName(camp?.sender_name || 'Viga Sales');
    setCampSenderEmail(camp?.sender_email || 'contato@vigasales.com.br');
    setCampReplyTo(camp?.reply_to || '');
    setCampDailyLimit(camp?.daily_limit || 50);
    setCampTimeStart(camp?.time_start || '08:00');
    setCampTimeEnd(camp?.time_end || '18:00');
    try { setCampDays(JSON.parse(camp?.days_of_week || '[1,2,3,4,5]')); } catch { setCampDays([1, 2, 3, 4, 5]); }
    setCampMinDelay(camp?.min_delay_sec ?? 30);
    setCampMaxDelay(camp?.max_delay_sec ?? 120);
    setCampUseAI(!!camp?.use_ai_variation);
    setCampAIPrompt(camp?.ai_variation_prompt || '');
    setShowCampaignModal(true);
  }

  async function toggleCampaign(camp) {
    try {
      if (camp.status === 'active') {
        await api.post(`/email/campaigns/${camp.id}/pause`);
      } else {
        await api.post(`/email/campaigns/${camp.id}/start`);
      }
      toast.success('Status atualizado');
      loadAll();
    } catch (err) { toast.error('Erro ao alterar status'); }
  }

  async function deleteCampaign(id) {
    if (!confirm('Excluir esta campanha e todos os logs?')) return;
    try {
      await api.delete(`/email/campaigns/${id}`);
      toast.success('Campanha excluída');
      loadAll();
    } catch (err) { toast.error('Erro ao excluir campanha'); }
  }

  async function loadLogs(campaignId, page = 1) {
    try {
      const res = await api.get(`/email/campaigns/${campaignId}/logs?page=${page}&limit=50`);
      setLogs(res.data.logs || []);
      setLogsTotal(res.data.total || 0);
      setLogsPage(page);
      setLogsCampaignId(campaignId);
      setShowLogsModal(true);
    } catch (err) { toast.error('Erro ao carregar logs'); }
  }

  async function previewCampaign() {
    try {
      const res = await api.post('/email/preview', {
        subject: campSubject,
        body_html: campBody,
        recipient_sample: { name: 'João Exemplo', company: 'Construtora ABC', email: 'exemplo@email.com' },
      });
      setPreviewHtml(res.data.body);
      setShowPreview(true);
    } catch (err) { toast.error('Erro ao gerar preview'); }
  }

  function selectTemplateForCampaign(tpl) {
    setCampSubject(tpl.subject);
    setCampBody(tpl.body_html);
    setCampTplId(tpl.id);
    toast.success(`Template "${tpl.name}" aplicado`);
  }

  const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'lists', label: 'Listas', icon: List },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'campaigns', label: 'Campanhas', icon: Send },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: `${C.primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={20} color={C.primary} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>Email Prospecção</h2>
            <p style={{ fontSize: 12, color: C.dim, margin: '2px 0 0' }}>Disparos via mail.vigasales.com.br</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" onClick={loadAll}><RefreshCw size={14} /> Atualizar</Btn>
          <Btn onClick={() => { setShowUploadModal(true); setListName(''); }}><Upload size={14} /> Importar CSV</Btn>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: C.surface, borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10,
            border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
            background: tab === t.id ? C.primary : 'transparent',
            color: tab === t.id ? '#fff' : C.muted,
            transition: 'all 0.2s',
          }}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === 'dashboard' && stats && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            {Object.entries(statCards).map(([key, { label, icon: Icon, color }]) => (
              <StatCard key={key} icon={Icon} label={label} value={stats[key]} color={color} extra={
                key === 'totalOpened' && stats.totalSent > 0 ? `${stats.openRate}% de abertura` :
                key === 'totalReplied' && stats.totalSent > 0 ? `${stats.replyRate}% resposta` : null
              } />
            ))}
          </div>
          <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: 18 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Hoje</h4>
            <div style={{ display: 'flex', gap: 24 }}>
              <div><span style={{ color: C.dim, fontSize: 12 }}>Enviados hoje:</span> <span style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{stats.sentToday || 0}</span></div>
              <div><span style={{ color: C.dim, fontSize: 12 }}>Abertos hoje:</span> <span style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{stats.openedToday || 0}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Lists */}
      {tab === 'lists' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Listas de Destinatários</h3>
            <Btn onClick={() => setShowUploadModal(true)}><Plus size={14} /> Nova Lista</Btn>
          </div>
          {lists.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>Nenhuma lista importada ainda.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lists.map(l => (
              <div key={l.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{l.name}</div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{l.recipient_count} destinatários · {new Date(l.created_at).toLocaleDateString('pt-BR')}</div>
                </div>
                <Btn variant="ghost" onClick={() => deleteList(l.id)}><Trash2 size={15} /></Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Templates */}
      {tab === 'templates' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Templates de Email</h3>
            <Btn onClick={() => openTemplateEditor(null)}><Plus size={14} /> Novo Template</Btn>
          </div>
          {templates.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>Nenhum template criado ainda.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templates.map(t => (
              <div key={t.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: C.primary, marginTop: 2 }}>{t.subject}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn variant="secondary" size="sm" onClick={() => { selectTemplateForCampaign(t); setTab('campaigns'); }}>Usar</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => openTemplateEditor(t)}><Edit3 size={14} /></Btn>
                  <Btn variant="ghost" size="sm" onClick={() => deleteTemplate(t.id)}><Trash2 size={14} /></Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaigns */}
      {tab === 'campaigns' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Campanhas</h3>
            <Btn onClick={() => openCampaignEditor(null)}><Plus size={14} /> Nova Campanha</Btn>
          </div>
          {campaigns.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>Nenhuma campanha criada ainda.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {campaigns.map(c => (
              <div key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{c.name}</span>
                      <Badge status={c.status} />
                    </div>
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
                      {c.list_name || 'Lista'} · {c.sent_count}/{c.total_recipients} enviados · {c.daily_limit}/dia · {c.time_start}-{c.time_end}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {c.status === 'active' && <Btn variant="warning" size="sm" onClick={() => toggleCampaign(c)}><Pause size={13} /></Btn>}
                    {(c.status === 'draft' || c.status === 'paused' || c.status === 'completed') && <Btn variant="success" size="sm" onClick={() => toggleCampaign(c)}><Play size={13} /></Btn>}
                    <Btn variant="secondary" size="sm" onClick={() => loadLogs(c.id)}><Eye size={13} /></Btn>
                    <Btn variant="ghost" size="sm" onClick={() => openCampaignEditor(c)}><Edit3 size={13} /></Btn>
                    <Btn variant="ghost" size="sm" onClick={() => deleteCampaign(c.id)}><Trash2 size={13} /></Btn>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                  <span style={{ color: C.muted }}>Enviados: <b style={{ color: C.purple }}>{c.sent_count || 0}</b></span>
                  <span style={{ color: C.muted }}>Abertos: <b style={{ color: C.primary }}>{c.opened_count || 0}</b></span>
                  <span style={{ color: C.muted }}>Clicks: <b style={{ color: C.teal }}>{c.clicked_count || 0}</b></span>
                  <span style={{ color: C.muted }}>Respostas: <b style={{ color: C.success }}>{c.replied_count || 0}</b></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <Modal open={showUploadModal} onClose={() => setShowUploadModal(false)} title="Importar Lista CSV" maxWidth={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Nome da Lista" value={listName} onChange={e => setListName(e.target.value)} placeholder="Ex: Construtoras Brasília" required />
          <div>
            <label style={{ display: 'block', color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Arquivo CSV *</label>
            <input ref={fileRef} type="file" accept=".csv" style={{ color: C.text, fontSize: 13 }} />
            <p style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>Colunas esperadas: email, nome, empresa (detecção automática)</p>
          </div>
          <Btn onClick={uploadList} style={{ alignSelf: 'flex-end' }}>Importar</Btn>
        </div>
      </Modal>

      {/* Template Modal */}
      <Modal open={showTemplateModal} onClose={() => setShowTemplateModal(false)} title={editingTemplate ? 'Editar Template' : 'Novo Template'} maxWidth={760}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Nome" value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Ex: Proposta Viga Sales" required />
          <Input label="Assunto" value={tplSubject} onChange={e => setTplSubject(e.target.value)} placeholder="Ex: {{primeiro_nome}}, solução para {sua construtora|seu negócio}" required
            hint='Variáveis: {{name}} {{primeiro_nome}} {{company}} {{email}} | Spintax: {opção1|opção2|opção3}' />
          <Input label="Corpo HTML" value={tplBody} onChange={e => setTplBody(e.target.value)} textarea rows={10} placeholder="<h1>Olá {{primeiro_nome}}</h1><p>...</p>" required
            hint='Use variáveis e spintax. Links são automaticamente rastreados para clicks.' />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="secondary" onClick={async () => { try { const r = await api.post('/email/preview', { subject: tplSubject, body_html: tplBody }); setPreviewHtml(r.data.body); setShowPreview(true); } catch {} }}><Eye size={14} /> Preview</Btn>
            <Btn onClick={saveTemplate}>Salvar Template</Btn>
          </div>
        </div>
      </Modal>

      {/* Campaign Modal */}
      <Modal open={showCampaignModal} onClose={() => setShowCampaignModal(false)} title={editingCampaign ? 'Editar Campanha' : 'Nova Campanha'} maxWidth={780}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflow: 'auto', paddingRight: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="Nome da Campanha" value={campName} onChange={e => setCampName(e.target.value)} placeholder="Ex: Prospecção DF Construtoras" required />
            <div>
              <label style={{ display: 'block', color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lista *</label>
              <select value={campListId} onChange={e => setCampListId(e.target.value)} style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}>
                <option value="">Selecionar lista...</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.recipient_count})</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Template</label>
            <select value={campTplId} onChange={e => { const tpl = templates.find(t => t.id === e.target.value); if (tpl) selectTemplateForCampaign(tpl); }} style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}>
              <option value="">Sem template (manual)</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <Input label="Assunto" value={campSubject} onChange={e => setCampSubject(e.target.value)} placeholder="Assunto do email" required />
          <Input label="Corpo HTML" value={campBody} onChange={e => setCampBody(e.target.value)} textarea rows={8} placeholder="<h1>Olá {{primeiro_nome}}</h1>..." required />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Input label="Nome Remetente" value={campSenderName} onChange={e => setCampSenderName(e.target.value)} />
            <Input label="Email Remetente" value={campSenderEmail} onChange={e => setCampSenderEmail(e.target.value)} />
            <Input label="Reply-To" value={campReplyTo} onChange={e => setCampReplyTo(e.target.value)} placeholder="Opcional" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Input label="Limite Diário" value={campDailyLimit} onChange={e => setCampDailyLimit(Number(e.target.value))} type="number" />
            <Input label="Horário Início" value={campTimeStart} onChange={e => setCampTimeStart(e.target.value)} type="time" />
            <Input label="Horário Fim" value={campTimeEnd} onChange={e => setCampTimeEnd(e.target.value)} type="time" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="Delay Mín (seg)" value={campMinDelay} onChange={e => setCampMinDelay(Number(e.target.value))} type="number" hint="Tempo mínimo entre envios" />
            <Input label="Delay Máx (seg)" value={campMaxDelay} onChange={e => setCampMaxDelay(Number(e.target.value))} type="number" hint="Tempo máximo entre envios" />
          </div>
          <div>
            <label style={{ display: 'block', color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dias da Semana</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {DIAS_SEMANA.map((d, i) => (
                <button key={i} onClick={() => setCampDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])} style={{
                  padding: '7px 0', width: 40, borderRadius: 8, border: `1px solid ${campDays.includes(i) ? C.primary : C.border}`,
                  background: campDays.includes(i) ? `${C.primary}25` : C.surface, color: campDays.includes(i) ? C.primary : C.dim,
                  cursor: 'pointer', fontWeight: 600, fontSize: 11, textAlign: 'center',
                }}>{d}</button>
              ))}
            </div>
          </div>
          <div style={{ background: C.surface, borderRadius: 10, padding: 12, border: `1px solid ${C.border}` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={campUseAI} onChange={e => setCampUseAI(e.target.checked)} style={{ accentColor: C.primary }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Variação por IA (Gemini)</span>
            </label>
            {campUseAI && <div style={{ marginTop: 8 }}><Input textarea rows={2} value={campAIPrompt} onChange={e => setCampAIPrompt(e.target.value)} placeholder="Prompt extra para a IA variar o email (opcional)" /></div>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="secondary" onClick={previewCampaign}><Eye size={14} /> Preview</Btn>
            <Btn onClick={saveCampaign}>{editingCampaign ? 'Atualizar' : 'Criar Campanha'}</Btn>
          </div>
        </div>
      </Modal>

      {/* Logs Modal */}
      <Modal open={showLogsModal} onClose={() => setShowLogsModal(false)} title="Logs de Envio" maxWidth={860}>
        {logs.length === 0 ? <div style={{ color: C.dim, textAlign: 'center', padding: 20 }}>Nenhum log encontrado.</div> : (
          <div>
            <div style={{ overflowX: 'auto', fontSize: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: C.muted, fontWeight: 600 }}>Email</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: C.muted, fontWeight: 600 }}>Assunto</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', color: C.muted, fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: C.muted, fontWeight: 600 }}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                      <td style={{ padding: '8px 10px', color: C.text }}>{l.email}</td>
                      <td style={{ padding: '8px 10px', color: C.dim, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.subject_sent}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}><Badge status={l.status} /></td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: C.dim }}>{new Date(l.created_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {logsTotal > 50 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                <Btn variant="secondary" size="sm" disabled={logsPage <= 1} onClick={() => loadLogs(logsCampaignId, logsPage - 1)}>Anterior</Btn>
                <span style={{ color: C.dim, fontSize: 12, alignSelf: 'center' }}>{logsPage} / {Math.ceil(logsTotal / 50)}</span>
                <Btn variant="secondary" size="sm" disabled={logsPage >= Math.ceil(logsTotal / 50)} onClick={() => loadLogs(logsCampaignId, logsPage + 1)}>Próximo</Btn>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Preview Modal */}
      <Modal open={showPreview} onClose={() => setShowPreview(false)} title="Preview do Email" maxWidth={720}>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <iframe srcDoc={previewHtml} title="preview" style={{ width: '100%', height: 450, border: 'none', background: '#fff' }} />
        </div>
      </Modal>
    </div>
  );
}
