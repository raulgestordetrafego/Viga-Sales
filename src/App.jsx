import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import { contacts as contactsApi, conversations as convsApi, broadcasts as broadcastsApi, stats as statsApi, statsDaily, statsRecent, globalSearch, pipeline as pipelineApi, dashboardAll, wpInstances } from './api';
import TasksModule from './TasksModule';
import ClientBriefing from './ClientBriefing';
import {
  LayoutDashboard, Users, MessageSquare, TrendingUp,
  Repeat2, Megaphone, CheckSquare, Settings as SettingsIcon,
  Search, LogOut, Paperclip, Mic, MicOff, X, Send, Target,
} from 'lucide-react';

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) { console.error('[ErrorBoundary]', err, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:40,textAlign:'center',color:'#ef4444',background:'#07101e',minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
          <div style={{fontSize:32}}>⚠️</div>
          <div style={{fontSize:16,fontWeight:700,color:'#fff'}}>Erro na tela</div>
          <div style={{fontSize:13,color:'#f87171',maxWidth:500,wordBreak:'break-all',background:'#0c1829',padding:'12px 16px',borderRadius:10,border:'1px solid #ef444430'}}>
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button onClick={()=>this.setState({error:null})} style={{marginTop:8,padding:'8px 20px',background:'#3b82f6',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontWeight:600}}>
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Socket ───────────────────────────────────────────────────────────────────
const socket = io(window.location.origin);

// ─── Design tokens — Viga Identity ───────────────────────────────────────────
const C = {
  bg:      '#07101e',          // Fundo principal navy-black
  surface: '#0c1829',          // Superfícies / painéis
  card:    '#101f34',          // Cards
  border:  '#1a3050',          // Bordas navy
  text:    '#e8edf5',          // Texto principal
  muted:   '#7a90b0',          // Texto secundário
  dim:     '#3a5270',          // Texto apagado
  primary: '#E67E22',          // Laranja Industrial — CTAs / destaques
  navy:    '#1A365D',          // Azul Marinho — identidade de marca
  purple:  '#2E6DA4',          // Azul médio (substitui purple)
  success: '#10b981',
  warning: '#f59e0b',
  danger:  '#ef4444',
  teal:    '#14b8a6',
  pink:    '#ec4899',
};

const STAGE_COLORS = {
  stage_lead:        C.dim,
  stage_contact:     C.purple,
  stage_proposal:    C.primary,
  stage_negotiation: C.navy,
  stage_won:         C.success,
  stage_lost:        C.danger,
};
const STAGE_LABELS = {
  stage_lead:        'Lead',
  stage_contact:     'Contato Feito',
  stage_proposal:    'Proposta',
  stage_negotiation: 'Negociação',
  stage_won:         'Ganho',
  stage_lost:        'Perdido',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt      = (n) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n || 0);
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '–';
const fmtTime  = (d) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '';
const initials = (n = '') => n.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';
const avatarBg = (n = '') => {
  const p = [C.primary, C.purple, C.pink, C.warning, C.success, C.teal, '#3b82f6', C.danger];
  return p[(n.charCodeAt(0) || 0) % p.length];
};

// ─── Permissions helper ───────────────────────────────────────────────────────
function getUserPermissions() {
  try {
    const user = JSON.parse(localStorage.getItem('crm_user') || 'null');
    if (!user) return {};
    if (user.role === 'master' || user.role === 'admin') return { view_contacts: true, edit_contacts: true, view_pipeline: true, move_cards: true, view_conversations: true, send_messages: true };
    return user.permissions || {};
  } catch { return {}; }
}

// ─── Base components ─────────────────────────────────────────────────────────

function Avatar({ name = '', size = 36 }) {
  const bg = avatarBg(name);
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:`linear-gradient(135deg, ${bg}dd, ${bg}88)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      color:'#fff', fontWeight:700, fontSize:size*0.36, letterSpacing:'0.02em',
      boxShadow:`0 2px 8px ${bg}50`,
    }}>
      {initials(name)}
    </div>
  );
}

function Badge({ children, color = C.primary }) {
  return (
    <span style={{
      background:`${color}18`, color, padding:'3px 10px', borderRadius:20,
      fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em',
      border:`1px solid ${color}35`, whiteSpace:'nowrap', display:'inline-block',
    }}>
      {children}
    </span>
  );
}

function Btn({ children, variant='primary', size='md', onClick, disabled, type='button', style:xs={} }) {
  const sz = { sm:{padding:'7px 14px',fontSize:12}, md:{padding:'10px 20px',fontSize:14}, lg:{padding:'13px 28px',fontSize:15} };
  const vars = {
    primary:  { background:`linear-gradient(135deg,${C.primary},#c0621a)`, color:'#fff', boxShadow:`0 4px 15px ${C.primary}50` },
    secondary:{ background:C.card, color:C.text, border:`1px solid ${C.border}` },
    outline:  { background:'transparent', color:C.muted, border:`1px solid ${C.border}` },
    ghost:    { background:'transparent', color:C.muted, border:'none' },
    danger:   { background:`linear-gradient(135deg,${C.danger},#dc2626)`, color:'#fff', boxShadow:`0 4px 12px ${C.danger}35` },
    success:  { background:`linear-gradient(135deg,${C.success},#059669)`, color:'#fff', boxShadow:`0 4px 12px ${C.success}35` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
      borderRadius:10, fontWeight:600, cursor:disabled?'not-allowed':'pointer',
      transition:'all 0.2s', border:'none', outline:'none',
      opacity:disabled?0.5:1, ...sz[size], ...vars[variant], ...xs,
    }}
      onMouseOver={e=>{ if(!disabled){e.currentTarget.style.filter='brightness(1.12)';e.currentTarget.style.transform='translateY(-1px)';} }}
      onMouseOut={e=>{ e.currentTarget.style.filter='';e.currentTarget.style.transform=''; }}
    >{children}</button>
  );
}

function FocusInput({ label, placeholder, value, onChange, type='text', required, textarea, rows=3, hint, autoFocus }) {
  const [focused, setFocused] = useState(false);
  const s = {
    width:'100%', background:C.bg, border:`1px solid ${focused?C.primary:C.border}`,
    borderRadius:10, padding:'11px 14px', color:C.text, fontSize:14, outline:'none',
    transition:'border-color 0.2s,box-shadow 0.2s', fontFamily:'inherit',
    boxShadow:focused?`0 0 0 3px ${C.primary}22`:'none',
    resize:textarea?'vertical':'none',
  };
  return (
    <div>
      {label && <label style={{display:'block',color:C.muted,fontSize:11,fontWeight:700,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}{required&&<span style={{color:C.danger}}> *</span>}</label>}
      {textarea
        ? <textarea placeholder={placeholder} value={value} onChange={onChange} rows={rows} autoFocus={autoFocus} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} style={s} />
        : <input type={type} placeholder={placeholder} value={value} onChange={onChange} autoFocus={autoFocus} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} style={s} />}
      {hint && <p style={{fontSize:11,color:C.dim,marginTop:4}}>{hint}</p>}
    </div>
  );
}

function Card({ children, title, subtitle, action, style:xs={}, noPad=false }) {
  return (
    <div style={{background:C.card,borderRadius:18,border:`1px solid ${C.border}`,overflow:'hidden',...xs}}>
      {(title||action)&&<div style={{padding:'18px 24px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>{title&&<h3 style={{fontSize:15,fontWeight:700,color:C.text}}>{title}</h3>}{subtitle&&<p style={{fontSize:12,color:C.dim,marginTop:2}}>{subtitle}</p>}</div>
        {action}
      </div>}
      <div style={noPad?{}:{padding:24}}>{children}</div>
    </div>
  );
}

function Modal({ open, onClose, title, children, maxWidth=580 }) {
  useEffect(() => {
    const h = (e) => e.key==='Escape'&&onClose();
    if(open) window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  }, [open,onClose]);
  if(!open) return null;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20,backdropFilter:'blur(6px)'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:22,padding:32,width:'100%',maxWidth,maxHeight:'90vh',overflow:'auto',boxShadow:'0 24px 64px rgba(0,0,0,0.6)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <h3 style={{fontSize:18,fontWeight:800,color:C.text}}>{title}</h3>
          <button onClick={onClose} style={{background:C.border,border:'none',color:C.muted,cursor:'pointer',fontSize:13,borderRadius:8,padding:'5px 10px'}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, desc, action }) {
  return (
    <div style={{textAlign:'center',padding:'60px 24px',color:C.dim}}>
      <div style={{fontSize:52,marginBottom:16,opacity:0.4}}>{icon}</div>
      <div style={{fontSize:16,fontWeight:700,color:C.muted,marginBottom:8}}>{title}</div>
      <div style={{fontSize:13,color:C.dim,lineHeight:1.7,maxWidth:320,margin:'0 auto'}}>{desc}</div>
      {action&&<div style={{marginTop:24}}>{action}</div>}
    </div>
  );
}

function StatCard({ label, value, icon, color, sub }) {
  return (
    <div style={{background:C.card,padding:24,borderRadius:20,border:`1px solid ${C.border}`,position:'relative',overflow:'hidden',borderTop:`3px solid ${color}`}}>
      <div style={{position:'absolute',top:-4,right:10,fontSize:54,opacity:0.05}}>{icon}</div>
      <div style={{color:C.dim,fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>{label}</div>
      <div style={{fontSize:38,fontWeight:800,color:C.text,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:C.dim,marginTop:8}}>{sub}</div>}
      <div style={{width:40,height:3,background:`linear-gradient(90deg,${color},${color}60)`,borderRadius:2,marginTop:18}} />
    </div>
  );
}

// ─── Auth Pages ───────────────────────────────────────────────────────────────

function AuthInput({ label, hint, type='text', placeholder, value, onChange, icon, rightEl, autoFocus, required }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <label style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}{required&&<span style={{color:C.danger}}> *</span>}</label>
        {rightEl}
      </div>
      <div style={{position:'relative',display:'flex',alignItems:'center'}}>
        {icon && <span style={{position:'absolute',left:14,fontSize:16,color:focused?C.primary:C.dim,transition:'color 0.2s'}}>{icon}</span>}
        <input
          type={type} placeholder={placeholder} value={value} onChange={onChange}
          autoFocus={autoFocus} required={required}
          onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{
            width:'100%',background:C.surface,border:`1.5px solid ${focused?C.primary:C.border}`,
            borderRadius:12,padding:`12px 14px 12px ${icon?'42px':'14px'}`,color:C.text,fontSize:14,
            outline:'none',transition:'border-color 0.2s,box-shadow 0.2s',fontFamily:'inherit',
            boxShadow:focused?`0 0 0 3px ${C.primary}20`:'none',
          }}
        />
      </div>
      {hint && <p style={{fontSize:11,color:C.dim,marginTop:4}}>{hint}</p>}
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [view, setView] = useState('login'); // 'login' | 'register' | 'pending'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'pending') { setView('pending'); setMsg(data.message); return; }
        throw new Error(data.message || data.error || 'Erro ao fazer login');
      }
      localStorage.setItem('crm_token', data.token);
      localStorage.setItem('crm_user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar');
      setView('pending'); setMsg(data.message);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const bg = C.bg;

  if (view === 'pending') return (
    <div style={{minHeight:'100vh',background:bg,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{width:'100%',maxWidth:420,textAlign:'center'}}>
        <div style={{width:80,height:80,borderRadius:24,background:`linear-gradient(135deg,${C.warning},#d97706)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:40,margin:'0 auto 24px',boxShadow:`0 8px 32px ${C.warning}40`}}>⏳</div>
        <div style={{fontSize:24,fontWeight:800,color:C.text,marginBottom:8}}>Aguardando aprovação</div>
        <div style={{fontSize:14,color:C.muted,lineHeight:1.7,marginBottom:32}}>{msg || 'Seu cadastro foi enviado. O administrador precisa aprovar seu acesso antes de você poder entrar.'}</div>
        <Btn variant="outline" onClick={()=>{setView('login');setError('');}}>Voltar ao login</Btn>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:bg,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{width:'100%',maxWidth:420}}>

        {/* Card */}
        <div style={{background:C.card,borderRadius:28,border:`1px solid ${C.border}`,padding:'44px 40px 36px',boxShadow:'0 32px 80px rgba(0,0,0,0.5)'}}>

          {/* Header */}
          <div style={{textAlign:'center',marginBottom:36}}>
            <div style={{width:72,height:72,borderRadius:22,background:`linear-gradient(135deg,${C.primary},${C.purple})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,margin:'0 auto 18px',boxShadow:`0 8px 32px ${C.primary}50`}}>
              {view==='login' ? '🔒' : '✍️'}
            </div>
            <div style={{fontSize:26,fontWeight:800,color:C.text,letterSpacing:'-0.02em'}}>Viga Sales</div>
            <div style={{fontSize:11,fontWeight:700,color:C.dim,letterSpacing:'0.12em',textTransform:'uppercase',marginTop:4}}>
              {view==='login' ? 'Área Restrita' : 'Solicitar Cadastro'}
            </div>
          </div>

          {/* Form */}
          {view === 'login' ? (
            <form onSubmit={handleLogin} style={{display:'flex',flexDirection:'column',gap:16}}>
              <AuthInput label="E-mail corporativo" type="email" placeholder="seu@email.com" value={email} onChange={e=>setEmail(e.target.value)} icon="👤" required autoFocus />
              <AuthInput
                label="Senha de acesso"
                type="password" placeholder="••••••••"
                value={password} onChange={e=>setPassword(e.target.value)}
                icon="🔑" required
              />
              {error && <div style={{background:`${C.danger}15`,border:`1px solid ${C.danger}35`,borderRadius:10,padding:'10px 14px',color:C.danger,fontSize:13}}>{error}</div>}
              <button type="submit" disabled={loading} style={{
                marginTop:8,width:'100%',padding:'14px',borderRadius:14,border:'none',cursor:loading?'not-allowed':'pointer',
                background:`linear-gradient(135deg,${C.primary},${C.purple})`,color:'#fff',fontSize:14,fontWeight:800,
                letterSpacing:'0.06em',textTransform:'uppercase',boxShadow:`0 6px 20px ${C.primary}50`,
                opacity:loading?0.7:1,transition:'all 0.2s',
              }}
                onMouseOver={e=>{if(!loading)e.currentTarget.style.filter='brightness(1.1)';}}
                onMouseOut={e=>e.currentTarget.style.filter=''}
              >
                {loading ? 'Entrando...' : 'Entrar no Sistema'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} style={{display:'flex',flexDirection:'column',gap:16}}>
              <AuthInput label="Nome completo" placeholder="Seu nome" value={name} onChange={e=>setName(e.target.value)} icon="👤" required autoFocus />
              <AuthInput label="E-mail" type="email" placeholder="seu@email.com" value={email} onChange={e=>setEmail(e.target.value)} icon="📧" required />
              <AuthInput label="Senha" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e=>setPassword(e.target.value)} icon="🔑" required hint="Mínimo 6 caracteres" />
              {error && <div style={{background:`${C.danger}15`,border:`1px solid ${C.danger}35`,borderRadius:10,padding:'10px 14px',color:C.danger,fontSize:13}}>{error}</div>}
              <button type="submit" disabled={loading} style={{
                marginTop:8,width:'100%',padding:'14px',borderRadius:14,border:'none',cursor:loading?'not-allowed':'pointer',
                background:`linear-gradient(135deg,${C.primary},${C.purple})`,color:'#fff',fontSize:14,fontWeight:800,
                letterSpacing:'0.06em',textTransform:'uppercase',boxShadow:`0 6px 20px ${C.primary}50`,
                opacity:loading?0.7:1,transition:'all 0.2s',
              }}>
                {loading ? 'Enviando...' : 'Solicitar Cadastro'}
              </button>
            </form>
          )}
        </div>

        {/* Footer link */}
        <div style={{textAlign:'center',marginTop:28}}>
          {view === 'login' ? (
            <>
              <div style={{fontSize:12,color:C.dim,marginBottom:6}}>NOVO NO VIGA SALES?</div>
              <button onClick={()=>{setView('register');setError('');}} style={{background:'transparent',border:'none',color:C.primary,fontSize:13,fontWeight:700,cursor:'pointer',letterSpacing:'0.04em',textTransform:'uppercase'}}>
                Solicitar Cadastro
              </button>
            </>
          ) : (
            <button onClick={()=>{setView('login');setError('');}} style={{background:'transparent',border:'none',color:C.muted,fontSize:13,cursor:'pointer'}}>
              ← Voltar ao login
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

// ─── Mini Bar Chart (SVG) ─────────────────────────────────────────────────────
function BarChart({ data }) {
  const max = Math.max(...data.map(d=>d.count), 1);
  const W = 100, H = 80, barW = 10, gap = 4;
  const totalW = data.length * (barW + gap) - gap;
  const startX = (W - totalW) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H+20}`} style={{width:'100%',height:'100%'}}>
      {data.map((d, i) => {
        const bh = Math.max(2, (d.count / max) * H);
        const x = startX + i * (barW + gap);
        const y = H - bh;
        const isToday = i === data.length - 1;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={bh} rx={2}
              fill={isToday ? C.accent : C.primary} opacity={isToday ? 1 : 0.6} />
            {d.count > 0 && (
              <text x={x + barW/2} y={y - 3} textAnchor="middle"
                fontSize="6" fill={C.dim}>{d.count}</text>
            )}
            <text x={x + barW/2} y={H + 14} textAnchor="middle"
              fontSize="6.5" fill={C.muted}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Dashboard({ onNavigate }) {
  const [data, setData]     = useState(null);
  const [pipe, setPipe]     = useState([]);
  const [daily, setDaily]   = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAll().then(d => {
      setData(d.stats);
      setPipe(Array.isArray(d.pipeline) ? d.pipeline : []);
      setDaily(Array.isArray(d.daily) ? d.daily : []);
      setRecent(Array.isArray(d.recentContacts) ? d.recentContacts : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if(loading) return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:20}}>
      {[1,2,3,4].map(i=><div key={i} style={{height:140,background:C.card,borderRadius:20,border:`1px solid ${C.border}`}} />)}
    </div>
  );

  const total = pipe.reduce((a,s)=>a+s.count,0);
  const todayMsgs = daily[daily.length-1]?.count ?? 0;
  const weekMsgs  = daily.reduce((a,d)=>a+d.count,0);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{fontSize:28,fontWeight:800,color:C.text,marginBottom:4}}>Dashboard</h2>
          <p style={{color:C.dim,fontSize:14}}>Visão geral do seu CRM em tempo real.</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <Btn size="sm" onClick={()=>onNavigate('contacts')}>+ Novo Contato</Btn>
          <Btn size="sm" variant="secondary" onClick={()=>onNavigate('conversations')}>💬 Conversas</Btn>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16}}>
        <StatCard label="Total de Contatos" value={data?.totalContacts??0} icon="👥" color={C.primary} sub="na base de dados" />
        <StatCard label="Conversas Abertas" value={data?.openConvs??0} icon="💬" color={C.success} sub="aguardando resposta" />
        <StatCard label="Mensagens Hoje" value={todayMsgs} icon="📩" color={C.warning} sub={`${weekMsgs} esta semana`} />
        <StatCard label="Total de Mensagens" value={data?.totalMessages??0} icon="📊" color={C.purple} sub="histórico completo" />
      </div>

      {/* Chart + Recent */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

        {/* Gráfico de mensagens */}
        <Card title="📈 Mensagens — últimos 7 dias" subtitle={`${weekMsgs} mensagens na semana`}>
          {daily.length > 0
            ? <div style={{height:120,padding:'8px 0'}}><BarChart data={daily} /></div>
            : <div style={{textAlign:'center',color:C.dim,padding:32,fontSize:13}}>Sem dados ainda</div>
          }
        </Card>

        {/* Pipeline resumo */}
        <Card title="🎯 Pipeline" subtitle={`${total} contato${total!==1?'s':''} distribuídos`}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {pipe.slice(0,4).map(s=>{
              const pct = total>0 ? Math.round((s.count/total)*100) : 0;
              const color = STAGE_COLORS[s.id] || C.primary;
              return (
                <div key={s.id}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:5}}>
                    <span style={{color:C.muted,fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                      <span style={{width:7,height:7,borderRadius:'50%',background:color,display:'inline-block'}}/>
                      {s.name}
                    </span>
                    <span style={{color:C.dim}}>{s.count} · {pct}%</span>
                  </div>
                  <div style={{height:5,background:C.bg,borderRadius:3,overflow:'hidden'}}>
                    <div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:3,transition:'width 0.6s ease'}} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Contatos recentes */}
      {recent.length > 0 && (
        <Card title="🕐 Contatos recentes" subtitle="Últimas interações">
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {recent.map(c => (
              <div key={c.id} onClick={()=>onNavigate('contacts', c.id)}
                style={{display:'flex',alignItems:'center',gap:12,padding:'10px 8px',borderRadius:10,cursor:'pointer',transition:'background .15s'}}
                onMouseOver={e=>e.currentTarget.style.background='#ffffff08'}
                onMouseOut={e=>e.currentTarget.style.background=''}>
                <Avatar name={c.name} size={36} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:C.text,fontWeight:600,fontSize:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
                  <div style={{color:C.dim,fontSize:12}}>{c.phone}</div>
                </div>
                <Badge color={STAGE_COLORS[c.pipeline_stage]||C.primary} style={{fontSize:10,flexShrink:0}}>
                  {STAGE_LABELS[c.pipeline_stage]||c.pipeline_stage||'Lead'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Contacts ────────────────────────────────────────────────────────────────

const parseTags = (t) => { try { if (Array.isArray(t)) return t; if (!t) return []; return JSON.parse(t); } catch { return []; } };

const ACTIVITY_ICONS = { call:'📞', email:'✉️', meeting:'🤝', note:'📝', task:'✅', whatsapp:'💬' };

function InfoField({ label, value, icon }) {
  if (!value) return null;
  return (
    <div style={{ background:'#ffffff06', borderRadius:10, padding:'10px 13px', border:`1px solid ${C.border}` }}>
      <div style={{ fontSize:10, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>{icon} {label}</div>
      <div style={{ fontSize:13, color:C.text, fontWeight:500, wordBreak:'break-word' }}>{value}</div>
    </div>
  );
}

function DrawerSection({ title, icon, action, children }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em' }}>{icon} {title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ContactDrawer({ contactId, onClose, onEdit, onDelete, onOpenConversation, onRefreshList, canEdit }) {
  const [contact, setContact]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [notes, setNotes]               = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [addingAct, setAddingAct]       = useState(false);
  const [actForm, setActForm]           = useState({ type:'note', title:'', description:'' });
  const [savingNotes, setSavingNotes]   = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await contactsApi.get(contactId); setContact(d); setNotes(d.notes || ''); }
    catch { toast.error('Erro ao carregar contato'); }
    setLoading(false);
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleStageChange = async (stage) => {
    try { await contactsApi.setStage(contactId, stage); setContact(p => ({ ...p, pipeline_stage: stage })); }
    catch { toast.error('Erro ao atualizar etapa'); }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await contactsApi.update(contactId, { name: contact.name, phone: contact.phone, email: contact.email, company: contact.company, tags: parseTags(contact.tags), pipeline_value: contact.pipeline_value, notes });
      setContact(p => ({ ...p, notes })); setEditingNotes(false); toast.success('Notas salvas!');
    } catch { toast.error('Erro ao salvar notas'); }
    setSavingNotes(false);
  };

  const handleAddActivity = async () => {
    if (!actForm.title.trim()) return toast.error('Título é obrigatório');
    try {
      await contactsApi.addActivity(contactId, actForm);
      setActForm({ type:'note', title:'', description:'' }); setAddingAct(false);
      load(); toast.success('Atividade adicionada!');
    } catch { toast.error('Erro ao adicionar atividade'); }
  };

  const handleDelete = () => { onClose(); onDelete(contactId); };

  const inputStyle = { width:'100%', background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', color:C.text, fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:800, backdropFilter:'blur(2px)' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:580, background:C.card, borderLeft:`1px solid ${C.border}`, zIndex:801, display:'flex', flexDirection:'column', boxShadow:'-12px 0 40px rgba(0,0,0,0.5)', animation:'slideInRight .2s ease-out' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:C.dim, fontSize:14 }}>Carregando ficha...</div>
        ) : !contact ? null : (
          <>
            {/* ── Header ── */}
            <div style={{ padding:'22px 24px 18px', borderBottom:`1px solid ${C.border}`, background:C.surface, flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:16 }}>
                <Avatar name={contact.name} size={58} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:20, fontWeight:800, color:C.text, marginBottom:3 }}>{contact.name}</div>
                  <div style={{ fontSize:13, color:C.muted, marginBottom:8 }}>{contact.company || '–'} {contact.email ? `· ${contact.email}` : ''}</div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <Badge color={STAGE_COLORS[contact.pipeline_stage]||C.primary}>{STAGE_LABELS[contact.pipeline_stage]||contact.pipeline_stage}</Badge>
                    {contact.pipeline_value > 0 && <Badge color={C.success}>{fmt(contact.pipeline_value)}</Badge>}
                    {parseTags(contact.tags).slice(0,3).map(t => <Badge key={t} color={C.purple}>{t}</Badge>)}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={() => onOpenConversation(contact)} title="Conversa WhatsApp" style={{ background:`${C.success}18`, border:`1px solid ${C.success}35`, color:C.success, borderRadius:8, padding:'7px 10px', cursor:'pointer', fontSize:17 }}>💬</button>
                  {canEdit !== false && <button onClick={() => { onClose(); setTimeout(() => onEdit(contact), 50); }} title="Editar contato" style={{ background:`${C.primary}18`, border:`1px solid ${C.primary}35`, color:C.primary, borderRadius:8, padding:'7px 10px', cursor:'pointer', fontSize:17 }}>✏️</button>}
                  <button onClick={onClose} style={{ background:C.border, border:'none', color:C.muted, borderRadius:8, padding:'7px 12px', cursor:'pointer', fontSize:14, fontWeight:700 }}>✕</button>
                </div>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:22 }}>

              {/* Informações */}
              <DrawerSection title="Informações" icon="📋">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <InfoField label="Telefone"  icon="📱" value={contact.phone} />
                  <InfoField label="E-mail"    icon="✉️" value={contact.email} />
                  <InfoField label="Empresa"   icon="🏢" value={contact.company} />
                  <InfoField label="Status"    icon="🔘" value={contact.status || 'Ativo'} />
                  <InfoField label="Última interação" icon="🕐" value={fmtDate(contact.last_interaction)} />
                  <InfoField label="Cadastrado em"    icon="📅" value={fmtDate(contact.created_at)} />
                </div>
              </DrawerSection>

              {/* Pipeline */}
              <DrawerSection title="Pipeline" icon="📈">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:7 }}>Etapa</div>
                    <select value={contact.pipeline_stage||'stage_lead'} onChange={e => handleStageChange(e.target.value)}
                      style={{ width:'100%', background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:'9px 12px', color:C.text, fontSize:13, outline:'none', fontFamily:'inherit' }}>
                      {Object.entries(STAGE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:7 }}>Valor no pipeline</div>
                    <div style={{ fontSize:26, fontWeight:800, color: contact.pipeline_value > 0 ? C.success : C.dim }}>{contact.pipeline_value > 0 ? fmt(contact.pipeline_value) : '–'}</div>
                  </div>
                </div>
              </DrawerSection>

              {/* Notas */}
              <DrawerSection title="Notas" icon="📝" action={
                editingNotes
                  ? <button onClick={handleSaveNotes} disabled={savingNotes} style={{ background:`${C.success}18`, border:`1px solid ${C.success}35`, color:C.success, borderRadius:7, padding:'4px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>{savingNotes ? '...' : '💾 Salvar'}</button>
                  : <button onClick={() => setEditingNotes(true)} style={{ background:`${C.primary}18`, border:`1px solid ${C.primary}35`, color:C.primary, borderRadius:7, padding:'4px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>✏️ Editar</button>
              }>
                {editingNotes
                  ? <textarea value={notes} onChange={e => setNotes(e.target.value)} autoFocus rows={4}
                      style={{ ...inputStyle, border:`1px solid ${C.primary}`, resize:'vertical', minHeight:90, boxShadow:`0 0 0 2px ${C.primary}22` }} />
                  : <div style={{ fontSize:13, color: notes ? C.muted : C.dim, lineHeight:1.7, whiteSpace:'pre-wrap', padding:'4px 0', minHeight:36 }}>{notes || 'Sem notas. Clique em Editar para adicionar.'}</div>}
              </DrawerSection>

              {/* Atividades */}
              <DrawerSection title={`Atividades (${(contact.activities||[]).length})`} icon="⚡" action={
                <button onClick={() => setAddingAct(!addingAct)} style={{ background:`${C.primary}18`, border:`1px solid ${C.primary}35`, color:C.primary, borderRadius:7, padding:'4px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>＋ Registrar</button>
              }>
                {addingAct && (
                  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'130px 1fr', gap:8, marginBottom:8 }}>
                      <select value={actForm.type} onChange={e => setActForm({...actForm, type:e.target.value})}
                        style={{ ...inputStyle, padding:'8px 10px', fontSize:12 }}>
                        <option value="note">📝 Nota</option>
                        <option value="call">📞 Ligação</option>
                        <option value="meeting">🤝 Reunião</option>
                        <option value="email">✉️ E-mail</option>
                        <option value="task">✅ Tarefa</option>
                        <option value="whatsapp">💬 WhatsApp</option>
                      </select>
                      <input value={actForm.title} onChange={e => setActForm({...actForm, title:e.target.value})}
                        onKeyDown={e => e.key==='Enter' && handleAddActivity()}
                        placeholder="Título..." autoFocus style={inputStyle} />
                    </div>
                    <textarea value={actForm.description} onChange={e => setActForm({...actForm, description:e.target.value})}
                      placeholder="Descrição opcional..." rows={2}
                      style={{ ...inputStyle, resize:'none', marginBottom:10, fontSize:12 }} />
                    <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                      <button onClick={() => setAddingAct(false)} style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.muted, borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:12 }}>Cancelar</button>
                      <button onClick={handleAddActivity} style={{ background:`linear-gradient(135deg,${C.primary},${C.purple})`, border:'none', color:'#fff', borderRadius:7, padding:'6px 16px', cursor:'pointer', fontSize:12, fontWeight:700, boxShadow:`0 3px 10px ${C.primary}40` }}>Salvar</button>
                    </div>
                  </div>
                )}
                {(contact.activities||[]).length === 0 && !addingAct
                  ? <div style={{ textAlign:'center', padding:'20px 0', color:C.dim, fontSize:13 }}>Nenhuma atividade registrada ainda.</div>
                  : (contact.activities||[]).map((a, i) => (
                    <div key={a.id} style={{ display:'flex', gap:12, padding:'11px 0', borderBottom: i < (contact.activities.length-1) ? `1px solid ${C.border}30` : 'none' }}>
                      <div style={{ width:34, height:34, borderRadius:'50%', background:`${C.primary}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0, border:`1px solid ${C.border}` }}>
                        {ACTIVITY_ICONS[a.type] || '📝'}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:2 }}>{a.title}</div>
                        {a.description && <div style={{ fontSize:12, color:C.muted, lineHeight:1.5, marginBottom:3 }}>{a.description}</div>}
                        <div style={{ fontSize:11, color:C.dim }}>{fmtDate(a.created_at)}</div>
                      </div>
                    </div>
                  ))
                }
              </DrawerSection>
            </div>

            {/* ── Footer ── */}
            <div style={{ padding:'14px 24px', borderTop:`1px solid ${C.border}`, display:'flex', gap:10, background:C.surface, flexShrink:0, flexWrap:'wrap' }}>
              <Btn variant="danger" size="sm" onClick={handleDelete} style={{ marginRight:'auto' }}>🗑 Excluir</Btn>
              <Btn variant="secondary" size="sm" onClick={onClose}>Fechar</Btn>
              <Btn variant="outline" size="sm" onClick={() => setShowFollowUp(true)}>📅 Lembrete</Btn>
              <Btn variant="outline" size="sm" onClick={() => setShowBriefing(true)} style={{ borderColor:`${C.primary}60`, color:C.primary }}>📋 Briefing</Btn>
              <Btn size="sm" onClick={() => { onClose(); setTimeout(() => onEdit(contact), 50); }}>✏️ Editar contato</Btn>
            </div>
            {showFollowUp && <FollowUpModal contact={contact} onClose={() => setShowFollowUp(false)} />}
            {showBriefing && <ClientBriefing contact={contact} onClose={() => setShowBriefing(false)} />}
          </>
        )}
      </div>
    </>
  );
}

