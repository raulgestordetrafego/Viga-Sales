// ─── Viga Tasks — Módulo de Organização ──────────────────────────────────────
// Integrado ao Viga Sales sem alterar nenhum componente existente.
// Dados persistidos em localStorage (chave: 'viga-tasks-data').
// Para migrar para o banco SQLite, basta trocar loadData/saveData por chamadas de API.

import React, { useState, useEffect, useRef } from 'react';

// ─── Design tokens (espelha os do App.jsx) ───────────────────────────────────
const C = {
  bg:      '#0a0d14',
  surface: '#131720',
  card:    '#1a1f2e',
  card2:   '#1f2435',
  border:  '#232840',
  text:    '#e8edf5',
  muted:   '#8b95b0',
  dim:     '#505878',
  primary: '#6366f1',
  purple:  '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  danger:  '#ef4444',
  teal:    '#14b8a6',
  pink:    '#ec4899',
  sky:     '#0ea5e9',
};

const PROJECT_COLORS = [
  { key: 'indigo',  val: '#6366f1' },
  { key: 'purple',  val: '#8b5cf6' },
  { key: 'teal',    val: '#14b8a6' },
  { key: 'success', val: '#10b981' },
  { key: 'warning', val: '#f59e0b' },
  { key: 'danger',  val: '#ef4444' },
  { key: 'pink',    val: '#ec4899' },
  { key: 'sky',     val: '#0ea5e9' },
];

const COL_COLORS = {
  'A Fazer':       C.dim,
  'Em Andamento':  C.sky,
  'Em Revisão':    C.warning,
  'Concluído':     C.success,
  'Bloqueado':     C.danger,
};

const PRIO_STYLE = {
  Alta:  { bg: `${C.danger}20`,  color: C.danger  },
  Média: { bg: `${C.warning}20`, color: C.warning },
  Baixa: { bg: `${C.success}20`, color: C.success },
};

// ─── Dados iniciais ───────────────────────────────────────────────────────────
const INITIAL = {
  projects: [
    {
      id: 1, name: 'Onboarding de Clientes', color: '#6366f1',
      description: 'Processo de entrada e ativação de novos clientes',
      columns: ['A Fazer', 'Em Andamento', 'Em Revisão', 'Concluído'],
      tasks: [
        { id: 101, title: 'Enviar contrato de serviço',       column: 'Concluído',     priority: 'Alta',  due: '2026-03-10', tags: ['Jurídico'], description: '', checklist: [{text:'Gerar PDF',done:true},{text:'Enviar por email',done:true}], comments: [] },
        { id: 102, title: 'Agendar reunião de kickoff',       column: 'Concluído',     priority: 'Alta',  due: '2026-03-12', tags: [],           description: '', checklist: [], comments: [] },
        { id: 103, title: 'Configurar acesso ao sistema',     column: 'Em Andamento',  priority: 'Alta',  due: '2026-03-18', tags: ['Tech'],      description: 'Criar usuário e configurar permissões.', checklist: [{text:'Criar login',done:true},{text:'Definir permissões',done:false}], comments: [] },
        { id: 104, title: 'Treinamento inicial do cliente',   column: 'A Fazer',       priority: 'Média', due: '2026-03-22', tags: ['Treinamento'], description: '', checklist: [], comments: [] },
        { id: 105, title: 'Enviar guia de boas-vindas',       column: 'A Fazer',       priority: 'Baixa', due: '2026-03-25', tags: [],           description: '', checklist: [], comments: [] },
      ],
    },
    {
      id: 2, name: 'Marketing & Conteúdo', color: '#ec4899',
      description: 'Campanhas, redes sociais e geração de leads',
      columns: ['A Fazer', 'Em Andamento', 'Em Revisão', 'Concluído'],
      tasks: [
        { id: 201, title: 'Post blog — Tendências do setor', column: 'Em Andamento', priority: 'Média', due: '2026-03-20', tags: ['Blog'], description: '', checklist: [], comments: [] },
        { id: 202, title: 'Campanha LinkedIn Q2',            column: 'A Fazer',      priority: 'Alta',  due: '2026-04-01', tags: ['Ads'],  description: '', checklist: [], comments: [] },
        { id: 203, title: 'Atualizar landing page',          column: 'Em Revisão',   priority: 'Média', due: '2026-03-19', tags: ['Site'], description: '', checklist: [], comments: [] },
      ],
    },
    {
      id: 3, name: 'Produto & Tech', color: '#8b5cf6',
      description: 'Desenvolvimento, bugs e novas funcionalidades',
      columns: ['A Fazer', 'Em Andamento', 'Em Revisão', 'Concluído', 'Bloqueado'],
      tasks: [
        { id: 301, title: 'Integração API WhatsApp',    column: 'Em Andamento', priority: 'Alta',  due: '2026-03-25', tags: ['API'],  description: '', checklist: [], comments: [] },
        { id: 302, title: 'Dashboard de métricas v2',   column: 'A Fazer',      priority: 'Média', due: '2026-04-10', tags: ['Front'],description: '', checklist: [], comments: [] },
        { id: 303, title: 'Bug: relatório de vendas',   column: 'Bloqueado',    priority: 'Alta',  due: '2026-03-17', tags: ['Bug'],  description: 'Relatório não carrega para contas enterprise.', checklist: [], comments: [] },
      ],
    },
  ],
};

// ─── Persistência ─────────────────────────────────────────────────────────────
function load() {
  try { const r = localStorage.getItem('viga-tasks-data'); if (r) return JSON.parse(r); } catch (_) {}
  return INITIAL;
}
function save(data) {
  try { localStorage.setItem('viga-tasks-data', JSON.stringify(data)); } catch (_) {}
}

// ─── Utils ────────────────────────────────────────────────────────────────────
const genId  = () => Date.now() + Math.floor(Math.random() * 9999);
const fmtDue = (d) => { if (!d) return ''; return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); };
const overdue = (t) => t.due && new Date(t.due + 'T00:00:00') < new Date(new Date().toDateString()) && t.column !== 'Concluído';

// ─── Recorrência ──────────────────────────────────────────────────────────────
const RECURRENCE_LABELS = { '': 'Sem recorrência', 'Diário': '🔁 Diário', 'Semanal': '🔁 Semanal', 'Mensal': '🔁 Mensal' };
function calcNextDue(due, recurrence) {
  const base = due ? new Date(due + 'T00:00:00') : new Date();
  if (recurrence === 'Diário')  base.setDate(base.getDate() + 1);
  else if (recurrence === 'Semanal') base.setDate(base.getDate() + 7);
  else if (recurrence === 'Mensal')  base.setMonth(base.getMonth() + 1);
  return base.toISOString().split('T')[0];
}

