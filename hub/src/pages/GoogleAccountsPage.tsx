import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Client, GoogleAdAccount, Page } from '../types';
import { hubApi } from '../api';
import {
  ArrowLeftIcon, MagnifyingGlassIcon, ExternalLinkIcon,
  ExclamationTriangleIcon, ArrowPathIcon,
} from '../components/icons';

interface GoogleAccountsPageProps {
  clients: Client[];
  navigateTo: (page: Page) => void;
  onChanged?: () => void;
}

const statusClasses = (status?: string | null) => {
  const s = String(status || '').toUpperCase();
  if (s === 'ENABLED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'SUSPENDED' || s === 'PAUSED') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'CANCELED' || s === 'CLOSED') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

const statusLabel = (status?: string | null) => {
  const s = String(status || '').toUpperCase();
  if (s === 'ENABLED') return 'Ativa';
  if (s === 'SUSPENDED') return 'Suspensa';
  if (s === 'CANCELED') return 'Cancelada';
  if (s === 'CLOSED') return 'Encerrada';
  return s || '—';
};

const GoogleAccountsPage: React.FC<GoogleAccountsPageProps> = ({ clients, navigateTo, onChanged }) => {
  const [accounts, setAccounts] = useState<GoogleAdAccount[]>([]);
  const [configured, setConfigured] = useState(true);
  const [linkedConfigured, setLinkedConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await hubApi.google.accounts();
      setAccounts(data?.accounts || []);
      setConfigured(data?.configured !== false);
      setLinkedConfigured(data?.linkedConfigured !== false);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Falha ao carregar contas do Google Ads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clientOptions = useMemo(
    () => [...clients].sort((a, b) =>
      (a.StatusCliente === 'Ativo' ? 0 : 1) - (b.StatusCliente === 'Ativo' ? 0 : 1)
      || (a.Nome || '').localeCompare(b.Nome || '')),
    [clients]
  );

  const stats = useMemo(() => ({
    total: accounts.length,
    linked: accounts.filter(a => a.linkedClienteId).length,
    active: accounts.filter(a => String(a.status || '').toUpperCase() === 'ENABLED' && !a.manager).length,
  }), [accounts]);

  const handleLink = async (account: GoogleAdAccount, clienteId: string) => {
    setSavingId(account.id);
    setError(null);
    try {
      await hubApi.google.linkAccount(account.id, clienteId || null);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Falha ao vincular conta.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigateTo('home')}
            title="Voltar para o Dashboard"
            className="p-2 rounded-full hover:bg-slate-200 transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Contas de Anúncios — Google</h1>
            <p className="text-slate-500 mt-1">Descobertas automaticamente via MCC (Google Ads API). Vincule cada conta ao cliente responsável.</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      {!configured && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">Google Ads não configurado no servidor. Faltam <code className="font-mono">GOOGLE_ADS_DEVELOPER_TOKEN</code>, <code className="font-mono">GOOGLE_ADS_REFRESH_TOKEN</code> (escopo <code className="font-mono">adwords</code>) e <code className="font-mono">GOOGLE_ADS_LOGIN_CUSTOMER_ID</code> (MCC).</p>
        </div>
      )}

      {configured && !linkedConfigured && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">Defina <code className="font-mono">GOOGLE_ADS_LOGIN_CUSTOMER_ID</code> (ID da MCC) para listar as contas filhas.</p>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Contas descobertas', value: stats.total },
          { label: 'Vinculadas a cliente', value: stats.linked },
          { label: 'Ativas', value: stats.active },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {loading && accounts.length === 0 ? (
        <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest text-[10px]">Carregando contas...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-100">
          <MagnifyingGlassIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nenhuma conta Google Ads encontrada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map(account => {
            const linkedClient = clients.find(c => c.ClienteID === account.linkedClienteId) || null;
            const isLinked = !!account.linkedClienteId;
            return (
              <div key={account.id} className="bg-white rounded-xl shadow-md flex flex-col border border-slate-100">
                <div className="p-5 flex items-start gap-3">
                  <div className={`p-3 rounded-full shrink-0 ${isLinked ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    <MagnifyingGlassIcon className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-slate-800 truncate" title={account.name}>{account.name}</h2>
                    <p className="text-xs text-slate-500 truncate">
                      {account.manager ? 'Conta MCC' : 'Conta de anúncio'}{account.currency ? ` · ${account.currency}` : ''}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">{account.id}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${statusClasses(account.status)}`}>
                    {account.manager ? 'MCC' : statusLabel(account.status)}
                  </span>
                </div>

                <div className="px-5">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Cliente vinculado</label>
                  <select
                    value={account.linkedClienteId || ''}
                    onChange={e => handleLink(account, e.target.value)}
                    disabled={savingId === account.id}
                    className="w-full border-slate-200 rounded-lg shadow-sm focus:ring-red-500 focus:border-red-500 text-sm p-2.5 bg-slate-50/50 disabled:opacity-60"
                  >
                    <option value="">— Sem vínculo —</option>
                    {clientOptions.map(c => (
                      <option key={c.ClienteID} value={c.ClienteID}>
                        {c.Nome}{c.StatusCliente && c.StatusCliente !== 'Ativo' ? ` (${c.StatusCliente})` : ''}
                      </option>
                    ))}
                  </select>
                  {savingId === account.id && <p className="text-[10px] text-red-500 mt-1.5 font-medium">Salvando...</p>}
                </div>

                <div className="p-5 mt-auto flex items-center gap-2 border-t border-slate-100">
                  <a
                    href={`https://ads.google.com/aw/overview?ocid=${account.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center py-2 px-3 bg-slate-50 text-red-600 hover:bg-red-50 font-semibold text-xs rounded-md transition-colors"
                  >
                    <ExternalLinkIcon className="w-4 h-4 mr-1.5" />
                    Gerenciador
                  </a>
                  {linkedClient && (
                    <span className="flex-1 text-center text-[11px] text-slate-400 truncate" title={linkedClient.Nome}>
                      {linkedClient.Nome}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GoogleAccountsPage;
