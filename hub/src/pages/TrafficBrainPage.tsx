import React, { useState, useEffect, useCallback } from 'react';
import { hubApi } from '../api';
import {
  SparklesIcon,
  MagnifyingGlassIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  CircleStackIcon,
  XIcon,
  ChartPieIcon,
  UserIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
} from '../components/icons';

interface BrainTopic {
  topico?: string;
  topic?: string;
  name?: string;
  descricao?: string;
  description?: string;
  summary?: string;
  score?: number;
  secoes?: string[];
  sections?: string[];
  keywords?: string[];
}

const sevColor: Record<string, string> = {
  'crítica': 'text-rose-600 bg-rose-50 border-rose-200',
  'alta': 'text-orange-600 bg-orange-50 border-orange-200',
  'média': 'text-amber-600 bg-amber-50 border-amber-200',
};

const TrafficBrainPage: React.FC = () => {
  const [tab, setTab] = useState<'consultar' | 'diagnostico'>('consultar');
  const [overview, setOverview] = useState<BrainTopic[]>([]);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<BrainTopic[] | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<BrainTopic | null>(null);
  const [topicLoading, setTopicLoading] = useState(false);

  // Form de diagnóstico de campanha
  const [campForm, setCampForm] = useState({
    platform: 'meta' as 'meta' | 'google',
    name: '',
    objective: 'conversions',
    status: 'active',
    daily_budget: 100,
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    cpa: 0,
    roas: 0,
  });
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await hubApi.cerebro.overview();
      const topics = data?.topics ? Object.values(data.topics) : [];
      setOverview(topics.length ? topics : (data?.topics_fallback ? Object.entries(data.topics_fallback).map(([k, v]) => ({ topico: k, descricao: v })) : []));
    } catch (e: any) {
      console.error(e);
      setError('Não foi possível carregar o cérebro. Verifique se o Python/scripts está disponível.');
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await hubApi.cerebro.query(search);
      setSearchResult(res?.matched_topics || []);
    } catch (err: any) {
      setError('Erro na consulta ao cérebro: ' + (err?.response?.data?.error || err.message));
      setSearchResult([]);
    } finally {
      setSearching(false);
    }
  };

  const openTopic = async (topic: BrainTopic) => {
    setSelectedTopic(topic);
    setTopicLoading(true);
    try {
      const res = await hubApi.cerebro.topic(topic.topico || topic.name || '');
      setSelectedTopic(res);
    } catch (err: any) {
      setSelectedTopic({ ...topic, summary: 'Erro ao carregar conteúdo completo: ' + (err?.response?.data?.error || err.message) });
    } finally {
      setTopicLoading(false);
    }
  };

  const set = (k: string, v: any) => setCampForm(f => ({ ...f, [k]: v }));

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnalyzing(true);
    setError(null);
    try {
      const res = await hubApi.cerebro.analyze({
        platform: campForm.platform,
        name: campForm.name || 'Campanha',
        objective: campForm.objective,
        status: campForm.status,
        daily_budget: Number(campForm.daily_budget),
        metrics: {
          spend: Number(campForm.spend),
          impressions: Number(campForm.impressions),
          clicks: Number(campForm.clicks),
          conversions: Number(campForm.conversions),
          ctr: Number(campForm.ctr),
          cpc: Number(campForm.cpc),
          cpm: Number(campForm.cpm),
          cpa: Number(campForm.cpa),
          roas: Number(campForm.roas),
        },
      });
      setAnalysis(res);
    } catch (err: any) {
      setError('Erro no diagnóstico: ' + (err?.response?.data?.error || err.message));
    } finally {
      setAnalyzing(false);
    }
  };

  const num = (v: string) => Number(v.replace(',', '.'));

  return (
    <div className="flex flex-col h-full bg-[#f1f5f9] overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-30 shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase leading-none">
              <CircleStackIcon className="w-5 h-5 text-orange-500" />
              Cérebro de Tráfego
            </h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">75+ PDFs e lives YouTube · especialista em performance</p>
          </div>
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200">
          <button onClick={() => setTab('consultar')} className={`px-5 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${tab === 'consultar' ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            Consultar
          </button>
          <button onClick={() => setTab('diagnostico')} className={`px-5 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${tab === 'diagnostico' ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            Diagnóstico
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 shrink-0" /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><XIcon className="w-4 h-4" /></button>
          </div>
        )}

        {tab === 'consultar' && (
          <>
            <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
              <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pergunte ao cérebro... Ex: como reduzir CPL no Meta Ads, estrutura de conta PMax, rotina de otimização"
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button type="submit" disabled={searching || !search.trim()} className="px-6 h-10 bg-orange-500 hover:bg-orange-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4" /> {searching ? 'Consultando...' : 'Consultar'}
              </button>
            </form>

            {searchResult && (
              <div className="space-y-3">
                {searchResult.length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-400 font-bold uppercase tracking-widest">Nenhum tópico encontrado</div>
                )}
                {searchResult.map((t, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-orange-300 transition-colors cursor-pointer" onClick={() => openTopic(t)}>
                    <div className="flex items-center gap-3 mb-2">
                      <LightBulbIcon className="w-5 h-5 text-orange-500 shrink-0" />
                      <h3 className="font-black text-slate-800 uppercase text-sm">{t.topico}</h3>
                      {typeof t.score === 'number' && (
                        <span className="ml-auto text-[10px] font-black text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">{(t.score * 100).toFixed(0)}% relevância</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{t.summary || t.descricao}</p>
                  </div>
                ))}
              </div>
            )}

            <div>
              <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <ChartPieIcon className="w-4 h-4" /> Tópicos do cérebro ({overview.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {overview.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => openTopic(t)}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-left hover:border-orange-300 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <LightBulbIcon className="w-4 h-4 text-orange-400 group-hover:text-orange-500 transition-colors" />
                      <h3 className="font-black text-slate-700 uppercase text-xs truncate">{t.topico || t.name}</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium line-clamp-2">{t.descricao || t.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {selectedTopic && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedTopic(null)}>
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-black text-slate-900 uppercase text-sm flex items-center gap-2">
                      <LightBulbIcon className="w-5 h-5 text-orange-500" /> {selectedTopic.topico || selectedTopic.topic}
                    </h3>
                    <button onClick={() => setSelectedTopic(null)} className="text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                    {topicLoading ? (
                      <div className="flex items-center gap-2 text-orange-500 text-xs font-black uppercase tracking-widest">
                        <ArrowPathIcon className="w-4 h-4 animate-spin" /> Carregando conteúdo...
                      </div>
                    ) : (
                      <>
                        {(selectedTopic.keywords?.length > 0) && (
                          <div className="flex flex-wrap gap-2">
                            {selectedTopic.keywords.map((k, i) => (
                              <span key={i} className="text-[10px] font-black text-orange-500 bg-orange-50 px-2 py-1 rounded-full uppercase">{k}</span>
                            ))}
                          </div>
                        )}
                        {selectedTopic.summary && (
                          <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{selectedTopic.summary}</div>
                        )}
                        {selectedTopic.sections?.length > 0 && (
                          <div className="space-y-3">
                            {selectedTopic.sections.map((s, i) => (
                              <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{s}</div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'diagnostico' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={handleAnalyze} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h2 className="font-black text-slate-800 uppercase text-sm flex items-center gap-2">
                <ArrowTrendingUpIcon className="w-5 h-5 text-orange-500" /> Diagnóstico de Campanha
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Plataforma</label>
                  <select value={campForm.platform} onChange={e => set('platform', e.target.value)} className="w-full border-slate-200 rounded-xl p-3 text-sm font-semibold bg-slate-50 focus:ring-orange-500 focus:border-orange-500">
                    <option value="meta">Meta Ads</option>
                    <option value="google">Google Ads</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Orçamento diário (R$)</label>
                  <input type="number" value={campForm.daily_budget} onChange={e => set('daily_budget', e.target.value)} className="w-full border-slate-200 rounded-xl p-3 text-sm font-semibold bg-slate-50 focus:ring-orange-500 focus:border-orange-500" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nome da campanha</label>
                <input value={campForm.name} onChange={e => set('name', e.target.value)} placeholder="Campanha de Captação - Teste" className="w-full border-slate-200 rounded-xl p-3 text-sm font-semibold bg-slate-50 focus:ring-orange-500 focus:border-orange-500" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  ['spend', 'Investimento (R$)', '0'],
                  ['impressions', 'Impressões', '0'],
                  ['clicks', 'Cliques', '0'],
                  ['conversions', 'Conversões', '0'],
                  ['ctr', 'CTR (%)', '0'],
                  ['cpc', 'CPC (R$)', '0'],
                  ['cpm', 'CPM (R$)', '0'],
                  ['cpa', 'CPA (R$)', '0'],
                  ['roas', 'ROAS', '0'],
                ].map(([key, label, def]) => (
                  <div key={key}>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</label>
                    <input
                      type="text"
                      value={String((campForm as any)[key])}
                      onChange={e => set(key, num(e.target.value))}
                      placeholder={def}
                      className="w-full border-slate-200 rounded-xl p-2.5 text-sm font-semibold bg-slate-50 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                ))}
              </div>

              <button type="submit" disabled={analyzing} className="w-full py-4 bg-orange-500 hover:bg-orange-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                <SparklesIcon className="w-4 h-4" /> {analyzing ? 'Diagnosticando...' : 'Analisar com o Cérebro'}
              </button>
            </form>

            <div className="space-y-4">
              {!analysis && (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                  <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <CurrencyDollarIcon className="w-8 h-8 text-orange-400" />
                  </div>
                  <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Preencha as métricas</p>
                  <p className="text-xs text-slate-400 mt-2">O cérebro vai comparar com os thresholds da base de conhecimento e indicar prioridades.</p>
                </div>
              )}

              {analysis && (
                <>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-black text-slate-800 uppercase text-sm">Diagnóstico</h3>
                      <div className="flex gap-2">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${analysis.diagnosis.issues.length === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                          {analysis.diagnosis.issues.length === 0 ? 'Saudável' : `${analysis.diagnosis.issues.length} problema(s)`}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {analysis.diagnosis.issues.length === 0 && (
                        <div className="flex items-center gap-2 text-emerald-600 text-xs font-black uppercase tracking-widest">
                          <CheckCircleIcon className="w-4 h-4" /> Nenhum problema crítico identificado
                        </div>
                      )}
                      {analysis.diagnosis.issues.map((i: any, idx: number) => (
                        <div key={idx} className={`rounded-xl border p-3 text-xs ${sevColor[i.severity] || 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                          <div className="flex items-center gap-2 font-black uppercase">
                            <ExclamationTriangleIcon className="w-4 h-4" /> {i.severity} · {i.metric.toUpperCase()}
                            <span className="ml-auto font-bold">v:{i.value} · limiar {i.threshold}</span>
                          </div>
                          <p className="mt-1 opacity-90 font-medium">Área: {i.area}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="font-black text-slate-800 uppercase text-sm mb-3 flex items-center gap-2">
                      <CheckCircleIcon className="w-5 h-5 text-emerald-500" /> Recomendações
                    </h3>
                    <ul className="space-y-2">
                      {analysis.diagnosis.recommendations.map((r: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                          <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> {r}
                        </li>
                      ))}
                    </ul>
                    {analysis.diagnosis.brain_insights?.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <h4 className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                          <CircleStackIcon className="w-3.5 h-3.5" /> Insights do cérebro
                        </h4>
                        {analysis.diagnosis.brain_insights.map((b: any, idx: number) => (
                          <p key={idx} className="text-[11px] text-slate-500 leading-relaxed mb-1"><strong className="uppercase">{b.topic}:</strong> {b.summary}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrafficBrainPage;
