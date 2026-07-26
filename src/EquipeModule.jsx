import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X, ArrowRight } from 'lucide-react';
import api from './api';

const META = {
  metaDispatcher:  { name:'Dante',     zone:0, cat:'whatsapp' },
  communityAgent:  { name:'Marta',     zone:0, cat:'whatsapp' },
  agente_sdr:      { name:'Maria',     zone:0, cat:'whatsapp' },
  emailDispatcher: { name:'Rita',      zone:1, cat:'email' },
  emailImap:       { name:'Leo',       zone:1, cat:'email' },
  blogAgent:       { name:'Clarice',   zone:2, cat:'content' },
  ideaAgent:       { name:'Chico',     zone:2, cat:'content' },
  mediaAgent:      { name:'Dora',      zone:2, cat:'content' },
  chiefAgent:      { name:'Osvaldo',   zone:3, cat:'strategy' },
  insightsAgent:   { name:'Ivone',     zone:3, cat:'strategy' },
  strategyAgent:   { name:'General',   zone:3, cat:'strategy' },
  coachAgent:      { name:'Carmem',    zone:3, cat:'strategy' },
  agente_agendador:{ name:'Tobias',    zone:3, cat:'strategy' },
  securityAgent:   { name:'Nascimento',zone:4, cat:'security' },
  trafficAgent:    { name:'Sofia',     zone:2, cat:'content' },
};

const ZONES = [
  { name:'WhatsApp Bay',  color:'#22c55e', left:'1%',  right:'21%' },
  { name:'Email Station', color:'#a855f7', left:'22%', right:'37%' },
  { name:'Content Studio',color:'#f97316', left:'38%', right:'57%' },
  { name:'Strategy HQ',   color:'#06b6d4', left:'58%', right:'83%' },
  { name:'Security Hub',  color:'#ef4444', left:'84%', right:'98%' },
];

const CONNECTIONS = [
  { from:'metaDispatcher', to:'agente_sdr', label:'Prospects → SDR' },
  { from:'emailDispatcher', to:'emailImap', label:'Envios → IMAP' },
  { from:'emailImap', to:'agente_sdr', label:'Replies → SDR' },
  { from:'communityAgent', to:'metaDispatcher', label:'Novos membros' },
  { from:'strategyAgent', to:'metaDispatcher', label:'Plano cadência' },
  { from:'strategyAgent', to:'emailDispatcher', label:'Segmentação' },
  { from:'insightsAgent', to:'chiefAgent', label:'Relatório' },
  { from:'coachAgent', to:'agente_sdr', label:'Tom de voz' },
  { from:'ideaAgent', to:'blogAgent', label:'Pautas' },
  { from:'mediaAgent', to:'blogAgent', label:'Assets' },
  { from:'blogAgent', to:'chiefAgent', label:'Artigos' },
  { from:'securityAgent', to:'chiefAgent', label:'Alertas seg.' },
  { from:'securityAgent', to:'metaDispatcher', label:'Status API' },
  { from:'securityAgent', to:'emailDispatcher', label:'Status SMTP' },
  { from:'metaDispatcher', to:'chiefAgent', label:'Métricas WPP' },
  { from:'emailDispatcher', to:'chiefAgent', label:'Métricas Email' },
  { from:'trafficAgent', to:'chiefAgent', label:'Brain de Tráfego' },
  { from:'trafficAgent', to:'strategyAgent', label:'Estratégia de Ads' },
];

const QUOTES = {
  metaDispatcher:'Disparando...', communityAgent:'Bora!', agente_sdr:'Lead novo!',
  emailDispatcher:'Taxa subindo!', emailImap:'Reply!', blogAgent:'Escrevendo...',
  chiefAgent:'Resultado?', securityAgent:'Seguro.', agente_agendador:'Que dia é?',
  trafficAgent:'CTR baixo? Testa o gancho!',
};

const OFFICE_BG = '/templates/office-bg.webp';
const AVATAR = '/templates/agent-avatar.webp';
const TABS = [
  { id:'office', icon:'🏢', label:'Escritório' },
  { id:'connections', icon:'🔗', label:'Conexões' },
  { id:'insights', icon:'📊', label:'Insights' },
];

