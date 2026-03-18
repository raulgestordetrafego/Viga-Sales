// ─── Briefing de Onboarding — Versão Conversacional ─────────────────────────
// Formulário guiado baseado no roteiro estratégico de onboarding da agência.
// Dados persistidos em localStorage por contato: viga-briefing-{contactId}

import React, { useState, useEffect } from 'react';

const C = {
  bg:      '#07101e',
  surface: '#0c1829',
  card:    '#101f34',
  card2:   '#13243d',
  border:  '#1a3050',
  text:    '#e8edf5',
  muted:   '#7a90b0',
  dim:     '#3a5270',
  primary: '#E67E22',
  navy:    '#1A365D',
  purple:  '#2E6DA4',
  success: '#10b981',
  warning: '#f59e0b',
  danger:  '#ef4444',
};

// ─── Estrutura do briefing ─────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'abertura',
    title: 'Abertura e Contexto',
    subtitle: 'Quebra-gelo — confirmar antes da call',
    icon: '👋',
    script: 'Antes da gente entrar em estratégia, quero entender melhor você e o seu negócio. A ideia aqui é ser um bate-papo bem leve pra gente conseguir direcionar tráfego, criativos e comunicação da melhor forma possível.',
    fields: [
      { id: 'responsavel',  label: 'Nome do responsável',       type: 'text',     placeholder: 'Ex: João Silva' },
      { id: 'empresa',      label: 'Nome da empresa',           type: 'text',     placeholder: 'Ex: Clínica ABC' },
      { id: 'papel',        label: 'Papel do cliente no negócio', type: 'text',   placeholder: 'Ex: Sócio-proprietário' },
      { id: 'instagram',    label: 'Instagram',                 type: 'text',     placeholder: '@perfil' },
      { id: 'site',         label: 'Site',                      type: 'text',     placeholder: 'https://...' },
      { id: 'localizacao',  label: 'Localização da empresa',    type: 'text',     placeholder: 'Ex: Lago Sul, Brasília-DF' },
    ],
  },
  {
    id: 'negocio',
    title: 'O Negócio',
    subtitle: 'Entender o que vendem e como funciona',
    icon: '🏢',
    script: 'Me conta hoje como funciona o seu negócio na prática. O que vocês vendem e como isso acontece no dia a dia?',
    fields: [
      { id: 'nicho',        label: 'Nicho e subnicho',          type: 'text',     placeholder: 'Ex: Clínica estética / procedimentos faciais' },
      { id: 'servico1',     label: 'Produto/Serviço principal 1', type: 'text',   placeholder: 'Ex: Laser de CO₂' },
      { id: 'servico2',     label: 'Produto/Serviço principal 2', type: 'text',   placeholder: 'Ex: Ultraformer' },
      { id: 'servico3',     label: 'Produto/Serviço principal 3', type: 'text',   placeholder: 'Ex: Lineskin' },
      { id: 'ticket',       label: 'Ticket médio aproximado',   type: 'text',     placeholder: 'Ex: R$ 2.500' },
      { id: 'recorrencia',  label: 'Existe recorrência de compra?', type: 'select', options: ['Sim', 'Não', 'Parcialmente'] },
      { id: 'formato',      label: 'Formato de venda',          type: 'select',   options: ['Presencial', 'Online', 'Híbrido', 'Produto físico'] },
    ],
  },
  {
    id: 'faturamento',
    title: 'Faturamento e Metas',
    subtitle: 'Contexto financeiro atual e expectativas',
    icon: '💰',
    script: 'Hoje isso representa mais ou menos qual faturamento mensal, olhando os últimos 6 meses?',
    fields: [
      { id: 'fat_atual',    label: 'Faturamento médio mensal atual', type: 'text', placeholder: 'Ex: R$ 50.000/mês' },
      { id: 'fat_meta',     label: 'Meta de faturamento',        type: 'text',     placeholder: 'Ex: R$ 100.000/mês' },
      { id: 'tempo_fecha',  label: 'Tempo médio de fechamento',  type: 'text',     placeholder: 'Ex: 7 dias após o primeiro contato' },
      { id: 'obs_fat',      label: 'Observações',                type: 'textarea', placeholder: 'Ex: Sazonalidade, picos de venda...' },
    ],
  },
  {
    id: 'publico',
    title: 'Público-Alvo e Avatar',
    subtitle: 'Núcleo do tráfego e dos criativos',
    icon: '🎯',
    script: 'Quando você pensa no cliente ideal de vocês, quem é essa pessoa?',
    fields: [
      { id: 'genero',       label: 'Gênero predominante',        type: 'select',   options: ['Feminino', 'Masculino', 'Misto (mais feminino)', 'Misto (mais masculino)', 'Equilibrado'] },
      { id: 'faixa_etaria', label: 'Faixa etária',               type: 'text',     placeholder: 'Ex: 35–55 anos' },
      { id: 'localizacao_p', label: 'Localização do público',    type: 'text',     placeholder: 'Ex: Lago Sul, Lago Norte, Asa Sul' },
      { id: 'perfil_socio', label: 'Perfil socioeconômico',      type: 'select',   options: ['Classe A', 'Classe B', 'Classe A e B', 'Classe C', 'Classe B e C'] },
      { id: 'profissao',    label: 'Profissão / Perfil',         type: 'text',     placeholder: 'Ex: Mães, executivas, profissionais liberais' },
      { id: 'consciencia',  label: 'Chega já sabendo o que quer?', type: 'select', options: ['Sim, cliente consciente', 'Não, precisa de orientação', 'Misto'] },
      { id: 'motivacao',    label: 'Compra por',                 type: 'select',   options: ['Necessidade', 'Desejo', 'Momento de vida', 'Indicação', 'Misto'] },
    ],
  },
  {
    id: 'dores',
    title: 'Dores, Desejos e Gatilhos',
    subtitle: 'Base dos criativos e da copy',
    icon: '💡',
    script: 'O que normalmente faz esse cliente te procurar? Qual problema ou desejo está por trás disso? Por que esse cliente escolhe você e não outra opção do mercado?',
    fields: [
      { id: 'dores',        label: 'Principais dores',           type: 'textarea', placeholder: 'Ex: Flacidez, manchas, envelhecimento precoce...' },
      { id: 'desejos',      label: 'Principais desejos',         type: 'textarea', placeholder: 'Ex: Rejuvenescimento, autoestima, aprovação social...' },
      { id: 'sonhos',       label: 'Sonhos e momentos de vida',  type: 'textarea', placeholder: 'Ex: Casamento, promoção, volta ao peso ideal...' },
      { id: 'diferencial',  label: 'Por que escolhem vocês?',    type: 'textarea', placeholder: 'Ex: Segurança, explicação científica, produtos patenteados...' },
    ],
  },
  {
    id: 'jornada',
    title: 'Jornada de Compra e Atendimento',
    subtitle: 'Como funciona do contato até a venda',
    icon: '🛒',
    script: 'Hoje, quando alguém entra em contato, como funciona esse caminho até a venda? De cada 10 pessoas que entram em contato, mais ou menos quantas realmente fazem sentido? E dessas, quantas costumam virar venda?',
    fields: [
      { id: 'atendimento',  label: 'Quem faz o atendimento',     type: 'text',     placeholder: 'Ex: Consultora comercial interna' },
      { id: 'canal',        label: 'Canal principal de entrada',  type: 'select',   options: ['Instagram', 'WhatsApp', 'Site', 'Indicação', 'Google', 'Misto'] },
      { id: 'qualif_10',    label: 'De 10 contatos, quantos qualificam?', type: 'text', placeholder: 'Ex: 7 de 10' },
      { id: 'conv_venda',   label: 'Dos qualificados, quantos viram venda?', type: 'text', placeholder: 'Ex: 3 de 10' },
      { id: 'obs_jornada',  label: 'Observações sobre o processo', type: 'textarea', placeholder: 'Ex: Clientes de alto padrão visitam o local antes de fechar...' },
    ],
  },
  {
    id: 'objecoes',
    title: 'Objeções e Barreiras de Venda',
    subtitle: 'O que impede ou trava a venda',
    icon: '🚧',
    script: 'O que normalmente impede uma venda de acontecer? O que você mais escuta como dúvida ou trava?',
    fields: [
      { id: 'obj_preco',    label: 'Objeção de preço',           type: 'textarea', placeholder: 'Ex: "Está caro", comparações com concorrentes que cobram menos...' },
      { id: 'obj_pgto',     label: 'Forma de pagamento',         type: 'text',     placeholder: 'Ex: Parcelamento no cartão, PIX, etc.' },
      { id: 'obj_confianca', label: 'Confiança / credibilidade', type: 'textarea', placeholder: 'Ex: Medo de procedimento, falta de avaliações...' },
      { id: 'obj_concorr',  label: 'Comparações com concorrentes', type: 'textarea', placeholder: 'Ex: Empresas que jogam o preço pra baixo...' },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing Atual e Histórico',
    subtitle: 'O que já foi feito e como foi',
    icon: '📣',
    script: 'Você já anunciou antes? Como foi essa experiência pra você?',
    fields: [
      { id: 'plataformas',  label: 'Plataformas utilizadas',     type: 'checkboxes', options: ['Meta Ads', 'Google Ads', 'TikTok Ads', 'LinkedIn Ads', 'Pinterest Ads', 'Nunca anunciou'] },
      { id: 'invest_atual', label: 'Investimento médio mensal',  type: 'text',     placeholder: 'Ex: R$ 2.000/mês' },
      { id: 'exp_neg',      label: 'Experiências negativas',     type: 'textarea', placeholder: 'Ex: Já contratou agência que não entregou resultados...' },
      { id: 'obs_mkt',      label: 'Observações',                type: 'textarea', placeholder: 'Contexto adicional sobre histórico de marketing...' },
    ],
  },
  {
    id: 'trafego',
    title: 'Direcionamento Estratégico de Tráfego',
    subtitle: 'Orçamento e expectativas de início',
    icon: '📈',
    script: 'Pensando em investimento mensal, qual valor você imagina como ideal pra esse início?',
    fields: [
      { id: 'orcamento',    label: 'Orçamento mensal de tráfego', type: 'text',    placeholder: 'Ex: R$ 3.000/mês' },
      { id: 'pgto_trafego', label: 'Forma de pagamento',         type: 'text',     placeholder: 'Ex: Cartão, boleto, PIX' },
      { id: 'meta_leads',   label: 'Meta de leads/mês',          type: 'text',     placeholder: 'Ex: 100 leads/mês' },
      { id: 'obs_trafego',  label: 'Observações estratégicas',   type: 'textarea', placeholder: 'Ex: Foco em leads qualificados, não volume...' },
    ],
  },
  {
    id: 'objetivos',
    title: 'Objetivos e Expectativas',
    subtitle: 'O que o cliente espera que mude',
    icon: '🏆',
    script: 'O que você espera que mude no seu negócio?',
    fields: [
      { id: 'meta_fat',     label: 'Meta de faturamento',        type: 'text',     placeholder: 'Ex: Dobrar o faturamento em 6 meses' },
      { id: 'meta_leads2',  label: 'Volume e qualidade de leads', type: 'textarea', placeholder: 'Ex: Leads com perfil B e A, interessados em procedimentos acima de R$ 2k' },
      { id: 'posicionamento', label: 'Posicionamento de marca',  type: 'textarea', placeholder: 'Ex: Ser referência em estética avançada no Lago Sul' },
      { id: 'expectativa',  label: 'Expectativa geral',          type: 'textarea', placeholder: 'Ex: Sentir o trabalho de vocês nos primeiros 30 dias...' },
    ],
  },
  {
    id: 'proximos',
    title: 'Próximos Passos',
    subtitle: 'Encerramento e alinhamento de prazos',
    icon: '✅',
    script: 'Perfeito, com tudo isso a gente já consegue montar uma estratégia bem sólida. O próximo passo agora é a parte criativa e estrutural. Vamos alinhar os próximos passos?',
    fields: [
      { id: 'data_captacao', label: 'Data de captação / produção audiovisual', type: 'date', placeholder: '' },
      { id: 'prazo_inicio',  label: 'Data prevista de início das campanhas', type: 'date', placeholder: '' },
      { id: 'obs_finais',    label: 'Alinhamentos finais / observações',     type: 'textarea', placeholder: 'Ex: Cliente pediu foco em botox primeiro mês...' },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadBriefing(contactId) {
  try { return JSON.parse(localStorage.getItem(`viga-briefing-${contactId}`) || '{}'); } catch { return {}; }
}
function saveBriefing(contactId, data) {
  try { localStorage.setItem(`viga-briefing-${contactId}`, JSON.stringify(data)); } catch {}
}
function countFilled(data) {
  return SECTIONS.reduce((acc, s) => acc + s.fields.filter(f => {
    const v = data[s.id]?.[f.id];
    return Array.isArray(v) ? v.length > 0 : (v && String(v).trim());
  }).length, 0);
}
const TOTAL_FIELDS = SECTIONS.reduce((a, s) => a + s.fields.length, 0);

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScriptCard({ text }) {
  return (
    <div style={{ background:`${C.primary}0d`, border:`1px solid ${C.primary}25`, borderRadius:12, padding:'12px 16px', marginBottom:18, position:'relative' }}>
      <div style={{ fontSize:10, fontWeight:800, color:C.primary, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>💬 Roteiro sugerido</div>
      <div style={{ fontSize:13, color:C.muted, lineHeight:1.65, fontStyle:'italic' }}>"{text}"</div>
    </div>
  );
}

function BField({ field, value, onChange }) {
  const base = {
    width:'100%', background:C.bg, border:`1px solid ${C.border}`, borderRadius:9,
    padding:'10px 13px', color:C.text, fontSize:13, outline:'none', fontFamily:'inherit',
    boxSizing:'border-box', transition:'border-color .15s',
  };
  const label = (
    <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:5 }}>
      {field.label}
    </label>
  );

  if (field.type === 'textarea') return (
    <div style={{ marginBottom:14 }}>
      {label}
      <textarea value={value||''} onChange={e=>onChange(e.target.value)} placeholder={field.placeholder} rows={3}
        style={{ ...base, resize:'vertical', minHeight:72 }}
        onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border} />
    </div>
  );

  if (field.type === 'select') return (
    <div style={{ marginBottom:14 }}>
      {label}
      <select value={value||''} onChange={e=>onChange(e.target.value)}
        style={{ ...base, cursor:'pointer' }}>
        <option value="">— Selecionar —</option>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  if (field.type === 'checkboxes') return (
    <div style={{ marginBottom:14 }}>
      {label}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {field.options.map(o => {
          const checked = Array.isArray(value) && value.includes(o);
          return (
            <button key={o} onClick={() => {
              const arr = Array.isArray(value) ? [...value] : [];
              onChange(checked ? arr.filter(x=>x!==o) : [...arr, o]);
            }} style={{
              padding:'6px 12px', borderRadius:20, border:`1px solid ${checked ? C.primary : C.border}`,
              background: checked ? `${C.primary}18` : C.bg, color: checked ? C.primary : C.muted,
              fontSize:12, fontWeight:checked?700:400, cursor:'pointer', transition:'all .15s',
            }}>
              {checked ? '✓ ' : ''}{o}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom:14 }}>
      {label}
      <input type={field.type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={field.placeholder}
        style={base}
        onFocus={e=>e.target.style.borderColor=C.primary} onBlur={e=>e.target.style.borderColor=C.border} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClientBriefing({ contact, onClose }) {
  const [step,  setStep]  = useState(0);
  const [data,  setData]  = useState(() => loadBriefing(contact.id));
  const [saved, setSaved] = useState(false);

  // Auto-save on every change
  useEffect(() => {
    saveBriefing(contact.id, data);
    setSaved(false);
    const t = setTimeout(() => setSaved(true), 600);
    return () => clearTimeout(t);
  }, [data, contact.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const section  = SECTIONS[step];
  const filled   = countFilled(data);
  const pct      = Math.round((filled / TOTAL_FIELDS) * 100);

  const setField = (sectionId, fieldId, value) => {
    setData(prev => ({ ...prev, [sectionId]: { ...(prev[sectionId]||{}), [fieldId]: value } }));
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:900, backdropFilter:'blur(3px)' }} />

      {/* Modal */}
      <div style={{
        position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
        zIndex:901, padding:'20px', pointerEvents:'none',
      }}>
        <div onClick={e=>e.stopPropagation()} style={{
          background:C.card, border:`1px solid ${C.border}`, borderRadius:22,
          width:'100%', maxWidth:680, maxHeight:'92vh', display:'flex', flexDirection:'column',
          boxShadow:'0 32px 80px rgba(0,0,0,0.75)', pointerEvents:'all',
          animation:'briefingIn .2s ease-out',
        }}>
          <style>{`@keyframes briefingIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>

          {/* ── Header ── */}
          <div style={{ padding:'20px 26px 16px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:C.primary, textTransform:'uppercase', letterSpacing:'.1em', background:`${C.primary}15`, border:`1px solid ${C.primary}30`, padding:'2px 9px', borderRadius:20 }}>
                    📋 Briefing de Onboarding
                  </span>
                  <span style={{ fontSize:11, color:C.dim }}>— {contact.name}</span>
                </div>
                <div style={{ fontSize:18, fontWeight:800, color:C.text }}>
                  {section.icon} {section.title}
                </div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{section.subtitle}</div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:22, fontWeight:800, color: pct >= 80 ? C.success : pct >= 40 ? C.warning : C.primary }}>{pct}%</div>
                <div style={{ fontSize:10, color:C.dim }}>preenchido</div>
                {saved && <div style={{ fontSize:10, color:C.success, marginTop:2 }}>✓ salvo</div>}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ height:4, background:C.border, borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${C.primary},${C.success})`, borderRadius:2, transition:'width .4s' }} />
            </div>

            {/* Step pills */}
            <div style={{ display:'flex', gap:4, marginTop:12, flexWrap:'wrap' }}>
              {SECTIONS.map((s, i) => {
                const secFilled = s.fields.filter(f => {
                  const v = data[s.id]?.[f.id];
                  return Array.isArray(v) ? v.length > 0 : (v && String(v).trim());
                }).length;
                const done = secFilled === s.fields.length;
                const partial = secFilled > 0 && !done;
                return (
                  <button key={s.id} onClick={() => setStep(i)} style={{
                    padding:'4px 10px', borderRadius:20, border:`1px solid ${i===step ? C.primary : done ? C.success : partial ? C.warning : C.border}`,
                    background: i===step ? `${C.primary}20` : done ? `${C.success}15` : partial ? `${C.warning}12` : 'transparent',
                    color: i===step ? C.primary : done ? C.success : partial ? C.warning : C.dim,
                    fontSize:11, fontWeight:i===step?700:400, cursor:'pointer', transition:'all .15s',
                    display:'flex', alignItems:'center', gap:4,
                  }}>
                    {done ? '✓' : partial ? '~' : s.icon} {s.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Body ── */}
          <div style={{ flex:1, overflowY:'auto', padding:'20px 26px' }}>
            <ScriptCard text={section.script} />
            <div style={{ display:'grid', gridTemplateColumns: section.fields.length > 4 ? '1fr 1fr' : '1fr', gap:'0 18px' }}>
              {section.fields.map(f => (
                <div key={f.id} style={{ gridColumn: (f.type==='textarea'||f.type==='checkboxes') ? '1 / -1' : 'auto' }}>
                  <BField
                    field={f}
                    value={data[section.id]?.[f.id]}
                    onChange={v => setField(section.id, f.id, v)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ padding:'14px 26px', borderTop:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:10, background:C.surface, borderRadius:'0 0 22px 22px', flexShrink:0 }}>
            <span style={{ fontSize:12, color:C.dim, flex:1 }}>
              Seção {step+1} de {SECTIONS.length} · {filled}/{TOTAL_FIELDS} campos preenchidos
            </span>
            <button onClick={onClose} style={{ background:'transparent', border:`1px solid ${C.border}`, color:C.muted, borderRadius:10, padding:'9px 16px', fontSize:13, cursor:'pointer' }}>
              Fechar
            </button>
            {step > 0 && (
              <button onClick={() => setStep(s => s-1)} style={{ background:C.card, border:`1px solid ${C.border}`, color:C.text, borderRadius:10, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                ← Anterior
              </button>
            )}
            {step < SECTIONS.length - 1 ? (
              <button onClick={() => setStep(s => s+1)} style={{ background:`linear-gradient(135deg,${C.primary},${C.navy})`, border:'none', color:'#fff', borderRadius:10, padding:'9px 22px', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:`0 4px 14px ${C.primary}40` }}>
                Próxima seção →
              </button>
            ) : (
              <button onClick={onClose} style={{ background:`linear-gradient(135deg,${C.success},#059669)`, border:'none', color:'#fff', borderRadius:10, padding:'9px 22px', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:`0 4px 14px ${C.success}40` }}>
                ✓ Concluir Briefing
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
