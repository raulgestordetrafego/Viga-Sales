import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { Page } from '../types';
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  EyeIcon,
  CheckBadgeIcon,
} from '../components/icons';

interface SearchConsolePageProps {
  navigateTo: (page: Page) => void;
}

interface SiteRow { site: string; clicks: number; impressions: number; ctr: number; }
interface QueryRow { query: string; clicks: number; impressions: number; position: number; }
interface Overview {
  configured: boolean;
  hasData: boolean;
  total: { clicks: number; impressions: number; ctr: number; position: number };
  bySite: SiteRow[];
  topQueries: QueryRow[];
  sites: string[];
  lastSync: { at: string; sites: number; rows: number } | null;
  days: number;
}

const fmtSite = (s: string) => s.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtNum = (v: number) => (v || 0).toLocaleString('pt-BR');

const StatCard: React.FC<{ label: string; value: string; sub?: string; icon: React.ReactNode; color: string }> = ({ label, value, sub, icon, color }) => (
  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
    <div className={`w-10 h-10 rounded-2xl ${color} flex items-center justify-center text-white mb-3 shadow-lg shadow-current/10`}>
      {icon}
    </div>
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.12em] mb-0.5">{label}</p>
      <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const SearchConsolePage: React.FC<SearchConsolePageProps> = ({ navigateTo }) => {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/equipe/search-console/overview', { params: { days } });
      setData(data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await api.post('/equipe/search-console/sync', { days });
      setTimeout(() => { setSyncing(false); load(); }, 5000);
    } catch (e: any) {
      setSyncing(false);
      setError(e?.response?.data?.error || e.message || 'Erro no sync');
    }
  };

  const t = data?.total;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigateTo('home')}
            title="Voltar para o Dashboard"
            className="p-2 rounded-full hover:bg-slate-200 transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <MagnifyingGlassIcon className="w-7 h-7 text-blue-600" />
              Search Console
            </h1>
            <p className="text-slate-500 mt-1">Busca orgânica do Google — cliques, impressões e posição.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(parseInt(e.target.value, 10))}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={180}>180 dias</option>
          </select>
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            <ArrowPathIcon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
      )}

      {data && !data.configured && (
        <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Search Console não configurado (env <code>GOOGLE_OAUTH_*</code> / <code>SEARCH_CONSOLE_REFRESH_TOKEN</code>).
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Cliques"
          value={loading ? '—' : fmtNum(t?.clicks || 0)}
          icon={<ArrowTrendingUpIcon className="w-5 h-5" />}
          color="bg-blue-600"
        />
        <StatCard
          label="Impressões"
          value={loading ? '—' : fmtNum(t?.impressions || 0)}
          icon={<EyeIcon className="w-5 h-5" />}
          color="bg-indigo-600"
        />
        <StatCard
          label="CTR"
          value={loading ? '—' : fmtPct(t?.ctr || 0)}
          icon={<ArrowTrendingUpIcon className="w-5 h-5" />}
          color="bg-emerald-600"
        />
        <StatCard
          label="Posição média"
          value={loading ? '—' : (t?.position || 0).toFixed(1)}
          icon={<CheckBadgeIcon className="w-5 h-5" />}
          color="bg-slate-700"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por site */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">Propriedades</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {(data?.bySite || []).length === 0 && (
              <p className="px-5 py-6 text-sm text-slate-400">Sem dados no período.</p>
            )}
            {(data?.bySite || []).map(s => (
              <div key={s.site} className="px-5 py-3 flex items-center justify-between">
                <span className="font-semibold text-slate-700 text-sm truncate mr-3">{fmtSite(s.site)}</span>
                <span className="text-sm text-slate-500 whitespace-nowrap">
                  <b className="text-slate-800">{fmtNum(s.clicks)}</b> cliques · {fmtNum(s.impressions)} impr · {fmtPct(s.ctr)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Top queries */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Top consultas</h2>
            {data?.lastSync && (
              <span className="text-[11px] text-slate-400">
                sync: {new Date(data.lastSync.at).toLocaleString('pt-BR')}
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {(data?.topQueries || []).length === 0 && (
              <p className="px-5 py-6 text-sm text-slate-400">Sem consultas no período.</p>
            )}
            {(data?.topQueries || []).map(q => (
              <div key={q.query} className="px-5 py-3 flex items-center justify-between">
                <span className="font-semibold text-slate-700 text-sm truncate mr-3">{q.query}</span>
                <span className="text-sm text-slate-500 whitespace-nowrap">
                  <b className="text-slate-800">{fmtNum(q.clicks)}</b> cliques · {fmtNum(q.impressions)} impr · pos {q.position}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="text-xs text-slate-400 mt-6">
        Dados do Google Search Console (janela de {days} dias, com ~2–3 dias de atraso do Google).
      </p>
    </div>
  );
};

export default SearchConsolePage;