/* ══════════════════════════════════════════════════════════════════════════════ */
export default function EquipeModule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('office');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/equipe/status');
      setData(res.data);
    } catch (e) {
      console.error('[Equipe] Erro ao carregar:', e?.response?.status, e?.message);
      setError(e?.response?.status === 401 
        ? 'Sessão expirada. Faça login novamente.' 
        : `Erro ${e?.response?.status || 'desconhecido'} ao carregar agentes. Tente recarregar.`
      );
    }
    setLoading(false);
  }, []);
  useEffect(()=>{load();const i=setInterval(load,60000);return()=>clearInterval(i)},[load]);

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',background:'#050510',color:'#555'}}>🏢 Carregando agentes...</div>;

  if (error) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',background:'#050510',gap:16}}>
      <div style={{fontSize:48}}>⚠️</div>
      <div style={{color:'#ef4444',fontSize:14,textAlign:'center',maxWidth:400}}>{error}</div>
      <button onClick={load} style={{padding:'8px 20px',background:'#f97316',border:'none',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:13,fontWeight:600}}>🔄 Tentar Novamente</button>
    </div>
  );

  const m = data?.metrics||{};
  const agents = [...(data?.agents?.vps||[]), ...(data?.agents?.n8n||[])];
  const active = agents.filter(a=>a.status==='active');

  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',background:'#050510',overflow:'hidden',fontFamily:'system-ui,sans-serif'}}>
      <style>{`
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes ping{75%,100%{transform:scale(2.5);opacity:0}}
      `}</style>

      {/* HUD */}
      <div style={{flexShrink:0,padding:'8px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',
        background:'rgba(0,0,0,0.7)',borderBottom:'1px solid #1a1a2e',backdropFilter:'blur(8px)',zIndex:30,fontSize:12}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <span style={{fontWeight:800,color:'#f97316',letterSpacing:'0.04em'}}>VIGA OFFICE</span>
          {TABS.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?'#1a1a2e':'transparent',border:'none',color:tab===t.id?'#fff':'#666',padding:'3px 10px',borderRadius:5,fontSize:11,cursor:'pointer',fontWeight:tab===t.id?600:400}}>{t.icon} {t.label}</button>))}
          <span style={{fontSize:10,color:'#555'}}>{new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'short'})}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12,fontSize:10}}>
          <span style={{color:'#777'}}>WPP <b style={{color:'#22c55e'}}>{m.meta?.enviados_hoje||0}</b></span>
          <span style={{color:'#777'}}>EMAIL <b style={{color:'#a855f7'}}>{m.email?.sent||0}</b></span>
          <span style={{color:'#777'}}>BLOG <b style={{color:'#f97316'}}>{m.blog?.posts||0}</b></span>
          <span style={{color:active.length===agents.length?'#22c55e':'#eab308',fontWeight:700}}>{active.length}/{agents.length} ON</span>
          <button onClick={load} style={{background:'none',border:'none',color:'#555',cursor:'pointer'}}><RefreshCw size={13}/></button>
        </div>
      </div>

      <div style={{flex:1,overflow:'auto'}}>
        {tab==='office' && <Office agents={agents} onSelect={setSelected} />}
        {tab==='connections' && <Connections agents={agents} />}
        {tab==='insights' && <Insights agents={agents} metrics={m} />}
      </div>

      {selected && <Modal agent={selected} onClose={()=>setSelected(null)} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   OFFICE — background DALL-E + avatares DALL-E posicionados
   ══════════════════════════════════════════════════════════════════════════════ */
function Office({ agents, onSelect }) {
  return (
    <div style={{position:'relative',width:'100%',aspectRatio:'16/9',minHeight:360}}>
      <img src={OFFICE_BG} alt="Office" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}} />

      {ZONES.map((zone,zi) => {
        const za = agents.filter(a=>META[a.id]?.zone===zi);
        return za.map((a,i)=>{
          const cfg = META[a.id]||{name:a.name};
          const alive = a.status==='active';
          const t = za.length;
          const x = parseFloat(zone.left) + (parseFloat(zone.right)-parseFloat(zone.left))*(i+0.5)/t;
          const y = 56 + Math.sin(i*2.3)*3;
          return <AvatarSprite key={a.id} agent={a} name={cfg.name} alive={alive} color={zone.color} x={x} y={y} onSelect={onSelect} />;
        });
      })}

      {/* Zone labels */}
      {ZONES.map((z,zi)=>(<div key={zi} style={{position:'absolute',top:'2%',left:z.left,fontSize:10,fontWeight:700,color:z.color,textShadow:`0 0 8px ${z.color}40`,letterSpacing:'0.04em',textTransform:'uppercase'}}>{z.name} <span style={{opacity:0.5,fontSize:8}}>({agents.filter(a=>META[a.id]?.zone===zi).length})</span></div>))}
    </div>
  );
}