// ─── FollowUps (inbox de sugestões IA) ───────────────────────────────────────

const INACTIVITY_DAYS = 3; // contatos sem interação há mais de N dias

function FollowUps() {
  const [tab, setTab]             = useState('scheduled'); // 'scheduled' | 'suggestions'
  const [contacts, setContacts]   = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [cards, setCards]         = useState({});
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fu_dismissed') || '[]'); } catch { return []; }
  });

  const saveDismissed = (list) => {
    setDismissed(list);
    localStorage.setItem('fu_dismissed', JSON.stringify(list));
  };

  const loadReminders = async () => {
    try {
      const r = await fetch('/api/reminders');
      const d = await r.json();
      setReminders(Array.isArray(d) ? d : []);
    } catch { /* ignora */ }
  };

  useEffect(() => {
    (async () => {
      await loadReminders();
      try {
        const d = await contactsApi.list();
        const all = Array.isArray(d.contacts) ? d.contacts : [];
        const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 86400000);
        const inactive = all.filter(c => {
          if (dismissed.includes(c.id)) return false;
          if (!c.last_interaction) return true;
          return new Date(c.last_interaction) < cutoff;
        });
        const stageWeight = { stage_negotiation:5, stage_proposal:4, stage_contact:3, stage_won:2, stage_lead:1, stage_lost:0 };
        inactive.sort((a,b) => (stageWeight[b.pipeline_stage]||0) - (stageWeight[a.pipeline_stage]||0));
        setContacts(inactive.slice(0, 15));
        inactive.slice(0, 5).forEach(c => generateSuggestion(c));
      } catch { toast.error('Erro ao carregar contatos'); }
      setLoading(false);
    })();
  }, []);

  const generateSuggestion = async (contact) => {
    setCards(prev => ({ ...prev, [contact.id]: { msg: '', status: 'loading' } }));
    try {
      const r = await fetch('/api/ai/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactName: contact.name, phone: contact.phone, company: contact.company, stage: contact.pipeline_stage, notes: contact.notes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro desconhecido');
      if (!d.suggestion) throw new Error('IA não retornou sugestão');
      setCards(prev => ({ ...prev, [contact.id]: { msg: d.suggestion, status: 'ready' } }));
    } catch(e) {
      toast.error('IA: ' + e.message, { duration: 5000 });
      setCards(prev => ({ ...prev, [contact.id]: { msg: '', status: 'error' } }));
    }
  };

  const sendNow = async (contact) => {
    const card = cards[contact.id];
    if (!card?.msg) return toast.error('Gere a mensagem primeiro');
    setCards(prev => ({ ...prev, [contact.id]: { ...prev[contact.id], status: 'sending' } }));
    try {
      const r = await fetch('/api/reminders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, phone: contact.phone, message: card.msg, sendNow: true }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast.success(`✅ Enviado para ${contact.name}!`);
      dismiss(contact.id);
    } catch(e) {
      toast.error('Erro: ' + e.message);
      setCards(prev => ({ ...prev, [contact.id]: { ...prev[contact.id], status: 'ready' } }));
    }
  };

  const cancelReminder = async (id) => {
    try {
      await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
      setReminders(prev => prev.filter(r => r.id !== id));
      toast.success('Lembrete cancelado');
    } catch { toast.error('Erro ao cancelar'); }
  };

  const dismiss = (id) => {
    saveDismissed([...dismissed, id]);
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const daysSince = (d) => {
    if (!d) return '∞';
    return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  };

  const STATUS_LABEL = { pending:'⏳ Agendado', sent:'✅ Enviado', failed:'❌ Falhou', cancelled:'🚫 Cancelado' };
  const STATUS_COLOR = { pending:C.warning, sent:C.success, failed:C.danger, cancelled:C.dim };

  const pending   = reminders.filter(r => r.status === 'pending');
  const history   = reminders.filter(r => r.status !== 'pending');

  const TabBtn = ({ id, label, count }) => (
    <button onClick={() => setTab(id)} style={{
      padding:'8px 18px', borderRadius:10, fontWeight:700, fontSize:13, cursor:'pointer', border:'none',
      background: tab === id ? `linear-gradient(135deg,${C.primary},${C.purple})` : C.card,
      color: tab === id ? '#fff' : C.muted,
      boxShadow: tab === id ? `0 4px 12px ${C.primary}40` : 'none',
      display:'flex', alignItems:'center', gap:6,
    }}>
      {label}
      {count > 0 && <span style={{ background: tab===id ? 'rgba(255,255,255,0.25)' : `${C.primary}30`, color: tab===id ? '#fff' : C.primary, borderRadius:8, fontSize:11, padding:'1px 7px', fontWeight:800 }}>{count}</span>}
    </button>
  );

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:C.muted, fontSize:14 }}>Carregando...</div>;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:C.text, margin:0 }}>🤖 Follow-ups</h2>
        <p style={{ color:C.muted, fontSize:13, marginTop:4 }}>Lembretes agendados e sugestões automáticas de follow-up por IA.</p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:10, marginBottom:24 }}>
        <TabBtn id="scheduled" label="📅 Agendados" count={pending.length} />
        <TabBtn id="suggestions" label="✨ Sugestões IA" count={contacts.length} />
        {history.length > 0 && <TabBtn id="history" label="📋 Histórico" count={history.length} />}
      </div>

      {/* ── Agendados ── */}
      {tab === 'scheduled' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {pending.length === 0 && (
            <div style={{ textAlign:'center', padding:'50px 0', color:C.dim }}>
              <div style={{ fontSize:40, marginBottom:10 }}>📭</div>
              <div style={{ fontSize:15, fontWeight:700, color:C.muted }}>Nenhum lembrete agendado</div>
              <div style={{ fontSize:12, marginTop:6 }}>Abra um contato e clique em "📅 Lembrete" para agendar.</div>
            </div>
          )}
          {pending.map(r => (
            <div key={r.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:18, borderLeft:`3px solid ${C.warning}` }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:3 }}>{r.contact_name || r.phone}</div>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>📱 {r.contact_phone || r.phone}</div>
                  <div style={{ background:C.surface, borderRadius:8, padding:'10px 12px', fontSize:13, color:C.text, lineHeight:1.6, border:`1px solid ${C.border}`, marginBottom:10 }}>
                    {r.message}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontSize:11, color:C.warning, fontWeight:700 }}>
                      ⏳ {new Date(r.scheduled_at).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </div>
                    <button onClick={() => cancelReminder(r.id)} style={{ background:`${C.danger}15`, border:`1px solid ${C.danger}30`, color:C.danger, borderRadius:8, padding:'5px 12px', cursor:'pointer', fontSize:11, fontWeight:700 }}>
                      🚫 Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sugestões IA ── */}
      {tab === 'suggestions' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {contacts.length === 0 && (
            <div style={{ textAlign:'center', padding:'50px 0', color:C.dim }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🎉</div>
              <div style={{ fontSize:15, fontWeight:700, color:C.muted }}>Nenhum follow-up pendente!</div>
              <div style={{ fontSize:12, marginTop:6 }}>Todos os contatos foram contatados recentemente.</div>
            </div>
          )}
          {contacts.map(contact => {
            const card = cards[contact.id] || {};
            const days = daysSince(contact.last_interaction);
            const urgency = days === '∞' || days > 7 ? C.danger : days > 4 ? C.warning : C.primary;
            return (
              <div key={contact.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:20, borderLeft:`3px solid ${urgency}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                  <Avatar name={contact.name} size={42} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{contact.name}</div>
                    <div style={{ fontSize:12, color:C.muted }}>{contact.company || ''} · {contact.phone}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <Badge color={STAGE_COLORS[contact.pipeline_stage]||C.primary}>{STAGE_LABELS[contact.pipeline_stage]}</Badge>
                    <div style={{ fontSize:11, color:urgency, fontWeight:700, marginTop:4 }}>
                      {days === '∞' ? 'Nunca contatado' : `${days}d sem contato`}
                    </div>
                  </div>
                </div>
                <div style={{ background:C.surface, borderRadius:10, padding:'12px 14px', marginBottom:14, border:`1px solid ${C.border}`, minHeight:60 }}>
                  {card.status === 'loading' ? <div style={{ color:C.dim, fontSize:13, fontStyle:'italic' }}>✨ IA gerando sugestão...</div>
                  : card.status === 'error'   ? <div style={{ color:C.danger, fontSize:13 }}>Erro ao gerar. Tente novamente.</div>
                  : card.msg ? (
                    <textarea value={card.msg} onChange={e => setCards(prev => ({ ...prev, [contact.id]: { ...prev[contact.id], msg: e.target.value } }))}
                      rows={3} style={{ width:'100%', background:'transparent', border:'none', color:C.text, fontSize:13, lineHeight:1.6, resize:'vertical', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }} />
                  ) : <div style={{ color:C.dim, fontSize:13 }}>Mensagem não gerada ainda.</div>}
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button onClick={() => dismiss(contact.id)} style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.dim, borderRadius:9, padding:'7px 14px', cursor:'pointer', fontSize:12, fontWeight:600 }}>❌ Ignorar</button>
                  <button onClick={() => generateSuggestion(contact)} style={{ background:`${C.purple}15`, border:`1px solid ${C.purple}35`, color:C.purple, borderRadius:9, padding:'7px 14px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                    {card.msg ? '🔄 Regerar' : '✨ Gerar com IA'}
                  </button>
                  <button onClick={() => sendNow(contact)} disabled={!card.msg || card.status==='loading' || card.status==='sending'}
                    style={{ background:`linear-gradient(135deg,${C.success},#059669)`, border:'none', color:'#fff', borderRadius:9, padding:'7px 18px', cursor:(!card.msg||card.status==='loading'||card.status==='sending')?'not-allowed':'pointer', fontSize:12, fontWeight:700, opacity:(!card.msg||card.status==='loading'||card.status==='sending')?0.6:1 }}>
                    {card.status === 'sending' ? 'Enviando...' : '✅ Enviar agora'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Histórico ── */}
      {tab === 'history' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {history.map(r => (
            <div key={r.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:16, display:'flex', gap:12, alignItems:'flex-start' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
                  <span style={{ fontSize:11, color:C.dim }}>{r.contact_name || r.phone}</span>
                </div>
                <div style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>{r.message}</div>
                <div style={{ fontSize:11, color:C.dim, marginTop:6 }}>{new Date(r.scheduled_at).toLocaleString('pt-BR')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FollowUpModal ────────────────────────────────────────────────────────────

function FollowUpModal({ contact, onClose }) {
  const today = new Date();
  const pad   = n => String(n).padStart(2,'0');
  const defaultDate = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
  const defaultTime = `${pad(today.getHours()+1)}:00`;

  const [date, setDate]       = useState(defaultDate);
  const [time, setTime]       = useState(defaultTime);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggesting, setSugg] = useState(false);

  const inputStyle = { width:'100%', background:'#0a0d14', border:'1px solid #232840', borderRadius:8, padding:'9px 12px', color:'#e8edf5', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' };

  const suggest = async () => {
    setSugg(true);
    try {
      const r = await fetch('/api/ai/suggest', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contactName: contact.name, phone: contact.phone, company: contact.company, stage: contact.pipeline_stage, notes: contact.notes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro no servidor');
      if (d.suggestion) setMessage(d.suggestion);
      else throw new Error('IA não retornou sugestão');
    } catch(e) { toast.error('IA: ' + e.message, { duration: 5000 }); }
    setSugg(false);
  };

  const save = async () => {
    if (!message.trim()) return toast.error('Mensagem obrigatória');
    if (!date || !time)  return toast.error('Data e hora obrigatórias');
    setLoading(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      const r = await fetch('/api/reminders', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contactId: contact.id, phone: contact.phone, message, scheduledAt }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast.success('Lembrete agendado! ✅');
      onClose();
    } catch(e) { toast.error('Erro ao agendar: ' + e.message); }
    setLoading(false);
  };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:900, backdropFilter:'blur(3px)' }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(460px,94vw)', background:'#1a1f2e', borderRadius:18, padding:28, zIndex:901, boxShadow:'0 20px 60px rgba(0,0,0,0.7)', border:'1px solid #232840' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#e8edf5' }}>📅 Agendar Lembrete</div>
            <div style={{ fontSize:12, color:'#8b95b0', marginTop:2 }}>para {contact.name}</div>
          </div>
          <button onClick={onClose} style={{ background:'#232840', border:'none', color:'#8b95b0', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16, fontWeight:700 }}>✕</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#505878', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>Data</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#505878', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>Hora</div>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#505878', textTransform:'uppercase', letterSpacing:'.07em' }}>Mensagem</div>
            <button onClick={suggest} disabled={suggesting} style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', border:'none', color:'#fff', borderRadius:8, padding:'5px 13px', cursor:suggesting?'wait':'pointer', fontSize:12, fontWeight:700, opacity:suggesting?0.7:1 }}>
              {suggesting ? '✨ Gerando...' : '✨ Sugerir com IA'}
            </button>
          </div>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Mensagem a enviar pelo WhatsApp no horário agendado..." style={{ ...inputStyle, resize:'vertical', minHeight:90, lineHeight:1.6 }} />
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ background:'transparent', border:'1px solid #232840', color:'#8b95b0', borderRadius:10, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:600 }}>Cancelar</button>
          <button onClick={save} disabled={loading} style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', border:'none', color:'#fff', borderRadius:10, padding:'9px 22px', cursor:loading?'wait':'pointer', fontSize:13, fontWeight:700, boxShadow:'0 4px 15px #6366f145', opacity:loading?0.7:1 }}>
            {loading ? 'Agendando...' : '📅 Agendar'}
          </button>
        </div>
      </div>
    </>
  );
}

function Contacts() {
  const [contacts, setContacts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState(null);
  const [drawerId, setDrawerId]     = useState(null);
  const [form, setForm]             = useState({name:'',phone:'',email:'',company:'',pipeline_value:'',notes:''});
  const [tags, setTags]             = useState([]);
  const [tagInput, setTagInput]     = useState('');

  const load = useCallback(async () => {
    try { const d=await contactsApi.list(); setContacts(Array.isArray(d.contacts)?d.contacts:[]); }
    catch { toast.error('Erro ao carregar contatos'); }
    setLoading(false);
  }, []);

  useEffect(()=>{ load(); },[load]);

  const openCreate = ()=>{
    setEditing(null);
    setForm({name:'',phone:'',email:'',company:'',pipeline_value:'',notes:''});
    setTags([]); setTagInput(''); setShowModal(true);
  };
  const openEdit = (c)=>{
    setEditing(c);
    setForm({name:c.name,phone:c.phone,email:c.email||'',company:c.company||'',pipeline_value:c.pipeline_value||'',notes:c.notes||''});
    setTags(parseTags(c.tags)); setTagInput(''); setShowModal(true);
  };

  const handleSave = async ()=>{
    if(!form.name||!form.phone) return toast.error('Nome e telefone são obrigatórios');
    try {
      const data={...form,tags,pipeline_value:Number(form.pipeline_value)||0};
      if(editing){ await contactsApi.update(editing.id,data); toast.success('Contato atualizado!'); }
      else { await contactsApi.create(data); toast.success('Contato criado!'); }
      setShowModal(false); load();
    } catch(err){ toast.error(err.response?.data?.error||'Erro ao salvar'); }
  };

  const handleDelete = async (id)=>{
    if(!confirm('Remover este contato?')) return;
    try { await contactsApi.delete(id); toast.success('Removido!'); load(); }
    catch { toast.error('Erro ao remover'); }
  };

  const addTag = ()=>{
    const t=tagInput.trim();
    if(t&&!tags.includes(t)) setTags([...tags,t]);
    setTagInput('');
  };

  const filtered = contacts.filter(c=>{
    const matchSearch = c.name?.toLowerCase().includes(search.toLowerCase())||c.phone?.includes(search)||c.company?.toLowerCase().includes(search.toLowerCase());
    const matchStage = stageFilter==='all' || c.pipeline_stage===stageFilter;
    return matchSearch && matchStage;
  });

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div>
          <h2 style={{fontSize:28,fontWeight:800,color:C.text,marginBottom:4}}>Contatos</h2>
          <p style={{color:C.dim,fontSize:14}}>{contacts.length} contato{contacts.length!==1?'s':''} cadastrado{contacts.length!==1?'s':''}</p>
        </div>
        <Btn onClick={openCreate}>+ Novo Contato</Btn>
      </div>

      <Card noPad>
        <div style={{padding:'14px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',flexDirection:'column',gap:10}}>
          <input placeholder="🔍 Buscar por nome, telefone ou empresa..." value={search} onChange={e=>setSearch(e.target.value)}
            style={{width:'100%',background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 16px',color:C.text,fontSize:14,outline:'none'}} />
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {[{id:'all',label:'Todos'},
              {id:'lead',label:'🔵 Lead'},
              {id:'contact',label:'📞 Contato'},
              {id:'proposal',label:'📄 Proposta'},
              {id:'negotiation',label:'🤝 Negociação'},
              {id:'won',label:'✅ Ganho'},
              {id:'lost',label:'❌ Perdido'},
            ].map(f=>(
              <button key={f.id} onClick={()=>setStageFilter(f.id)} style={{
                padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',border:'1px solid',
                background:stageFilter===f.id?C.primary:'transparent',
                color:stageFilter===f.id?'#fff':C.muted,
                borderColor:stageFilter===f.id?C.primary:C.border,
                transition:'all .15s'
              }}>{f.label}</button>
            ))}
          </div>
        </div>
        {loading?(
          <div style={{padding:48,textAlign:'center',color:C.dim}}>Carregando...</div>
        ):filtered.length===0?(
          <EmptyState icon="👥" title="Nenhum contato encontrado" desc="Adicione seu primeiro lead ou cliente." action={<Btn size="sm" onClick={openCreate}>+ Criar Contato</Btn>} />
        ):(
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {['Contato','Empresa','Etapa','Valor','Tags','Última Interação',''].map(h=>(
                    <th key={h} style={{padding:'12px 16px',color:C.dim,fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c=>(
                  <tr key={c.id} style={{borderBottom:`1px solid ${C.border}`,transition:'background 0.12s', cursor:'pointer'}}
                    onMouseOver={e=>e.currentTarget.style.background='#ffffff06'}
                    onMouseOut={e=>e.currentTarget.style.background=''}
                    onClick={()=>setDrawerId(c.id)}>
                    <td style={{padding:'14px 16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <Avatar name={c.name} size={38} />
                        <div>
                          <div style={{color:C.text,fontWeight:600,fontSize:14}}>{c.name}</div>
                          <div style={{color:C.dim,fontSize:12}}>{c.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{padding:'14px 16px',color:C.muted,fontSize:13}}>{c.company||'–'}</td>
                    <td style={{padding:'14px 16px'}}><Badge color={STAGE_COLORS[c.pipeline_stage]||C.primary}>{STAGE_LABELS[c.pipeline_stage]||c.pipeline_stage}</Badge></td>
                    <td style={{padding:'14px 16px',color:c.pipeline_value>0?C.success:C.dim,fontWeight:600,fontSize:13}}>{c.pipeline_value>0?fmt(c.pipeline_value):'–'}</td>
                    <td style={{padding:'14px 16px'}}>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                        {parseTags(c.tags).slice(0,2).map(t=><Badge key={t} color={C.primary}>{t}</Badge>)}
                        {parseTags(c.tags).length>2&&<Badge color={C.dim}>+{parseTags(c.tags).length-2}</Badge>}
                      </div>
                    </td>
                    <td style={{padding:'14px 16px',color:C.dim,fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(c.last_interaction)}</td>
                    <td style={{padding:'14px 16px',textAlign:'right',whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                      <button title="Abrir conversa" onClick={()=>window.dispatchEvent(new CustomEvent('switchTab',{detail:{tab:'conversations',activeConv:c}}))}
                        style={{background:'none',border:'none',cursor:'pointer',color:C.success,fontSize:17,padding:'4px 6px',borderRadius:8}}>💬</button>
                      <button title="Editar" onClick={()=>openEdit(c)}
                        style={{background:'none',border:'none',cursor:'pointer',color:C.primary,fontSize:17,padding:'4px 6px',borderRadius:8}}>✏️</button>
                      <button title="Remover" onClick={()=>handleDelete(c.id)}
                        style={{background:'none',border:'none',cursor:'pointer',color:C.danger,fontSize:17,padding:'4px 6px',borderRadius:8}}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {drawerId && (
        <ContactDrawer
          contactId={drawerId}
          onClose={() => setDrawerId(null)}
          onEdit={(c) => { setDrawerId(null); openEdit(c); }}
          onDelete={(id) => handleDelete(id)}
          onOpenConversation={(c) => { setDrawerId(null); window.dispatchEvent(new CustomEvent('switchTab',{detail:{tab:'conversations',activeConv:c}})); }}
          onRefreshList={load}
        />
      )}

      <Modal open={showModal} onClose={()=>setShowModal(false)} title={editing?'Editar Contato':'Novo Contato'} maxWidth={620}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <FocusInput label="Nome" placeholder="João da Silva" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required autoFocus />
            <FocusInput label="Telefone" placeholder="5511999999999" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} required />
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <FocusInput label="E-mail" placeholder="joao@empresa.com" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} />
            <FocusInput label="Empresa" placeholder="ACME Ltda" value={form.company} onChange={e=>setForm({...form,company:e.target.value})} />
          </div>
          <FocusInput label="Valor no Pipeline (R$)" placeholder="0" value={form.pipeline_value} onChange={e=>setForm({...form,pipeline_value:e.target.value})} />
          <div>
            <label style={{display:'block',color:C.muted,fontSize:11,fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em'}}>Tags</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
              {tags.map(t=>(
                <span key={t} style={{background:`${C.primary}20`,color:C.primary,padding:'3px 10px',borderRadius:20,fontSize:12,display:'flex',alignItems:'center',gap:6,border:`1px solid ${C.primary}30`}}>
                  {t}<button onClick={()=>setTags(tags.filter(x=>x!==t))} style={{background:'none',border:'none',color:C.primary,cursor:'pointer',fontSize:14,lineHeight:1,padding:0}}>×</button>
                </span>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              <input placeholder="Nova tag... (Enter para adicionar)" value={tagInput} onChange={e=>setTagInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addTag())}
                style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontSize:13,outline:'none'}} />
              <Btn size="sm" variant="secondary" onClick={addTag}>+ Add</Btn>
            </div>
          </div>
          <FocusInput label="Notas" placeholder="Observações sobre o contato..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} textarea rows={3} />
          <div style={{display:'flex',gap:12,justifyContent:'flex-end',borderTop:`1px solid ${C.border}`,paddingTop:20,marginTop:4}}>
            <Btn variant="outline" onClick={()=>setShowModal(false)}>Cancelar</Btn>
            <Btn onClick={handleSave}>{editing?'💾 Salvar Alterações':'✨ Criar Contato'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Conversations ────────────────────────────────────────────────────────────

function Conversations({ initialContact }) {
  const perms = getUserPermissions();
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [winW, setWinW] = useState(window.innerWidth);
  const [contactDrawerId, setContactDrawerId] = useState(null);
  const [editContact, setEditContact] = useState(null);
  const [editForm, setEditForm] = useState({name:'',phone:'',email:'',company:'',pipeline_value:'',notes:''});
  const [editTags, setEditTags] = useState([]);
  const [editTagInput, setEditTagInput] = useState('');
  const isMobile = winW < 600;
  const msgEndRef = useRef(null);
  const listScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [mediaPreview, setMediaPreview] = useState(null); // { type:'image'|'audio', url, base64, mimeType }
  const [recording, setRecording] = useState(false);

  useEffect(()=>{
    const onResize=()=>setWinW(window.innerWidth);
    window.addEventListener('resize',onResize);
    return ()=>window.removeEventListener('resize',onResize);
  },[]);

  const scrollToBottom = useCallback((instant=false)=>{ msgEndRef.current?.scrollIntoView({behavior:instant?'instant':'smooth'}); },[]);

  const loadConvs = useCallback(async ()=>{
    try { const d=await convsApi.list(); setConvs(Array.isArray(d)?d:[]); return Array.isArray(d)?d:[]; }
    catch { toast.error('Erro ao carregar conversas'); return []; }
  },[]);

  useEffect(()=>{
    async function init(){
      setLoading(true);
      const d=await loadConvs();
      if(initialContact){
        try {
          const conv=await convsApi.orCreate(initialContact.id);
          const full={...conv,contact_name:initialContact.name,contact_phone:initialContact.phone};
          setActive(full);
          setConvs(prev=>prev.some(c=>c.id===full.id)?prev:[full,...prev]);
        } catch{}
      } else if(d.length>0){ setActive(d[0]); }
      setLoading(false);
    }
    init();
  },[initialContact,loadConvs]);

  useEffect(()=>{
    if(active?.id) convsApi.messages(active.id).then(msgs=>{ setMessages(msgs); setTimeout(()=>scrollToBottom(true),50); }).catch(()=>{});
  },[active?.id]);

  useEffect(()=>{
    const handle=(data)=>{
      if(active&&data.conversation?.id===active.id){
        setMessages(prev=>prev.some(m=>m.id===data.message.id)?prev:[...prev,data.message]);
        setTimeout(scrollToBottom,100);
      }
      if(data.conversation){
        setConvs(prev=>{
          const idx=prev.findIndex(c=>c.id===data.conversation.id);
          if(idx===-1) return [data.conversation,...prev];
          const updated=[...prev]; updated[idx]={...updated[idx],...data.conversation};
          return updated.sort((a,b)=>new Date(b.last_message_at)-new Date(a.last_message_at));
        });
      }
    };
    socket.on('new_message',handle);
    return ()=>socket.off('new_message',handle);
  },[active,scrollToBottom]);

  const prevMsgCount = useRef(0);
  useEffect(()=>{
    const isNew = messages.length > prevMsgCount.current;
    prevMsgCount.current = messages.length;
    if(isNew) scrollToBottom();
  },[messages,scrollToBottom]);

  const send=async()=>{
    if(mediaPreview) { await sendMedia(); return; }
    if(!input.trim()||!active||sending) return;
    const text=input; setSending(true); setInput('');
    try {
      const sent=await convsApi.sendMessage(active.id,{content:text});
      setMessages(prev=>prev.some(m=>m.id===sent.id)?prev:[...prev,sent]);
    } catch { toast.error('Erro ao enviar mensagem'); setInput(text); }
    finally { setSending(false); }
  };

  const sendMedia=async()=>{
    if(!mediaPreview||!active||sending) return;
    setSending(true);
    const preview=mediaPreview;
    setMediaPreview(null);
    const caption=input.trim(); setInput('');
    try {
      const sent=await convsApi.sendMedia(active.id,{
        type: preview.type,
        base64: preview.base64,
        content: caption||null,
      });
      setMessages(prev=>prev.some(m=>m.id===sent.id)?prev:[...prev,{
        ...sent,
        media_url: sent.media_url || preview.url,
      }]);
    } catch(e) { toast.error('Erro ao enviar mídia: '+(e?.response?.data?.error||e?.message||'')); setMediaPreview(preview); }
    finally { setSending(false); }
  };

  const handleFileChange=async(e)=>{
    const file=e.target.files?.[0];
    if(!file) return;
    e.target.value='';
    const reader=new FileReader();
    reader.onload=()=>{
      setMediaPreview({ type:'image', url: reader.result, base64: reader.result, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const toggleRecording=async()=>{
    if(recording){
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mr=new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')?'audio/ogg;codecs=opus':'audio/webm' });
      audioChunksRef.current=[];
      mr.ondataavailable=e=>audioChunksRef.current.push(e.data);
      mr.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(audioChunksRef.current,{type: mr.mimeType});
        const url=URL.createObjectURL(blob);
        const reader=new FileReader();
        reader.onload=()=>setMediaPreview({type:'audio', url, base64: reader.result, mimeType: mr.mimeType});
        reader.readAsDataURL(blob);
        setRecording(false);
      };
      mr.start();
      mediaRecorderRef.current=mr;
      setRecording(true);
    } catch { toast.error('Permissão de microfone negada'); }
  };

  const showList = !isMobile || !active;
  const showChat = !isMobile || !!active;

  return (
    <>
    <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'320px 1fr',flex:1,overflow:'hidden',minHeight:0}}>

      {/* Lista */}
      {showList && (
        <div style={{borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',background:'#0d1117',minHeight:0,overflow:'hidden'}}>
          <div style={{padding:'14px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'#131720',flexShrink:0}}>
            <h3 style={{fontSize:15,fontWeight:700,color:C.text}}>Conversas</h3>
            <button onClick={loadConvs} style={{background:'none',border:'none',color:'#00a884',cursor:'pointer',fontSize:18,padding:4}} title="Atualizar">↻</button>
          </div>
          <div ref={listScrollRef} style={{flex:1,overflowY:'scroll'}}>
            {loading&&<div style={{padding:40,textAlign:'center',color:C.dim,fontSize:13}}>Carregando...</div>}
            {!loading&&convs.length===0&&<EmptyState icon="💬" title="Sem conversas" desc="Mensagens recebidas pelo WhatsApp aparecerão aqui automaticamente." />}
            {convs.map(c=>(
              <div key={c.id}
                onClick={()=>{ setActive(c); if(c.unread_count>0){ convsApi.markRead(c.id).catch(()=>{}); setConvs(prev=>prev.map(x=>x.id===c.id?{...x,unread_count:0}:x)); } }}
                style={{
                  padding:'13px 16px',cursor:'pointer',borderBottom:`1px solid ${C.border}20`,
                  background:active?.id===c.id?`${C.primary}18`:'transparent',
                  borderLeft:active?.id===c.id?`3px solid ${C.primary}`:'3px solid transparent',
                  transition:'background 0.15s', position:'relative',
                }}
                onMouseOver={e=>{ e.currentTarget.style.background=active?.id===c.id?`${C.primary}18`:'#ffffff06'; const btn=e.currentTarget.querySelector('.unread-btn'); if(btn) btn.style.display='flex'; }}
                onMouseOut={e=>{ e.currentTarget.style.background=active?.id===c.id?`${C.primary}18`:'transparent'; const btn=e.currentTarget.querySelector('.unread-btn'); if(btn) btn.style.display='none'; }}>
                <div style={{display:'flex',gap:12,alignItems:'center'}}>
                  <Avatar name={c.contact_name||'?'} size={44} />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontWeight:c.unread_count>0?700:600,fontSize:14,color:C.text}}>{c.contact_name||'Desconhecido'}</span>
                      <span style={{fontSize:10,color:C.dim}}>{fmtTime(c.last_message_at)}</span>
                    </div>
                    <div style={{fontSize:12,color:c.unread_count>0?C.muted:C.dim,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',fontWeight:c.unread_count>0?600:400}}>{c.last_message||'Sem mensagens'}</div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                    {c.unread_count>0&&<div style={{minWidth:20,height:20,borderRadius:10,background:'#00a884',color:'#fff',fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 5px'}}>{c.unread_count>99?'99+':c.unread_count}</div>}
                    <button className="unread-btn" onClick={e=>{ e.stopPropagation(); convsApi.markUnread(c.id).catch(()=>{}); setConvs(prev=>prev.map(x=>x.id===c.id?{...x,unread_count:(x.unread_count||0)+1}:x)); toast.success('Marcado como não lida'); }}
                      title="Marcar como não lida"
                      style={{display:'none',background:`${C.primary}25`,border:`1px solid ${C.primary}40`,color:C.primary,borderRadius:6,padding:'2px 6px',cursor:'pointer',fontSize:10,fontWeight:700,alignItems:'center',gap:3}}>
                      ● não lida
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat */}
      {showChat && (
        <div style={{display:'flex',flexDirection:'column',background:'#0b141a',minHeight:0,overflow:'hidden'}}>
          {active ? (
            <>
              <div style={{padding:'12px 16px',background:'#1f2c34',borderBottom:`1px solid #2a2d3e`,display:'flex',alignItems:'center',gap:12}}>
                {isMobile && (
                  <button onClick={()=>setActive(null)} style={{background:'none',border:'none',color:'#8696a0',cursor:'pointer',fontSize:22,padding:'0 8px 0 0',lineHeight:1}}>←</button>
                )}
                <div onClick={()=>active.contact_id && setContactDrawerId(active.contact_id)} style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',flex:1}} title="Ver ficha do contato">
                  <Avatar name={active.contact_name||'?'} size={40} />
                  <div>
                    <div style={{fontWeight:600,color:'#e9edef',fontSize:15}}>{active.contact_name||'Desconhecido'}</div>
                    <div style={{fontSize:12,color:'#8696a0'}}>{active.contact_phone||''}</div>
                  </div>
                </div>
              </div>
              <div style={{flex:1,overflowY:'scroll',minHeight:0,padding:isMobile?'12px 12px':'20px 48px',display:'flex',flexDirection:'column',gap:4,background:'#0b141a'}}>
                <div style={{marginTop:'auto'}} />
                {messages.length===0&&<div style={{marginBottom:'auto',textAlign:'center',padding:'40px 0',color:'#8696a0',fontSize:13}}>Nenhuma mensagem ainda</div>}
                {messages.map(m=>(
                  <div key={m.id} style={{alignSelf:m.direction==='outbound'?'flex-end':'flex-start',maxWidth:'80%',marginBottom:2}}>
                    <div style={{
                      background:m.direction==='outbound'?'#005c4b':'#1f2c34',
                      color:'#e9edef',padding:'8px 12px',borderRadius:8,
                      borderBottomRightRadius:m.direction==='outbound'?2:8,
                      borderBottomLeftRadius:m.direction==='outbound'?8:2,
                      fontSize:14,lineHeight:1.5,boxShadow:'0 1px 2px rgba(0,0,0,0.3)',
                    }}>
                      {m.type === 'image' && m.media_url ? (
                        <img src={m.media_url} alt="imagem" style={{maxWidth:'100%',borderRadius:6,display:'block',cursor:'pointer'}} onClick={()=>window.open(m.media_url,'_blank')} />
                      ) : m.type === 'image' ? (
                        <div style={{display:'flex',alignItems:'center',gap:8,color:'#8696a0',fontSize:13,padding:'4px 0'}}>
                          <span style={{fontSize:22}}>🖼️</span><span>Imagem</span>
                        </div>
                      ) : m.type === 'audio' && m.media_url ? (
                        <audio controls src={m.media_url} style={{maxWidth:'240px',height:36,display:'block'}} />
                      ) : m.type === 'audio' ? (
                        <div style={{display:'flex',alignItems:'center',gap:8,color:'#8696a0',fontSize:13,padding:'4px 0'}}>
                          <span style={{fontSize:22}}>🎵</span><span>Áudio</span>
                        </div>
                      ) : m.type === 'video' && m.media_url ? (
                        <video controls src={m.media_url} style={{maxWidth:'100%',borderRadius:6,display:'block'}} />
                      ) : m.type === 'video' ? (
                        <div style={{display:'flex',alignItems:'center',gap:8,color:'#8696a0',fontSize:13,padding:'4px 0'}}>
                          <span style={{fontSize:22}}>🎬</span><span>Vídeo</span>
                        </div>
                      ) : m.type === 'document' && m.media_url ? (
                        <a href={m.media_url} download style={{color:'#53bdeb',textDecoration:'none',display:'flex',alignItems:'center',gap:6}}>
                          <span style={{fontSize:20}}>📄</span>
                          <span style={{fontSize:13}}>{m.content||'Documento'}</span>
                        </a>
                      ) : m.type === 'document' ? (
                        <div style={{display:'flex',alignItems:'center',gap:8,color:'#8696a0',fontSize:13,padding:'4px 0'}}>
                          <span style={{fontSize:22}}>📄</span><span>{m.content||'Documento'}</span>
                        </div>
                      ) : m.type==='sticker' ? (
                        <span style={{fontSize:13,color:'#8696a0',fontStyle:'italic'}}>🖼️ figurinha</span>
                      ) : m.type==='location' ? (
                        <span style={{fontSize:13}}>📍 {m.content}</span>
                      ) : (
                        <span style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{m.content}</span>
                      )}
                      {['image','video'].includes(m.type) && m.media_url && m.content && !['[imagem]','[vídeo]','[mídia]'].includes(m.content) && (
                        <span style={{display:'block',fontSize:13,marginTop:4,whiteSpace:'pre-wrap'}}>{m.content}</span>
                      )}
                    </div>
                    <div style={{fontSize:11,color:'#8696a0',marginTop:2,textAlign:m.direction==='outbound'?'right':'left',display:'flex',alignItems:'center',justifyContent:m.direction==='outbound'?'flex-end':'flex-start',gap:4}}>
                      {new Date(m.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                      {m.direction==='outbound'&&<span style={{color:'#53bdeb',fontSize:13}}>✓✓</span>}
                    </div>
                  </div>
                ))}
                <div ref={msgEndRef} />
              </div>
              {/* Prévia de mídia */}
              {mediaPreview && (
                <div style={{padding:'8px 16px',background:'#1a2530',borderTop:'1px solid #2a3942',display:'flex',alignItems:'center',gap:12}}>
                  {mediaPreview.type==='image' ? (
                    <img src={mediaPreview.url} alt="preview" style={{height:72,borderRadius:8,objectFit:'cover',border:'1px solid #2a3942'}} />
                  ) : (
                    <div style={{display:'flex',alignItems:'center',gap:8,background:'#2a3942',borderRadius:8,padding:'8px 12px'}}>
                      <Mic size={18} color='#00a884' />
                      <audio controls src={mediaPreview.url} style={{height:32,maxWidth:200}} />
                    </div>
                  )}
                  <button onClick={()=>setMediaPreview(null)} style={{background:'none',border:'none',color:'#8696a0',cursor:'pointer',padding:4}} title="Remover">
                    <X size={18} />
                  </button>
                </div>
              )}
              {/* Barra de digitação */}
              <div style={{padding:'10px 12px',background:'#1f2c34',display:'flex',alignItems:'center',gap:8}}>
                {!perms.send_messages ? (
                  <div style={{flex:1,padding:'10px 14px',color:C.dim,fontSize:13,background:'#2a3942',borderRadius:10,display:'flex',alignItems:'center',gap:8}}>
                    🔒 <span>Sem permissão para enviar mensagens</span>
                  </div>
                ) : (<>
                <input type="file" ref={fileInputRef} accept="image/*" style={{display:'none'}} onChange={handleFileChange} />
                <button onClick={()=>fileInputRef.current?.click()} disabled={recording}
                  title="Enviar imagem"
                  style={{background:'none',border:'none',color:recording?'#444':'#8696a0',cursor:recording?'default':'pointer',padding:6,borderRadius:8,flexShrink:0,display:'flex',alignItems:'center',transition:'color 0.15s'}}
                  onMouseOver={e=>{ if(!recording) e.currentTarget.style.color='#00a884'; }}
                  onMouseOut={e=>{ e.currentTarget.style.color=recording?'#444':'#8696a0'; }}>
                  <Paperclip size={20} />
                </button>
                <button onClick={toggleRecording}
                  title={recording?'Parar gravação':'Gravar áudio'}
                  style={{background:recording?'#ef444420':'none',border:recording?'1px solid #ef4444':'none',color:recording?'#ef4444':'#8696a0',cursor:'pointer',padding:6,borderRadius:8,flexShrink:0,display:'flex',alignItems:'center',transition:'all 0.15s'}}
                  onMouseOver={e=>{ if(!recording) e.currentTarget.style.color='#00a884'; }}
                  onMouseOut={e=>{ if(!recording) e.currentTarget.style.color='#8696a0'; }}>
                  {recording ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <input value={input} onChange={e=>setInput(e.target.value)}
                  onKeyPress={e=>e.key==='Enter'&&!e.shiftKey&&send()}
                  placeholder={recording?'Gravando... clique no mic para parar':mediaPreview?'Legenda (opcional)...':'Digite sua mensagem...'}
                  disabled={recording}
                  style={{flex:1,background:'#2a3942',border:'none',borderRadius:10,padding:'11px 15px',color:'#d1d7db',outline:'none',fontSize:14,fontFamily:'inherit',opacity:recording?0.5:1}} />
                <button onClick={send}
                  disabled={sending||recording||(!input.trim()&&!mediaPreview)}
                  title="Enviar"
                  style={{background:'#00a884',border:'none',borderRadius:10,padding:'9px 14px',cursor:'pointer',color:'#fff',display:'flex',alignItems:'center',opacity:(sending||recording||(!input.trim()&&!mediaPreview))?0.5:1,transition:'opacity 0.15s',flexShrink:0}}>
                  <Send size={18} />
                </button>
                </>)}
              </div>
            </>
          ) : (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,color:C.dim,height:'100%'}}>
              <div style={{fontSize:64}}>💬</div>
              <p style={{fontSize:15}}>Selecione uma conversa para começar</p>
            </div>
          )}
        </div>
      )}
    </div>
    {contactDrawerId && (
      <ContactDrawer
        contactId={contactDrawerId}
        onClose={()=>setContactDrawerId(null)}
        onEdit={(c)=>{ setEditContact(c); setEditForm({name:c.name,phone:c.phone,email:c.email||'',company:c.company||'',pipeline_value:c.pipeline_value||'',notes:c.notes||''}); setEditTags(parseTags(c.tags)); setEditTagInput(''); }}
        onDelete={()=>setContactDrawerId(null)}
        onRefreshList={()=>{}}
        onOpenConversation={(c)=>{ setContactDrawerId(null); window.dispatchEvent(new CustomEvent('switchTab',{detail:{tab:'conversations',activeConv:c}})); }}
      />
    )}
    {editContact && (
      <Modal open={!!editContact} onClose={()=>setEditContact(null)} title="Editar Contato" maxWidth={620}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <FocusInput label="Nome" value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})} required autoFocus />
            <FocusInput label="Telefone" value={editForm.phone} onChange={e=>setEditForm({...editForm,phone:e.target.value})} required />
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <FocusInput label="E-mail" type="email" value={editForm.email} onChange={e=>setEditForm({...editForm,email:e.target.value})} />
            <FocusInput label="Empresa" value={editForm.company} onChange={e=>setEditForm({...editForm,company:e.target.value})} />
          </div>
          <FocusInput label="Valor no Pipeline (R$)" value={editForm.pipeline_value} onChange={e=>setEditForm({...editForm,pipeline_value:e.target.value})} />
          <div>
            <label style={{display:'block',color:C.muted,fontSize:11,fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em'}}>Tags</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
              {editTags.map(t=><span key={t} style={{background:`${C.primary}20`,color:C.primary,padding:'3px 10px',borderRadius:20,fontSize:12,display:'flex',alignItems:'center',gap:6,border:`1px solid ${C.primary}30`}}>{t}<button onClick={()=>setEditTags(editTags.filter(x=>x!==t))} style={{background:'none',border:'none',color:C.primary,cursor:'pointer',fontSize:14,lineHeight:1,padding:0}}>×</button></span>)}
            </div>
            <div style={{display:'flex',gap:8}}>
              <input placeholder="Nova tag..." value={editTagInput} onChange={e=>setEditTagInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); const t=editTagInput.trim(); if(t&&!editTags.includes(t)) setEditTags([...editTags,t]); setEditTagInput(''); }}}
                style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontSize:13,outline:'none'}} />
              <Btn size="sm" variant="secondary" onClick={()=>{ const t=editTagInput.trim(); if(t&&!editTags.includes(t)) setEditTags([...editTags,t]); setEditTagInput(''); }}>+ Add</Btn>
            </div>
          </div>
          <FocusInput label="Notas" value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})} textarea rows={3} />
          <div style={{display:'flex',gap:12,justifyContent:'flex-end',borderTop:`1px solid ${C.border}`,paddingTop:20,marginTop:4}}>
            <Btn variant="outline" onClick={()=>setEditContact(null)}>Cancelar</Btn>
            <Btn onClick={async()=>{ try{ await contactsApi.update(editContact.id,{...editForm,tags:editTags,pipeline_value:Number(editForm.pipeline_value)||0}); toast.success('Contato atualizado!'); setEditContact(null); setContactDrawerId(editContact.id); }catch(e){ toast.error('Erro ao salvar'); }}}>💾 Salvar Alterações</Btn>
          </div>
        </div>
      </Modal>
    )}
    </>
  );
}

// ─── Pipeline Kanban ─────────────────────────────────────────────────────────

function Pipeline() {
  const perms = getUserPermissions();
  const [funnels, setFunnels]   = useState([]);
  const [activeFunnel, setActiveFunnel] = useState(null);
  const [stages, setStages]     = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const wasDragging = useRef(false);

  const loadFunnels = useCallback(async () => {
    try {
      const fs = await pipelineApi.funnels();
      setFunnels(fs);
      if (fs.length > 0 && !activeFunnel) setActiveFunnel(fs[0].id);
    } catch { toast.error('Erro ao carregar funis'); }
  }, []);

  const loadStages = useCallback(async (funnelId) => {
    if (!funnelId) return;
    setLoading(true);
    try {
      const [s, c] = await Promise.all([pipelineApi.stages(funnelId), contactsApi.list()]);
      setStages(s);
      setContacts(Array.isArray(c.contacts) ? c.contacts : []);
    } catch { toast.error('Erro ao carregar pipeline'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadFunnels(); }, [loadFunnels]);
  useEffect(() => { if (activeFunnel) loadStages(activeFunnel); }, [activeFunnel, loadStages]);

  const handleDrop = async (e, targetStageId) => {
    e.preventDefault();
    if (!dragging || dragging.stage === targetStageId) { setDragging(null); setDragOver(null); return; }
    setContacts(prev => prev.map(c => c.id === dragging.id ? { ...c, pipeline_stage: targetStageId } : c));
    try { await contactsApi.setStage(dragging.id, targetStageId); toast.success('Contato movido!'); }
    catch { setContacts(prev => prev.map(c => c.id === dragging.id ? { ...c, pipeline_stage: dragging.stage } : c)); toast.error('Erro ao mover'); }
    setDragging(null); setDragOver(null);
  };

  const stageIds = new Set(stages.map(s => s.id));
  const visibleContacts = contacts.filter(c => stageIds.has(c.pipeline_stage));
  const totalValue = visibleContacts.reduce((a, c) => a + (Number(c.pipeline_value) || 0), 0);

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{fontSize:28,fontWeight:800,color:C.text,marginBottom:4}}>Pipeline Kanban</h2>
          <p style={{color:C.dim,fontSize:14}}>Arraste os cartões entre colunas para mover leads no funil.</p>
        </div>
        {totalValue > 0 && (
          <div style={{background:`${C.success}15`,border:`1px solid ${C.success}30`,borderRadius:12,padding:'8px 16px',fontSize:13,fontWeight:700,color:C.success}}>
            💰 {fmt(totalValue)}
          </div>
        )}
      </div>

      {/* Seletor de funil */}
      {funnels.length > 1 && (
        <div style={{display:'flex',gap:4,background:C.surface,borderRadius:14,padding:4,border:`1px solid ${C.border}`,width:'fit-content'}}>
          {funnels.map(f => (
            <button key={f.id} onClick={() => setActiveFunnel(f.id)} style={{
              padding:'8px 20px',borderRadius:10,border:'none',cursor:'pointer',fontSize:13,fontWeight:700,
              background: activeFunnel === f.id ? `linear-gradient(135deg,${C.primary},${C.purple})` : 'transparent',
              color: activeFunnel === f.id ? '#fff' : C.muted, transition:'all 0.18s',
            }}>{f.name}</button>
          ))}
        </div>
      )}

      {loading ? <div style={{color:C.dim,padding:20}}>Carregando pipeline...</div> : (
        <div style={{overflowX:'auto',paddingBottom:20}}>
          <div style={{display:'flex',gap:20,minWidth:stages.length*288}}>
            {stages.map(s => {
              const sc = contacts.filter(c => c.pipeline_stage === s.id);
              const sv = sc.reduce((a, c) => a + (Number(c.pipeline_value) || 0), 0);
              const color = s.color || STAGE_COLORS[s.id] || C.primary;
              const isDrag = dragOver === s.id;
              return (
                <div key={s.id} style={{width:280,flexShrink:0}}
                  onDragOver={e=>{ e.preventDefault(); setDragOver(s.id); }}
                  onDragLeave={e=>{ if(!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
                  onDrop={e=>handleDrop(e,s.id)}>
                  <div style={{background:C.card,borderRadius:18,padding:16,border:`1px solid ${isDrag?color:C.border}`,transition:'border-color 0.2s,box-shadow 0.2s',boxShadow:isDrag?`0 0 24px ${color}30`:'none'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:10,height:10,borderRadius:'50%',background:color,boxShadow:`0 0 6px ${color}`}} />
                        <span style={{fontSize:13,fontWeight:700,color:C.text}}>{s.name}</span>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{background:`${color}20`,color,fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:10}}>{sc.length}</div>
                        {sv>0&&<div style={{fontSize:10,color:C.success,fontWeight:700,marginTop:2}}>{fmt(sv)}</div>}
                      </div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:10,minHeight:80}}>
                      {sc.map(c=>(
                        <div key={c.id} draggable={!!perms.move_cards}
                          onDragStart={e=>{ if(!perms.move_cards) return; wasDragging.current=true; setDragging({id:c.id,stage:c.pipeline_stage}); e.dataTransfer.effectAllowed='move'; }}
                          onDragEnd={()=>{ setDragging(null); setDragOver(null); setTimeout(()=>{ wasDragging.current=false; },50); }}
                          onClick={()=>{ if(!wasDragging.current && perms.view_contacts) setSelectedContact(c.id); }}
                          style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:14,cursor: perms.view_contacts ? 'pointer' : 'default',transition:'all 0.15s',opacity:dragging?.id===c.id?0.35:1,position:'relative'}}
                          onMouseOver={e=>{ e.currentTarget.style.borderColor=color; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)'; }}
                          onMouseOut={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
                          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                            <Avatar name={c.name} size={30} />
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:600,fontSize:13,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
                              <div style={{color:C.dim,fontSize:11}}>{c.phone}</div>
                            </div>
                            {!perms.view_contacts && <span title="Sem permissão para ver ficha" style={{fontSize:12,color:C.dim}}>🔒</span>}
                          </div>
                          {c.pipeline_value>0&&<div style={{fontSize:12,color:C.success,fontWeight:700}}>{fmt(c.pipeline_value)}</div>}
                          {c.company&&<div style={{fontSize:11,color:C.dim,marginTop:4}}>🏢 {c.company}</div>}
                        </div>
                      ))}
                      {sc.length===0&&(
                        <div style={{border:`2px dashed ${isDrag?color:C.border}`,borderRadius:12,padding:'24px 16px',textAlign:'center',color:isDrag?color:C.dim,fontSize:12,transition:'all 0.2s'}}>
                          {isDrag?'↓ Soltar aqui':'Vazio'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedContact && (
        <ContactDrawer
          contactId={selectedContact}
          onClose={() => setSelectedContact(null)}
          onEdit={() => { setSelectedContact(null); loadStages(activeFunnel); }}
          onDelete={() => { setSelectedContact(null); loadStages(activeFunnel); }}
          onOpenConversation={(c)=>{ setSelectedContact(null); window.dispatchEvent(new CustomEvent('switchTab',{detail:{tab:'conversations',activeConv:c}})); }}
          onRefreshList={() => loadStages(activeFunnel)}
          canEdit={!!perms.edit_contacts}
        />
      )}
    </div>
  );
}

// ─── Broadcasts ───────────────────────────────────────────────────────────────

function Broadcasts() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({name:'',message:'',target_tags:[]});
  const [tagInput, setTagInput] = useState('');
  const [sending, setSending] = useState({});

  const load=async()=>{
    try { const d=await broadcastsApi.list(); setList(Array.isArray(d)?d:[]); }
    catch { toast.error('Erro ao carregar campanhas'); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const handleCreate=async()=>{
    if(!form.name.trim()||!form.message.trim()) return toast.error('Nome e mensagem são obrigatórios');
    try {
      await broadcastsApi.create(form);
      toast.success('Campanha criada!');
      setShowCreate(false); setForm({name:'',message:'',target_tags:[]}); load();
    } catch { toast.error('Erro ao criar campanha'); }
  };

  const handleSend=async(id,name)=>{
    if(!confirm(`Disparar a campanha "${name}"?\n\nIsso enviará mensagens para os contatos selecionados.`)) return;
    setSending(p=>({...p,[id]:true}));
    try { const r=await broadcastsApi.send(id); toast.success(`🚀 Disparando para ${r.total} contatos!`); setTimeout(load,2000); }
    catch(err){ toast.error(err.response?.data?.error||'Erro ao disparar'); }
    finally { setSending(p=>({...p,[id]:false})); }
  };

  const addTag=()=>{ const t=tagInput.trim(); if(t&&!form.target_tags.includes(t)) setForm({...form,target_tags:[...form.target_tags,t]}); setTagInput(''); };

  const ST={ draft:{color:C.dim,label:'Rascunho'}, running:{color:C.warning,label:'Enviando…'}, finished:{color:C.success,label:'Concluído'}, failed:{color:C.danger,label:'Falhou'} };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div>
          <h2 style={{fontSize:28,fontWeight:800,color:C.text,marginBottom:4}}>Disparos em Massa</h2>
          <p style={{color:C.dim,fontSize:14}}>Envie campanhas para múltiplos contatos via WhatsApp.</p>
        </div>
        <Btn onClick={()=>setShowCreate(true)}>+ Nova Campanha</Btn>
      </div>

      {loading?(<div style={{color:C.dim}}>Carregando...</div>):list.length===0?(
        <EmptyState icon="📢" title="Nenhuma campanha ainda" desc="Crie sua primeira campanha para disparar mensagens em massa com delay anti-ban automático." action={<Btn size="sm" onClick={()=>setShowCreate(true)}>+ Criar Campanha</Btn>} />
      ):(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:20}}>
          {list.map(b=>{
            const pct=b.total_count>0?Math.round(((b.sent_count+b.failed_count)/b.total_count)*100):0;
            const st=ST[b.status]||ST.draft;
            return (
              <div key={b.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,overflow:'hidden'}}>
                <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontWeight:700,color:C.text,fontSize:15,marginBottom:2}}>{b.name}</div>
                    <div style={{fontSize:11,color:C.dim}}>{fmtDate(b.created_at)}</div>
                  </div>
                  <Badge color={st.color}>{st.label}</Badge>
                </div>
                <div style={{padding:'16px 20px'}}>
                  <p style={{fontSize:13,color:C.muted,lineHeight:1.7,marginBottom:16,maxHeight:56,overflow:'hidden'}}>{b.message}</p>
                  {b.total_count>0&&(
                    <div style={{marginBottom:16}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.dim,marginBottom:6}}><span>Progresso</span><span>{pct}%</span></div>
                      <div style={{height:6,background:C.bg,borderRadius:3}}><div style={{height:'100%',borderRadius:3,background:`linear-gradient(90deg,${C.success},${C.teal})`,width:`${pct}%`,transition:'width 0.5s'}} /></div>
                    </div>
                  )}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,paddingTop:12,borderTop:`1px solid ${C.border}`,marginBottom:16}}>
                    {[['Total',b.total_count,C.text],['Sucesso',b.sent_count,C.success],['Falha',b.failed_count,C.danger]].map(([l,v,c])=>(
                      <div key={l} style={{textAlign:'center'}}>
                        <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
                        <div style={{fontSize:10,color:C.dim,textTransform:'uppercase',letterSpacing:'0.05em'}}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {b.status==='draft'&&(
                    <Btn variant="success" style={{width:'100%',justifyContent:'center'}} onClick={()=>handleSend(b.id,b.name)} disabled={!!sending[b.id]}>
                      {sending[b.id]?'⏳ Iniciando...':'🚀 Disparar Campanha'}
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title="Nova Campanha de Disparo">
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <FocusInput label="Nome da campanha" placeholder="Promoção de Verão 2025" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required autoFocus />
          <FocusInput label="Mensagem" placeholder="Olá! Temos uma oferta especial para você..." value={form.message} onChange={e=>setForm({...form,message:e.target.value})} textarea rows={5} required hint={`${form.message.length} caracteres`} />
          <div>
            <label style={{display:'block',color:C.muted,fontSize:11,fontWeight:700,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em'}}>Filtrar por Tags (opcional)</label>
            <p style={{fontSize:12,color:C.dim,marginBottom:10}}>Deixe vazio para disparar para <b style={{color:C.muted}}>todos os contatos ativos</b>.</p>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
              {form.target_tags.map(t=>(
                <span key={t} style={{background:`${C.primary}20`,color:C.primary,padding:'3px 10px',borderRadius:20,fontSize:12,display:'flex',alignItems:'center',gap:6,border:`1px solid ${C.primary}30`}}>
                  {t}<button onClick={()=>setForm({...form,target_tags:form.target_tags.filter(x=>x!==t)})} style={{background:'none',border:'none',color:C.primary,cursor:'pointer',padding:0,fontSize:14,lineHeight:1}}>×</button>
                </span>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              <input placeholder="Tag... (Enter)" value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addTag())}
                style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:C.text,fontSize:13,outline:'none'}} />
              <Btn size="sm" variant="secondary" onClick={addTag}>+ Add</Btn>
            </div>
          </div>
          <div style={{background:`${C.warning}12`,border:`1px solid ${C.warning}30`,borderRadius:12,padding:14,fontSize:12,color:C.warning,display:'flex',gap:10,alignItems:'flex-start'}}>
            <span style={{fontSize:16,flexShrink:0}}>⚠️</span>
            <span>Mensagens enviadas com <b>delay de 2–5 segundos</b> entre cada envio para evitar bloqueio do WhatsApp.</span>
          </div>
          <div style={{display:'flex',gap:12,justifyContent:'flex-end',borderTop:`1px solid ${C.border}`,paddingTop:20,marginTop:4}}>
            <Btn variant="outline" onClick={()=>setShowCreate(false)}>Cancelar</Btn>
            <Btn onClick={handleCreate}>✨ Criar Campanha</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function Settings() {
  const [tab, setTab] = useState('whatsapp');
  const [config, setConfig] = useState(null);
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(true);
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('crm_user') || 'null'); } catch { return null; } })();
  const isAdmin = ['master','admin'].includes(currentUser?.role);

  useEffect(()=>{ fetch('/api/whatsapp/config', { headers:{ Authorization:`Bearer ${localStorage.getItem('crm_token')}` } }).then(r=>r.json()).then(d=>{ setConfig(d); setLoading(false); }).catch(()=>setLoading(false)); },[]);

  const copy=(text,label)=>navigator.clipboard.writeText(text).then(()=>toast.success(`${label} copiado!`));
  const authHdr=()=>({ Authorization:`Bearer ${localStorage.getItem('crm_token')}` });
  const testWebhook=async()=>{ try{ await fetch('/api/whatsapp/test-webhook',{method:'POST',headers:authHdr()}); toast.success('Mensagem de teste enviada!'); }catch{ toast.error('Erro ao testar'); } };
  const simulateInbound=async()=>{
    try {
      await fetch('/webhook/evolution',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({event:"messages.upsert",instance:config?.instance||'default',data:{messages:[{key:{remoteJid:"5511988887777@s.whatsapp.net",fromMe:false,id:"SIM_"+Date.now()},pushName:"Lead Teste",message:{conversation:"Olá! Mensagem de teste."},messageTimestamp:Math.floor(Date.now()/1000)}]}})});
      toast.success('Simulação enviada! Verifique em Conversas.');
    } catch { toast.error('Erro na simulação'); }
  };
  const setupWebhook=async()=>{
    try {
      const r=await fetch('/api/whatsapp/setup-webhook',{method:'POST',headers:authHdr()});
      const d=await r.json();
      if(d.success) toast.success('Webhook configurado na Evolution API!');
      else throw new Error(d.error);
    } catch(err){ toast.error('Erro: '+err.message); }
  };
  const saveConfig=async()=>{
    try {
      const r=await fetch('/api/whatsapp/config',{method:'POST',headers:{'Content-Type':'application/json',...authHdr()},body:JSON.stringify(config)});
      const d=await r.json();
      if(d.success) toast.success('Configurações salvas!');
    } catch { toast.error('Erro ao salvar'); }
  };
  const loadDebug=async()=>{
    try { const r=await fetch('/api/debug/db'); const d=await r.json(); setDebugData(d); toast.success('Debug carregado!'); }
    catch { toast.error('Erro (disponível apenas em modo dev)'); }
  };

  if(loading) return <div style={{padding:20,color:C.dim}}>Carregando...</div>;

  const Section=({title,icon,children})=>(
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,overflow:'hidden',marginBottom:20}}>
      <div style={{padding:'18px 24px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:20}}>{icon}</span>
        <h3 style={{fontSize:15,fontWeight:700,color:C.text}}>{title}</h3>
      </div>
      <div style={{padding:24}}>{children}</div>
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',maxWidth:740}}>
      <div style={{marginBottom:24}}>
        <h2 style={{fontSize:28,fontWeight:800,color:C.text,marginBottom:4}}>Configurações</h2>
        <p style={{color:C.dim,fontSize:14}}>Gerencie integrações e usuários do sistema.</p>
      </div>

      {/* Abas */}
      <div style={{display:'flex',gap:4,marginBottom:24,background:C.surface,borderRadius:14,padding:4,border:`1px solid ${C.border}`,width:'fit-content',flexWrap:'wrap'}}>
        {[
          {id:'whatsapp', label:'⚙️ WhatsApp'},
          {id:'funnels',  label:'🎯 Funis'},
          {id:'fields',   label:'🗂️ Campos'},
          ...(isAdmin ? [{id:'instances', label:'📱 Instâncias'}] : []),
          ...(isAdmin ? [{id:'users', label:'👥 Usuários'}] : []),
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'8px 18px',borderRadius:10,border:'none',cursor:'pointer',fontSize:13,fontWeight:700,
            background:tab===t.id?`linear-gradient(135deg,${C.primary},${C.purple})`:'transparent',
            color:tab===t.id?'#fff':C.muted,transition:'all 0.18s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'funnels'    && <FunnelManagement />}
      {tab === 'fields'     && <CustomFieldsManagement />}
      {tab === 'instances'  && isAdmin && <InstancesManagement />}
      {tab === 'users'      && isAdmin && <UserManagement />}

      {tab === 'whatsapp' && <><Section title="Integração Evolution API" icon="🔗">
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          <div>
            <label style={{display:'block',color:C.muted,fontSize:11,fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em'}}>URL do Webhook (configure na Evolution API)</label>
            <div style={{display:'flex',gap:8}}>
              <input readOnly value={config?.webhook_url||''} style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:'11px 14px',color:C.primary,fontSize:13,fontWeight:600,outline:'none',fontFamily:'monospace'}} />
              <Btn size="sm" variant="secondary" onClick={()=>copy(config?.webhook_url,'URL')}>Copiar</Btn>
            </div>
            <p style={{fontSize:11,color:C.dim,marginTop:6}}>Cole esta URL em <b style={{color:C.muted}}>Configurations → Webhook</b> no painel da Evolution API.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <FocusInput label="Instância" value={config?.instance||''} onChange={e=>setConfig({...config,instance:e.target.value})} placeholder="NomeDaInstancia" />
            <FocusInput label="API URL" value={config?.api_url||''} onChange={e=>setConfig({...config,api_url:e.target.value})} placeholder="https://..." />
          </div>
          <FocusInput label="API Key" type="password" value={config?.api_key||''} onChange={e=>setConfig({...config,api_key:e.target.value})} placeholder="Sua chave de API" />
          <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
            <Btn variant="outline" size="sm" onClick={setupWebhook}>🔧 Configurar Webhook Auto</Btn>
            <Btn size="sm" onClick={saveConfig}>💾 Salvar</Btn>
          </div>
          {config?.forward_url&&(
            <div style={{background:`${C.warning}10`,border:`1px solid ${C.warning}25`,borderRadius:10,padding:14}}>
              <div style={{fontSize:12,color:C.warning,fontWeight:700,marginBottom:4}}>Forward Webhook Ativo</div>
              <div style={{fontSize:12,color:C.muted,fontFamily:'monospace'}}>{config.forward_url}</div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Integração n8n" icon="🤖">
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <p style={{fontSize:13,color:C.muted,lineHeight:1.6}}>Configure o n8n para enviar mensagens a este CRM usando o endpoint abaixo.</p>
          <div>
            <label style={{display:'block',color:C.dim,fontSize:12,marginBottom:6}}>Endpoint HTTP POST:</label>
            <div style={{display:'flex',gap:8}}>
              <code style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px',color:C.success,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:'monospace'}}>{config?.n8n_url}</code>
              <Btn size="sm" variant="secondary" onClick={()=>copy(config?.n8n_url,'URL n8n')}>Copiar</Btn>
            </div>
          </div>
          <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 16px'}}>
            <div style={{fontSize:11,color:C.dim,fontWeight:700,marginBottom:6,textTransform:'uppercase'}}>Headers obrigatórios:</div>
            <code style={{fontSize:12,color:C.muted,fontFamily:'monospace',lineHeight:2}}>Accept: application/json<br/>X-N8N-AUTH: viga-sales-crm</code>
          </div>
        </div>
      </Section>

      <Section title="Ferramentas de Teste" icon="🧪">
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:debugData?20:0}}>
          <Btn variant="outline" onClick={testWebhook}>🧪 Testar Webhook</Btn>
          <Btn variant="outline" onClick={simulateInbound}>📥 Simular Mensagem</Btn>
          <Btn variant="secondary" onClick={loadDebug}>🔍 Debug (dev)</Btn>
        </div>
        {debugData&&(
          <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:16,maxHeight:360,overflow:'auto'}}>
            <div style={{fontSize:12,color:C.primary,fontWeight:700,marginBottom:10}}>Últimos Webhooks:</div>
            {(debugData.webhookLogs||[]).length>0
              ? debugData.webhookLogs.map((l,i)=><div key={i} style={{marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${C.border}`,fontSize:11}}><div style={{color:C.warning}}>[{l.timestamp}] {l.event}</div><div style={{color:C.muted,marginTop:2}}>{l.summary}</div></div>)
              : <p style={{color:C.dim,fontSize:12}}>Nenhum webhook recebido ainda.</p>}
            <div style={{fontSize:12,color:C.primary,fontWeight:700,margin:'16px 0 10px'}}>Últimas Mensagens:</div>
            {(debugData.messages||[]).map(m=><div key={m.id} style={{marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${C.border}`,fontSize:11}}><div style={{color:m.direction==='inbound'?C.success:C.primary}}>[{m.direction}] {m.timestamp}</div><div style={{color:C.text}}>{m.content}</div></div>)}
            {(debugData.messages||[]).length===0&&<p style={{color:C.dim,fontSize:12}}>Nenhuma mensagem no banco.</p>}
          </div>
        )}
      </Section>

      <div style={{background:`${C.warning}10`,border:`1px solid ${C.warning}25`,borderRadius:14,padding:16,display:'flex',gap:12}}>
        <span style={{fontSize:20}}>💡</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:C.warning,marginBottom:4}}>Dica de Configuração</div>
          <p style={{fontSize:13,color:C.muted,lineHeight:1.6}}>Ative os eventos <b style={{color:C.muted}}>MESSAGES_UPSERT</b> e <b style={{color:C.muted}}>MESSAGES_UPDATE</b> na aba Webhook da sua Evolution API para receber mensagens em tempo real.</p>
        </div>
      </div>
    </>}
    </div>
  );
}

// ─── Custom Fields Management ─────────────────────────────────────────────────

function CustomFieldModal({ field, onClose, onDone }) {
  const [name, setName]       = useState(field?.name || '');
  const [fieldKey, setFieldKey] = useState(field?.field_key || '');
  const [type, setType]       = useState(field?.type || 'text');
  const [options, setOptions] = useState(() => {
    try { return field?.options ? JSON.parse(field.options).join('\n') : ''; } catch { return ''; }
  });
  const [saving, setSaving]   = useState(false);
  const tok = () => localStorage.getItem('crm_token');

  const autoKey = n => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');

  const onNameChange = v => {
    setName(v);
    if (!field) setFieldKey(autoKey(v));
  };

  const save = async () => {
    if (!name.trim()) return toast.error('Nome obrigatório');
    const key = fieldKey || autoKey(name);
    const optArr = type === 'select' ? options.split('\n').map(o=>o.trim()).filter(Boolean) : undefined;
    const body = { name: name.trim(), field_key: key, type, options: optArr };
    setSaving(true);
    try {
      const url = field ? `/api/custom-fields/${field.id}` : '/api/custom-fields';
      const method = field ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erro ao salvar'); return; }
      toast.success(field ? 'Campo atualizado' : 'Campo criado');
      onDone();
    } finally { setSaving(false); }
  };

  const selStyle = { width:'100%', background:'var(--bg,#0f0f0f)', border:'1px solid #2a2a2a', borderRadius:8, padding:'10px 12px', color:'#e2e8f0', fontSize:13, outline:'none' };

  return (
    <Modal open onClose={onClose} title={field ? 'Editar campo' : 'Novo campo personalizado'} maxWidth={480}>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <FocusInput label="Nome do campo" placeholder="ex: Tipo de Veículo" value={name} onChange={e=>onNameChange(e.target.value)} autoFocus />
        <div>
          <label style={{display:'block',fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Chave interna</label>
          <input value={fieldKey} onChange={e=>setFieldKey(autoKey(e.target.value))} placeholder="tipo_veiculo" style={{...selStyle,fontFamily:'monospace',fontSize:12}} />
          <p style={{fontSize:11,color:'#64748b',marginTop:4}}>Identificador usado no mapeamento CSV. Gerado automaticamente.</p>
        </div>
        <div>
          <label style={{display:'block',fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Tipo</label>
          <select value={type} onChange={e=>setType(e.target.value)} style={selStyle}>
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="date">Data</option>
            <option value="select">Lista de opções</option>
          </select>
        </div>
        {type === 'select' && (
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Opções (uma por linha)</label>
            <textarea value={options} onChange={e=>setOptions(e.target.value)} rows={4} placeholder={"Opção 1\nOpção 2\nOpção 3"} style={{...selStyle,resize:'vertical',fontFamily:'inherit'}} />
          </div>
        )}
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:4}}>
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={save} disabled={saving}>{saving?'Salvando...':'Salvar'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function CustomFieldsManagement() {
  const [fields, setFields]   = useState([]);
  const [modal, setModal]     = useState(null); // null | 'create' | fieldObj
  const tok = () => localStorage.getItem('crm_token');

  const load = () => {
    fetch('/api/custom-fields', { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json()).then(fs => setFields(Array.isArray(fs) ? fs : [])).catch(() => {});
  };
  useEffect(load, []);

  const deleteField = async id => {
    if (!window.confirm('Excluir campo? Os dados salvos nos contatos também serão apagados.')) return;
    await fetch(`/api/custom-fields/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok()}` } });
    toast.success('Campo excluído');
    load();
  };

  const typeLabel = t => ({ text:'Texto', number:'Número', date:'Data', select:'Lista' }[t] || t);

  return (
    <>
      {modal && (
        <CustomFieldModal
          field={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      )}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <p style={{fontSize:13,color:'#94a3b8',margin:0}}>
            Campos extras que aparecem nos contatos e no mapeamento de CSV.
          </p>
        </div>
        <Btn size="sm" onClick={() => setModal('create')}>+ Novo campo</Btn>
      </div>

      {fields.length === 0 ? (
        <div style={{background:'#111',border:'1px solid #2a2a2a',borderRadius:14,padding:'32px',textAlign:'center',color:'#64748b',fontSize:13}}>
          Nenhum campo personalizado criado ainda.<br/>
          <span style={{fontSize:11}}>Ex: "Tipo de Veículo", "Região de Atuação", "Tamanho da Frota"</span>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {fields.map(f => {
            let opts = [];
            try { opts = f.options ? JSON.parse(f.options) : []; } catch {}
            return (
              <div key={f.id} style={{display:'flex',alignItems:'center',gap:12,background:'#111',border:'1px solid #2a2a2a',borderRadius:12,padding:'12px 16px'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,color:'#e2e8f0'}}>{f.name}</div>
                  <div style={{fontSize:11,color:'#64748b',marginTop:2,fontFamily:'monospace'}}>{f.field_key} · {typeLabel(f.type)}{opts.length?` · ${opts.length} opções`:''}</div>
                </div>
                <Btn size="sm" variant="secondary" onClick={() => setModal(f)}>Editar</Btn>
                <Btn size="sm" variant="danger" onClick={() => deleteField(f.id)}>Excluir</Btn>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Funnel Management ────────────────────────────────────────────────────────

function FunnelManagement() {
  const [funnels, setFunnels]           = useState([]);
  const [selectedFunnel, setSelectedFunnel] = useState(null);
  const [stages, setStages]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [newFunnelName, setNewFunnelName] = useState('');
  const [editingFunnel, setEditingFunnel] = useState(null);
  const [showNewStage, setShowNewStage] = useState(false);
  const [newStage, setNewStage]         = useState({ name: '', color: '#6366f1' });
  const [editingStage, setEditingStage] = useState(null);

  const loadFunnels = async () => {
    try {
      const fs = await pipelineApi.funnels();
      setFunnels(fs);
      if (!selectedFunnel && fs.length > 0) setSelectedFunnel(fs[0].id);
    } catch { toast.error('Erro ao carregar funis'); }
    setLoading(false);
  };

  const loadStages = async (funnelId) => {
    if (!funnelId) return;
    try {
      const s = await pipelineApi.stages(funnelId);
      setStages(s);
    } catch { toast.error('Erro ao carregar etapas'); }
  };

  useEffect(() => { loadFunnels(); }, []);
  useEffect(() => { if (selectedFunnel) loadStages(selectedFunnel); }, [selectedFunnel]);

  const handleCreateFunnel = async () => {
    if (!newFunnelName.trim()) return;
    try {
      const f = await pipelineApi.createFunnel({ name: newFunnelName });
      toast.success('Funil criado!');
      setNewFunnelName('');
      setFunnels(prev => [...prev, f]);
      setSelectedFunnel(f.id);
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao criar funil'); }
  };

  const handleRenameFunnel = async (id) => {
    if (!editingFunnel?.name?.trim()) return;
    try {
      await pipelineApi.updateFunnel(id, { name: editingFunnel.name });
      setFunnels(prev => prev.map(f => f.id === id ? { ...f, name: editingFunnel.name } : f));
      setEditingFunnel(null);
      toast.success('Funil renomeado!');
    } catch (err) { toast.error(err.response?.data?.error || 'Erro'); }
  };

  const handleDeleteFunnel = async (id, name) => {
    if (!confirm(`Excluir o funil "${name}"?\n\nTodas as etapas sem contatos serão removidas.`)) return;
    try {
      await pipelineApi.deleteFunnel(id);
      const remaining = funnels.filter(f => f.id !== id);
      setFunnels(remaining);
      if (selectedFunnel === id) setSelectedFunnel(remaining[0]?.id || null);
      toast.success('Funil excluído!');
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao excluir'); }
  };

  const handleCreateStage = async () => {
    if (!newStage.name.trim()) return;
    try {
      const s = await pipelineApi.createStage({ ...newStage, funnel_id: selectedFunnel });
      setStages(prev => [...prev, s]);
      setNewStage({ name: '', color: '#6366f1' });
      setShowNewStage(false);
      toast.success('Etapa criada!');
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao criar etapa'); }
  };

  const handleUpdateStage = async (id) => {
    if (!editingStage?.name?.trim()) return;
    try {
      await pipelineApi.updateStage(id, { name: editingStage.name, color: editingStage.color });
      setStages(prev => prev.map(s => s.id === id ? { ...s, ...editingStage } : s));
      setEditingStage(null);
      toast.success('Etapa atualizada!');
    } catch (err) { toast.error(err.response?.data?.error || 'Erro'); }
  };

  const handleDeleteStage = async (id, name) => {
    if (!confirm(`Excluir a etapa "${name}"?`)) return;
    try {
      await pipelineApi.deleteStage(id);
      setStages(prev => prev.filter(s => s.id !== id));
      toast.success('Etapa excluída!');
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao excluir'); }
  };

  if (loading) return <div style={{color:C.dim,padding:20}}>Carregando...</div>;

  const COLORS = ['#64748b','#3b82f6','#2E6DA4','#8b5cf6','#6366f1','#f59e0b','#E67E22','#14b8a6','#22c55e','#ef4444','#ec4899','#1A365D'];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      {/* Lista de funis */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,overflow:'hidden'}}>
        <div style={{padding:'16px 24px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h3 style={{fontSize:15,fontWeight:700,color:C.text}}>Funis</h3>
        </div>
        <div style={{padding:20,display:'flex',flexDirection:'column',gap:10}}>
          {funnels.map(f => (
            <div key={f.id} onClick={() => setSelectedFunnel(f.id)}
              style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderRadius:12,cursor:'pointer',
                border:`1px solid ${selectedFunnel===f.id?C.primary:C.border}`,
                background:selectedFunnel===f.id?`${C.primary}10`:C.bg,transition:'all 0.15s'}}>
              {editingFunnel?.id === f.id ? (
                <input autoFocus value={editingFunnel.name}
                  onChange={e=>setEditingFunnel({...editingFunnel,name:e.target.value})}
                  onKeyDown={e=>{ if(e.key==='Enter') handleRenameFunnel(f.id); if(e.key==='Escape') setEditingFunnel(null); }}
                  onClick={e=>e.stopPropagation()}
                  style={{flex:1,background:'transparent',border:'none',color:C.text,fontSize:14,fontWeight:700,outline:'none'}} />
              ) : (
                <span style={{flex:1,fontSize:14,fontWeight:700,color:selectedFunnel===f.id?C.primary:C.text}}>{f.name}</span>
              )}
              <div style={{display:'flex',gap:6}} onClick={e=>e.stopPropagation()}>
                {editingFunnel?.id === f.id ? (
                  <>
                    <Btn size="sm" onClick={()=>handleRenameFunnel(f.id)}>✓</Btn>
                    <Btn size="sm" variant="outline" onClick={()=>setEditingFunnel(null)}>✕</Btn>
                  </>
                ) : (
                  <>
                    <Btn size="sm" variant="outline" onClick={()=>setEditingFunnel({id:f.id,name:f.name})}>✏️</Btn>
                    <Btn size="sm" variant="danger" onClick={()=>handleDeleteFunnel(f.id,f.name)}>🗑️</Btn>
                  </>
                )}
              </div>
            </div>
          ))}
          {/* Criar novo funil */}
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <input placeholder="Nome do novo funil..." value={newFunnelName}
              onChange={e=>setNewFunnelName(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleCreateFunnel()}
              style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px 14px',color:C.text,fontSize:13,outline:'none'}} />
            <Btn onClick={handleCreateFunnel} disabled={!newFunnelName.trim()}>+ Criar Funil</Btn>
          </div>
        </div>
      </div>

      {/* Etapas do funil selecionado */}
      {selectedFunnel && (
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:18,overflow:'hidden'}}>
          <div style={{padding:'16px 24px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <h3 style={{fontSize:15,fontWeight:700,color:C.text}}>
              Etapas — {funnels.find(f=>f.id===selectedFunnel)?.name}
            </h3>
            <Btn size="sm" onClick={()=>setShowNewStage(true)}>+ Nova Etapa</Btn>
          </div>
          <div style={{padding:20,display:'flex',flexDirection:'column',gap:8}}>
            {stages.map((s, i) => (
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:12,border:`1px solid ${C.border}`,background:C.bg}}>
                <div style={{width:12,height:12,borderRadius:'50%',background:s.color,flexShrink:0,boxShadow:`0 0 6px ${s.color}`}} />
                <span style={{fontSize:12,color:C.dim,fontWeight:700,minWidth:20}}>{i+1}</span>
                {editingStage?.id === s.id ? (
                  <div style={{flex:1,display:'flex',gap:8,alignItems:'center'}}>
                    <input autoFocus value={editingStage.name}
                      onChange={e=>setEditingStage({...editingStage,name:e.target.value})}
                      onKeyDown={e=>e.key==='Enter'&&handleUpdateStage(s.id)}
                      style={{flex:1,background:'transparent',border:`1px solid ${C.border}`,borderRadius:8,padding:'6px 10px',color:C.text,fontSize:13,outline:'none'}} />
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {COLORS.map(col=>(
                        <div key={col} onClick={()=>setEditingStage({...editingStage,color:col})}
                          style={{width:18,height:18,borderRadius:'50%',background:col,cursor:'pointer',
                            border:editingStage.color===col?'2px solid #fff':'2px solid transparent',transition:'border 0.1s'}} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <span style={{flex:1,fontSize:13,fontWeight:600,color:C.text}}>{s.name}</span>
                )}
                <div style={{display:'flex',gap:6}}>
                  {editingStage?.id === s.id ? (
                    <>
                      <Btn size="sm" onClick={()=>handleUpdateStage(s.id)}>✓</Btn>
                      <Btn size="sm" variant="outline" onClick={()=>setEditingStage(null)}>✕</Btn>
                    </>
                  ) : (
                    <>
                      <Btn size="sm" variant="outline" onClick={()=>setEditingStage({id:s.id,name:s.name,color:s.color})}>✏️</Btn>
                      <Btn size="sm" variant="danger" onClick={()=>handleDeleteStage(s.id,s.name)}>🗑️</Btn>
                    </>
                  )}
                </div>
              </div>
            ))}
            {stages.length === 0 && <p style={{color:C.dim,fontSize:13,textAlign:'center',padding:'20px 0'}}>Nenhuma etapa ainda. Clique em "+ Nova Etapa".</p>}

            {showNewStage && (
              <div style={{display:'flex',gap:8,alignItems:'center',padding:'10px 14px',borderRadius:12,border:`1px dashed ${C.primary}`,background:`${C.primary}08`,marginTop:4}}>
                <div style={{width:12,height:12,borderRadius:'50%',background:newStage.color,flexShrink:0}} />
                <input autoFocus placeholder="Nome da etapa..." value={newStage.name}
                  onChange={e=>setNewStage({...newStage,name:e.target.value})}
                  onKeyDown={e=>e.key==='Enter'&&handleCreateStage()}
                  style={{flex:1,background:'transparent',border:`1px solid ${C.border}`,borderRadius:8,padding:'6px 10px',color:C.text,fontSize:13,outline:'none'}} />
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                  {COLORS.map(col=>(
                    <div key={col} onClick={()=>setNewStage({...newStage,color:col})}
                      style={{width:18,height:18,borderRadius:'50%',background:col,cursor:'pointer',
                        border:newStage.color===col?'2px solid #fff':'2px solid transparent',transition:'border 0.1s'}} />
                  ))}
                </div>
                <Btn size="sm" onClick={handleCreateStage} disabled={!newStage.name.trim()}>✓</Btn>
                <Btn size="sm" variant="outline" onClick={()=>{ setShowNewStage(false); setNewStage({name:'',color:'#6366f1'}); }}>✕</Btn>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── User Management ──────────────────────────────────────────────────────────

function ChangePasswordModal({ userId, onClose }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (password !== confirm) return toast.error('As senhas não coincidem');
    if (password.length < 6) return toast.error('Mínimo 6 caracteres');
    setSaving(true);
    try {
      const token = localStorage.getItem('crm_token');
      const r = await fetch(`/api/users/${userId}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Erro'); }
      toast.success('Senha alterada com sucesso!');
      onClose();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'#000a',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'#1e2a35',borderRadius:16,padding:28,width:360,border:'1px solid #2a3942'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:700,color:'#e9edef',marginBottom:20}}>🔑 Alterar Senha</div>
        <form onSubmit={handleSave} style={{display:'flex',flexDirection:'column',gap:14}}>
          <input type="password" placeholder="Nova senha" value={password} onChange={e=>setPassword(e.target.value)}
            style={{background:'#2a3942',border:'1px solid #3d4a54',borderRadius:10,padding:'11px 14px',color:'#e9edef',fontSize:14,outline:'none'}} />
          <input type="password" placeholder="Confirmar senha" value={confirm} onChange={e=>setConfirm(e.target.value)}
            style={{background:'#2a3942',border:'1px solid #3d4a54',borderRadius:10,padding:'11px 14px',color:'#e9edef',fontSize:14,outline:'none'}} />
          <div style={{display:'flex',gap:10,marginTop:4}}>
            <Btn variant="outline" onClick={onClose} style={{flex:1}}>Cancelar</Btn>
            <Btn type="submit" disabled={saving} style={{flex:1}}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'user' });
  const [saving, setSaving] = useState(false);
  const token = () => localStorage.getItem('crm_token');

  const submit = async () => {
    if (!form.name || !form.email || !form.password) return toast.error('Preencha todos os campos');
    setSaving(true);
    try {
      const r = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erro ao criar usuário'); return; }
      toast.success('Usuário criado com sucesso!');
      onDone();
    } catch { toast.error('Erro ao criar usuário'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000}}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:32,width:'100%',maxWidth:400,boxShadow:'0 24px 80px #000a'}}>
        <h3 style={{margin:'0 0 24px',fontSize:17,fontWeight:700,color:C.text}}>Criar novo usuário</h3>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <FocusInput label="Nome" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nome completo" />
          <FocusInput label="E-mail" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@exemplo.com" />
          <FocusInput label="Senha" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Mínimo 6 caracteres" />
          <div>
            <label style={{display:'block',color:C.muted,fontSize:11,fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em'}}>Função</label>
            <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}
              style={{width:'100%',padding:'11px 14px',background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:13,outline:'none'}}>
              <option value="user">Usuário</option>
              <option value="admin">Admin</option>
              <option value="master">Master</option>
            </select>
          </div>
        </div>
        <div style={{display:'flex',gap:10,marginTop:24,justifyContent:'flex-end'}}>
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={submit} disabled={saving}>{saving ? 'Criando...' : 'Criar usuário'}</Btn>
        </div>
      </div>
    </div>
  );
}

function InstancesManagement() {
  const [instances, setInstances] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editInst, setEditInst] = useState(null);
  const [form, setForm] = useState({ name: '', instance_name: '', api_url: '', api_key: '' });

  const authHdr = () => ({ Authorization: `Bearer ${localStorage.getItem('crm_token')}`, 'Content-Type': 'application/json' });

  const load = async () => {
    setLoading(true);
    try {
      const [insts, usrs] = await Promise.all([
        wpInstances.list(),
        fetch('/api/users', { headers: authHdr() }).then(r => r.json()),
      ]);
      setInstances(insts);
      setUsers(Array.isArray(usrs) ? usrs : []);
    } catch { toast.error('Erro ao carregar instâncias'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditInst(null); setForm({ name: '', instance_name: '', api_url: '', api_key: '' }); setShowForm(true); };
  const openEdit = (inst) => { setEditInst(inst); setForm({ name: inst.name, instance_name: inst.instance_name, api_url: inst.api_url || '', api_key: '' }); setShowForm(true); };

  const save = async () => {
    try {
      if (editInst) {
        await wpInstances.update(editInst.id, form);
        toast.success('Instância atualizada!');
      } else {
        await wpInstances.create(form);
        toast.success('Instância criada!');
      }
      setShowForm(false);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const del = async (inst) => {
    if (!confirm(`Remover instância "${inst.name}"?`)) return;
    try { await wpInstances.delete(inst.id); toast.success('Removida!'); load(); }
    catch (e) { toast.error(e.message); }
  };

  const addUser = async (instId, userId) => {
    try { await wpInstances.addUser(instId, userId); load(); }
    catch (e) { toast.error(e.message); }
  };

  const removeUser = async (instId, userId) => {
    try { await wpInstances.removeUser(instId, userId); load(); }
    catch (e) { toast.error(e.message); }
  };

  if (loading) return <div style={{ color: C.dim, padding: 20 }}>Carregando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Instâncias WhatsApp</h3>
          <p style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Controle quais usuários veem as conversas de cada instância.</p>
        </div>
        <Btn size="sm" onClick={openCreate}>+ Nova Instância</Btn>
      </div>

      {showForm && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{editInst ? 'Editar Instância' : 'Nova Instância'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FocusInput label="Nome exibido" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Raul Comercial" />
            <FocusInput label="Nome da Instância (Evolution API)" value={form.instance_name} onChange={e => setForm({ ...form, instance_name: e.target.value })} placeholder="Ex: raul" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FocusInput label="API URL (opcional)" value={form.api_url} onChange={e => setForm({ ...form, api_url: e.target.value })} placeholder="https://..." />
            <FocusInput label="API Key (opcional)" type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} placeholder="Chave da instância" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Btn>
            <Btn size="sm" onClick={save}>Salvar</Btn>
          </div>
        </div>
      )}

      {instances.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: C.dim, background: C.card, borderRadius: 16, border: `1px solid ${C.border}` }}>
          Nenhuma instância cadastrada ainda.
        </div>
      )}

      {instances.map(inst => {
        const assignedIds = (inst.users || []).map(u => u.id);
        const unassigned = users.filter(u => u.role !== 'master' && !assignedIds.includes(u.id));
        return (
          <div key={inst.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>📱</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{inst.name}</div>
                  <div style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>{inst.instance_name}</div>
                </div>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: inst.is_active ? `${C.success}20` : `${C.danger}20`, color: inst.is_active ? C.success : C.danger, fontWeight: 700 }}>
                  {inst.is_active ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn size="sm" variant="outline" onClick={() => openEdit(inst)}>✏️</Btn>
                {inst.id !== 'instance_default' && (
                  <Btn size="sm" variant="danger" onClick={() => del(inst)}>🗑️</Btn>
                )}
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Usuários com acesso
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, background: `${C.purple}20`, color: C.purple, fontWeight: 700 }}>
                  👑 Master (sempre)
                </span>
                {(inst.users || []).filter(u => u.role !== 'master').map(u => (
                  <span key={u.id} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, background: `${C.primary}15`, color: C.primary, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {u.name}
                    <button onClick={() => removeUser(inst.id, u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                {unassigned.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) { addUser(inst.id, e.target.value); e.target.value = ''; } }}
                    style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: `1px dashed ${C.border}`, background: C.bg, color: C.muted, cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="">+ Adicionar usuário</option>
                    {unassigned.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PERM_LABELS = [
  { key: 'view_contacts',       label: 'Ver ficha do lead' },
  { key: 'edit_contacts',       label: 'Editar contatos' },
  { key: 'view_pipeline',       label: 'Ver pipeline' },
  { key: 'move_cards',          label: 'Mover cards no pipeline' },
  { key: 'view_conversations',  label: 'Ver conversas WhatsApp' },
  { key: 'send_messages',       label: 'Enviar mensagens' },
];

function UserPermissionsPanel({ user, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [perms, setPerms] = useState(user.permissions || {});

  if (user.role === 'master') {
    return <span style={{fontSize:11,color:C.primary,fontWeight:700,background:`${C.primary}18`,padding:'3px 8px',borderRadius:6}}>Master (acesso total)</span>;
  }

  const toggle = async (key) => {
    const newPerms = { ...perms, [key]: !perms[key] };
    setPerms(newPerms);
    const token = localStorage.getItem('crm_token');
    try {
      await fetch(`/api/users/${user.id}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permissions: newPerms }),
      });
      toast.success('Permissão atualizada!');
      if (onUpdate) onUpdate(user.id, newPerms);
    } catch {
      toast.error('Erro ao atualizar permissão');
      setPerms(perms);
    }
  };

  return (
    <div style={{width:'100%',marginTop:8}}>
      <button onClick={()=>setExpanded(v=>!v)} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:'4px 10px',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',gap:6}}>
        🔐 Permissões {expanded ? '▲' : '▼'}
      </button>
      {expanded && (
        <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:8,padding:'12px',background:C.surface,borderRadius:10,border:`1px solid ${C.border}`}}>
          {PERM_LABELS.map(({ key, label }) => (
            <label key={key} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,color:C.text,background:C.bg,padding:'5px 10px',borderRadius:8,border:`1px solid ${perms[key] ? C.success + '60' : C.border}`,userSelect:'none'}}>
              <input type="checkbox" checked={!!perms[key]} onChange={()=>toggle(key)} style={{accentColor:C.success,cursor:'pointer'}} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [changePwdUserId, setChangePwdUserId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('crm_user') || 'null'); } catch { return null; } })();
  const isMaster = currentUser?.role === 'master';

  const load = () => {
    const token = localStorage.getItem('crm_token');
    fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(load, []);

  const updateStatus = async (id, status) => {
    const token = localStorage.getItem('crm_token');
    await fetch(`/api/users/${id}/status`, { method:'PATCH', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ status }) });
    toast.success('Status atualizado!'); load();
  };
  const updateRole = async (id, role) => {
    const token = localStorage.getItem('crm_token');
    await fetch(`/api/users/${id}/role`, { method:'PATCH', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ role }) });
    toast.success('Função atualizada!'); load();
  };
  const deleteUser = async (id) => {
    if (!confirm('Remover este usuário?')) return;
    const token = localStorage.getItem('crm_token');
    await fetch(`/api/users/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${token}` } });
    toast.success('Usuário removido!'); load();
  };

  const handlePermUpdate = (userId, newPerms) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions: newPerms } : u));
  };

  const roleLabel = (r) => r === 'master' ? '👑 Master' : r === 'admin' ? '🛡️ Admin' : '👤 Usuário';
  const statusColor = (s) => s === 'active' ? C.success : s === 'pending' ? C.warning : C.danger;
  const statusLabel = (s) => s === 'active' ? 'Ativo' : s === 'pending' ? 'Pendente' : 'Suspenso';
  const pending = users.filter(u => u.status === 'pending');

  if (loading) return <div style={{color:C.dim,padding:20}}>Carregando usuários...</div>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      {showCreate && <CreateUserModal onClose={()=>setShowCreate(false)} onDone={()=>{ load(); setShowCreate(false); }} />}
      {pending.length > 0 && (
        <Card title={`⏳ Aprovações Pendentes (${pending.length})`} style={{borderTop:`3px solid ${C.warning}`}}>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {pending.map(u => (
              <div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px',background:C.bg,borderRadius:12,border:`1px solid ${C.warning}30`}}>
                <Avatar name={u.name} size={36} />
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.text}}>{u.name}</div>
                  <div style={{fontSize:12,color:C.dim}}>{u.email}</div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <Btn size="sm" variant="success" onClick={() => updateStatus(u.id, 'active')}>✅ Aprovar</Btn>
                  <Btn size="sm" variant="danger" onClick={() => updateStatus(u.id, 'suspended')}>❌ Rejeitar</Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
        <Btn size="sm" onClick={()=>setShowCreate(true)}>+ Criar Usuário</Btn>
        {isMaster && (
          <Btn variant="danger" size="sm" onClick={async()=>{
            if(!window.confirm('Deslogar TODOS os usuários de todos os dispositivos?')) return;
            const token=localStorage.getItem('crm_token');
            await fetch('/api/auth/logout-all',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
            toast.success('Todos os usuários foram deslogados!');
          }}>Deslogar todos os dispositivos</Btn>
        )}
      </div>

      <Card title="👥 Todos os Usuários">
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {users.map(u => (
            <div key={u.id} style={{display:'flex',flexDirection:'column',gap:0,padding:'14px',background:C.bg,borderRadius:12,border:`1px solid ${C.border}`}}>
              <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                <Avatar name={u.name} size={38} />
                <div style={{flex:1,minWidth:120}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.text}}>{u.name}</div>
                  <div style={{fontSize:12,color:C.dim}}>{u.email}</div>
                </div>
                <Badge color={statusColor(u.status)}>{statusLabel(u.status)}</Badge>
                <span style={{fontSize:12,color:C.muted}}>{roleLabel(u.role)}</span>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {/* Qualquer um pode trocar sua própria senha; master pode trocar de todos */}
                  {(isMaster || u.id === currentUser?.id) && (
                    <Btn size="sm" variant="outline" onClick={() => setChangePwdUserId(u.id)}>🔑 Senha</Btn>
                  )}
                  {isMaster && u.role !== 'master' && (
                    <>
                      {u.status !== 'active' && <Btn size="sm" variant="success" onClick={() => updateStatus(u.id, 'active')}>Ativar</Btn>}
                      {u.status === 'active' && <Btn size="sm" variant="outline" onClick={() => updateStatus(u.id, 'suspended')}>Suspender</Btn>}
                      <select value={u.role} onChange={e => updateRole(u.id, e.target.value)} style={{padding:'5px 10px',borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:12,cursor:'pointer'}}>
                        <option value="user">Usuário</option>
                        <option value="admin">Admin</option>
                        <option value="master">Master</option>
                      </select>
                      <Btn size="sm" variant="danger" onClick={() => deleteUser(u.id)}>🗑️</Btn>
                    </>
                  )}
                </div>
              </div>
              {isMaster && (
                <UserPermissionsPanel user={u} onUpdate={handlePermUpdate} />
              )}
            </div>
          ))}
        </div>
      </Card>
      {changePwdUserId && <ChangePasswordModal userId={changePwdUserId} onClose={() => setChangePwdUserId(null)} />}
    </div>
  );
}

// ─── Prospecting ──────────────────────────────────────────────────────────────

const CSV_CRM_FIELDS = [
  { key: 'phone',        label: 'Telefone *' },
  { key: 'name',         label: 'Nome' },
  { key: 'company',      label: 'Empresa / Razão Social' },
  { key: 'trade_name',   label: 'Nome Fantasia' },
  { key: 'email',        label: 'E-mail' },
  { key: 'phone2',       label: 'Telefone Secundário' },
  { key: 'city',         label: 'Cidade' },
  { key: 'state',        label: 'Estado' },
  { key: 'address',      label: 'Endereço' },
  { key: 'neighborhood', label: 'Bairro' },
  { key: 'zip_code',     label: 'CEP' },
  { key: 'segment',      label: 'Segmento / Atividade' },
  { key: 'website',      label: 'Site' },
  { key: 'instagram',    label: 'Instagram' },
  { key: 'cnpj',         label: 'CNPJ' },
  { key: 'notes',        label: 'Observações' },
];

function autoDetectCrmField(header) {
  const h = header.toLowerCase().trim();
  if (/telefone principal|fone principal/.test(h)) return 'phone';
  if (/telefone secund|fone secund|phone2|tel\.? ?2/.test(h)) return 'phone2';
  if (/telefone|phone|celular|whatsapp|fone/.test(h)) return 'phone';
  if (/nome fantasia|trade/.test(h)) return 'trade_name';
  if (/razão social|razao social|raz.o social/.test(h)) return 'company';
  if (/nome da empresa|nome empresa/.test(h)) return 'company';
  if (/empresa|company/.test(h)) return 'company';
  if (/nome|name/.test(h)) return 'name';
  if (/e-?mail|email/.test(h)) return 'email';
  if (/cidade|city|municipio|munic/.test(h)) return 'city';
  if (/\bestado\b|\buf\b|\bstate\b/.test(h)) return 'state';
  if (/endere|address|logradouro/.test(h)) return 'address';
  if (/bairro|neighborhood/.test(h)) return 'neighborhood';
  if (/\bcep\b|zip/.test(h)) return 'zip_code';
  if (/segmento|atividade|segment/.test(h)) return 'segment';
  if (/\bsite\b|website/.test(h)) return 'website';
  if (/instagram/.test(h)) return 'instagram';
  if (/cnpj/.test(h)) return 'cnpj';
  if (/observ|notes/.test(h)) return 'notes';
  return '';
}

function parseCsvHeaders(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      const firstLine = text.split(/\r?\n/)[0] || '';
      const sep = firstLine.includes(';') ? ';' : ',';
      const headers = firstLine.split(sep).map(h => h.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      resolve(headers);
    };
    reader.readAsText(file, 'utf-8');
  });
}

function CsvImportModal({ onClose, onDone }) {
  const [step, setStep]             = useState('file'); // 'file' | 'mapping' | 'pipeline'
  const [file, setFile]             = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [mapping, setMapping]       = useState({}); // { crmField: csvColumn }
  const [importing, setImport]      = useState(false);
  const [result, setResult]         = useState(null);
  const [funnels, setFunnels]       = useState([]);
  const [stages, setStages]         = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [selectedFunnel, setSelectedFunnel] = useState('');
  const [selectedStage, setSelectedStage]   = useState('');
  const tok = () => localStorage.getItem('crm_token');

  useEffect(() => {
    const h = { Authorization: `Bearer ${tok()}` };
    Promise.all([
      fetch('/api/funnels', { headers: h }).then(r => r.json()).catch(() => []),
      fetch('/api/custom-fields', { headers: h }).then(r => r.json()).catch(() => []),
    ]).then(([fs, cfs]) => {
      setFunnels(Array.isArray(fs) ? fs : []);
      setCustomFields(Array.isArray(cfs) ? cfs : []);
    });
  }, []);

  useEffect(() => {
    if (!selectedFunnel) { setStages([]); setSelectedStage(''); return; }
    fetch(`/api/pipeline/stages?funnel_id=${selectedFunnel}`, { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json()).then(ss => { setStages(Array.isArray(ss) ? ss : []); setSelectedStage(''); })
      .catch(() => {});
  }, [selectedFunnel]);

  const onFileSelect = async f => {
    if (!f) return;
    setFile(f);
    const headers = await parseCsvHeaders(f);
    setCsvHeaders(headers);
    // Auto-detect: first match per CRM field wins
    const auto = {};
    for (const h of headers) {
      const field = autoDetectCrmField(h);
      if (field && !auto[field]) auto[field] = h;
    }
    setMapping(auto);
    setStep('mapping');
  };

  const doImport = async () => {
    if (!file) return;
    setImport(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (selectedStage) fd.append('pipeline_stage', selectedStage);
      fd.append('mapping', JSON.stringify(mapping));
      const r = await fetch('/api/prospects/import-csv', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok()}` },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Erro ao importar'); return; }
      setResult(d);
      onDone();
    } catch { toast.error('Erro ao importar CSV'); }
    finally { setImport(false); }
  };

  const selStyle = { width:'100%', background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 14px', color:C.text, fontSize:13, outline:'none', cursor:'pointer' };

  const allCrmFields = [
    ...CSV_CRM_FIELDS,
    ...customFields.map(cf => ({ key: `custom_${cf.id}`, label: cf.name })),
  ];

  const steps = ['file','mapping','pipeline'];
  const stepIdx = steps.indexOf(step);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:32,width:'100%',maxWidth:result?500:620,boxShadow:'0 24px 80px #000a',maxHeight:'90vh',overflowY:'auto'}}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
          <div>
            <h3 style={{margin:'0 0 4px',fontSize:18,fontWeight:700,color:C.text}}>Importar lista CSV</h3>
            {!result && (
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                {['Arquivo','Mapeamento','Pipeline'].map((s,i)=>(
                  <React.Fragment key={s}>
                    <span style={{fontSize:12,fontWeight:600,color:i<=stepIdx?C.primary:C.dim,transition:'color 0.2s'}}>{i+1}. {s}</span>
                    {i<2 && <span style={{color:C.border,fontSize:12}}>›</span>}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.dim,cursor:'pointer',fontSize:20,lineHeight:1,padding:4}}>✕</button>
        </div>

        {/* Step 1 — Arquivo */}
        {step==='file' && !result && (
          <>
            <p style={{margin:'0 0 20px',fontSize:13,color:C.dim}}>
              Suporta planilhas CNPJ e Google Maps. Colunas serão mapeadas no próximo passo.
            </p>
            <label style={{display:'flex',flexDirection:'column',gap:8,cursor:'pointer',border:`2px dashed ${C.border}`,borderRadius:14,padding:'32px 20px',alignItems:'center',background:C.bg,transition:'all 0.2s',marginBottom:20}}>
              <span style={{fontSize:36}}>📂</span>
              <span style={{fontSize:13,fontWeight:600,color:C.muted}}>Clique para selecionar o arquivo .csv</span>
              <span style={{fontSize:11,color:C.dim}}>ou arraste aqui</span>
              <input type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={e=>onFileSelect(e.target.files[0]||null)} />
            </label>
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
            </div>
          </>
        )}

        {/* Step 2 — Mapeamento de colunas */}
        {step==='mapping' && !result && (
          <>
            <p style={{margin:'0 0 16px',fontSize:13,color:C.dim}}>
              Arquivo: <b style={{color:C.text}}>{file?.name}</b> — {csvHeaders.length} colunas detectadas.
              Diga ao CRM o que é cada coluna. Colunas sem mapeamento serão ignoradas.
            </p>
            <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,overflow:'hidden',marginBottom:20}}>
              {/* Header */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 24px 1fr',gap:12,padding:'10px 16px',borderBottom:`1px solid ${C.border}`,background:C.surface}}>
                <span style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em'}}>Coluna no CSV</span>
                <span/>
                <span style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em'}}>Campo no CRM</span>
              </div>
              <div style={{maxHeight:340,overflowY:'auto'}}>
                {csvHeaders.map(header => {
                  // Find which CRM field this header is currently mapped to
                  const mappedTo = Object.entries(mapping).find(([_k,v])=>v===header)?.[0] || '';
                  return (
                    <div key={header} style={{display:'grid',gridTemplateColumns:'1fr 24px 1fr',gap:12,padding:'8px 16px',borderBottom:`1px solid ${C.border}`,alignItems:'center'}}>
                      <div style={{fontSize:13,color:C.text,fontFamily:'monospace',background:C.surface,borderRadius:6,padding:'4px 8px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={header}>{header}</div>
                      <span style={{color:C.dim,textAlign:'center',fontSize:14}}>→</span>
                      <select
                        value={mappedTo}
                        onChange={e => {
                          const newField = e.target.value;
                          setMapping(prev => {
                            const next = { ...prev };
                            // Remove any existing mapping pointing to this header
                            Object.keys(next).forEach(k => { if (next[k] === header) delete next[k]; });
                            if (newField) next[newField] = header;
                            return next;
                          });
                        }}
                        style={selStyle}
                      >
                        <option value="">— Ignorar esta coluna —</option>
                        {allCrmFields.map(f => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Aviso se telefone não mapeado */}
            {!mapping['phone'] && (
              <div style={{background:`${C.warning}15`,border:`1px solid ${C.warning}40`,borderRadius:10,padding:'10px 14px',fontSize:12,color:C.warning,marginBottom:16,display:'flex',gap:8,alignItems:'center'}}>
                ⚠️ Nenhuma coluna mapeada para <b>Telefone</b>. O CRM tentará detectar automaticamente.
              </div>
            )}
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <Btn variant="outline" onClick={()=>setStep('file')}>← Voltar</Btn>
              <Btn onClick={()=>setStep('pipeline')}>Próximo →</Btn>
            </div>
          </>
        )}

        {/* Step 3 — Pipeline */}
        {step==='pipeline' && !result && (
          <>
            <p style={{margin:'0 0 16px',fontSize:13,color:C.dim}}>
              Pronto para importar <b style={{color:C.text}}>{file?.name}</b>. Selecione onde colocar os leads no Kanban (opcional).
            </p>
            <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,padding:16,marginBottom:20}}>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:12}}>
                📌 Enviar para o Pipeline (opcional)
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div>
                  <label style={{display:'block',fontSize:11,color:C.dim,marginBottom:5}}>Funil</label>
                  <select value={selectedFunnel} onChange={e=>setSelectedFunnel(e.target.value)} style={selStyle}>
                    <option value="">— Não enviar para o pipeline —</option>
                    {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                {selectedFunnel && (
                  <div>
                    <label style={{display:'block',fontSize:11,color:C.dim,marginBottom:5}}>Etapa do Kanban</label>
                    <select value={selectedStage} onChange={e=>setSelectedStage(e.target.value)} style={selStyle}>
                      <option value="">— Selecione a etapa —</option>
                      {stages.map((s,i) => (
                        <option key={s.id} value={s.id}>{i+1}. {s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedStage && (
                  <div style={{fontSize:12,color:C.success,display:'flex',alignItems:'center',gap:6}}>
                    ✅ Leads serão importados na etapa <b>{stages.find(s=>s.id===selectedStage)?.name}</b>
                  </div>
                )}
              </div>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <Btn variant="outline" onClick={()=>setStep('mapping')}>← Voltar</Btn>
              <Btn onClick={doImport} disabled={importing||(!!selectedFunnel&&!selectedStage)}>
                {importing ? 'Importando...' : '🚀 Importar'}
              </Btn>
            </div>
          </>
        )}

        {/* Resultado */}
        {result && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
              {[
                { label:'Importados',   value:result.inserted,         color:C.success  },
                { label:'Duplicatas',   value:result.skipped,          color:C.warning  },
                { label:'Sem telefone', value:result.invalid,          color:C.danger   },
                { label:'Total no CSV', value:result.total,            color:C.primary  },
                ...(result.addedToPipeline > 0 ? [{ label:'No Pipeline', value:result.addedToPipeline, color:C.teal }] : []),
              ].map(s=>(
                <div key={s.label} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:'16px 20px'}}>
                  <div style={{fontSize:26,fontWeight:700,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:11,color:C.dim,marginTop:2}}>{s.label}</div>
                </div>
              ))}
            </div>
            {result.errors?.length > 0 && (
              <div style={{background:`${C.danger}10`,border:`1px solid ${C.danger}30`,borderRadius:10,padding:12,fontSize:12,color:C.danger,marginBottom:16}}>
                {result.errors.length} linha(s) com erro — verifique o CSV
              </div>
            )}
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <Btn onClick={onClose}>Fechar</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Prospecting() {
  const [prospects, setProspects]       = useState([]);
  const [stats, setStats]               = useState(null);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected]         = useState(null);
  const [notes, setNotes]               = useState('');
  const [savingNotes, setSavingNotes]   = useState(false);
  const [tab, setTab]                   = useState('leads'); // 'leads' | 'falhas'
  const [failures, setFailures]         = useState([]);
  const [loadingFail, setLoadingFail]   = useState(false);
  const [showImport, setShowImport]     = useState(false);

  const tok = () => localStorage.getItem('crm_token');

  const STATUS_LIST = [
    { id:'all',        label:'Todos',       color: C.dim      },
    { id:'novo',       label:'Novo',        color:'#3b82f6'   },
    { id:'reservado',  label:'Reservado',   color:'#6366f1'   },
    { id:'enviado',    label:'Enviado',     color:'#f59e0b'   },
    { id:'respondeu',  label:'Respondeu',   color:'#10b981'   },
    { id:'follow-up',  label:'Follow-up',   color:'#8b5cf6'   },
    { id:'convertido', label:'Convertido',  color:'#059669'   },
    { id:'descartado', label:'Descartado',  color:'#ef4444'   },
  ];

  const statusColor = s => STATUS_LIST.find(x => x.id === s)?.color || C.dim;

  const openDrawer = (p) => { setSelected(p); setNotes(p.notes || ''); };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await fetch(`/api/prospects/${selected.id}/notes`, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${tok()}` },
        body: JSON.stringify({ notes }),
      });
      toast.success('Observação salva');
      setSelected(s => ({ ...s, notes }));
      load();
    } catch { toast.error('Erro ao salvar observação'); }
    finally { setSavingNotes(false); }
  };

  const loadFailures = useCallback(async () => {
    setLoadingFail(true);
    try {
      const r = await fetch('/api/prospects/logs/failures?limit=100', { headers: { Authorization: `Bearer ${tok()}` } });
      const data = await r.json();
      setFailures(Array.isArray(data) ? data : []);
    } catch { toast.error('Erro ao carregar falhas'); }
    finally { setLoadingFail(false); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 500 });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const [pRes, sRes] = await Promise.all([
        fetch(`/api/prospects?${params}`, { headers: { Authorization: `Bearer ${tok()}` } }),
        fetch('/api/prospects/stats/summary', { headers: { Authorization: `Bearer ${tok()}` } }),
      ]);
      const pData = await pRes.json();
      const sData = await sRes.json();
      setProspects(Array.isArray(pData) ? pData : (Array.isArray(pData?.prospects) ? pData.prospects : []));
      // Garante que stats é sempre um objeto com valores numéricos, nunca um erro do Postgres
      const toNum = v => { const n = parseInt(v); return isNaN(n) ? 0 : n; };
      setStats({
        total:      toNum(sData?.total),
        novo:       toNum(sData?.novo),
        enviado:    toNum(sData?.enviado),
        respondeu:  toNum(sData?.respondeu),
        convertido: toNum(sData?.convertido),
        follow_up:  toNum(sData?.follow_up),
        sent_today: toNum(sData?.sent_today),
      });
    } catch { toast.error('Erro ao carregar prospects'); }
    finally   { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'falhas') loadFailures(); }, [tab, loadFailures]);

  const retryProspect = async (prospectId) => {
    try {
      await fetch(`/api/prospects/${prospectId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ status: 'novo' }),
      });
      toast.success('Prospect recolocado na fila');
      loadFailures();
    } catch { toast.error('Erro ao retentar'); }
  };

  const updateStatus = async (id, status) => {
    try {
      await fetch(`/api/prospects/${id}/status`, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${tok()}` },
        body: JSON.stringify({ status }),
      });
      toast.success('Status atualizado');
      setSelected(s => s?.id === id ? { ...s, status } : s);
      load();
    } catch { toast.error('Erro ao atualizar status'); }
  };

  const filtered = prospects.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.name||'').toLowerCase().includes(q)
        || (p.company||'').toLowerCase().includes(q)
        || (p.phone||'').includes(q)
        || (p.city||'').toLowerCase().includes(q);
  });

  // Garante que qualquer valor seja renderizável (nunca um objeto)
  const safeVal = v => (v === null || v === undefined) ? 0 : (typeof v === 'object' ? JSON.stringify(v) : v);
  const statCount = key => safeVal(stats?.[key === 'follow-up' ? 'follow_up' : key]) || 0;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {showImport && <CsvImportModal onClose={()=>setShowImport(false)} onDone={()=>{ load(); setShowImport(false); toast.success('Lista importada com sucesso!'); }} />}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:22,fontWeight:700,color:C.text}}>Prospecção</h2>
          <p style={{margin:'4px 0 0',fontSize:13,color:C.dim}}>Leads captados via Google Maps / n8n / CSV</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <Btn size="sm" variant="outline" onClick={()=>setShowImport(true)}>📥 Importar CSV</Btn>
          {/* Tabs */}
          <div style={{display:'flex',gap:4,background:C.surface,borderRadius:10,padding:4,border:`1px solid ${C.border}`}}>
            {[{id:'leads',label:'Leads'},{id:'falhas',label:'⚠ Falhas'}].map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                padding:'6px 18px',borderRadius:7,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,transition:'all 0.15s',
                background: tab===t.id ? C.primary : 'transparent',
                color: tab===t.id ? '#fff' : C.dim,
              }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:12}}>
          {[
            {label:'Total',      value:safeVal(stats.total),          color:C.primary  },
            {label:'Novos',      value:safeVal(stats.novo),           color:'#3b82f6'  },
            {label:'Enviados',   value:safeVal(stats.enviado),        color:'#f59e0b'  },
            {label:'Responderam',value:safeVal(stats.respondeu),      color:'#10b981'  },
            {label:'Follow-up',  value:safeVal(stats.follow_up),      color:'#8b5cf6'  },
            {label:'Convertidos',value:safeVal(stats.convertido),     color:'#059669'  },
            {label:'Falhas',     value:failures.length,               color:'#ef4444'  },
          ].map(s=>(
            <div key={s.label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 16px',
              cursor: s.label==='Falhas' ? 'pointer' : 'default'}}
              onClick={()=>{ if(s.label==='Falhas'){ setTab('falhas'); loadFailures(); } }}
            >
              <div style={{fontSize:22,fontWeight:700,color:s.color}}>{s.value}</div>
              <div style={{fontSize:11,color:C.dim,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Aba Falhas */}
      {tab === 'falhas' && (
        <Card noPad>
          <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontWeight:700,color:C.text,fontSize:14}}>Relatório de Falhas de Envio</span>
            <button onClick={loadFailures} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:'5px 12px',cursor:'pointer',fontSize:12,color:C.dim}}>↻ Atualizar</button>
          </div>
          {loadingFail ? (
            <div style={{padding:48,textAlign:'center',color:C.dim}}>Carregando...</div>
          ) : failures.length === 0 ? (
            <EmptyState icon="✅" title="Nenhuma falha registrada" sub="Todos os envios foram bem-sucedidos" />
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:C.surface}}>
                    {['Empresa','Telefone','Erro','Data',''].map(h=>(
                      <th key={h} style={{padding:'10px 16px',textAlign:'left',fontWeight:600,color:C.dim,fontSize:11,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {failures.map((f,i)=>{
                    let errMsg = f.error || '';
                    try {
                      const p = JSON.parse(errMsg);
                      const raw = p?.message || p?.error || errMsg;
                      errMsg = typeof raw === 'string' ? raw : JSON.stringify(raw);
                    } catch {}
                    if (typeof errMsg !== 'string') errMsg = JSON.stringify(errMsg);
                    return (
                      <tr key={f.id} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?'transparent':`${C.surface}50`}}>
                        <td style={{padding:'10px 16px'}}>
                          <div style={{fontWeight:600,color:C.text}}>{f.company||f.name||'—'}</div>
                        </td>
                        <td style={{padding:'10px 16px',color:C.dim,fontFamily:'monospace',fontSize:12}}>{f.phone}</td>
                        <td style={{padding:'10px 16px',color:'#ef4444',maxWidth:300}}>
                          <span title={f.error} style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:280}}>
                            {errMsg || '—'}
                          </span>
                        </td>
                        <td style={{padding:'10px 16px',color:C.dim,whiteSpace:'nowrap',fontSize:12}}>
                          {new Date(f.created_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
                        </td>
                        <td style={{padding:'10px 16px'}}>
                          <button onClick={()=>retryProspect(f.prospect_id)}
                            style={{background:'#3b82f6',color:'#fff',border:'none',borderRadius:8,padding:'5px 12px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                            Retentar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`,color:C.dim,fontSize:12}}>
                {failures.length} falha{failures.length!==1?'s':''} registrada{failures.length!==1?'s':''}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Lista */}
      {tab === 'leads' && <Card noPad>
        {/* Busca + filtros */}
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="🔍 Buscar por nome, empresa, telefone ou cidade..."
            style={{flex:1,minWidth:200,padding:'8px 12px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,outline:'none'}}
          />
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {STATUS_LIST.map(s=>(
              <button key={s.id} onClick={()=>setStatusFilter(s.id)} style={{
                padding:'6px 12px',borderRadius:20,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,transition:'all 0.15s',
                background: statusFilter===s.id ? s.color : C.surface,
                color:       statusFilter===s.id ? '#fff'   : C.dim,
              }}>
                {s.label}{s.id!=='all' ? ` (${statCount(s.id)})` : ''}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{padding:48,textAlign:'center',color:C.dim}}>Carregando...</div>
        ) : filtered.length===0 ? (
          <EmptyState icon="🎯" title="Nenhum prospect encontrado" sub="Os leads captados pelo n8n aparecerão aqui" />
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:C.surface}}>
                  {['Empresa / Contato','Telefone','Cidade','Avaliação','Status',''].map(h=>(
                    <th key={h} style={{padding:'10px 16px',textAlign:'left',fontWeight:600,color:C.dim,fontSize:11,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p,i)=>(
                  <tr key={p.id} onClick={()=>openDrawer(p)}
                    style={{borderTop:`1px solid ${C.border}`,cursor:'pointer',transition:'background 0.1s',
                      background: i%2===0 ? 'transparent' : `${C.surface}50`}}
                    onMouseEnter={e=>e.currentTarget.style.background=`${C.primary}10`}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'transparent':`${C.surface}50`}
                  >
                    <td style={{padding:'12px 16px'}}>
                      <div style={{fontWeight:600,color:C.text}}>{p.company||p.name||'—'}</div>
                      {p.company&&p.name&&p.company!==p.name&&<div style={{fontSize:11,color:C.dim,marginTop:2}}>{p.name}</div>}
                    </td>
                    <td style={{padding:'12px 16px',color:C.dim,fontFamily:'monospace',fontSize:12}}>{p.phone}</td>
                    <td style={{padding:'12px 16px',color:C.dim}}>{p.city||'—'}</td>
                    <td style={{padding:'12px 16px'}}>
                      {p.rating
                        ? <span style={{color:'#f59e0b',fontWeight:600}}>★ <span style={{fontWeight:400,color:C.dim}}>{p.rating}</span></span>
                        : '—'}
                    </td>
                    <td style={{padding:'12px 16px'}}>
                      <span style={{background:`${statusColor(p.status)}20`,color:statusColor(p.status),padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>
                        {p.status||'novo'}
                      </span>
                    </td>
                    <td style={{padding:'12px 16px'}}>
                      <button onClick={e=>{e.stopPropagation();window.open(`https://wa.me/55${p.phone}`,'_blank');}}
                        style={{background:'#25D366',color:'#fff',border:'none',borderRadius:8,padding:'5px 12px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                        WhatsApp
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading&&filtered.length>0&&(
          <div style={{padding:'10px 16px',borderTop:`1px solid ${C.border}`,color:C.dim,fontSize:12}}>
            {filtered.length} prospect{filtered.length!==1?'s':''}
          </div>
        )}
      </Card>}

      {/* Drawer */}
      {selected&&(
        <div onClick={()=>setSelected(null)}
          style={{position:'fixed',inset:0,background:'#00000060',zIndex:1000,display:'flex',justifyContent:'flex-end'}}>
          <div onClick={e=>e.stopPropagation()} style={{
            width:'min(420px,100vw)',background:C.card,height:'100%',overflowY:'auto',
            borderLeft:`1px solid ${C.border}`,boxShadow:'-8px 0 32px #00000030',
            padding:24,display:'flex',flexDirection:'column',gap:20,
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <h3 style={{margin:0,fontSize:18,fontWeight:700,color:C.text}}>{selected.company||selected.name||'Prospect'}</h3>
                {selected.company&&selected.name&&selected.company!==selected.name&&(
                  <div style={{fontSize:13,color:C.dim,marginTop:4}}>{selected.name}</div>
                )}
                <div style={{marginTop:8}}>
                  <span style={{background:`${statusColor(selected.status)}20`,color:statusColor(selected.status),padding:'3px 12px',borderRadius:20,fontSize:12,fontWeight:700}}>
                    {selected.status||'novo'}
                  </span>
                </div>
              </div>
              <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',cursor:'pointer',color:C.dim,fontSize:24,lineHeight:1}}>×</button>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {[
                {label:'Telefone',        value:selected.phone},
                {label:'Tel. Secundário', value:selected.phone2},
                {label:'E-mail',          value:selected.email},
                {label:'CNPJ',            value:selected.cnpj},
                {label:'Razão Social',    value:selected.company},
                {label:'Nome Fantasia',   value:selected.trade_name},
                {label:'Atividade',       value:selected.segment},
                {label:'Cód. Atividade',  value:selected.main_activity_code},
                {label:'Cidade',          value:selected.city},
                {label:'Estado',          value:selected.state},
                {label:'Bairro',          value:selected.neighborhood},
                {label:'Endereço',        value:selected.address},
                {label:'CEP',             value:selected.zip_code},
                {label:'Porte',           value:selected.company_size},
                {label:'Capital Social',  value:selected.capital_social},
                {label:'Nat. Jurídica',   value:selected.legal_nature},
                {label:'Abertura',        value:selected.opening_date},
                {label:'Situação CNPJ',   value:selected.cnpj_status},
                {label:'Site',            value:selected.website},
                {label:'Instagram',       value:selected.instagram},
                {label:'Avaliação',       value:selected.rating?`${selected.rating}/5 (${selected.reviews_count||0} avaliações)`:null},
                {label:'Fonte',           value:selected.source},
              ].filter(f=>f.value).map(f=>(
                <div key={f.label} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                  <span style={{fontSize:11,color:C.dim,minWidth:110,fontWeight:600,paddingTop:2,flexShrink:0}}>{f.label}</span>
                  <span style={{fontSize:13,color:C.text,wordBreak:'break-all'}}>{f.value}</span>
                </div>
              ))}
            </div>

            {selected.ai_message&&(
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:C.dim,marginBottom:8,letterSpacing:'0.05em'}}>MENSAGEM GERADA PELA IA</div>
                <div style={{fontSize:13,color:C.text,lineHeight:1.7}}>{selected.ai_message}</div>
              </div>
            )}

            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.dim,marginBottom:10,letterSpacing:'0.05em'}}>ALTERAR STATUS</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {STATUS_LIST.filter(s=>s.id!=='all').map(s=>(
                  <button key={s.id} onClick={()=>updateStatus(selected.id,s.id)} style={{
                    padding:'6px 14px',borderRadius:20,cursor:'pointer',fontSize:12,fontWeight:600,transition:'all 0.15s',
                    border:`1.5px solid ${s.color}`,
                    background: selected.status===s.id ? s.color : 'transparent',
                    color:       selected.status===s.id ? '#fff'  : s.color,
                  }}>{s.label}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.dim,marginBottom:8,letterSpacing:'0.05em'}}>OBSERVAÇÃO</div>
              <textarea
                value={notes}
                onChange={e=>setNotes(e.target.value)}
                placeholder="Ex: número inválido, não é do segmento, já é cliente..."
                rows={3}
                style={{width:'100%',padding:'10px 12px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,resize:'vertical',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}
              />
              <button onClick={saveNotes} disabled={savingNotes} style={{marginTop:6,padding:'7px 16px',background:C.primary,color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',opacity:savingNotes?0.6:1}}>
                {savingNotes ? 'Salvando...' : 'Salvar observação'}
              </button>
            </div>

            <button onClick={()=>window.open(`https://wa.me/55${selected.phone}`,'_blank')}
              style={{background:'#25D366',color:'#fff',border:'none',borderRadius:10,padding:'12px 20px',fontSize:14,fontWeight:700,cursor:'pointer',width:'100%',marginTop:'auto'}}>
              Abrir no WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────

const NAV = [
  { id:'dashboard',     label:'Dashboard',     Icon: LayoutDashboard },
  { id:'contacts',      label:'Contatos',       Icon: Users           },
  { id:'conversations', label:'Conversas',      Icon: MessageSquare   },
  { id:'pipeline',      label:'Pipeline',       Icon: TrendingUp      },
  { id:'followups',     label:'Follow-ups',     Icon: Repeat2         },
  { id:'prospecting',   label:'Prospecção',     Icon: Target          },
  { id:'broadcasts',    label:'Disparos',       Icon: Megaphone       },
  { id:'tasks',         label:'Tarefas',        Icon: CheckSquare     },
  { id:'settings',      label:'Configurações',  Icon: SettingsIcon    },
];

export default function App() {
  const storedUser = (() => { try { return JSON.parse(localStorage.getItem('crm_user') || 'null'); } catch { return null; } })();
  const [authed, setAuthed] = useState(!!localStorage.getItem('crm_token'));
  const [currentUser, setCurrentUser] = useState(storedUser);
  const [page, setPage] = useState('dashboard');
  const [wpState, setWpState] = useState('checking');
  const [initialConv, setInitialConv] = useState(null);
  const [unread, setUnread] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [winW, setWinW] = useState(window.innerWidth);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const audioRef = useRef(null);

  const handleLogout = async () => {
    const token = localStorage.getItem('crm_token');
    await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    setAuthed(false);
    setCurrentUser(null);
  };

  useEffect(()=>{
    const onResize=()=>setWinW(window.innerWidth);
    window.addEventListener('resize',onResize);
    return ()=>window.removeEventListener('resize',onResize);
  },[]);

  const isMobile  = winW < 768;
  const isTablet  = winW >= 768 && winW < 1024;
  const collapsed = isMobile ? false : (isTablet ? true : sidebarCollapsed);
  const sidebarW  = collapsed ? 64 : 252;

  useEffect(()=>{
    const h=(e)=>{ setPage(e.detail.tab); if(e.detail.activeConv) setInitialConv(e.detail.activeConv); };
    window.addEventListener('switchTab',h);
    return ()=>window.removeEventListener('switchTab',h);
  },[]);

  useEffect(()=>{
    const h=()=>{
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      setAuthed(false);
      setCurrentUser(null);
    };
    socket.on('force_logout',h);
    return ()=>socket.off('force_logout',h);
  },[]);

  useEffect(()=>{
    if (!authed) return;
    const tok = localStorage.getItem('crm_token');
    fetch('/api/whatsapp/status', { headers: tok ? { Authorization: `Bearer ${tok}` } : {} }).then(r=>r.json()).then(d=>setWpState(d?.instance?.state||'disconnected')).catch(()=>setWpState('error'));
  },[authed]);

  useEffect(()=>{
    const h=({state})=>setWpState(state);
    socket.on('connection_update',h);
    return ()=>socket.off('connection_update',h);
  },[]);

  useEffect(()=>{
    const h=(data)=>{
      if(data.message?.direction==='inbound'){
        if(page!=='conversations') setUnread(n=>n+1);
        // Notificação sonora
        try {
          const ctx = new (window.AudioContext||window.webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.setValueAtTime(880, ctx.currentTime);
          o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime+0.1);
          g.gain.setValueAtTime(0.3, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.3);
          o.start(ctx.currentTime); o.stop(ctx.currentTime+0.3);
        } catch(e){}
      }
    };
    socket.on('new_message',h);
    return ()=>socket.off('new_message',h);
  },[page]);

  // Busca global com debounce
  useEffect(()=>{
    if(!searchQ.trim()){ setSearchRes(null); return; }
    setSearchLoading(true);
    const t = setTimeout(()=>{
      globalSearch(searchQ).then(r=>{ setSearchRes(r); setSearchLoading(false); }).catch(()=>setSearchLoading(false));
    }, 350);
    return ()=>clearTimeout(t);
  },[searchQ]);

  const navigate=(id)=>{ setPage(id); setInitialConv(null); if(id==='conversations') setUnread(0); setSidebarOpen(false); };

  // Atalho Ctrl+K para busca (deve ficar ANTES do return condicional)
  useEffect(()=>{
    const h=(e)=>{ if((e.metaKey||e.ctrlKey)&&e.key==='k'){ e.preventDefault(); setSearchOpen(true); } if(e.key==='Escape') setSearchOpen(false); };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[]);

  if (!authed) return <LoginPage onLogin={(user) => { setCurrentUser(user); setAuthed(true); }} />;

  const wpColor=wpState==='open'?C.success:wpState==='checking'?C.warning:C.danger;
  const wpLabel=wpState==='open'?'Conectado':wpState==='checking'?'Verificando...':'Desconectado';

  const pagePad = isMobile ? '16px' : '40px 52px';

  // ── Sidebar content (shared between mobile overlay and desktop) ──
  const sidebarPerms = getUserPermissions();

  const SidebarContent = ({ compact }) => (
    <>
      {/* Header */}
      <div style={{padding: compact ? '18px 10px' : '22px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent: compact ? 'center' : 'space-between'}}>
        <div onClick={()=>!isMobile&&setSidebarCollapsed(v=>!v)} style={{display:'flex',alignItems:'center',gap:compact?0:12,cursor:isMobile?'default':'pointer'}} title={isMobile?'':compact?'Expandir menu':'Recolher menu'}>
          <div style={{width:44,height:44,borderRadius:14,flexShrink:0,background:'#07101e',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 4px 16px #00000080`,border:`1.5px solid #1a3050`,overflow:'hidden'}}>
            <svg width="22" height="44" viewBox="0 0 48 110" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* ── Cubo flutuando (dot do i) ── */}
              <polygon points="24,2 38,9 24,16 10,9"   fill="#F0A020"/>
              <polygon points="10,9 24,16 24,30 10,23"  fill="#C07518"/>
              <polygon points="38,9 24,16 24,30 38,23"  fill="#904E10"/>
              {/* ── GAP ── */}
              {/* ── Coluna: cap laranja + corpo navy ── */}
              <polygon points="24,34 38,41 24,48 10,41" fill="#D98920"/>
              <polygon points="10,41 24,48 24,56 10,49" fill="#C07518"/>
              <polygon points="38,41 24,48 24,56 38,49" fill="#904E10"/>
              <polygon points="10,49 24,56 24,98 10,91" fill="#1C3F70"/>
              <polygon points="38,49 24,56 24,98 38,91" fill="#0E2448"/>
            </svg>
          </div>
          {!compact && <div>
            <div style={{fontSize:17,fontWeight:800,color:C.text,letterSpacing:'-0.02em'}}>Viga Sales</div>
            <div style={{fontSize:11,color:C.dim}}>WhatsApp CRM</div>
          </div>}
        </div>
      </div>

      {/* Nav */}
      <nav style={{flex:1,padding:'14px 6px',display:'flex',flexDirection:'column',gap:2,overflowY:'auto'}}>
        {NAV.filter(p => p.id !== 'conversations' || sidebarPerms.view_conversations).map(p=>{
          const active=page===p.id;
          return (
            <div key={p.id} onClick={()=>navigate(p.id)} title={compact?p.label:''} style={{
              display:'flex',alignItems:'center',gap:compact?0:10,
              padding: compact ? '12px' : '10px 14px',
              borderRadius:12,cursor:'pointer',fontSize:14,fontWeight:active?700:500,
              color:active?'#fff':C.muted,justifyContent:compact?'center':'flex-start',
              background:active?`linear-gradient(135deg,${C.primary}dd,#c0621add)`:'transparent',
              boxShadow:active?`0 4px 12px ${C.primary}40`:'none',
              transition:'all 0.18s',position:'relative',
            }}
              onMouseOver={e=>{ if(!active){e.currentTarget.style.background='#ffffff08';e.currentTarget.style.color=C.text;} }}
              onMouseOut={e=>{ if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color=C.muted;} }}>
              <p.Icon size={compact?20:17} strokeWidth={1.75} style={{flexShrink:0}} />
              {!compact && p.label}
              {p.id==='conversations'&&unread>0&&(
                <span style={{
                  marginLeft: compact ? 0 : 'auto',
                  position: compact ? 'absolute' : 'relative',
                  top: compact ? 6 : 'auto', right: compact ? 6 : 'auto',
                  background:C.success,color:'#fff',borderRadius:10,fontSize:10,fontWeight:700,padding:'2px 5px',minWidth:16,textAlign:'center'
                }}>
                  {unread>99?'99+':unread}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      {/* Busca global */}
      <div style={{padding:'6px 6px 0'}}>
        <div onClick={()=>setSearchOpen(true)} title="Busca global (Ctrl+K)" style={{
          display:'flex',alignItems:'center',gap:8,padding:compact?'10px':'10px 14px',
          borderRadius:10,cursor:'pointer',border:`1px solid ${C.border}`,background:C.bg,
          color:C.dim,fontSize:13,justifyContent:compact?'center':'flex-start',
          transition:'all .15s'
        }}
          onMouseOver={e=>{e.currentTarget.style.borderColor=C.primary;e.currentTarget.style.color=C.text;}}
          onMouseOut={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.dim;}}>
          <Search size={compact?18:14} strokeWidth={1.75} style={{flexShrink:0}} />
          {!compact && <span>Buscar...</span>}
          {!compact && <span style={{marginLeft:'auto',fontSize:11,background:`${C.primary}20`,color:C.primary,borderRadius:4,padding:'1px 5px'}}>⌘K</span>}
        </div>
      </div>

      {/* WhatsApp status */}
      <div style={{padding:'10px 6px 0',borderTop:`1px solid ${C.border}`}}>
        {compact ? (
          <div title={`WhatsApp: ${wpLabel}`} style={{display:'flex',justifyContent:'center',padding:'8px 0'}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:wpColor,boxShadow:`0 0 8px ${wpColor}`}} />
          </div>
        ) : (
          <div style={{background:C.bg,borderRadius:12,padding:'10px 14px',border:`1px solid ${C.border}`}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:wpColor,boxShadow:`0 0 8px ${wpColor}`}} />
              <span style={{fontSize:12,fontWeight:700,color:C.text}}>WhatsApp</span>
            </div>
            <div style={{fontSize:11,color:wpColor,fontWeight:600}}>{wpLabel}</div>
          </div>
        )}
      </div>

      {/* User info + logout */}
      <div style={{padding:'10px 6px 14px'}}>
        {compact ? (
          <div title="Sair" onClick={handleLogout} style={{display:'flex',justifyContent:'center',padding:'10px',cursor:'pointer',borderRadius:10,color:C.dim}}
            onMouseOver={e=>{e.currentTarget.style.background='#ffffff08';e.currentTarget.style.color=C.danger;}}
            onMouseOut={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=C.dim;}}>
            <LogOut size={18} strokeWidth={1.75} />
          </div>
        ) : (
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,background:C.bg,border:`1px solid ${C.border}`}}>
            <Avatar name={currentUser?.name || 'U'} size={32} />
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{currentUser?.name || 'Usuário'}</div>
              <div style={{fontSize:10,color:C.dim,textTransform:'capitalize'}}>{currentUser?.role === 'master' ? 'Master' : currentUser?.role === 'admin' ? 'Admin' : 'Usuário'}</div>
            </div>
            <button onClick={handleLogout} title="Sair" style={{background:'transparent',border:'none',cursor:'pointer',color:C.dim,padding:4,borderRadius:8,flexShrink:0,display:'flex',alignItems:'center'}}
              onMouseOver={e=>e.currentTarget.style.color=C.danger} onMouseOut={e=>e.currentTarget.style.color=C.dim}>
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${C.bg};font-family:'Inter',system-ui,-apple-system,sans-serif;color:${C.text};}
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
        ::-webkit-scrollbar-thumb:hover{background:#384060;}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}
        @keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
      `}</style>

      {/* Mobile overlay backdrop */}
      {isMobile && sidebarOpen && (
        <div onClick={()=>setSidebarOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:299,backdropFilter:'blur(2px)'}} />
      )}

      {/* Mobile slide-in sidebar */}
      {isMobile && (
        <div style={{
          position:'fixed',top:0,left:0,height:'100%',width:260,
          background:C.surface,borderRight:`1px solid ${C.border}`,
          display:'flex',flexDirection:'column',zIndex:300,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition:'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <SidebarContent compact={false} />
        </div>
      )}

      <div style={{display:'flex',height:'100vh',overflow:'hidden'}}>

        {/* ── Desktop/Tablet Sidebar ── */}
        {!isMobile && (
          <div style={{
            width:sidebarW,background:C.surface,borderRight:`1px solid ${C.border}`,
            display:'flex',flexDirection:'column',flexShrink:0,
            transition:'width 0.25s cubic-bezier(0.4,0,0.2,1)',overflow:'hidden',
            position:'relative',
          }}>
            <SidebarContent compact={collapsed} />
          </div>
        )}

        {/* ── Main ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight:0}}>

          {/* Mobile top bar */}
          {isMobile && (
            <div style={{height:56,background:C.surface,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',padding:'0 16px',gap:12,flexShrink:0,zIndex:10}}>
              <button onClick={()=>setSidebarOpen(true)} style={{background:'transparent',border:'none',color:C.text,cursor:'pointer',display:'flex',alignItems:'center',padding:4}}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="5" width="18" height="1.8" rx="1" fill="currentColor"/><rect x="2" y="10.1" width="18" height="1.8" rx="1" fill="currentColor"/><rect x="2" y="15.2" width="18" height="1.8" rx="1" fill="currentColor"/></svg>
              </button>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <svg width="18" height="36" viewBox="0 0 48 110" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
                  <polygon points="24,2 38,9 24,16 10,9"   fill="#F0A020"/>
                  <polygon points="10,9 24,16 24,30 10,23"  fill="#C07518"/>
                  <polygon points="38,9 24,16 24,30 38,23"  fill="#904E10"/>
                  <polygon points="24,34 38,41 24,48 10,41" fill="#D98920"/>
                  <polygon points="10,41 24,48 24,56 10,49" fill="#C07518"/>
                  <polygon points="38,41 24,48 24,56 38,49" fill="#904E10"/>
                  <polygon points="10,49 24,56 24,108 10,101" fill="#1C3F70"/>
                  <polygon points="38,49 24,56 24,108 38,101" fill="#0E2448"/>
                </svg>
                <span style={{fontSize:16,fontWeight:800,color:C.text,fontFamily:"'Archivo',sans-serif"}}>Viga Sales</span>
              </div>
              <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:wpColor,boxShadow:`0 0 6px ${wpColor}`}} />
                <span style={{fontSize:11,color:wpColor,fontWeight:600}}>{wpLabel}</span>
              </div>
            </div>
          )}

          {/* Page content */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight:0}}>
            {page==='dashboard'     &&<div style={{flex:1,overflowY:'auto',padding:pagePad}}><Dashboard onNavigate={(p,id)=>{ setPage(p); if(id) setInitialConv(id); }} /></div>}
            {page==='contacts'      &&<div style={{flex:1,overflowY:'auto',padding:pagePad}}><Contacts /></div>}
            {page==='conversations' &&<div style={{flex:1,display:'flex',overflow:'hidden'}}><Conversations initialContact={initialConv} /></div>}
            {page==='pipeline'      &&<div style={{flex:1,overflowY:'auto',padding:pagePad}}><Pipeline /></div>}
            {page==='followups'     &&<div style={{flex:1,overflowY:'auto',padding:pagePad}}><FollowUps /></div>}
            {page==='prospecting'   &&<div style={{flex:1,overflowY:'auto',padding:pagePad}}><ErrorBoundary><Prospecting /></ErrorBoundary></div>}
            {page==='broadcasts'    &&<div style={{flex:1,overflowY:'auto',padding:pagePad}}><Broadcasts /></div>}
            {page==='tasks'         &&<div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}><TasksModule currentUser={currentUser} /></div>}
            {page==='settings'      &&<div style={{flex:1,overflowY:'auto',padding:pagePad}}><Settings /></div>}
          </div>

          {/* Mobile bottom navigation */}
          {isMobile && (
            <div style={{
              height:64,background:C.surface,borderTop:`1px solid ${C.border}`,
              display:'flex',alignItems:'center',justifyContent:'space-around',
              flexShrink:0,paddingBottom:'env(safe-area-inset-bottom,0px)',
            }}>
              {NAV.filter(p => p.id !== 'conversations' || sidebarPerms.view_conversations).map(p=>{
                const active=page===p.id;
                return (
                  <div key={p.id} onClick={()=>navigate(p.id)} style={{
                    display:'flex',flexDirection:'column',alignItems:'center',gap:3,
                    padding:'6px 12px',borderRadius:12,cursor:'pointer',flex:1,
                    color:active?C.primary:C.dim,
                    background:active?`${C.primary}15`:'transparent',
                    transition:'all 0.18s',position:'relative',
                  }}>
                    <span style={{fontSize:20}}>{p.icon}</span>
                    <span style={{fontSize:9,fontWeight:active?700:500,letterSpacing:'0.02em'}}>{p.label}</span>
                    {p.id==='conversations'&&unread>0&&(
                      <span style={{position:'absolute',top:2,right:8,background:C.success,color:'#fff',borderRadius:8,fontSize:9,fontWeight:700,padding:'1px 5px',minWidth:14,textAlign:'center'}}>
                        {unread>99?'99+':unread}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Toaster position="top-right" toastOptions={{style:{background:C.card,color:C.text,border:`1px solid ${C.border}`,fontSize:14,borderRadius:12}}} />

      {/* ── Modal Busca Global ── */}
      {searchOpen && (
        <div onClick={()=>{ setSearchOpen(false); setSearchQ(''); setSearchRes(null); }}
          style={{position:'fixed',inset:0,background:'#00000090',zIndex:9999,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:80}}>
          <div onClick={e=>e.stopPropagation()}
            style={{width:'min(580px,92vw)',background:C.card,borderRadius:18,border:`1px solid ${C.border}`,boxShadow:`0 24px 80px #00000080`,overflow:'hidden'}}>
            {/* Input */}
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 20px',borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:18}}>🔍</span>
              <input autoFocus value={searchQ} onChange={e=>setSearchQ(e.target.value)}
                placeholder="Buscar contatos, conversas..."
                style={{flex:1,background:'transparent',border:'none',outline:'none',color:C.text,fontSize:16}} />
              {searchLoading && <span style={{color:C.dim,fontSize:12}}>Buscando...</span>}
              <span onClick={()=>{ setSearchOpen(false); setSearchQ(''); setSearchRes(null); }}
                style={{color:C.dim,cursor:'pointer',fontSize:13,background:C.bg,borderRadius:6,padding:'3px 8px'}}>Esc</span>
            </div>
            {/* Resultados */}
            {searchRes && (
              <div style={{maxHeight:400,overflowY:'auto'}}>
                {searchRes.contacts?.length > 0 && (
                  <div>
                    <div style={{padding:'10px 20px 4px',fontSize:11,fontWeight:700,color:C.dim,textTransform:'uppercase',letterSpacing:'.08em'}}>Contatos</div>
                    {searchRes.contacts.map(c=>(
                      <div key={c.id} onClick={()=>{ setPage('contacts'); setSearchOpen(false); setSearchQ(''); setSearchRes(null); }}
                        style={{display:'flex',alignItems:'center',gap:12,padding:'10px 20px',cursor:'pointer',transition:'background .12s'}}
                        onMouseOver={e=>e.currentTarget.style.background='#ffffff08'}
                        onMouseOut={e=>e.currentTarget.style.background=''}>
                        <Avatar name={c.name} size={32} />
                        <div style={{flex:1}}>
                          <div style={{color:C.text,fontWeight:600,fontSize:14}}>{c.name}</div>
                          <div style={{color:C.dim,fontSize:12}}>{c.phone}{c.company?` · ${c.company}`:''}</div>
                        </div>
                        <Badge color={STAGE_COLORS[c.pipeline_stage]||C.primary}>{STAGE_LABELS[c.pipeline_stage]||'Lead'}</Badge>
                      </div>
                    ))}
                  </div>
                )}
                {searchRes.conversations?.length > 0 && (
                  <div>
                    <div style={{padding:'10px 20px 4px',fontSize:11,fontWeight:700,color:C.dim,textTransform:'uppercase',letterSpacing:'.08em'}}>Conversas</div>
                    {searchRes.conversations.map(c=>(
                      <div key={c.id} onClick={()=>{ setInitialConv(c); setPage('conversations'); setSearchOpen(false); setSearchQ(''); setSearchRes(null); }}
                        style={{display:'flex',alignItems:'center',gap:12,padding:'10px 20px',cursor:'pointer',transition:'background .12s'}}
                        onMouseOver={e=>e.currentTarget.style.background='#ffffff08'}
                        onMouseOut={e=>e.currentTarget.style.background=''}>
                        <Avatar name={c.contact_name} size={32} />
                        <div>
                          <div style={{color:C.text,fontWeight:600,fontSize:14}}>{c.contact_name}</div>
                          <div style={{color:C.dim,fontSize:12}}>{c.phone}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchRes.contacts?.length===0 && searchRes.conversations?.length===0 && (
                  <div style={{padding:32,textAlign:'center',color:C.dim,fontSize:14}}>Nenhum resultado para "{searchQ}"</div>
                )}
              </div>
            )}
            {!searchRes && !searchLoading && (
              <div style={{padding:'20px 24px',color:C.dim,fontSize:13}}>
                Digite para buscar contatos e conversas...
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