// ─── Google Calendar link ─────────────────────────────────────────────────────
function gcalLink(task) {
  const title = encodeURIComponent(task.title || '');
  const details = encodeURIComponent(task.description || '');
  let dates = '';
  if (task.due) {
    const s = task.due.replace(/-/g, '');
    const e = new Date(task.due + 'T00:00:00'); e.setDate(e.getDate() + 1);
    dates = `${s}/${e.toISOString().split('T')[0].replace(/-/g,'')}`;
  } else {
    const t = new Date(), e = new Date(t); e.setDate(e.getDate() + 1);
    const fmt = d => d.toISOString().split('T')[0].replace(/-/g,'');
    dates = `${fmt(t)}/${fmt(e)}`;
  }
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`;
}

// ─── Templates da Agência ─────────────────────────────────────────────────────
const TEMPLATES = [
  { id:'tpl1', icon:'📊', name:'Revisão Diária de Contas',         recurrence:'Diário',  priority:'Alta',  tags:['Rotina','Ads'],        description:'Verificar métricas, budget, CPL e performance das campanhas ativas. Checar alertas de conta.' },
  { id:'tpl2', icon:'⚙️',  name:'Otimização Semanal de Campanhas', recurrence:'Semanal', priority:'Alta',  tags:['Otimização','Ads'],    description:'Ajuste de lances, pausar criativos de baixa performance, escalar os bons. Revisar públicos.' },
  { id:'tpl3', icon:'📈', name:'Relatório Mensal para Cliente',    recurrence:'Mensal',  priority:'Alta',  tags:['Relatório','Cliente'], description:'Elaborar relatório com resultados do mês: CPL, ROAS, alcance, leads e recomendações.' },
  { id:'tpl4', icon:'🧾', name:'Ficha de Cliente — Onboarding',   recurrence:'',        priority:'Alta',  tags:['Onboarding','Cliente'],description:'Preencher ficha completa: nicho, produto, público, verba, objetivos, concorrentes e materiais disponíveis.' },
  { id:'tpl5', icon:'🔍', name:'Auditoria de Pixel/Tags',         recurrence:'Mensal',  priority:'Média', tags:['Técnico','Pixel'],     description:'Verificar se todos os eventos do pixel estão disparando corretamente. Testar com Pixel Helper.' },
  { id:'tpl6', icon:'💰', name:'Verificação de Budget Diário',    recurrence:'Diário',  priority:'Alta',  tags:['Budget','Ads'],        description:'Conferir se o gasto do dia está dentro do esperado. Ajustar limites diários se necessário.' },
  { id:'tpl7', icon:'🎨', name:'Revisão de Criativos',            recurrence:'Semanal', priority:'Média', tags:['Criativo','Design'],   description:'Avaliar performance dos criativos ativos. Solicitar novos se frequência acima de 2,5.' },
  { id:'tpl8', icon:'📞', name:'Follow-up com Cliente',           recurrence:'Semanal', priority:'Média', tags:['Cliente','CRM'],       description:'Alinhar expectativas, apresentar resultados parciais e coletar feedbacks para melhorias.' },
  { id:'tpl9', icon:'🧪', name:'Teste A/B de Criativos',         recurrence:'Mensal',  priority:'Média', tags:['Teste','Criativo'],    description:'Criar e lançar teste A/B com pelo menos 2 novos criativos para validar hipóteses.' },
  { id:'tpl10',icon:'🕵️', name:'Análise de Concorrência',        recurrence:'Mensal',  priority:'Baixa', tags:['Estratégia'],          description:'Verificar anúncios e estratégias dos concorrentes na Biblioteca de Anúncios do Meta/Google.' },
];

// ─── Coaching Tips ────────────────────────────────────────────────────────────
const COACHING_TIPS = [
  { icon:'📊', cat:'Métricas',     text:'Sempre cheque o CPL pela manhã. Se estiver >20% acima da meta, pause os conjuntos de anúncios mais caros imediatamente.' },
  { icon:'🎯', cat:'Estratégia',   text:'Regra de ouro: nunca escale um anúncio que não converte no budget atual. Valide primeiro, escale depois.' },
  { icon:'💬', cat:'Clientes',     text:'Fale com pelo menos 1 cliente por dia — mesmo que seja para compartilhar um resultado positivo. Relacionamento é retenção.' },
  { icon:'🔥', cat:'Criativos',    text:'Criativo com frequência >2.5? Já está saturando. Renove antes de perceber a queda na performance.' },
  { icon:'💰', cat:'Budget',       text:'Budget diário gastando menos de 80% até as 18h? Verifique se o público está muito restrito ou se a entrega está limitada.' },
  { icon:'🧪', cat:'Testes',       text:'Sempre tenha ao menos 1 teste A/B ativo por conta. Quem para de testar, para de crescer.' },
  { icon:'📱', cat:'Criativos',    text:'Vídeos curtos (7-15s) com gancho nos 3 primeiros segundos têm 2× mais chance de manter a atenção no feed.' },
  { icon:'🔍', cat:'Pixel',        text:'Pixel disparando errado é dinheiro jogado fora. Audite os eventos de conversão com o Pixel Helper 1× por semana.' },
  { icon:'📈', cat:'ROAS',         text:'ROAS abaixo de 2? Revise o funil antes de culpar o tráfego — o problema pode estar na landing page.' },
  { icon:'🤝', cat:'Clientes',     text:'Antes de apresentar resultados, contextualize o cenário do período. Isso protege a conta nos meses difíceis.' },
  { icon:'🎨', cat:'Criativos',    text:'UGC converte em média 4× mais que material publicitário tradicional. Peça depoimentos dos clientes regularmente.' },
  { icon:'🚦', cat:'Otimização',   text:'Pare de otimizar antes de 50 eventos de conversão no período. Dados insuficientes = otimizações erradas.' },
  { icon:'📅', cat:'Rotina',       text:'Segunda é para planejar e revisar campanhas. Sexta é para fechar relatórios. Rituais semanais criam consistência.' },
  { icon:'🌍', cat:'Público',      text:'Lookalike de compradores converte 3× mais do que interesses frios. Sempre que possível, use dados próprios.' },
  { icon:'⚡', cat:'Velocidade',   text:'Landing page com >3s de carregamento perde até 40% dos leads. Velocidade é conversão.' },
  { icon:'📦', cat:'Oferta',       text:'Às vezes o problema não é o anúncio — é a oferta. Teste o benefício principal antes de mudar o criativo.' },
  { icon:'🗓', cat:'Planejamento', text:'Planeje criativos com 15 dias de antecedência. Urgência = baixa qualidade. Antecipação = melhores resultados.' },
  { icon:'🔄', cat:'Retenção',     text:'Manter um cliente custa 5× menos do que conquistar um novo. Invista em relatórios bonitos e comunicação constante.' },
  { icon:'💡', cat:'Inovação',     text:'30 minutos por semana na Biblioteca de Anúncios dos concorrentes. Não para copiar — para se inspirar e se antecipar.' },
  { icon:'🏆', cat:'Resultado',    text:'Resultado bom? Documente o que funcionou imediatamente. A memória falha; o registro serve para todos os clientes.' },
  { icon:'📋', cat:'Processos',    text:'Sem processo, você vira escravo da urgência. Com processo, você controla o trabalho. Documente tudo que se repete.' },
  { icon:'🎁', cat:'Proposta',     text:'Nunca envie proposta sem uma call antes. Entender a dor do cliente aumenta a taxa de fechamento em 60%.' },
  { icon:'📉', cat:'Crise',        text:'Conta em queda? Antes de entrar em pânico: verifique pixel ativo, reprovações e se o público não está esgotado.' },
  { icon:'🔑', cat:'Acesso',       text:'Sempre tenha acesso admin ao BM e conta do cliente. Perder acesso no meio de campanha ativa é pesadelo.' },
  { icon:'💬', cat:'Relatório',    text:'O melhor relatório conta uma história: situação → ação → resultado → próximo passo. Não é só número.' },
  { icon:'🕵️', cat:'Concorrência', text:'Analise os 3 maiores concorrentes do seu cliente na Biblioteca de Anúncios 1× por mês. Insights valem ouro.' },
  { icon:'🎬', cat:'Vídeo',        text:'Hook de vídeo: comece com o problema, não com a solução. "Você está perdendo leads por isso..." chama mais atenção.' },
  { icon:'📣', cat:'Copy',         text:'A melhor copy é a que o cliente já usa ao falar do produto. Entreviste compradores satisfeitos para coletar linguagem.' },
  { icon:'🛡', cat:'Segurança',    text:'Conta do cliente com 2FA ativa? BM com backup de admin? Segurança da conta é responsabilidade sua também.' },
  { icon:'🌱', cat:'Crescimento',  text:'Agências que crescem têm processos de onboarding padronizados. Crie um checklist de ativação e use em todo cliente novo.' },
];

const getTodayTip = () => {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((Date.now() - start.getTime()) / 86400000);
  return COACHING_TIPS[day % COACHING_TIPS.length];
};

// ─── Daily Coaching Panel ─────────────────────────────────────────────────────
function DailyCoachingPanel({ data, onDismiss, onSettings }) {
  const tip  = getTodayTip();
  const today = new Date().toISOString().split('T')[0];
  const dueTasks = data.projects.flatMap(p =>
    p.tasks.filter(t => t.due === today && t.column !== 'Concluído')
  );
  const recurringActive = data.projects.flatMap(p =>
    p.tasks.filter(t => t.recurrence && t.column !== 'Concluído')
  ).length;

  const dayName = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

  return (
    <div style={{ background:`linear-gradient(135deg, #1a1f2e 0%, #141824 100%)`, border:`1px solid ${C.border}`, borderLeft:`4px solid ${C.warning}`, borderRadius:18, padding:'20px 24px', marginBottom:28, position:'relative', overflow:'hidden' }}>
      {/* Background decoration */}
      <div style={{ position:'absolute', right:-20, top:-20, fontSize:100, opacity:.04, pointerEvents:'none' }}>{tip.icon}</div>

      <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
        {/* Left: tip */}
        <div style={{ flex:1, minWidth:240 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <span style={{ background:`${C.warning}20`, color:C.warning, fontSize:10, fontWeight:800, padding:'3px 9px', borderRadius:20, textTransform:'uppercase', letterSpacing:'.08em', border:`1px solid ${C.warning}35` }}>☀️ Coaching do dia</span>
            <span style={{ fontSize:11, color:C.dim }}>{dayName}, {dateStr}</span>
          </div>
          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            <span style={{ fontSize:26, flexShrink:0, marginTop:2 }}>{tip.icon}</span>
            <div>
              <span style={{ background:`${C.primary}15`, color:C.primary, fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, border:`1px solid ${C.primary}30`, marginBottom:6, display:'inline-block' }}>{tip.cat}</span>
              <p style={{ margin:0, fontSize:14, color:C.text, lineHeight:1.6, fontWeight:500 }}>{tip.text}</p>
            </div>
          </div>
        </div>

        {/* Right: today summary */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, minWidth:160, alignItems:'flex-end' }}>
          <div style={{ display:'flex', gap:10 }}>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'10px 16px', textAlign:'center', minWidth:72 }}>
              <div style={{ fontSize:22, fontWeight:800, color: dueTasks.length > 0 ? C.warning : C.success }}>{dueTasks.length}</div>
              <div style={{ fontSize:10, color:C.dim, fontWeight:600 }}>para hoje</div>
            </div>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'10px 16px', textAlign:'center', minWidth:72 }}>
              <div style={{ fontSize:22, fontWeight:800, color:C.sky }}>{recurringActive}</div>
              <div style={{ fontSize:10, color:C.dim, fontWeight:600 }}>recorrentes</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onSettings} title="Configurar notificações" style={{ background:C.card, border:`1px solid ${C.border}`, color:C.dim, borderRadius:8, padding:'6px 10px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
              🔔 Notificações
            </button>
            <button onClick={onDismiss} style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.dim, borderRadius:8, padding:'6px 10px', fontSize:12, cursor:'pointer' }}>
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Due today list */}
      {dueTasks.length > 0 && (
        <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${C.border}`, display:'flex', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:C.dim, fontWeight:700, alignSelf:'center' }}>📋 Hoje:</span>
          {dueTasks.slice(0, 5).map(t => (
            <span key={t.id} style={{ background:`${C.warning}12`, color:C.warning, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, border:`1px solid ${C.warning}25` }}>
              {t.title}
            </span>
          ))}
          {dueTasks.length > 5 && <span style={{ fontSize:11, color:C.dim }}>+{dueTasks.length - 5} mais</span>}
        </div>
      )}
    </div>
  );
}

// ─── Coaching Settings Modal ──────────────────────────────────────────────────
function CoachingSettingsModal({ settings, onClose, onSave }) {
  const [enabled, setEnabled] = useState(settings.enabled || false);
  const [time,    setTime]    = useState(settings.time    || '08:00');
  const [perm,    setPerm]    = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') setEnabled(true);
  };

  const permLabel = { granted:'✅ Concedida', denied:'❌ Bloqueada — libere nas config. do browser', default:'⚠️ Não solicitada ainda' };

  return (
    <TModal open onClose={onClose} title="🔔 Coaching Diário" maxWidth={440}>
      <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:20 }}>
        Receba uma dica diária de gestão de agência de tráfego no horário que escolher. A notificação também avisa sobre tarefas com prazo para hoje.
      </p>

      {/* Permission status */}
      <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12, color:C.muted }}>
        <span style={{ fontWeight:700 }}>Permissão do browser: </span>{permLabel[perm]}
        {perm === 'default' && (
          <button onClick={requestPermission} style={{ marginLeft:10, background:`${C.primary}20`, border:`1px solid ${C.primary}40`, color:C.primary, borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
            Solicitar agora
          </button>
        )}
      </div>

      {/* Toggle */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
        <span style={{ fontSize:14, color:C.text, fontWeight:600 }}>Ativar notificação diária</span>
        <button
          onClick={() => perm === 'granted' ? setEnabled(v => !v) : requestPermission()}
          style={{ width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', position:'relative', transition:'background .2s',
            background: enabled && perm === 'granted' ? C.success : C.border }}>
          <div style={{ position:'absolute', top:3, left: enabled && perm === 'granted' ? 22 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.3)' }} />
        </button>
      </div>

      {/* Time */}
      <div style={{ marginBottom:20 }}>
        <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Horário da notificação</label>
        <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{
          background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 13px',
          color:C.text, fontSize:14, outline:'none', fontFamily:'inherit', width:'100%',
        }} />
        <p style={{ fontSize:11, color:C.dim, marginTop:6 }}>Recomendado: 08:00 — antes de começar a checar as campanhas.</p>
      </div>

      {/* Preview */}
      <div style={{ background:`${C.warning}10`, border:`1px solid ${C.warning}30`, borderRadius:10, padding:'12px 14px', marginBottom:20 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.warning, marginBottom:6 }}>Prévia da notificação:</div>
        <div style={{ fontSize:12, color:C.muted, lineHeight:1.5 }}>
          <strong style={{ color:C.text }}>☀️ Viga Sales — Coaching do dia</strong><br />
          {getTodayTip().icon} {getTodayTip().text.slice(0, 80)}...
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
        <button onClick={onClose} style={{ background:C.surface, border:`1px solid ${C.border}`, color:C.muted, borderRadius:10, padding:'10px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>Cancelar</button>
        <button onClick={() => onSave({ enabled: enabled && perm === 'granted', time, perm })} style={{ background:`linear-gradient(135deg,${C.warning},${C.primary})`, border:'none', color:'#fff', borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:`0 4px 14px ${C.warning}40` }}>
          Salvar
        </button>
      </div>
    </TModal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Overlay({ onClick }) {
  return <div onClick={onClick} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(4px)',zIndex:900 }} />;
}

function TModal({ open, onClose, title, children, maxWidth = 560 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <Overlay onClick={onClose} />
      <div style={{ position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',zIndex:901,padding:20,pointerEvents:'none' }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 20,
          width: '100%', maxWidth, maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)', pointerEvents: 'all',
          animation: 'tFadeIn .18s ease-out',
        }}>
          <div style={{ padding: '24px 28px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{title}</div>
            <button onClick={onClose} style={{ background: C.border, border: 'none', color: C.muted, cursor: 'pointer', borderRadius: 8, padding: '4px 10px', fontSize: 14 }}>✕</button>
          </div>
          <div style={{ padding: '20px 28px 28px' }}>{children}</div>
        </div>
      </div>
    </>
  );
}

function TInput({ label, value, onChange, placeholder, type = 'text', autoFocus, required, textarea, rows = 3 }) {
  const [focused, setFocused] = useState(false);
  const base = {
    width: '100%', background: C.bg, border: `1px solid ${focused ? C.primary : C.border}`,
    borderRadius: 10, padding: '10px 13px', color: C.text, fontSize: 14, outline: 'none',
    fontFamily: 'inherit', transition: 'border-color .15s, box-shadow .15s',
    boxShadow: focused ? `0 0 0 3px ${C.primary}22` : 'none',
    resize: textarea ? 'vertical' : 'none',
  };
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{label}{required && <span style={{ color: C.danger }}> *</span>}</label>}
      {textarea
        ? <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} autoFocus={autoFocus} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={base} />
        : <input type={type} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} required={required} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={base} />}
    </div>
  );
}

function TSelect({ label, value, onChange, children }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{label}</label>}
      <select value={value} onChange={onChange} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{
        width: '100%', background: C.bg, border: `1px solid ${focused ? C.primary : C.border}`,
        borderRadius: 10, padding: '10px 13px', color: C.text, fontSize: 14, outline: 'none',
        fontFamily: 'inherit', transition: 'border-color .15s',
      }}>
        {children}
      </select>
    </div>
  );
}

function PriorityBadge({ p }) {
  if (!p) return null;
  const s = PRIO_STYLE[p] || {};
  return <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '.04em', border: `1px solid ${s.color}35` }}>{p}</span>;
}

function StatusPill({ col }) {
  const color = COL_COLORS[col] || C.dim;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:`${color}18`, color, padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:700, border:`1px solid ${color}30`, whiteSpace:'nowrap' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:color, display:'inline-block', flexShrink:0 }} />
      {col}
    </span>
  );
}

function Tag({ children }) {
  return <span style={{ background: `${C.primary}18`, color: C.muted, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, border: `1px solid ${C.border}` }}>{children}</span>;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function TasksDashboard({ data, onOpenProject, onNewProject, onDeleteProject, onUseTemplate }) {
  const allTasks  = data.projects.flatMap(p => p.tasks);
  const total     = allTasks.length;
  const done      = allTasks.filter(t => t.column === 'Concluído').length;
  const inProg    = allTasks.filter(t => t.column === 'Em Andamento').length;
  const late      = allTasks.filter(overdue).length;

  const stats = [
    { label: 'Total de Tarefas',  value: total,             color: C.primary, icon: '📋', sub: `em ${data.projects.length} projetos` },
    { label: 'Concluídas',        value: done,              color: C.success, icon: '✅', sub: `${total ? Math.round(done/total*100) : 0}% do total` },
    { label: 'Em Andamento',      value: inProg,            color: C.sky,     icon: '🔄', sub: 'tarefas ativas' },
    { label: 'Atrasadas',         value: late,              color: C.danger,  icon: '⚠️', sub: 'precisam atenção' },
    { label: 'Projetos',          value: data.projects.length, color: C.purple, icon:'📁', sub: 'workspaces ativos' },
  ];

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:16, marginBottom:32 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background:C.card, borderRadius:18, border:`1px solid ${C.border}`, padding:22, position:'relative', overflow:'hidden', borderTop:`3px solid ${s.color}` }}>
            <div style={{ position:'absolute', top:-4, right:10, fontSize:48, opacity:.06 }}>{s.icon}</div>
            <div style={{ fontSize:10, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:10 }}>{s.label}</div>
            <div style={{ fontSize:36, fontWeight:800, color:C.text, lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:11, color:C.dim, marginTop:6 }}>{s.sub}</div>
            <div style={{ width:36, height:3, background:`linear-gradient(90deg,${s.color},${s.color}55)`, borderRadius:2, marginTop:16 }} />
          </div>
        ))}
      </div>

      {/* Projects grid */}
      <div style={{ fontSize:13, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:14 }}>Projetos</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
        {data.projects.map(p => {
          const pDone = p.tasks.filter(t => t.column === 'Concluído').length;
          const pct   = p.tasks.length ? Math.round(pDone / p.tasks.length * 100) : 0;
          return (
            <div key={p.id} onClick={() => onOpenProject(p.id)} style={{
              background: C.card, borderRadius:18, border:`1px solid ${C.border}`,
              padding:22, cursor:'pointer', position:'relative', overflow:'hidden',
              transition:'all .2s', borderTop:`3px solid ${p.color}`,
            }}
              onMouseOver={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 12px 32px rgba(0,0,0,0.4)`; }}
              onMouseOut={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
              <div style={{ fontSize:15, fontWeight:800, color:C.text, marginBottom:6 }}>{p.name}</div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:16, lineHeight:1.5, minHeight:34 }}>{p.description || 'Sem descrição'}</div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:C.dim, marginBottom:4 }}>{pct}% concluído</div>
                  <div style={{ height:4, background:C.border, borderRadius:2, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:p.color, borderRadius:2, transition:'width .3s' }} />
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                  <span style={{ fontSize:11, color:C.muted, fontWeight:700 }}>{p.tasks.length} tarefas</span>
                  <button onClick={e => { e.stopPropagation(); if(confirm('Excluir projeto?')) onDeleteProject(p.id); }}
                    style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 8px', color:C.dim, cursor:'pointer', fontSize:11 }}
                    onMouseOver={e => { e.currentTarget.style.borderColor=C.danger; e.currentTarget.style.color=C.danger; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.dim; }}>
                    🗑
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* New project card */}
        <div onClick={onNewProject} style={{
          background:'transparent', borderRadius:18, border:`2px dashed ${C.border}`,
          padding:22, cursor:'pointer', display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:8, minHeight:150,
          color:C.dim, transition:'all .2s',
        }}
          onMouseOver={e => { e.currentTarget.style.borderColor=C.primary; e.currentTarget.style.color=C.primary; e.currentTarget.style.background=`${C.primary}08`; }}
          onMouseOut={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.dim; e.currentTarget.style.background='transparent'; }}>
          <div style={{ fontSize:28 }}>＋</div>
          <div style={{ fontSize:13, fontWeight:600 }}>Criar novo projeto</div>
        </div>
      </div>

      {/* ── Templates section ── */}
      {onUseTemplate && data.projects.length > 0 && (
        <div style={{ marginTop:36 }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:14 }}>📋 Modelos de Tarefa</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
            {TEMPLATES.map(tpl => (
              <div key={tpl.id} style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:'14px 16px', cursor:'pointer', transition:'all .15s' }}
                onMouseOver={e => { e.currentTarget.style.borderColor=C.warning; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseOut={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.transform=''; }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:8 }}>
                  <span style={{ fontSize:20 }}>{tpl.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.text, lineHeight:1.3 }}>{tpl.name}</div>
                    <div style={{ fontSize:11, color:C.dim, marginTop:3, lineHeight:1.5 }}>{tpl.description.slice(0,70)}...</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                  <PriorityBadge p={tpl.priority} />
                  {tpl.recurrence && <span style={{ background:`${C.sky}18`, color:C.sky, fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, border:`1px solid ${C.sky}30` }}>🔁 {tpl.recurrence}</span>}
                  {tpl.tags.slice(0,2).map(t => <Tag key={t}>{t}</Tag>)}
                </div>
                <button onClick={() => onUseTemplate(tpl)} style={{ width:'100%', background:`${C.warning}18`, border:`1px solid ${C.warning}35`, color:C.warning, borderRadius:8, padding:'7px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  Usar este modelo →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Kanban ───────────────────────────────────────────────────────────────────
function KanbanBoard({ project, tasks, onOpenTask, onAddTask, onAddCol, onDragStart, onDragOver, onDrop, onDragEnd, dragOverCol }) {
  return (
    <div style={{ display:'flex', gap:14, overflowX:'auto', alignItems:'flex-start', paddingBottom:16, height:'100%' }}>
      {project.columns.map(col => {
        const colTasks = tasks.filter(t => t.column === col);
        const colColor = COL_COLORS[col] || C.dim;
        const isDragOver = dragOverCol === col;
        return (
          <div key={col}
            onDragOver={e => { e.preventDefault(); onDragOver(col); }}
            onDrop={e => { e.preventDefault(); onDrop(col); }}
            style={{
              minWidth: 268, width: 268, background: C.surface, borderRadius: 16,
              border: `1px solid ${isDragOver ? C.primary : C.border}`,
              overflow: 'hidden', flexShrink: 0, display: 'flex', flexDirection: 'column',
              maxHeight: 'calc(100vh - 220px)',
              boxShadow: isDragOver ? `0 0 0 2px ${C.primary}55` : 'none',
              transition: 'border-color .15s, box-shadow .15s',
            }}>
            {/* Column header */}
            <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:8, borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
              <span style={{ width:9, height:9, borderRadius:'50%', background:colColor, flexShrink:0 }} />
              <span style={{ fontSize:13, fontWeight:700, color:C.text, flex:1 }}>{col}</span>
              <span style={{ background:`${colColor}20`, color:colColor, fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10 }}>{colTasks.length}</span>
            </div>
            {/* Tasks */}
            <div style={{ flex:1, overflowY:'auto', padding:10, display:'flex', flexDirection:'column', gap:8 }}>
              {colTasks.map(t => <KanbanCard key={t.id} task={t} onClick={() => onOpenTask(t)} onDragStart={() => onDragStart(t.id)} onDragEnd={onDragEnd} />)}
              <button onClick={() => onAddTask(col)} style={{
                display:'flex', alignItems:'center', gap:6, padding:'8px 10px',
                borderRadius:8, border:`1px dashed ${C.border}`, background:'transparent',
                cursor:'pointer', fontSize:12, color:C.dim, transition:'all .15s', marginTop:2,
              }}
                onMouseOver={e => { e.currentTarget.style.borderColor=C.primary; e.currentTarget.style.color=C.primary; e.currentTarget.style.background=`${C.primary}08`; }}
                onMouseOut={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.dim; e.currentTarget.style.background='transparent'; }}>
                ＋ Adicionar tarefa
              </button>
            </div>
          </div>
        );
      })}
      {/* Add column */}
      <div onClick={onAddCol} style={{
        minWidth:180, background:'transparent', borderRadius:16, border:`2px dashed ${C.border}`,
        display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        cursor:'pointer', color:C.dim, fontSize:13, fontWeight:600, flexShrink:0, minHeight:80,
        transition:'all .15s',
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor=C.primary; e.currentTarget.style.color=C.primary; e.currentTarget.style.background=`${C.primary}08`; }}
        onMouseOut={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.dim; e.currentTarget.style.background='transparent'; }}>
        ＋ Coluna
      </div>
    </div>
  );
}

function KanbanCard({ task, onClick, onDragStart, onDragEnd }) {
  const late = overdue(task);
  const checkDone = task.checklist?.filter(c => c.done).length || 0;
  return (
    <div draggable onClick={onClick}
      onDragStart={e => { e.dataTransfer.effectAllowed='move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '12px 13px', cursor: 'pointer', transition: 'all .15s',
      }}
      onMouseOver={e => { e.currentTarget.style.borderColor=C.dim; e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 4px 14px rgba(0,0,0,0.3)'; }}
      onMouseOut={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
      <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:9, lineHeight:1.4 }}>{task.title}</div>
      <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
        <PriorityBadge p={task.priority} />
        {task.recurrence && <span style={{ fontSize:9, fontWeight:700, color:C.sky, background:`${C.sky}18`, padding:'1px 6px', borderRadius:20, border:`1px solid ${C.sky}30` }}>🔁 {task.recurrence}</span>}
        {task.tags?.map(tag => <Tag key={tag}>{tag}</Tag>)}
        {task.checklist?.length > 0 && (
          <span style={{ fontSize:10, color:C.dim, marginLeft:'auto' }}>☑ {checkDone}/{task.checklist.length}</span>
        )}
        {task.due && (
          <span style={{ fontSize:11, color: late ? C.danger : C.dim, fontWeight: late ? 700 : 400, marginLeft: task.checklist?.length ? 0 : 'auto' }}>
            {late ? '⚠️ ' : ''}{fmtDue(task.due)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────
function ListView({ project, tasks, onOpenTask, onAddTask }) {
  return (
    <div style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 120px 110px 80px', padding:'10px 18px', background:C.surface, borderBottom:`1px solid ${C.border}`, fontSize:10, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:'.08em' }}>
        <span>Tarefa</span><span>Status</span><span>Prioridade</span><span>Prazo</span><span>Resp.</span>
      </div>
      {project.columns.map(col => {
        const colTasks = tasks.filter(t => t.column === col);
        const colColor = COL_COLORS[col] || C.dim;
        return (
          <div key={col}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 18px', background:C.surface, borderBottom:`1px solid ${C.border}`, fontSize:11, fontWeight:700, color:C.muted }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:colColor }} />
              {col} <span style={{ fontWeight:400, color:C.dim }}>({colTasks.length})</span>
            </div>
            {colTasks.map(t => {
              const late = overdue(t);
              return (
                <div key={t.id} onClick={() => onOpenTask(t)} style={{ display:'grid', gridTemplateColumns:'1fr 160px 120px 110px 80px', padding:'11px 18px', borderBottom:`1px solid ${C.border}`, fontSize:13, alignItems:'center', cursor:'pointer', transition:'background .1s' }}
                  onMouseOver={e => e.currentTarget.style.background=C.surface}
                  onMouseOut={e => e.currentTarget.style.background='transparent'}>
                  <span style={{ color:C.text, fontWeight:500 }}>{t.title}</span>
                  <span><StatusPill col={t.column} /></span>
                  <span><PriorityBadge p={t.priority} /></span>
                  <span style={{ color: late ? C.danger : C.muted, fontSize:12, fontWeight: late ? 700 : 400 }}>{t.due ? fmtDue(t.due) : '—'}{late ? ' ⚠️' : ''}</span>
                  <span>
                    <div style={{ width:26, height:26, borderRadius:'50%', background:`linear-gradient(135deg,${C.primary}cc,${C.purple}88)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff' }}>
                      {(t.assignee || '?').slice(0,2).toUpperCase()}
                    </div>
                  </span>
                </div>
              );
            })}
            <div onClick={() => onAddTask(col)} style={{ padding:'9px 18px', display:'flex', alignItems:'center', gap:8, fontSize:12, color:C.dim, cursor:'pointer', borderBottom:`1px solid ${C.border}`, transition:'all .15s' }}
              onMouseOver={e => { e.currentTarget.style.color=C.primary; e.currentTarget.style.background=`${C.primary}08`; }}
              onMouseOut={e => { e.currentTarget.style.color=C.dim; e.currentTarget.style.background='transparent'; }}>
              ＋ Adicionar em "{col}"
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Task Detail Modal ────────────────────────────────────────────────────────
function TaskDetailModal({ task, columns, onClose, onUpdate, onDelete, onMove }) {
  const [title, setTitle]         = useState(task.title);
  const [editTitle, setEditTitle] = useState(false);
  const [desc, setDesc]           = useState(task.description || '');
  const [newCheck, setNewCheck]   = useState('');
  const [newComment, setNewComment] = useState('');

  const saveTitle = () => { if (title.trim()) onUpdate(task.id, { title: title.trim() }); setEditTitle(false); };
  const toggleCheck = (i) => {
    const cl = task.checklist.map((c, j) => j === i ? { ...c, done: !c.done } : c);
    onUpdate(task.id, { checklist: cl });
  };
  const addCheck = () => {
    if (!newCheck.trim()) return;
    onUpdate(task.id, { checklist: [...task.checklist, { text: newCheck.trim(), done: false }] });
    setNewCheck('');
  };
  const addComment = () => {
    if (!newComment.trim()) return;
    const c = { id: genId(), author: 'Raul Santos', text: newComment.trim(), time: new Date().toLocaleString('pt-BR') };
    onUpdate(task.id, { comments: [...(task.comments || []), c] });
    setNewComment('');
  };
  const checkDone = task.checklist.filter(c => c.done).length;
  const checkPct  = task.checklist.length ? Math.round(checkDone / task.checklist.length * 100) : 0;

  return (
    <TModal open onClose={onClose} title="" maxWidth={740}>
      {/* Title */}
      <div style={{ marginBottom:20 }}>
        {editTitle
          ? <input value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={e => e.key==='Enter'&&saveTitle()} autoFocus style={{ width:'100%', background:C.bg, border:`1px solid ${C.primary}`, borderRadius:10, padding:'10px 13px', color:C.text, fontSize:17, fontWeight:800, outline:'none', fontFamily:'inherit' }} />
          : <div onClick={() => setEditTitle(true)} title="Clique para editar" style={{ fontSize:17, fontWeight:800, color:C.text, cursor:'text', padding:'4px 0' }}>{task.title}</div>}
        <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap', alignItems:'center' }}>
          <StatusPill col={task.column} />
          <PriorityBadge p={task.priority} />
          {task.tags?.map(t => <Tag key={t}>{t}</Tag>)}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 200px', gap:24 }}>
        {/* Left */}
        <div>
          <TInput label="Descrição" textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Detalhes da tarefa..." rows={4} />
          <button onClick={() => onUpdate(task.id, { description: desc })} style={{ background:`${C.primary}18`, border:`1px solid ${C.primary}35`, color:C.primary, borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer', marginBottom:20 }}>Salvar descrição</button>

          {/* Checklist */}
          <div style={{ fontSize:11, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>
            ☑ Checklist {task.checklist.length > 0 && <span style={{ fontWeight:400, color:C.dim }}>— {checkDone}/{task.checklist.length} ({checkPct}%)</span>}
          </div>
          {task.checklist.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ height:4, background:C.border, borderRadius:2, overflow:'hidden', marginBottom:10 }}>
                <div style={{ height:'100%', width:`${checkPct}%`, background:C.primary, borderRadius:2, transition:'width .3s' }} />
              </div>
              {task.checklist.map((c, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 0', borderBottom:`1px solid ${C.border}` }}>
                  <input type="checkbox" checked={c.done} onChange={() => toggleCheck(i)} style={{ accentColor:C.primary, width:15, height:15, cursor:'pointer' }} />
                  <span style={{ fontSize:13, color: c.done ? C.dim : C.text, textDecoration: c.done ? 'line-through' : 'none', flex:1 }}>{c.text}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <input value={newCheck} onChange={e => setNewCheck(e.target.value)} onKeyDown={e => e.key==='Enter'&&addCheck()} placeholder="Novo item do checklist..." style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', color:C.text, fontSize:12, outline:'none', fontFamily:'inherit' }} />
            <button onClick={addCheck} style={{ background:C.primary, border:'none', color:'#fff', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>＋</button>
          </div>

          {/* Comments */}
          <div style={{ fontSize:11, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:'.08em', marginTop:22, marginBottom:10 }}>💬 Comentários</div>
          {(task.comments || []).map(c => (
            <div key={c.id} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg,${C.primary}cc,${C.purple}88)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                {c.author.split(' ').map(w => w[0]).join('')}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{c.author}</div>
                <div style={{ fontSize:13, color:C.muted, lineHeight:1.5, marginTop:2 }}>{c.text}</div>
                <div style={{ fontSize:10, color:C.dim, marginTop:3 }}>{c.time}</div>
              </div>
            </div>
          ))}
          <div style={{ display:'flex', gap:8, marginTop:10 }}>
            <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key==='Enter'&&addComment()} placeholder="Escrever comentário..." style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', color:C.text, fontSize:12, outline:'none', fontFamily:'inherit' }} />
            <button onClick={addComment} style={{ background:C.surface, border:`1px solid ${C.border}`, color:C.muted, borderRadius:8, padding:'8px 14px', fontSize:12, cursor:'pointer' }}>→</button>
          </div>
        </div>

        {/* Right — metadata */}
        <div>
          <TSelect label="Status" value={task.column} onChange={e => onMove(task.id, e.target.value)}>
            {columns.map(c => <option key={c}>{c}</option>)}
          </TSelect>
          <TSelect label="Prioridade" value={task.priority || ''} onChange={e => onUpdate(task.id, { priority: e.target.value })}>
            <option value="">—</option><option>Alta</option><option>Média</option><option>Baixa</option>
          </TSelect>
          <TInput label="Prazo" type="date" value={task.due || ''} onChange={e => onUpdate(task.id, { due: e.target.value })} />
          <TInput label="Responsável" value={task.assignee || ''} onChange={e => onUpdate(task.id, { assignee: e.target.value })} placeholder="Ex: RS" />
          <TInput label="Tags (vírgula)" value={(task.tags || []).join(', ')} onChange={e => onUpdate(task.id, { tags: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} placeholder="Bug, Urgente..." />

          {/* Recorrência */}
          <TSelect label="🔁 Recorrência" value={task.recurrence || ''} onChange={e => onUpdate(task.id, { recurrence: e.target.value })}>
            <option value="">Sem recorrência</option>
            <option value="Diário">Diário</option>
            <option value="Semanal">Semanal</option>
            <option value="Mensal">Mensal</option>
          </TSelect>
          {task.recurrence && (
            <div style={{ background:`${C.sky}12`, border:`1px solid ${C.sky}30`, borderRadius:8, padding:'6px 10px', fontSize:11, color:C.sky, marginBottom:14 }}>
              🔁 Recria automaticamente ({task.recurrence.toLowerCase()}) ao concluir
            </div>
          )}

          {/* Google Calendar */}
          <a href={gcalLink(task)} target="_blank" rel="noopener noreferrer" style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:7,
            width:'100%', marginBottom:8, background:`${C.success}15`, border:`1px solid ${C.success}35`,
            color:C.success, borderRadius:10, padding:'10px', fontSize:13, fontWeight:700,
            cursor:'pointer', textDecoration:'none',
          }}>
            📅 Adicionar ao Google Calendar
          </a>

          <button onClick={() => { if (confirm('Excluir esta tarefa?')) onDelete(task.id); }} style={{ width:'100%', marginTop:0, background:`${C.danger}18`, border:`1px solid ${C.danger}35`, color:C.danger, borderRadius:10, padding:'10px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            🗑 Excluir tarefa
          </button>
        </div>
      </div>
    </TModal>
  );
}

// ─── Template → Project Modal ─────────────────────────────────────────────────
function TemplateProjectModal({ tpl, projects, onClose, onSave }) {
  const [projId, setProjId] = useState(projects[0]?.id || '');
  const [due,    setDue]    = useState('');
  const proj = projects.find(p => p.id === Number(projId) || p.id === projId);
  return (
    <TModal open onClose={onClose} title={`${tpl.icon} ${tpl.name}`} maxWidth={440}>
      <div style={{ background:C.bg, borderRadius:10, padding:'10px 14px', fontSize:12, color:C.muted, marginBottom:16, lineHeight:1.6 }}>{tpl.description}</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        <PriorityBadge p={tpl.priority} />
        {tpl.recurrence && <span style={{ background:`${C.sky}18`, color:C.sky, fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, border:`1px solid ${C.sky}30` }}>🔁 {tpl.recurrence}</span>}
        {tpl.tags.map(t => <Tag key={t}>{t}</Tag>)}
      </div>
      <TSelect label="Adicionar ao projeto *" value={projId} onChange={e => setProjId(e.target.value)}>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </TSelect>
      <TInput label="Prazo inicial" type="date" value={due} onChange={e => setDue(e.target.value)} />
      {tpl.recurrence && (
        <div style={{ background:`${C.sky}12`, border:`1px solid ${C.sky}30`, borderRadius:10, padding:'8px 12px', fontSize:12, color:C.sky, marginBottom:14 }}>
          🔁 Será recriada automaticamente ({tpl.recurrence.toLowerCase()}) ao concluir
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
        <button onClick={onClose} style={{ background:C.surface, border:`1px solid ${C.border}`, color:C.muted, borderRadius:10, padding:'10px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>Cancelar</button>
        <button onClick={() => projId && onSave(proj?.id ?? projId, { title:tpl.name, description:tpl.description, priority:tpl.priority, tags:[...tpl.tags], recurrence:tpl.recurrence, due, assignee:'RS' })} disabled={!projId} style={{ background:`linear-gradient(135deg,${C.warning},${C.primary})`, border:'none', color:'#fff', borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:`0 4px 14px ${C.warning}40` }}>
          Criar tarefa
        </button>
      </div>
    </TModal>
  );
}

// ─── New Project Modal ────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onSave }) {
  const [name,  setName]  = useState('');
  const [desc,  setDesc]  = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0].val);
  return (
    <TModal open onClose={onClose} title="Novo Projeto">
      <TInput label="Nome *" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Vendas Q2, Suporte..." autoFocus required />
      <TInput label="Descrição" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Objetivo do projeto..." textarea rows={3} />
      <div style={{ marginBottom:20 }}>
        <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Cor</label>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {PROJECT_COLORS.map(c => (
            <div key={c.key} onClick={() => setColor(c.val)} style={{
              width:30, height:30, borderRadius:'50%', background:c.val, cursor:'pointer',
              border: color === c.val ? `3px solid #fff` : '3px solid transparent',
              boxShadow: color === c.val ? `0 0 0 2px ${c.val}` : 'none',
              transition:'all .15s', transform: color === c.val ? 'scale(1.15)' : 'scale(1)',
            }} />
          ))}
        </div>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:4 }}>
        <button onClick={onClose} style={{ background:C.surface, border:`1px solid ${C.border}`, color:C.muted, borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer' }}>Cancelar</button>
        <button onClick={() => name.trim() && onSave({ name: name.trim(), description: desc.trim(), color })} disabled={!name.trim()} style={{ background:`linear-gradient(135deg,${C.primary},${C.purple})`, border:'none', color:'#fff', borderRadius:10, padding:'10px 22px', fontSize:14, fontWeight:700, cursor:name.trim()?'pointer':'not-allowed', opacity:name.trim()?1:.5, boxShadow:`0 4px 14px ${C.primary}40` }}>
          Criar Projeto
        </button>
      </div>
    </TModal>
  );
}

// ─── New Task Modal ───────────────────────────────────────────────────────────
function NewTaskModal({ col, columns, onClose, onSave, prefill = {} }) {
  const [title,      setTitle]      = useState(prefill.title || '');
  const [desc,       setDesc]       = useState(prefill.description || '');
  const [priority,   setPriority]   = useState(prefill.priority || 'Média');
  const [due,        setDue]        = useState(prefill.due || '');
  const [assignee,   setAssignee]   = useState(prefill.assignee || 'RS');
  const [column,     setColumn]     = useState(col);
  const [tags,       setTags]       = useState((prefill.tags || []).join(', '));
  const [recurrence, setRecurrence] = useState(prefill.recurrence || '');
  return (
    <TModal open onClose={onClose} title={prefill.title ? `📋 Usar modelo: ${prefill.title}` : 'Nova Tarefa'}>
      <TInput label="Título *" value={title} onChange={e => setTitle(e.target.value)} placeholder="O que precisa ser feito?" autoFocus required />
      <TInput label="Descrição" textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Detalhes..." rows={3} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <TSelect label="Status" value={column} onChange={e => setColumn(e.target.value)}>
          {columns.map(c => <option key={c}>{c}</option>)}
        </TSelect>
        <TSelect label="Prioridade" value={priority} onChange={e => setPriority(e.target.value)}>
          <option>Alta</option><option>Média</option><option>Baixa</option>
        </TSelect>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <TInput label="Prazo" type="date" value={due} onChange={e => setDue(e.target.value)} />
        <TInput label="Responsável" value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Ex: RS" />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <TSelect label="🔁 Recorrência" value={recurrence} onChange={e => setRecurrence(e.target.value)}>
          <option value="">Sem recorrência</option>
          <option value="Diário">Diário</option>
          <option value="Semanal">Semanal</option>
          <option value="Mensal">Mensal</option>
        </TSelect>
        <TInput label="Tags (vírgula)" value={tags} onChange={e => setTags(e.target.value)} placeholder="Ex: Rotina, Ads" />
      </div>
      {recurrence && (
        <div style={{ background:`${C.sky}12`, border:`1px solid ${C.sky}30`, borderRadius:10, padding:'8px 12px', fontSize:12, color:C.sky, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
          🔁 Esta tarefa será recriada automaticamente ({recurrence.toLowerCase()}) quando concluída.
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:4 }}>
        <button onClick={onClose} style={{ background:C.surface, border:`1px solid ${C.border}`, color:C.muted, borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:600, cursor:'pointer' }}>Cancelar</button>
        <button onClick={() => title.trim() && onSave({ title: title.trim(), description: desc, priority, due, assignee, column, tags: tags.split(',').map(x=>x.trim()).filter(Boolean), recurrence })} disabled={!title.trim()} style={{ background:`linear-gradient(135deg,${C.primary},${C.purple})`, border:'none', color:'#fff', borderRadius:10, padding:'10px 22px', fontSize:14, fontWeight:700, cursor:title.trim()?'pointer':'not-allowed', opacity:title.trim()?1:.5, boxShadow:`0 4px 14px ${C.primary}40` }}>
          Criar Tarefa
        </button>
      </div>
    </TModal>
  );
}

// ─── New Column Modal ─────────────────────────────────────────────────────────
function NewColumnModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  return (
    <TModal open onClose={onClose} title="Nova Coluna" maxWidth={360}>
      <TInput label="Nome da Coluna" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Em Teste, Aguardando..." autoFocus />
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
        <button onClick={onClose} style={{ background:C.surface, border:`1px solid ${C.border}`, color:C.muted, borderRadius:10, padding:'10px 18px', fontSize:14, fontWeight:600, cursor:'pointer' }}>Cancelar</button>
        <button onClick={() => name.trim() && onSave(name.trim())} disabled={!name.trim()} style={{ background:`linear-gradient(135deg,${C.primary},${C.purple})`, border:'none', color:'#fff', borderRadius:10, padding:'10px 20px', fontSize:14, fontWeight:700, cursor:name.trim()?'pointer':'not-allowed', opacity:name.trim()?1:.5 }}>
          Adicionar
        </button>
      </div>
    </TModal>
  );
}

// ─── Main TasksModule ─────────────────────────────────────────────────────────
export default function TasksModule({ currentUser }) {
  const [data,           setData]           = useState(load);
  const [view,           setView]           = useState('dashboard');
  const [activeId,       setActiveId]       = useState(null);
  const [projectView,    setProjectView]    = useState('kanban');
  const [modal,          setModal]          = useState(null);
  const [search,         setSearch]         = useState('');
  const [filterPrio,     setFilterPrio]     = useState('');
  const [dragTask,       setDragTask]       = useState(null);
  const [dragOverCol,    setDragOverCol]    = useState(null);
  const [showTemplates,  setShowTemplates]  = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(() => localStorage.getItem('viga-coach-dismissed') === new Date().toISOString().split('T')[0]);
  const [coachSettings,  setCoachSettings]  = useState(() => { try { return JSON.parse(localStorage.getItem('viga-coaching-settings') || '{}'); } catch { return {}; } });
  const notifTimer = useRef(null);

  useEffect(() => { save(data); }, [data]);

  // ── Coaching notifications ──
  useEffect(() => {
    const scheduleNext = () => {
      if (!coachSettings.enabled) return;
      const [h, m] = (coachSettings.time || '08:00').split(':').map(Number);
      const next = new Date(); next.setHours(h, m, 0, 0);
      if (next <= new Date()) next.setDate(next.getDate() + 1);
      const ms = next.getTime() - Date.now();
      notifTimer.current = setTimeout(() => {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const tip = getTodayTip();
          const today = new Date().toISOString().split('T')[0];
          const due = data.projects.flatMap(p => p.tasks.filter(t => t.due === today && t.column !== 'Concluído')).length;
          const body = `${tip.icon} ${tip.text.slice(0, 90)}...${due > 0 ? `\n📋 ${due} tarefa(s) para hoje.` : ''}`;
          new Notification('☀️ Viga Sales — Coaching do dia', { body, icon: '/vite.svg' });
        }
        scheduleNext();
      }, ms);
    };
    clearTimeout(notifTimer.current);
    scheduleNext();
    return () => clearTimeout(notifTimer.current);
  }, [coachSettings.enabled, coachSettings.time]);

  const project = data.projects.find(p => p.id === activeId);

  // ── Mutations ──
  const mut = (fn) => setData(prev => { const next = JSON.parse(JSON.stringify(prev)); fn(next); return next; });

  const addProject  = (d)  => mut(s => s.projects.push({ id:genId(), tasks:[], columns:['A Fazer','Em Andamento','Em Revisão','Concluído'], ...d }));
  const delProject  = (id) => { mut(s => { s.projects = s.projects.filter(p => p.id !== id); }); if (activeId === id) { setActiveId(null); setView('dashboard'); } };
  const addTask     = (col, d) => mut(s => { const p = s.projects.find(x => x.id === activeId); p.tasks.push({ id:genId(), column:col, checklist:[], comments:[], tags:[], recurrence:'', ...d }); });
  const addTaskToProject = (projId, col, d) => mut(s => { const p = s.projects.find(x => x.id === projId); if (p) p.tasks.push({ id:genId(), column:col || p.columns[0] || 'A Fazer', checklist:[], comments:[], tags:[], recurrence:'', ...d }); });
  const updateTask  = (id, patch) => mut(s => { const p = s.projects.find(x => x.id === activeId); const t = p.tasks.find(x => x.id === id); Object.assign(t, patch); });
  const deleteTask  = (id) => { mut(s => { const p = s.projects.find(x => x.id === activeId); p.tasks = p.tasks.filter(x => x.id !== id); }); setModal(null); };
  const moveTask    = (id, col) => mut(s => {
    const p = s.projects.find(x => x.id === activeId);
    const t = p.tasks.find(x => x.id === id);
    if (!t) return;
    const wasNotDone = t.column !== 'Concluído';
    t.column = col;
    // Auto-criar próxima ocorrência para tarefas recorrentes
    if (col === 'Concluído' && wasNotDone && t.recurrence && t.recurrence !== '') {
      const nextDue = calcNextDue(t.due, t.recurrence);
      p.tasks.push({
        id: genId(), title: t.title, description: t.description || '',
        priority: t.priority, tags: [...(t.tags || [])], assignee: t.assignee || '',
        recurrence: t.recurrence, due: nextDue,
        column: p.columns[0] || 'A Fazer', checklist: [], comments: [],
      });
    }
  });
  const addColumn   = (col) => mut(s => { const p = s.projects.find(x => x.id === activeId); if (!p.columns.includes(col)) p.columns.push(col); });

  // ── Drag ──
  const onDragStart  = (id) => setDragTask(id);
  const onDragOver   = (col) => setDragOverCol(col);
  const onDrop       = (col) => { if (dragTask) moveTask(dragTask, col); setDragTask(null); setDragOverCol(null); };
  const onDragEnd    = () => { setDragTask(null); setDragOverCol(null); };

  // ── Filtered tasks ──
  const filtered = project?.tasks.filter(t => {
    const q = search.toLowerCase();
    return (!q || t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q))
      && (!filterPrio || t.priority === filterPrio);
  }) || [];

  const pagePad = '32px 40px';

  return (
    <>
      <style>{`@keyframes tFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* ── Topbar ── */}
      <div style={{ height:56, background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:14, padding:'0 28px', flexShrink:0 }}>
        {view === 'project' && (
          <button onClick={() => { setView('dashboard'); setActiveId(null); }} style={{ background:C.card, border:`1px solid ${C.border}`, color:C.muted, borderRadius:8, padding:'6px 12px', fontSize:13, cursor:'pointer' }}>← Voltar</button>
        )}
        {view === 'project' && project && (
          <span style={{ width:10, height:10, borderRadius:'50%', background:project.color }} />
        )}
        <span style={{ fontSize:17, fontWeight:800, color:C.text, flex:1 }}>
          {view === 'dashboard' ? '✅ Tarefas' : project?.name || ''}
        </span>

        {/* View switcher (project only) */}
        {view === 'project' && (
          <div style={{ display:'flex', gap:4, background:C.card, padding:4, borderRadius:10, border:`1px solid ${C.border}` }}>
            {[{id:'kanban',label:'🗂 Kanban'},{id:'list',label:'☰ Lista'}].map(v => (
              <button key={v.id} onClick={() => setProjectView(v.id)} style={{
                padding:'6px 14px', borderRadius:7, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
                background: projectView===v.id ? `linear-gradient(135deg,${C.primary},${C.purple})` : 'transparent',
                color: projectView===v.id ? '#fff' : C.muted,
                boxShadow: projectView===v.id ? `0 2px 8px ${C.primary}40` : 'none',
              }}>{v.label}</button>
            ))}
          </div>
        )}

        {/* 🔔 Coaching button */}
        <button onClick={() => setModal({ type:'coachSettings' })} title="Coaching diário" style={{
          background: coachSettings.enabled ? `${C.warning}20` : C.card,
          border: `1px solid ${coachSettings.enabled ? C.warning : C.border}`,
          color: coachSettings.enabled ? C.warning : C.dim,
          borderRadius:10, padding:'9px 12px', fontSize:13, cursor:'pointer',
          display:'flex', alignItems:'center', gap:5, fontWeight:600,
        }}>
          🔔 {coachSettings.enabled ? 'Coaching ativo' : 'Coaching'}
        </button>

        {/* Actions */}
        {view === 'dashboard' ? (
          <button onClick={() => setModal({ type:'newProject' })} style={{ background:`linear-gradient(135deg,${C.primary},${C.purple})`, border:'none', color:'#fff', borderRadius:10, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6, boxShadow:`0 4px 14px ${C.primary}40` }}>
            ＋ Novo Projeto
          </button>
        ) : (
          <>
            <button onClick={() => setShowTemplates(v => !v)} style={{ background: showTemplates ? `${C.warning}22` : C.card, border:`1px solid ${showTemplates ? C.warning : C.border}`, color: showTemplates ? C.warning : C.muted, borderRadius:10, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              📋 Modelos
            </button>
            <button onClick={() => setModal({ type:'newTask', col: project?.columns[0] })} style={{ background:`linear-gradient(135deg,${C.primary},${C.purple})`, border:'none', color:'#fff', borderRadius:10, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6, boxShadow:`0 4px 14px ${C.primary}40` }}>
              ＋ Tarefa
            </button>
          </>
        )}
      </div>

      {/* ── Templates panel ── */}
      {view === 'project' && showTemplates && (
        <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:'14px 20px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.warning, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12 }}>📋 Modelos de Tarefa — clique para usar</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 }}>
            {TEMPLATES.map(tpl => (
              <div key={tpl.id} onClick={() => { setShowTemplates(false); setModal({ type:'newTask', col: project?.columns[0], prefill: tpl }); }}
                style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:'12px 14px', cursor:'pointer', transition:'all .15s' }}
                onMouseOver={e => { e.currentTarget.style.borderColor=C.warning; e.currentTarget.style.background=`${C.warning}0a`; }}
                onMouseOut={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.background=C.surface; }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:16 }}>{tpl.icon}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:C.text, flex:1, lineHeight:1.3 }}>{tpl.name}</span>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
                  <PriorityBadge p={tpl.priority} />
                  {tpl.recurrence && <span style={{ background:`${C.sky}18`, color:C.sky, fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, border:`1px solid ${C.sky}30` }}>🔁 {tpl.recurrence}</span>}
                  {tpl.tags.slice(0,2).map(t => <Tag key={t}>{t}</Tag>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter bar (project only) ── */}
      {view === 'project' && (
        <div style={{ padding:'8px 28px', background:C.surface, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:C.card, border:`1px solid ${C.border}`, borderRadius:9, padding:'7px 12px', maxWidth:220 }}>
            <span style={{ color:C.dim, fontSize:14 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarefas..." style={{ border:'none', background:'transparent', outline:'none', fontSize:13, color:C.text, width:'100%', fontFamily:'inherit' }} />
          </div>
          {['Alta','Média','Baixa'].map(p => (
            <button key={p} onClick={() => setFilterPrio(filterPrio === p ? '' : p)} style={{
              padding:'6px 12px', borderRadius:8, border:`1px solid ${filterPrio===p ? C.primary : C.border}`,
              background: filterPrio===p ? `${C.primary}22` : C.card,
              color: filterPrio===p ? C.primary : C.muted,
              fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s',
            }}>
              {p === 'Alta' ? '🔴' : p === 'Média' ? '🟡' : '🟢'} {p}
            </button>
          ))}
          {(search || filterPrio) && (
            <button onClick={() => { setSearch(''); setFilterPrio(''); }} style={{ padding:'6px 10px', borderRadius:8, border:`1px solid ${C.danger}50`, background:`${C.danger}10`, color:C.danger, fontSize:12, fontWeight:600, cursor:'pointer' }}>✕ Limpar</button>
          )}
          <span style={{ marginLeft:'auto', fontSize:12, color:C.dim }}>{filtered.length} tarefa{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex:1, overflowY: view==='project' && projectView==='kanban' ? 'hidden' : 'auto', overflowX: view==='project' && projectView==='kanban' ? 'hidden' : 'hidden', padding: view==='project' && projectView==='kanban' ? '16px 20px' : pagePad, display:'flex', flexDirection:'column' }}>
        {view === 'dashboard' && (
          <>
            {!coachDismissed && (
              <DailyCoachingPanel
                data={data}
                onDismiss={() => { setCoachDismissed(true); localStorage.setItem('viga-coach-dismissed', new Date().toISOString().split('T')[0]); }}
                onSettings={() => setModal({ type:'coachSettings' })}
              />
            )}
            <TasksDashboard
              data={data}
              onOpenProject={id => { setActiveId(id); setView('project'); }}
              onNewProject={() => setModal({ type:'newProject' })}
              onDeleteProject={delProject}
              onUseTemplate={tpl => setModal({ type:'useTemplate', tpl })}
            />
          </>
        )}
        {view === 'project' && project && projectView === 'kanban' && (
          <KanbanBoard
            project={project} tasks={filtered}
            onOpenTask={t => setModal({ type:'taskDetail', task:t })}
            onAddTask={col => setModal({ type:'newTask', col })}
            onAddCol={() => setModal({ type:'newColumn' })}
            onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} dragOverCol={dragOverCol}
          />
        )}
        {view === 'project' && project && projectView === 'list' && (
          <ListView
            project={project} tasks={filtered}
            onOpenTask={t => setModal({ type:'taskDetail', task:t })}
            onAddTask={col => setModal({ type:'newTask', col })}
          />
        )}
      </div>

      {/* ── Modals ── */}
      {modal?.type === 'coachSettings' && (
        <CoachingSettingsModal
          settings={coachSettings}
          onClose={() => setModal(null)}
          onSave={s => {
            setCoachSettings(s);
            localStorage.setItem('viga-coaching-settings', JSON.stringify(s));
            setModal(null);
          }}
        />
      )}
      {modal?.type === 'newProject'  && <NewProjectModal onClose={() => setModal(null)} onSave={d => { addProject(d); setModal(null); }} />}
      {modal?.type === 'newColumn'   && <NewColumnModal  onClose={() => setModal(null)} onSave={n => { addColumn(n); setModal(null); }} />}
      {modal?.type === 'newTask'     && <NewTaskModal col={modal.col} columns={project?.columns||[]} prefill={modal.prefill||{}} onClose={() => setModal(null)} onSave={d => { addTask(modal.col, d); setModal(null); }} />}
      {modal?.type === 'useTemplate' && <TemplateProjectModal tpl={modal.tpl} projects={data.projects} onClose={() => setModal(null)} onSave={(projId, d) => { addTaskToProject(projId, null, d); setModal(null); }} />}
      {modal?.type === 'taskDetail'  && (
        <TaskDetailModal
          task={modal.task}
          columns={project?.columns || []}
          onClose={() => setModal(null)}
          onUpdate={(id, patch) => { updateTask(id, patch); setModal(prev => ({ ...prev, task: { ...prev.task, ...patch } })); }}
          onDelete={deleteTask}
          onMove={(id, col) => { moveTask(id, col); setModal(prev => ({ ...prev, task: { ...prev.task, column: col } })); }}
        />
      )}
    </>
  );
}