function AvatarSprite({ agent, name, alive, color, x, y, onSelect }) {
  const [ox, setOx] = useState(0);
  const [talk, setTalk] = useState('');

  useEffect(()=>{
    const w=setInterval(()=>setOx(Math.random()*2.5-1.2),3500+Math.random()*4000);
    const s=setInterval(()=>{setTalk(QUOTES[agent.id]||'...');setTimeout(()=>setTalk(''),3000)},7000+Math.random()*8000);
    return ()=>{clearInterval(w);clearInterval(s)};
  },[]);

  return (
    <div onClick={()=>onSelect(agent)} style={{
      position:'absolute',left:`${x+ox}%`,top:`${y}%`,transform:'translate(-50%,-50%)',
      transition:'left 1.4s cubic-bezier(0.25,0.1,0.25,1)',cursor:'pointer',zIndex:10,
      display:'flex',flexDirection:'column',alignItems:'center',gap:1,
    }}>
      {talk&&<div style={{position:'absolute',bottom:'110%',left:'50%',transform:'translateX(-50%)',background:'#fff',color:'#111',padding:'2px 7px',borderRadius:4,fontSize:8,fontWeight:600,whiteSpace:'nowrap',zIndex:20,boxShadow:'0 2px 6px rgba(0,0,0,0.5)'}}>{talk}<div style={{position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',width:0,height:0,borderLeft:'3px solid transparent',borderRight:'3px solid transparent',borderTop:'3px solid #fff'}}/></div>}
      <div style={{position:'relative',width:32,height:32}}>
        <img src={AVATAR} alt="" style={{width:'100%',height:'100%',objectFit:'contain',filter:alive?`drop-shadow(0 0 6px ${color}50) brightness(1.1)`:'grayscale(100%) brightness(0.4)',opacity:alive?1:0.4}}/>
        <div style={{position:'absolute',inset:0,background:alive?color:'#333',mixBlendMode:'color',borderRadius:'50%',opacity:0.35}}/>
        <div style={{position:'absolute',top:-2,right:-2,width:7,height:7,borderRadius:'50%',background:alive?'#22c55e':'#555',border:'1px solid #000'}}>{alive&&<div style={{width:'100%',height:'100%',borderRadius:'50%',background:'#22c55e',animation:'ping 1.5s infinite',opacity:0.5}}/>}</div>
      </div>
      <span style={{fontSize:8,fontWeight:600,color:alive?'#ddd':'#333'}}>{name}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   CONNECTIONS — flow graph
   ══════════════════════════════════════════════════════════════════════════════ */
function Connections({ agents }) {
  const cats = {whatsapp:'#22c55e',email:'#a855f7',content:'#f97316',strategy:'#06b6d4',security:'#ef4444'};
  const groups = {};
  agents.forEach(a=>{const c=META[a.id]?.cat||'strategy';if(!groups[c])groups[c]=[];groups[c].push(a)});

  return (
    <div style={{padding:24}}>
      <h3 style={{fontSize:14,fontWeight:700,color:'#fff',margin:'0 0 4px'}}>Mapa de Conexões</h3>
      <p style={{fontSize:11,color:'#666',margin:'0 0 16px'}}>Fluxo de dados e dependências entre agentes</p>
      <div style={{display:'flex',gap:12,overflowX:'auto'}}>
        {Object.entries(groups).map(([cat,ga])=>(
          <div key={cat} style={{flex:1,minWidth:150,background:'#111118',border:`1px solid ${cats[cat]}20`,borderRadius:12,padding:12}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',color:cats[cat],marginBottom:10}}>{cat==='whatsapp'?'📱 WhatsApp':cat==='email'?'📧 Email':cat==='content'?'✍️ Conteúdo':cat==='strategy'?'🎯 Estratégia':'🛡️ Segurança'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {ga.map(a=>{
                const cfg=META[a.id]||{name:a.name};const alive=a.status==='active';
                const incoming=CONNECTIONS.filter(c=>c.to===a.id);
                const outgoing=CONNECTIONS.filter(c=>c.from===a.id);
                return (<div key={a.id} style={{background:'#0a0a12',borderRadius:8,padding:'6px 8px',border:`1px solid ${alive?'#1a1a2e':'#111'}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:(incoming.length||outgoing.length)?5:0}}>
                    <span style={{fontSize:14,filter:alive?'none':'grayscale(1) opacity(0.3)'}}>{cfg.name[0]||'🤖'}</span>
                    <div><div style={{fontSize:10,fontWeight:600,color:alive?'#ccc':'#444'}}>{cfg.name}</div><div style={{fontSize:8,color:cats[cat]}}>{a.name}</div></div>
                  </div>
                  {[...incoming.map(c=>({...c,type:'in'})),...outgoing.map(c=>({...c,type:'out'}))].slice(0,3).map((c,i)=>(<div key={i} style={{display:'flex',alignItems:'center',gap:4,fontSize:8,padding:'1px 0 1px 5px',borderLeft:`2px solid ${c.type==='in'?'#22c55e':'#f97316'}`}}><span style={{color:c.type==='in'?'#22c55e':'#f97316'}}>{c.type==='in'?'←':'→'}</span><span style={{color:'#777'}}>{c.type==='in'?META[c.from]?.name:c.type==='out'?META[c.to]?.name:''}</span></div>))}
                </div>);
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:14,fontSize:9,color:'#555',marginTop:10}}><span>← <span style={{color:'#22c55e'}}>Recebe</span></span><span>→ <span style={{color:'#f97316'}}>Envia</span></span></div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   INSIGHTS — performance + recommendations
   ══════════════════════════════════════════════════════════════════════════════ */
function Insights({ agents, metrics:m }) {
  const suggestions = [];
  if ((m.meta?.enviados_hoje||0)<10&&(m.meta?.prospects_na_fila||0)>50000) suggestions.push({agent:'metaDispatcher',text:'Fila com '+((m.meta?.prospects_na_fila||0)/1000).toFixed(0)+'k prospects. Aumentar limite diário.',sev:'high'});
  if ((m.meta?.enviados_hoje||0)===0&&(m.meta?.total_enviados||0)>0) suggestions.push({agent:'metaDispatcher',text:'Zero envios hoje. Verificar dispatcher.',sev:'critical'});
  if (parseFloat(m.email?.openRate||0)<20) suggestions.push({agent:'emailDispatcher',text:'Abertura <20%. Testar novas linhas de assunto.',sev:'high'});
  if ((m.blog?.posts||0)===0) suggestions.push({agent:'blogAgent',text:'Nenhum artigo. Verificar OPENAI_API_KEY.',sev:'high'});
  if ((m.prospecting?.reunioes||0)===0&&(m.prospecting?.responderam||0)>5) suggestions.push({agent:'agente_agendador',text:'Leads responderam, zero reuniões. Rever n8n.',sev:'high'});

  const cards = [
    {id:'metaDispatcher',n:'Dante',ico:'📡',m:'WPP Hoje',v:(m.meta?.enviados_hoje||0),s:(m.meta?.total_enviados||0)+' total',c:'#22c55e'},
    {id:'emailDispatcher',n:'Rita',ico:'📬',m:'Emails',v:(m.email?.sent||0),s:`${m.email?.openRate||0}% abertura`,c:'#a855f7'},
    {id:'blogAgent',n:'Clarice',ico:'✍️',m:'Artigos',v:(m.blog?.posts||0),s:m.blog?.ultimo?.title?.substring(0,22)||'',c:'#f97316'},
    {id:'agente_sdr',n:'Maria',ico:'💬',m:'Responderam',v:(m.prospecting?.responderam||0),s:`${(m.prospecting?.reunioes||0)} reuniões`,c:'#22c55e'},
    {id:'securityAgent',n:'Nascimento',ico:'🛡️',m:'Scan',v:'30min',s:'6 alertas',c:'#ef4444'},
    {id:'trafficAgent',n:'Sofia',ico:'🧠',m:'Cérebro',v:'6 tópicos',s:'75 PDFs + 29 lives',c:'#06b6d4'},
    {id:'chiefAgent',n:'Osvaldo',ico:'👔',m:'Online',v:agents.filter(a=>a.status==='active').length,s:`de ${agents.length}`,c:'#eab308'},
  ];

  return (
    <div style={{padding:24}}>
      <h3 style={{fontSize:14,fontWeight:700,color:'#fff',margin:'0 0 4px'}}>Performance & Recomendações</h3>
      <p style={{fontSize:11,color:'#666',margin:'0 0 16px'}}>Métricas individuais e sugestões automáticas</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10,marginBottom:20}}>
        {cards.map(c=>{
          const ad=agents.find(a=>a.id===c.id);const alive=ad?.status==='active';
          const tips=suggestions.filter(s=>s.agent===c.id);
          return (<div key={c.id} style={{background:'#111118',border:`1px solid ${alive?'#1a1a2e':'#111'}`,borderRadius:12,padding:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <div style={{display:'flex',alignItems:'center',gap:5}}><span style={{fontSize:15,filter:alive?'none':'grayscale(1) opacity(0.3)'}}>{c.ico}</span><span style={{fontSize:12,fontWeight:600,color:alive?'#ddd':'#444'}}>{c.n}</span></div>
              <div style={{width:6,height:6,borderRadius:'50%',background:alive?'#22c55e':'#444'}}/>
            </div>
            <div style={{fontSize:24,fontWeight:800,color:c.c,fontFamily:'monospace',lineHeight:1}}>{typeof c.v==='number'?c.v.toLocaleString():c.v}</div>
            <div style={{fontSize:9,color:'#555',margin:'3px 0'}}>{c.m} · {c.s}</div>
            {tips.map((t,i)=>(<div key={i} style={{fontSize:9,padding:'4px 7px',borderRadius:5,background:t.sev==='critical'?'#ef444410':'#f9731610',borderLeft:`2px solid ${t.sev==='critical'?'#ef4444':'#f97316'}`,color:'#999',marginTop:5}}>💡 {t.text}</div>))}
          </div>);
        })}
      </div>

      {/* Funnel */}
      <div style={{background:'#111118',border:'1px solid #1a1a2e',borderRadius:12,padding:16}}>
        <h4 style={{fontSize:12,fontWeight:700,color:'#fff',margin:'0 0 12px'}}>Funil de Conversão</h4>
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          {[{l:'Prospects',v:m.prospecting?.total||0,c:'#4a5568'},{l:'Fila',v:m.prospecting?.novos||0,c:'#3b82f6'},{l:'Enviados',v:m.prospecting?.enviados||0,c:'#f97316'},{l:'Responderam',v:m.prospecting?.responderam||0,c:'#a855f7'},{l:'Reuniões',v:m.prospecting?.reunioes||0,c:'#22c55e'}].map((s,i,a)=>(
            <React.Fragment key={i}>
              <div style={{textAlign:'center',background:'#0a0a12',borderRadius:8,padding:'8px 12px',border:`1px solid ${s.c}20`}}><div style={{fontSize:15,fontWeight:800,color:s.c,fontFamily:'monospace'}}>{s.v.toLocaleString()}</div><div style={{fontSize:8,color:'#777',marginTop:2}}>{s.l}</div></div>
              {i<a.length-1&&<ArrowRight size={12} style={{color:'#333'}}/>}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   CHIEF TASKS — produtividade e tarefas do Chefe
   ══════════════════════════════════════════════════════════════════════════════ */
function ChiefTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    api.get('/equipe/chief/tasks').then(r => {
      setTasks(r.data?.tasks || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleTask = async (task) => {
    const newStatus = task.status === 'concluida' ? 'pendente' : 'concluida';
    setSaving(task.id);
    try {
      await api.patch(`/equipe/chief/tasks/${task.id}`, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? {...t, status: newStatus} : t));
    } catch {}
    setSaving(null);
  };

  const pending = tasks.filter(t => t.status === 'pendente').length;
  const done = tasks.filter(t => t.status === 'concluida').length;
  const total = tasks.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  if (loading) return <div style={{padding:24,color:'#555',fontSize:12}}>Carregando tarefas...</div>;

  return (
    <div style={{padding:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <h3 style={{fontSize:14,fontWeight:700,color:'#fff',margin:'0 0 4px'}}>✅ Tarefas do Chefe</h3>
          <p style={{fontSize:11,color:'#666',margin:0}}>Geradas pelo Chief Agent — planejamento semanal</p>
        </div>
        <button onClick={async () => {
          setLoading(true);
          await api.post('/equipe/chief/run');
          const r = await api.get('/equipe/chief/tasks');
          setTasks(r.data?.tasks || []);
          setLoading(false);
        }} style={{padding:'6px 12px',fontSize:10,background:'#1a1a2e',border:'1px solid #2a2a3e',color:'#f97316',borderRadius:6,cursor:'pointer',fontWeight:600}}>
          🔄 Novo Plano
        </button>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#888',marginBottom:6}}>
            <span>{done}/{total} concluídas</span>
            <span style={{color:progress===100?'#22c55e':progress>50?'#f97316':'#ef4444',fontWeight:700}}>{progress}%</span>
          </div>
          <div style={{height:6,background:'#1a1a2e',borderRadius:3,overflow:'hidden'}}>
            <div style={{height:'100%',background:progress===100?'#22c55e':progress>50?'#f97316':'#ef4444',borderRadius:3,transition:'width 0.3s',width:`${progress}%`}}/>
          </div>
        </div>
      )}

      {/* Task list */}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {tasks.length === 0 ? (
          <div style={{textAlign:'center',padding:40,color:'#555',fontSize:12}}>
            Nenhuma tarefa ainda. Clique em "Novo Plano" para o Chief gerar.
          </div>
        ) : (
          tasks.map(task => {
            const done = task.status === 'concluida';
            const prioColor = task.priority === 'alta' ? '#ef4444' : task.priority === 'media' ? '#f97316' : '#3b82f6';
            return (
              <div key={task.id} onClick={() => toggleTask(task)} style={{
                display:'flex',alignItems:'flex-start',gap:10,padding:'12px 14px',
                background:done?'#111118':'#14141e',border:`1px solid ${done?'#1a1a2e':'#1e1e30'}`,
                borderRadius:10,cursor:'pointer',opacity:done?0.6:1,transition:'all 0.15s',
              }}>
                <div onClick={e=>e.stopPropagation()} style={{
                  width:18,height:18,borderRadius:5,border:`2px solid ${done?'#22c55e':prioColor}`,
                  background:done?'#22c55e':'transparent',display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:10,flexShrink:0,marginTop:2,
                }}>
                  {done && '✓'}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                    <span style={{fontSize:12,fontWeight:600,color:done?'#555':'#ddd',textDecoration:done?'line-through':'none'}}>
                      {task.title}
                    </span>
                    <span style={{fontSize:8,fontWeight:700,color:prioColor,background:`${prioColor}15`,padding:'1px 5px',borderRadius:3,textTransform:'uppercase'}}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && <div style={{fontSize:10,color:'#666',lineHeight:1.4}}>{task.description}</div>}
                  <div style={{fontSize:8,color:'#444',marginTop:4}}>
                    {new Date(task.created_at).toLocaleDateString('pt-BR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════════════════════════════════════════ */
function Modal({ agent, onClose }) {
  const cfg=META[agent.id]||{name:agent.name};const [logs,setLogs]=useState(null);
  const sc={active:'#22c55e',paused:'#eab308',error:'#ef4444'}[agent.status]||'#555';
  useEffect(()=>{setLogs(null)},[agent.id]);
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,backdropFilter:'blur(3px)'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#12121e',border:'1px solid #2a2a3e',borderRadius:12,width:380,maxWidth:'90vw',maxHeight:'80vh',overflow:'auto'}}>
        <div style={{padding:'14px 18px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid #1e1e30'}}>
          <span style={{fontSize:26}}>{(cfg.name||'?')[0]}</span>
          <div style={{flex:1}}><div style={{fontWeight:700,color:'#fff',fontSize:13}}>{cfg.name}</div><div style={{fontSize:9,color:'#777'}}>{agent.name}</div></div>
          <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:6,height:6,borderRadius:'50%',background:sc,boxShadow:`0 0 5px ${sc}`}}/><span style={{fontSize:8,fontWeight:700,textTransform:'uppercase',color:sc}}>{agent.status}</span></div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#555',cursor:'pointer'}}><X size={14}/></button>
        </div>
        <div style={{padding:'14px 18px'}}>
          <p style={{fontSize:10,color:'#999',lineHeight:1.6,margin:'0 0 10px'}}>{agent.description}</p>
          <div style={{fontSize:9,color:'#555',marginBottom:10}}>Schedule: <span style={{color:'#bbb'}}>{agent.schedule||'—'}</span></div>
          <button onClick={async()=>{try{setLogs((await api.get(`/equipe/logs/${agent.id}?limit=6`).then(r=>r.data)).logs||[])}catch{setLogs([])}}} style={{width:'100%',padding:7,fontSize:10,background:'#1a1a2e',border:'1px solid #2a2a3e',color:'#fff',borderRadius:6,cursor:'pointer'}}>Ver Logs</button>
          {logs&&<div style={{marginTop:8,background:'#0a0a12',border:'1px solid #1e1e30',borderRadius:6,padding:8,maxHeight:130,overflowY:'auto',fontFamily:'monospace',fontSize:8,color:'#22c55e'}}>{logs.length===0?'Nenhum log':logs.map((l,i)=><div key={i}>&gt; {l.template_name||l.title||l.recipient_email||l.status||'-'}</div>)}</div>}
        </div>
      </div>
    </div>
  );
}
