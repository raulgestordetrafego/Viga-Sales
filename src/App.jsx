import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import { contacts as contactsApi, conversations as convsApi, broadcasts as broadcastsApi, stats as statsApi, statsDaily, statsRecent, globalSearch, pipeline as pipelineApi } from './api';
import TasksModule from './TasksModule';
import ClientBriefing from './ClientBriefing';
import {
  LayoutDashboard, Users, MessageSquare, TrendingUp,
  Repeat2, Megaphone, CheckSquare, Settings as SettingsIcon,
  Search, LogOut, Paperclip, Mic, MicOff, X, Send,
} from 'lucide-react';

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
    Promise.all([
      statsApi(),
      contactsApi.pipelineStats().catch(()=>[]),
      statsDaily().catch(()=>[]),
      statsRecent().catch(()=>[]),
    ]).then(([s,p,d,r])=>{
      setData(s); setPipe(Array.isArray(p)?p:[]);
      setDaily(Array.isArray(d)?d:[]); setRecent(Array.isArray(r)?r:[]);
      setLoading(false);
    }).catch(()=>setLoading(false));
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

function ContactDrawer({ contactId, onClose, onEdit, onDelete, onOpenConversation, onRefreshList }) {
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
                  <button onClick={() => { onClose(); setTimeout(() => onEdit(contact), 50); }} title="Editar contato" style={{ background:`${C.primary}18`, border:`1px solid ${C.primary}35`, color:C.primary, borderRadius:8, padding:'7px 10px', cursor:'pointer', fontSize:17 }}>✏️</button>
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
  const [stages, setStages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const load = useCallback(async ()=>{
    try {
      const [s,c]=await Promise.all([pipelineApi.stages(),contactsApi.list()]);
      setStages(s); setContacts(Array.isArray(c.contacts)?c.contacts:[]);
    } catch { toast.error('Erro ao carregar pipeline'); }
    setLoading(false);
  },[]);

  useEffect(()=>{ load(); },[load]);

  const handleDrop=async(e,targetStageId)=>{
    e.preventDefault();
    if(!dragging||dragging.stage===targetStageId){ setDragging(null); setDragOver(null); return; }
    setContacts(prev=>prev.map(c=>c.id===dragging.id?{...c,pipeline_stage:targetStageId}:c));
    try { await contactsApi.setStage(dragging.id,targetStageId); toast.success('Contato movido!'); }
    catch { setContacts(prev=>prev.map(c=>c.id===dragging.id?{...c,pipeline_stage:dragging.stage}:c)); toast.error('Erro ao mover'); }
    setDragging(null); setDragOver(null);
  };

  if(loading) return <div style={{color:C.dim,padding:20}}>Carregando pipeline...</div>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      <div>
        <h2 style={{fontSize:28,fontWeight:800,color:C.text,marginBottom:4}}>Pipeline Kanban</h2>
        <p style={{color:C.dim,fontSize:14}}>Arraste os cartões entre colunas para mover leads no funil.</p>
      </div>
      <div style={{overflowX:'auto',paddingBottom:20}}>
        <div style={{display:'flex',gap:20,minWidth:stages.length*288}}>
          {stages.map(s=>{
            const sc=contacts.filter(c=>c.pipeline_stage===s.id);
            const sv=sc.reduce((a,c)=>a+(Number(c.pipeline_value)||0),0);
            const color=s.color||STAGE_COLORS[s.id]||C.primary;
            const isDrag=dragOver===s.id;
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
                      <div key={c.id} draggable
                        onDragStart={e=>{ setDragging({id:c.id,stage:c.pipeline_stage}); e.dataTransfer.effectAllowed='move'; }}
                        onDragEnd={()=>{ setDragging(null); setDragOver(null); }}
                        style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:14,cursor:'grab',transition:'all 0.15s',opacity:dragging?.id===c.id?0.35:1}}
                        onMouseOver={e=>{ e.currentTarget.style.borderColor=color; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)'; }}
                        onMouseOut={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                          <Avatar name={c.name} size={30} />
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:13,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
                            <div style={{color:C.dim,fontSize:11}}>{c.phone}</div>
                          </div>
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
      <div style={{display:'flex',gap:4,marginBottom:24,background:C.surface,borderRadius:14,padding:4,border:`1px solid ${C.border}`,width:'fit-content'}}>
        {[{id:'whatsapp',label:'⚙️ WhatsApp'}, ...(isAdmin?[{id:'users',label:'👥 Usuários'}]:[])].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'8px 18px',borderRadius:10,border:'none',cursor:'pointer',fontSize:13,fontWeight:700,
            background:tab===t.id?`linear-gradient(135deg,${C.primary},${C.purple})`:'transparent',
            color:tab===t.id?'#fff':C.muted,transition:'all 0.18s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'users' && isAdmin && <UserManagement />}

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

// ─── User Management ──────────────────────────────────────────────────────────

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const roleLabel = (r) => r === 'master' ? '👑 Master' : r === 'admin' ? '🛡️ Admin' : '👤 Usuário';
  const statusColor = (s) => s === 'active' ? C.success : s === 'pending' ? C.warning : C.danger;
  const statusLabel = (s) => s === 'active' ? 'Ativo' : s === 'pending' ? 'Pendente' : 'Suspenso';
  const pending = users.filter(u => u.status === 'pending');

  if (loading) return <div style={{color:C.dim,padding:20}}>Carregando usuários...</div>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
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

      <Card title="👥 Todos os Usuários">
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {users.map(u => (
            <div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'14px',background:C.bg,borderRadius:12,border:`1px solid ${C.border}`,flexWrap:'wrap'}}>
              <Avatar name={u.name} size={38} />
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontSize:14,fontWeight:700,color:C.text}}>{u.name}</div>
                <div style={{fontSize:12,color:C.dim}}>{u.email}</div>
              </div>
              <Badge color={statusColor(u.status)}>{statusLabel(u.status)}</Badge>
              <span style={{fontSize:12,color:C.muted}}>{roleLabel(u.role)}</span>
              {isMaster && u.role !== 'master' && (
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {u.status !== 'active' && <Btn size="sm" variant="success" onClick={() => updateStatus(u.id, 'active')}>Ativar</Btn>}
                  {u.status === 'active' && <Btn size="sm" variant="outline" onClick={() => updateStatus(u.id, 'suspended')}>Suspender</Btn>}
                  <select value={u.role} onChange={e => updateRole(u.id, e.target.value)} style={{padding:'5px 10px',borderRadius:8,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:12,cursor:'pointer'}}>
                    <option value="user">Usuário</option>
                    <option value="admin">Admin</option>
                    <option value="master">Master</option>
                  </select>
                  <Btn size="sm" variant="danger" onClick={() => deleteUser(u.id)}>🗑️</Btn>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
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

  if (!authed) return <LoginPage onLogin={(user) => { setCurrentUser(user); setAuthed(true); }} />;

  const wpColor=wpState==='open'?C.success:wpState==='checking'?C.warning:C.danger;
  const wpLabel=wpState==='open'?'Conectado':wpState==='checking'?'Verificando...':'Desconectado';

  const pagePad = isMobile ? '16px' : '40px 52px';

  // Atalho Ctrl+K para busca
  useEffect(()=>{
    const h=(e)=>{ if((e.metaKey||e.ctrlKey)&&e.key==='k'){ e.preventDefault(); setSearchOpen(true); } if(e.key==='Escape') setSearchOpen(false); };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[]);

  // ── Sidebar content (shared between mobile overlay and desktop) ──
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
        {NAV.map(p=>{
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
              {NAV.map(p=>{
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
