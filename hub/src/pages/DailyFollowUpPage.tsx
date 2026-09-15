import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { hubApi } from '../api';
import { Client, DailyPerformance, DateRange } from '../types';
import { fetchMetaDailyHistory } from '../services/metaApi';
import MetaDateRangePicker from '../components/MetaDateRangePicker';
import { 
    MagnifyingGlassIcon,
    SparklesIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    UsersIcon,
} from '../components/icons';

interface DailyFollowUpPageProps {
  clients: Client[];
}

/**
 * Formatação de moeda segura contra undefined/null/zero
 */
const formatCurrency = (value: any) => {
  const val = Number(value);
  if (value === undefined || value === null || isNaN(val) || val === 0) return '-';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

/**
 * Normaliza a resposta do /hub/desempenho (array ou mapa por ClienteID)
 */
const normalizePerformance = (list: any): any[] => {
  if (Array.isArray(list)) return list || [];
  return Object.entries(list || {}).map(([key, value]: [string, any]) => ({ ...(value || {}), ClienteID: key }));
};

const DailyFollowUpPage: React.FC<DailyFollowUpPageProps> = ({ clients }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  
  const [performanceMap, setPerformanceMap] = useState<Record<string, Record<string, DailyPerformance>>>({});
  // Mapa dinâmico para CPL Anterior (calculado com base no histórico)
  const [cplAntMap, setCplAntMap] = useState<Record<string, number>>({});
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    return { since: formatDate(firstDay), until: formatDate(today), label: 'Este mês' };
  });

  const currentDays = useMemo(() => {
    const days = [];
    const start = new Date(dateRange.since + 'T12:00:00');
    const end = new Date(dateRange.until + 'T12:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push({
            display: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`,
            iso: d.toISOString().split('T')[0]
        });
        if (days.length > 31) break; 
    }
    return days;
  }, [dateRange]);

  const activeClients = useMemo(() => {
    return clients
      .filter(c => c.StatusCliente === 'Ativo')
      .filter(c => c.Nome.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.Nome.localeCompare(b.Nome));
  }, [clients, searchTerm]);

  /**
   * Helper para calcular o intervalo do mês anterior
   */
  const getPreviousRange = (since: string) => {
      const d = new Date(since + 'T12:00:00'); 
      // Garante o primeiro dia do mês atual selecionado
      const firstDayCurrent = new Date(d.getFullYear(), d.getMonth(), 1);
      // Mês anterior (índice - 1)
      const firstDayPrev = new Date(firstDayCurrent.getFullYear(), firstDayCurrent.getMonth() - 1, 1);
      const lastDayPrev = new Date(firstDayCurrent.getFullYear(), firstDayCurrent.getMonth(), 0);
      
      return {
          start: firstDayPrev.toISOString().split('T')[0],
          end: lastDayPrev.toISOString().split('T')[0]
      };
  };

  /**
   * Effect: Carrega o CPL do mês anterior (Retroativo)
   * Lê o history salvo via hubApi.desempenho.list() em vez do Firestore.
   */
  useEffect(() => {
      const fetchCplAnt = async () => {
          const targetClients = clients.filter(c => c.StatusCliente === 'Ativo');
          if (targetClients.length === 0) return;

          const { start, end } = getPreviousRange(dateRange.since);
          const results: Record<string, number> = {};

          try {
              const list = await hubApi.desempenho.list();
              const items = normalizePerformance(list);

              await Promise.all(targetClients.map(async (c) => {
                  try {
                      const item = items.find((x: any) => x.ClienteID === c.ClienteID || x.clienteId === c.ClienteID);
                      const history = item?.history || {};

                      let totalSpend = 0;
                      let totalLeads = 0;
                      
                      Object.values(history).forEach((entry: any) => {
                          if (!entry || !entry.data) return;
                          if (entry.data >= start && entry.data <= end) {
                              totalSpend += Number(entry.spend || 0);
                              totalLeads += Number(entry.leads || 0);
                          }
                      });
                      
                      results[c.ClienteID] = totalLeads > 0 ? totalSpend / totalLeads : 0;
                  } catch (e) {
                      console.warn(`Erro ao calcular CPL Ant para ${c.Nome}`, e);
                  }
              }));
          } catch (e) {
              console.warn("Erro ao carregar desempenho para CPL Ant:", e);
          }
          
          setCplAntMap(results);
      };

      fetchCplAnt();
  }, [dateRange.since, clients]); // Recalcula sempre que mudar o mês ou a lista de clientes

  /**
   * MECANISMO DE CAPTURA AUTOMATIZADA (Retroativa ou Atual)
   * Grava o history agregado no backend via hubApi.desempenho.save().
   */
  const performSync = useCallback(async (clientList: Client[]) => {
    if (clientList.length === 0) return;
    setSyncing(true);
    setSyncErrors({});
    
    try {
        for (const client of clientList) {
            setSyncStatus(`Processando ${client.Nome}...`);
            try {
                // Captura dados do período SELECIONADO (dateRange)
                // Se o usuário selecionou Dezembro, dateRange será de Dezembro, e a API trará dados de Dezembro.
                const historyData = await fetchMetaDailyHistory(client.metaAdAccountId!, dateRange, 'captacao');
                
                // Monta o histórico como objeto { "YYYY-MM-DD": {...} }
                const history: Record<string, any> = {};
                historyData.forEach(day => {
                    history[day.data] = { ...day, clienteId: client.ClienteID, lastUpdate: new Date().toISOString() };
                });

                await hubApi.desempenho.save(client.ClienteID, {
                    nome: client.Nome,
                    ultimoSync: new Date().toISOString(),
                    ativo: true,
                    history
                });
            } catch (err: any) {
                setSyncErrors(prev => ({ ...prev, [client.ClienteID]: err.message }));
            }
        }
    } finally {
        setSyncing(false);
        setSyncStatus('');
    }
  }, [dateRange]);

  /**
   * Carregamento + Polling (5s)
   * Constrói o performanceMap a partir do history salvo de cada cliente ativo.
   */
  useEffect(() => {
    if (activeClients.length === 0) return;
    let active = true;

    const loadPerformance = async () => {
        try {
            const list = await hubApi.desempenho.list();
            if (!active) return;
            const items = normalizePerformance(list);
            const nextMap: Record<string, Record<string, DailyPerformance>> = {};

            activeClients.forEach(client => {
                const item = items.find((x: any) => x.ClienteID === client.ClienteID || x.clienteId === client.ClienteID);
                const history = item?.history || {};
                const clientDays: Record<string, DailyPerformance> = {};

                Object.entries(history).forEach(([date, entry]: [string, any]) => {
                    if (!entry) return;
                    if (date >= dateRange.since && date <= dateRange.until) {
                        clientDays[date] = {
                            ...entry,
                            id: entry.id || `${client.ClienteID}_${date}`,
                            clienteId: client.ClienteID,
                            data: date,
                            canal: entry.canal || 'Meta',
                            spend: Number(entry.spend || 0),
                            leads: Number(entry.leads || 0),
                            cpl: Number(entry.cpl || 0)
                        };
                    }
                });

                nextMap[client.ClienteID] = clientDays;
            });

            setPerformanceMap(nextMap);
        } catch (e) {
            /* silencioso no polling */
        }
    };

    loadPerformance();
    const t = setInterval(loadPerformance, 5000);
    
    return () => { active = false; clearInterval(t); };
  }, [activeClients.length, dateRange.since, dateRange.until, activeClients]); // Adicionado activeClients para garantir re-conexão na busca

  const handleManualSync = () => {
    const syncList = clients.filter(c => c.StatusCliente === 'Ativo' && c.metaAdAccountId);
    if (syncList.length === 0) return alert("Configure a conta de anúncios Meta nas contas ativas primeiro.");
    if (!confirm(`Deseja iniciar a captura de dados para ${syncList.length} clientes no período selecionado (${dateRange.label})?`)) return;
    performSync(syncList);
  };

  return (
    <div className="flex flex-col h-full bg-[#f1f5f9] overflow-hidden">
      {/* Header Fiel ao Print */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-30 shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase leading-none">
                <UsersIcon className="w-5 h-5 text-orange-500" />
                REPORT DIÁRIO
            </h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Mapeamento de Estruturas Ativo</p>
          </div>
          <div className="h-8 w-px bg-slate-100 mx-2"></div>
          <div className="flex items-center gap-3">
              <div className="flex items-center bg-slate-100 rounded-xl px-3 h-11 border border-slate-200">
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 mr-2" />
                <input type="text" placeholder="Filtrar contas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-transparent border-none focus:ring-0 text-xs w-48 font-bold uppercase"/>
              </div>
              <MetaDateRangePicker currentRange={dateRange} onRangeChange={setDateRange} align="left" />
          </div>
        </div>
        <div className="flex items-center gap-4">
            {syncStatus && <span className="text-[10px] font-black text-orange-500 animate-pulse uppercase tracking-widest">{syncStatus}</span>}
            <button onClick={handleManualSync} disabled={syncing} className="px-6 h-11 bg-orange-500 hover:bg-orange-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2">
              <SparklesIcon className="w-4 h-4" /> {syncing ? 'CAPTURANDO...' : 'FORÇAR CAPTURA MANUAL'}
            </button>
        </div>
      </div>

      <div className="flex-1 m-4 bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full border-separate border-spacing-0 table-fixed">
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#0f172a] text-white">
                <th className="sticky left-0 z-30 bg-[#0f172a] p-5 text-left text-[11px] font-black uppercase tracking-widest border-r border-slate-700 w-[280px] min-w-[280px]">CLIENTES ATIVOS</th>
                <th className="w-24 min-w-[96px] px-4 text-center bg-[#1e293b] text-[11px] font-black uppercase tracking-widest border-r border-slate-700" title="Média de CPL do Mês Anterior">REF.</th>
                {currentDays.map(day => (
                  <th key={day.iso} colSpan={3} className="w-[240px] min-w-[240px] px-2 py-5 text-center border-l border-slate-700 text-[11px] font-black uppercase tracking-widest bg-[#0f172a]">{day.display}</th>
                ))}
              </tr>
              <tr className="bg-[#f8fafc] text-slate-400">
                <th className="sticky left-0 z-30 bg-white border-b p-3 text-left border-r border-slate-100 text-[9px] font-black uppercase tracking-widest">NOME DA CONTA</th>
                <th className="border-b px-2 text-center bg-slate-50 font-black border-r text-orange-700 text-[9px] uppercase tracking-widest">CPL ANT.</th>
                {currentDays.map(day => (
                  <React.Fragment key={`${day.iso}-sub`}>
                    <th className="border-b border-l px-1 py-2 text-center text-orange-500 bg-orange-50/20 font-black text-[9px] w-20 min-w-[80px]">L</th>
                    <th className="border-b border-l px-1 py-2 text-center text-slate-900 font-black text-[9px] w-20 min-w-[80px]">CPL</th>
                    <th className="border-b border-l px-1 py-2 text-center text-slate-400 font-black text-[9px] w-20 min-w-[80px]">INV</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeClients.map((client) => {
                const hasError = syncErrors[client.ClienteID];
                // Usa o CPL calculado dinamicamente do mês anterior
                const cplRef = cplAntMap[client.ClienteID] || 0;
                
                return (
                  <tr key={client.ClienteID} className="group hover:bg-slate-50 transition-colors">
                    <td className="sticky left-0 z-10 bg-white p-4 border-r shadow-[4px_0_10px_rgba(0,0,0,0.01)] group-hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${client.metaAdAccountId ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                        <span className="font-black text-slate-700 uppercase truncate text-[11px]">{client.Nome}</span>
                        {hasError && (
                            <span title={`Erro: ${hasError}`} className="flex items-center shrink-0">
                              <ExclamationTriangleIcon className="w-4 h-4 text-rose-500" />
                            </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 text-center font-black text-orange-700 bg-orange-50/10 border-r border-slate-100 text-[11px]">
                      {cplRef > 0 ? formatCurrency(cplRef) : '-'}
                    </td>
                    {currentDays.map(day => {
                      const perf = performanceMap[client.ClienteID]?.[day.iso];
                      return (
                        <React.Fragment key={`${client.ClienteID}-${day.iso}`}>
                          {/* L - Azul */}
                          <td className={`px-1 py-4 text-center border-l border-slate-100 font-black text-[11px] ${perf?.leads ? 'text-orange-500 bg-orange-50/30' : 'text-slate-200'}`}>
                            {perf?.leads || '-'}
                          </td>
                          {/* CPL - Preto */}
                          <td className={`px-1 py-4 text-center border-l border-slate-100 font-black text-[10px] ${perf?.cpl ? 'text-slate-900' : 'text-slate-200'}`}>
                            {perf?.cpl ? formatCurrency(perf.cpl) : '-'}
                          </td>
                          {/* INV - Cinza */}
                          <td className={`px-1 py-4 text-center border-l border-slate-100 font-bold text-[10px] ${perf?.spend ? 'text-slate-400' : 'text-slate-200'}`}>
                            {perf?.spend ? formatCurrency(perf.spend) : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Informacional Fiel ao Print */}
      <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 text-emerald-600 font-black"><CheckCircleIcon className="w-3.5 h-3.5" /> <span>ESTRUTURA DE DADOS SINCRONIZADA</span></div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500"></div> <span>L = RESULTADO PADRÃO (CAPTAÇÃO)</span></div>
        </div>
        <div>CONTAS MONITORADAS: <strong>{activeClients.length}</strong></div>
      </div>
    </div>
  );
};

export default DailyFollowUpPage;
