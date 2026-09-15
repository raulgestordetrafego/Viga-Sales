import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Client, Lead, Investment, Creative, Optimization, LeadStatus, EfetividadeStatus, OptimizationStatus, MetaInsightsData, MetaCampaignData, DateRange, MetaFilter, MetaCampaignCategory, MonthlyCreativeRequest, MoodStatus, Squad } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
    ArrowLeftIcon, FunnelIcon, CheckBadgeIcon, ArrowTrendingUpIcon, ChartPieIcon, PlusIcon, ExternalLinkIcon, 
    Cog6ToothIcon, WalletIcon, UsersIcon, CurrencyDollarIcon, PencilIcon, CubeIcon, ChevronDownIcon, 
    ChevronUpIcon, WifiSlashIcon, TrashIcon, CheckCircleIcon, XIcon, MagnifyingGlassIcon, ArrowPathIcon, 
    DocumentChartBarIcon, CalendarDaysIcon, BanknotesIcon, CalendarIcon, SparklesIcon, ExclamationTriangleIcon, 
    LightBulbIcon, PhotoIcon, ClipboardCheckIcon, ChartBarSquareIcon, MapPinIcon, PhoneIcon
} from '../components/icons';
import KanbanBoard from '../components/KanbanBoard';
import CreativesTable from '../components/CreativesTable';
import MonthlyRequestsTable from '../components/MonthlyRequestsTable';
import MetaDateRangePicker from '../components/MetaDateRangePicker';
import MetaFilterBar from '../components/MetaFilterBar';
import { fetchMetaInsights, fetchMetaCampaigns } from '../services/metaApi';
import ScenarioProjectionPage from './ScenarioProjectionPage'; 
import ReportsPage from './ReportsPage'; 
import { hubApi } from '../api';

// Helper to format currency safely
const formatCurrency = (value: number, currency: string = 'BRL') => {
  if (value === undefined || value === null || isNaN(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: currency });
};

// =====================================================================
// MetaLiveStats Component
// =====================================================================

const CampaignCard: React.FC<{ camp: MetaCampaignData, currency?: string }> = ({ camp, currency }) => {
    const getCategoryBadge = (category: MetaCampaignCategory) => {
        const labels: Record<string, string> = {
            'CAPTACAO_ENG_MSG': 'Captação | Engajamento | Mensagens',
            'CAPTACAO_LEADS_MSG': 'Captação | Leads | Mensagens',
            'CAPTACAO_LEADS_FORMS': 'Captação | Leads | Forms',
            'CAPTACAO_LEADS_SITE': 'Captação | Leads | Site',
            'CAPTACAO_LEADS_TIMTIM': 'Captação | Leads Timtim',
            'CAPTACAO_VENDAS_WHATSAPP': 'Captação | Vendas | Whatsapp',
            'DISTRIBUICAO_TRAFEGO': 'Distribuição | Tráfego',
            'OUTRO': 'Outro'
        };
        return labels[category] || category;
    };

    const renderMetric = (label: string, value: any, isPrimary: boolean = false) => (
        <div className={`p-3 rounded-2xl ${isPrimary ? 'bg-orange-50 border border-orange-100 shadow-sm' : 'bg-slate-50'}`}>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1.5">{label}</p>
            <p className={`text-base font-black ${isPrimary ? 'text-orange-500' : 'text-slate-700'}`}>{value}</p>
        </div>
    );

    const renderPrincipais = () => {
        const leads = camp.leads || 0;
        const spend = camp.spend || 0;
        const cpl = leads > 0 ? spend / leads : 0;
        return (
            <>
                {renderMetric('Leads / Resultados', leads.toLocaleString('pt-BR'), true)}
                {renderMetric('CPL (Custo por Res.)', formatCurrency(cpl, currency), true)}
                {renderMetric('Valor Investido', formatCurrency(spend, currency), true)}
            </>
        );
    };

    const renderSecundarias = () => (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-slate-100">
            {renderMetric('CPM', formatCurrency(camp.cpm || 0, currency))}
            {renderMetric('Cliques', (camp.clicks || 0).toLocaleString('pt-BR'))}
            {renderMetric('CPC', formatCurrency(camp.cpc || 0, currency))}
            {renderMetric('Alcance', (camp.reach || 0).toLocaleString('pt-BR'))}
            {renderMetric('Frequência', (camp.frequency || 0).toFixed(2))}
        </div>
    );

    return (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden hover:shadow-lg transition-all group border-l-4 border-l-orange-500">
            <div className="p-8">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
                    <div>
                        <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-[0.15em] mb-3 inline-block">
                            {getCategoryBadge(camp.category)}
                        </span>
                        <h3 className="text-xl font-black text-slate-800 leading-tight group-hover:text-orange-500 transition-colors">{camp.name}</h3>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                         <span className={`w-2 h-2 rounded-full ${camp.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                         <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{camp.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}</span>
                    </div>
                </div>
                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <SparklesIcon className="w-5 h-5 text-orange-500" />
                        <span className="text-[11px] font-black uppercase text-orange-900 tracking-[0.2em]">Métricas Principais</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {renderPrincipais()}
                    </div>
                    <div className="flex items-center gap-2 mt-6 mb-2">
                        <DocumentChartBarIcon className="w-5 h-5 text-slate-400" />
                        <span className="text-[11px] font-black uppercase text-slate-400 tracking-[0.2em]">Métricas de Entrega</span>
                    </div>
                    {renderSecundarias()}
                </div>
            </div>
        </div>
    );
};

const MetaLiveStats: React.FC<{ client: Client, leads: Lead[], onOpenConfig: () => void, onLeadCreate: (lead: Omit<Lead, 'LeadID'>) => void }> = ({ client, leads, onOpenConfig, onLeadCreate }) => {
    const [data, setData] = useState<MetaInsightsData | null>(null);
    const [campaigns, setCampaigns] = useState<MetaCampaignData[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState<DateRange>(() => {
        const d = new Date();
        const since = new Date(d.getFullYear(), d.getMonth(), 1);
        return { since: since.toISOString().split('T')[0], until: d.toISOString().split('T')[0], label: 'Este mês' };
    });
    const [metaFilters, setMetaFilters] = useState<MetaFilter[]>([]);

    const filteredCampaigns = useMemo(() => {
        let camps = campaigns;
        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase();
            camps = camps.filter(c => c.name.toLowerCase().includes(lower) || c.id.includes(lower));
        }
        if (metaFilters.length > 0) {
            camps = camps.filter(camp => {
                return metaFilters.every(f => {
                    const val = (f.value || '').toString().toLowerCase();
                    switch(f.type) {
                      case 'campaign_name':
                        return f.operator === 'contains' ? camp.name.toLowerCase().includes(val) : !camp.name.toLowerCase().includes(val);
                      case 'impressions':
                        const numVal = Number(f.value);
                        if (f.operator === 'greater_than') return camp.impressions > numVal;
                        if (f.operator === 'less_than') return camp.impressions < numVal;
                        if (f.operator === 'equal_to') return camp.impressions === numVal;
                        return true;
                      default: return true;
                    }
                });
            });
        }
        return camps;
    }, [campaigns, metaFilters, searchTerm]);

    const stats = useMemo(() => {
        const totals = filteredCampaigns.reduce((acc, camp) => {
            acc.spend += camp.spend || 0;
            acc.impressions += camp.impressions || 0;
            acc.reach += camp.reach || 0;
            acc.leads += camp.leads || 0;
            acc.clicks += camp.clicks || 0;
            return acc;
        }, { spend: 0, impressions: 0, reach: 0, leads: 0, clicks: 0 });
        return { 
            ...totals, 
            ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0, 
            cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0, 
            cpl: totals.leads > 0 ? totals.spend / totals.leads : 0, 
            cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0 
        };
    }, [filteredCampaigns]);

    const loadData = async () => {
        if (!client.metaAdAccountId) return;
        setLoading(true);
        try {
            const [insights, campaignsData] = await Promise.all([
                fetchMetaInsights(client.metaAdAccountId, dateRange),
                fetchMetaCampaigns(client.metaAdAccountId, dateRange)
            ]);
            setData(insights);
            setCampaigns(campaignsData);
            setLastUpdate(new Date().toLocaleTimeString('pt-BR'));
        } catch (err) {
            console.error("Meta Sync Error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [client.metaAdAccountId, dateRange]);

    if (!client.metaAdAccountId) {
        return (
             <div className="p-12 bg-white rounded-[2.5rem] border border-slate-100 text-center shadow-xl">
                <CubeIcon className="mx-auto h-16 w-16 text-slate-200 mb-6" />
                <h3 className="text-2xl font-black text-slate-800">Conexão Meta Pendente</h3>
                <p className="text-slate-500 mt-2 mb-8 max-w-sm mx-auto">Vincule a conta de anúncios deste cliente para ativar o monitoramento em tempo real.</p>
                <button onClick={onOpenConfig} className="px-8 py-3 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-orange-700 transition-all active:scale-95">Configurar Agora</button>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Performance Viga Sales</h2>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Integração Direta Meta Graph API (Todas as Campanhas)</p>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={loadData} disabled={loading} className="flex items-center px-6 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95">
                        {loading ? <ArrowPathIcon className="w-4 h-4 animate-spin mr-2" /> : <ArrowPathIcon className="w-4 h-4 mr-2" />}
                        Sincronizar
                    </button>
                    <MetaDateRangePicker currentRange={dateRange} onRangeChange={setDateRange} align="right" />
                </div>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: 'Valor Investido', value: formatCurrency(stats.spend, data?.currency), icon: <CurrencyDollarIcon className="w-6 h-6"/>, color: 'text-orange-500', bg: 'bg-orange-50' },
                    { label: 'Total de Leads/Res', value: (stats.leads || 0).toLocaleString('pt-BR'), icon: <FunnelIcon className="w-6 h-6"/>, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'CTR Médio', value: `${stats.ctr.toFixed(2)}%`, icon: <ArrowTrendingUpIcon className="w-6 h-6"/>, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Custo por Resultado', value: formatCurrency(stats.cpl, data?.currency), icon: <ChartPieIcon className="w-6 h-6"/>, color: 'text-rose-600', bg: 'bg-rose-50' },
                ].map((kpi, i) => (
                    <div key={i} className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
                        <div className={`p-3 rounded-2xl ${kpi.bg} ${kpi.color} w-fit mb-4`}>{kpi.icon}</div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">{kpi.label}</p>
                        <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
                    </div>
                ))}
            </div>
            <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Todas as Campanhas</h3>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Última leitura: {lastUpdate}</div>
                 </div>
                 <MetaFilterBar 
                    filters={metaFilters}
                    onAddFilter={(f) => setMetaFilters([...metaFilters, f])}
                    onRemoveFilter={(id) => setMetaFilters(metaFilters.filter(f => f.id !== id))}
                    onClearAll={() => { setMetaFilters([]); setSearchTerm(''); }}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                 />
                 <div className="grid grid-cols-1 gap-6">
                    {filteredCampaigns.map(camp => (
                        <CampaignCard key={camp.id} camp={camp} currency={data?.currency} />
                    ))}
                    {filteredCampaigns.length === 0 && (
                        <div className="py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
                             <WifiSlashIcon className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                             <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Nenhuma campanha encontrada.</p>
                        </div>
                    )}
                 </div>
            </div>
        </div>
    );
};

// =====================================================================
// NPS COMPONENT (LOCAL-STATE VERSION — SEM FIREBASE)
// Persistência em memória local + mood global do cliente via hubApi
// =====================================================================

const NPSTable: React.FC<{ client: Client }> = ({ client }) => {
    const { userProfile } = useAuth();
    const [historyMonths, setHistoryMonths] = useState<string[]>([]);
    const [currentMonth, setCurrentMonth] = useState("");
    const squads: Squad[] = [{ id: 'geral', nome: 'Geral', createdAt: new Date().toISOString() }];
    const [npsData, setNpsData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const npsCache = useRef<Record<string, any>>({});

    const isReadOnly = userProfile?.role === 'vendedor' || userProfile?.role === 'user';

    useEffect(() => {
        const monthsNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
        const now = new Date();
        const initialMonth = `${monthsNames[now.getMonth()]} ${now.getFullYear()}`;
        setCurrentMonth(initialMonth);
        setHistoryMonths([initialMonth]);
    }, [client.ClienteID]);

    useEffect(() => {
        if (!currentMonth) return;
        setLoading(true);
        if (npsCache.current[currentMonth]) {
            setNpsData(npsCache.current[currentMonth]);
        } else {
            const defaultData = {
                atendimento: 'Excelente',
                trafego: 'Bom',
                criativos: 'Excelente',
                vendas: 'Bom',
                resultado: 'Excelente',
                nivel: 'A',
                status: 'ATIVO',
                healthScore: 5
            };
            npsCache.current[currentMonth] = defaultData;
            setNpsData(defaultData);
        }
        setLoading(false);
    }, [client.ClienteID, currentMonth]);

    const handleUpdateNps = async (updates: any) => {
        if (isReadOnly) return;
        const newData = { ...npsData, ...updates };
        
        // Recalcula Health Score como média dos 5 critérios
        const weights: Record<string, number> = {
            'Excelente': 5,
            'Bom': 4,
            'Ruim': 2,
            'Péssimo': 1,
            'Avaliar': 0
        };
        const values = [newData.atendimento, newData.trafego, newData.criativos, newData.vendas, newData.resultado];
        const sum = values.reduce((acc, val) => acc + (weights[val] || 0), 0);
        
        const healthScore = Math.round(sum / values.length);
        
        const finalData = { ...newData, healthScore, updatedAt: new Date().toISOString() };
        npsCache.current[currentMonth] = finalData;
        setNpsData(finalData);

        // Churnometro: Se o mês editado for o mais recente (vigente), atualiza o mood global do cliente
        if (historyMonths.length === 0 || currentMonth === historyMonths[0]) {
            let mood = MoodStatus.Verde;
            if (healthScore <= 2) mood = MoodStatus.Vermelho;
            else if (healthScore <= 3) mood = MoodStatus.Amarelo;
            try {
                await hubApi.clientes.update(client.ClienteID, { ...client, mood });
            } catch (error) {
                console.error("Erro ao atualizar mood do cliente:", error);
            }
        }
    };

    const handleAddNewMonth = async () => {
        if (isReadOnly) return;
        const monthsNames = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
        
        let nextMonth = "";
        if (historyMonths.length > 0) {
            const [name, yearStr] = historyMonths[0].split(" ");
            let year = parseInt(yearStr);
            let nextMonthIndex = monthsNames.indexOf(name) + 1;
            
            if (nextMonthIndex >= 12) {
                nextMonthIndex = 0;
                year += 1;
            }
            nextMonth = `${monthsNames[nextMonthIndex]} ${year}`;
        } else {
            const now = new Date();
            nextMonth = `${monthsNames[now.getMonth()]} ${now.getFullYear()}`;
        }

        // Cria o novo mês com dados baseados no mês anterior (se houver) para continuidade
        const baseData = npsCache.current[currentMonth] || npsData || {
            atendimento: 'Excelente',
            trafego: 'Bom',
            criativos: 'Excelente',
            vendas: 'Bom',
            resultado: 'Excelente',
            nivel: 'A',
            status: 'ATIVO',
            healthScore: 5
        };

        npsCache.current[nextMonth] = { ...baseData, createdAt: new Date().toISOString() };
        setHistoryMonths(prev => [nextMonth, ...prev.filter(m => m !== nextMonth)]);
        setCurrentMonth(nextMonth);
    };

    const getStatusStyle = (val: string) => {
        if (val === 'Excelente') return 'bg-emerald-500 text-white';
        if (val === 'Bom') return 'bg-emerald-100 text-emerald-800';
        if (val === 'Ruim') return 'bg-amber-100 text-amber-800';
        if (val === 'Péssimo') return 'bg-rose-500 text-white';
        if (val === 'Avaliar') return 'bg-slate-100 text-slate-400';
        if (val === 'A') return 'bg-orange-500 text-white';
        if (val === 'B') return 'bg-orange-400 text-white';
        if (val === 'C') return 'bg-orange-200 text-orange-900';
        if (val === 'ATIVO') return 'bg-emerald-500 text-white';
        if (val === 'INATIVO') return 'bg-rose-500 text-white';
        return 'bg-white text-slate-800';
    };

    if (loading || !npsData) return <div className="p-8 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">Sincronizando Dados NPS...</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Avaliação de Sucesso (NPS)</h2>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Mapeamento Mensal de Qualidade e Satisfação - <span className="text-orange-500">{currentMonth}</span></p>
                </div>
                {!isReadOnly && (
                    <button 
                        onClick={handleAddNewMonth}
                        className="flex items-center gap-2 bg-orange-500 hover:bg-orange-700 text-white px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95"
                    >
                        <PlusIcon className="w-4 h-4" /> Novo Mês
                    </button>
                )}
            </header>

            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className="bg-[#0f172a] text-white">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-slate-700">Nome do cliente</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-slate-700">Nível</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-slate-700">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-slate-700">Squad</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-slate-700">Atendimento WhatsApp</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-slate-700">Tráfego</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-slate-700">Criativos</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-slate-700">Vendas/Objetivo</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest border-r border-slate-700">Resultado Geral</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Health Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 border-b border-r border-slate-100 font-bold text-slate-800 text-sm whitespace-nowrap">{client.Nome}</td>
                                <td className="px-6 py-4 border-b border-r border-slate-100">
                                    <select 
                                        disabled={isReadOnly}
                                        value={npsData.nivel}
                                        onChange={(e) => handleUpdateNps({ nivel: e.target.value })}
                                        className={`w-20 p-2 rounded-lg text-xs font-black border-none appearance-none focus:ring-0 cursor-pointer text-center ${getStatusStyle(npsData.nivel)}`}
                                    >
                                        <option value="A">A</option>
                                        <option value="B">B</option>
                                        <option value="C">C</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4 border-b border-r border-slate-100">
                                    <select 
                                        disabled={isReadOnly}
                                        value={npsData.status}
                                        onChange={(e) => handleUpdateNps({ status: e.target.value })}
                                        className={`w-24 p-2 rounded-lg text-[10px] font-black border-none appearance-none focus:ring-0 cursor-pointer text-center ${getStatusStyle(npsData.status)}`}
                                    >
                                        <option value="ATIVO">ATIVO</option>
                                        <option value="INATIVO">INATIVO</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4 border-b border-r border-slate-100">
                                    <select 
                                        className={`w-32 p-2 rounded-lg text-[10px] font-black border-none appearance-none focus:ring-0 cursor-pointer text-center bg-emerald-50 text-emerald-600`}
                                        disabled
                                    >
                                        <option value="">{client.SquadID || 'Escolha...'}</option>
                                        {squads.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
                                    </select>
                                </td>
                                <td className="px-6 py-4 border-b border-r border-slate-100">
                                    <select 
                                        disabled={isReadOnly}
                                        value={npsData.atendimento}
                                        onChange={(e) => handleUpdateNps({ atendimento: e.target.value })}
                                        className={`w-full p-2 rounded-lg text-xs font-bold border-none appearance-none focus:ring-0 cursor-pointer ${getStatusStyle(npsData.atendimento)}`}
                                    >
                                        <option>Excelente</option>
                                        <option>Bom</option>
                                        <option>Ruim</option>
                                        <option>Péssimo</option>
                                        <option>Avaliar</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4 border-b border-r border-slate-100">
                                    <select 
                                        disabled={isReadOnly}
                                        value={npsData.trafego}
                                        onChange={(e) => handleUpdateNps({ trafego: e.target.value })}
                                        className={`w-full p-2 rounded-lg text-xs font-bold border-none appearance-none focus:ring-0 cursor-pointer ${getStatusStyle(npsData.trafego)}`}
                                    >
                                        <option>Excelente</option>
                                        <option>Bom</option>
                                        <option>Ruim</option>
                                        <option>Péssimo</option>
                                        <option>Avaliar</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4 border-b border-r border-slate-100">
                                    <select 
                                        disabled={isReadOnly}
                                        value={npsData.criativos}
                                        onChange={(e) => handleUpdateNps({ criativos: e.target.value })}
                                        className={`w-full p-2 rounded-lg text-xs font-bold border-none appearance-none focus:ring-0 cursor-pointer ${getStatusStyle(npsData.criativos)}`}
                                    >
                                        <option>Excelente</option>
                                        <option>Bom</option>
                                        <option>Ruim</option>
                                        <option>Péssimo</option>
                                        <option>Avaliar</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4 border-b border-r border-slate-100">
                                    <select 
                                        disabled={isReadOnly}
                                        value={npsData.vendas}
                                        onChange={(e) => handleUpdateNps({ vendas: e.target.value })}
                                        className={`w-full p-2 rounded-lg text-xs font-bold border-none appearance-none focus:ring-0 cursor-pointer ${getStatusStyle(npsData.vendas)}`}
                                    >
                                        <option>Excelente</option>
                                        <option>Bom</option>
                                        <option>Ruim</option>
                                        <option>Péssimo</option>
                                        <option>Avaliar</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4 border-b border-r border-slate-100">
                                    <select 
                                        disabled={isReadOnly}
                                        value={npsData.resultado}
                                        onChange={(e) => handleUpdateNps({ resultado: e.target.value })}
                                        className={`w-full p-2 rounded-lg text-xs font-bold border-none appearance-none focus:ring-0 cursor-pointer ${getStatusStyle(npsData.resultado)}`}
                                    >
                                        <option>Excelente</option>
                                        <option>Bom</option>
                                        <option>Ruim</option>
                                        <option>Péssimo</option>
                                        <option>Avaliar</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4 border-b border-slate-100">
                                    <div className="flex text-amber-400 gap-0.5" title={`${npsData.healthScore || 0}/5 Estrelas`}>
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <SparklesIcon 
                                                key={star} 
                                                className={`w-4 h-4 ${star <= (npsData.healthScore || 0) ? 'fill-current' : 'text-slate-200'}`} 
                                            />
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center overflow-x-auto gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-4 whitespace-nowrap">Histórico Gravado:</span>
                    {historyMonths.map(m => (
                        <button 
                            key={m} 
                            onClick={() => setCurrentMonth(m)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${currentMonth === m ? 'bg-orange-500 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-white/80 border border-slate-200'}`}
                        >
                            {m}
                        </button>
                    ))}
                    {historyMonths.length === 0 && (
                        <span className="text-[10px] text-slate-400 font-bold uppercase italic">Nenhum histórico disponível. Clique em Novo Mês para iniciar.</span>
                    )}
                </div>
            </div>
        </div>
    );
};

// =====================================================================
// Main ClientDetailPage Component
// =====================================================================

interface ClientDetailPageProps {
    client: Client;
    leads: Lead[];
    investments: Investment[];
    creatives: Creative[];
    monthlyRequests: MonthlyCreativeRequest[];
    optimizations: Optimization[];
    allClients: Client[]; 
    onLeadUpdate: (updatedLead: Lead) => void;
    onLeadCreate: (newLead: Omit<Lead, 'LeadID'>) => void;
    onNavigateBack: () => void;
    onGoToFunnel: () => void;
    onOpenEditModal: (client: Client) => void;
    onDeleteClient: (id: string) => void;
    onOpenNewCreativeModal: (clientId: string) => void;
    onOpenEditCreativeModal: (creative: Creative) => void;
    onOpenNewMonthlyRequestModal: (clientId: string) => void;
    onOpenEditMonthlyRequestModal: (request: MonthlyCreativeRequest) => void;
    onSaveOptimization: (opt: Omit<Optimization, 'OtimizacaoID'> | Optimization) => void;
    onOpenOptimizationModal: (opt: Optimization) => void;
    onOpenNewOptimizationModal: () => void;
    onOpenMetaConfigModal: (client: Client) => void;
    initialTab?: string;
}

const ClientDetailPage: React.FC<ClientDetailPageProps> = ({ 
    client, leads, investments, creatives, monthlyRequests, optimizations, allClients,
    onNavigateBack, onGoToFunnel, onOpenEditModal, onDeleteClient,
    onOpenNewCreativeModal, onOpenEditCreativeModal,
    onOpenNewMonthlyRequestModal, onOpenEditMonthlyRequestModal,
    onSaveOptimization, onOpenOptimizationModal, onOpenNewOptimizationModal,
    onOpenMetaConfigModal, onLeadCreate, onLeadUpdate,
    initialTab = 'briefing'
}) => {
    const { userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState(initialTab);

    useEffect(() => {
        if(initialTab) setActiveTab(initialTab);
    }, [initialTab]);

    const tabs = [
        { id: 'briefing', label: 'Briefing' },
        { id: 'nps', label: 'NPS' }, // NEW TAB
        { id: 'funil', label: 'Funil de Vendas' },
        { id: 'creatives', label: 'Criativos' },
        { id: 'optimizations', label: 'Otimizações' },
        { id: 'projection', label: 'Projeção' },
        { id: 'meta_ads', label: 'Meta Ads & API' },
        { id: 'reports', label: 'Relatórios' },
    ];

    const canEditClient = userProfile?.role === 'adm_supremo' || userProfile?.role === 'admin' || userProfile?.role === 'vendedor';
    const canDeleteClient = userProfile?.role === 'adm_supremo' || userProfile?.role === 'admin';
    const canManageCreatives = userProfile?.role !== 'vendedor';
    const canManageOptimizations = userProfile?.role !== 'vendedor';

    const InfoCard: React.FC<{ 
        title: string; 
        icon: React.ReactNode; 
        children: React.ReactNode; 
        headerColor?: string;
        className?: string;
    }> = ({ title, icon, children, headerColor = 'text-slate-800', className = '' }) => (
        <div className={`bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col ${className}`}>
            <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-slate-50 rounded-xl text-orange-500">
                    {icon}
                </div>
                <h4 className={`text-xs font-black uppercase tracking-[0.2em] ${headerColor}`}>{title}</h4>
            </div>
            <div className="flex-1">
                {children}
            </div>
        </div>
    );

    const renderBriefing = () => {
        return (
        <div className="space-y-6 animate-in fade-in duration-300">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                     <div className="flex items-center gap-2 mb-1">
                        <SparklesIcon className="w-5 h-5 text-orange-500" />
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Briefing Estratégico</h3>
                     </div>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fundamentos da Operação de Tráfego</p>
                </div>
                <div className="flex gap-3">
                    {canDeleteClient && (
                        <button 
                            onClick={() => onDeleteClient(client.ClienteID)}
                            className="flex items-center gap-2 px-5 py-3 border border-rose-100 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 transition-colors"
                        >
                            <TrashIcon className="w-4 h-4" /> Excluir
                        </button>
                    )}
                    {canEditClient && (
                        <button 
                            onClick={() => onOpenEditModal(client)}
                            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors shadow-lg active:scale-95"
                        >
                            <PencilIcon className="w-4 h-4" /> Editar Dados
                        </button>
                    )}
                </div>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                     <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-1">Receita Gerada</p>
                     <p className="text-lg font-black text-slate-900">{formatCurrency(client.receitaGerada || 0)}</p>
                 </div>
                 <div className="bg-white border border-slate-100 rounded-2xl p-4">
                     <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Faturamento Médio</p>
                     <p className="text-lg font-black text-slate-900">{formatCurrency(client.faturamentoMedio || 0)}</p>
                 </div>
                 <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 md:col-span-2 col-span-2">
                     <p className="text-[9px] font-black uppercase tracking-widest text-orange-500 mb-1">Serviços Vendidos</p>
                     <p className="text-xs font-bold text-slate-800 line-clamp-2">{client.servicosVendidos || 'Nenhum'}</p>
                 </div>
             </div>
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                 <div className="lg:col-span-2 space-y-4">
                     <InfoCard title="Resumo Executivo" icon={<DocumentChartBarIcon className="w-5 h-5" />}>
                        <div className="max-h-[100px] overflow-y-auto custom-scrollbar pr-2 pb-0">
                            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line font-medium mb-0">
                                {client.resumo || 'Nenhum resumo estratégico informado.'}
                            </p>
                        </div>
                     </InfoCard>
                     <InfoCard title="Dores e Desejos do Público" icon={<LightBulbIcon className="w-5 h-5" />}>
                        <div className="max-h-[100px] overflow-y-auto custom-scrollbar pr-2 pb-0">
                            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line font-medium mb-0">
                                {client.doresDesejos || 'Mapeamento de público-alvo pendente.'}
                            </p>
                        </div>
                     </InfoCard>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InfoCard title="Produto / Serviço" icon={<CubeIcon className="w-5 h-5" />}>
                            <p className="text-base font-bold text-slate-800 mb-0">
                                {client.produtoPrincipal || 'Não especificado.'}
                            </p>
                        </InfoCard>
                        <InfoCard title="Orçamento Mensal" icon={<BanknotesIcon className="w-5 h-5" />}>
                            <p className="text-2xl font-black text-orange-500 tracking-tight mb-0 leading-none">
                                {formatCurrency(client.OrcamentoMensal)}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 mb-0">Investimento Meta & Google</p>
                        </InfoCard>
                     </div>
                     <InfoCard title="Conexão Meta API" icon={<CubeIcon className="w-5 h-5" />}>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">ID da Conta de Anúncio</label>
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs font-mono font-bold text-slate-700 truncate">
                                        {client.metaAdAccountId || 'Não configurado'}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Fonte dos Dados</label>
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[10px] font-mono font-bold text-slate-500 truncate max-w-full overflow-hidden">
                                        {client.metaAdAccountId ? 'Backend · System User (BM AB Capital)' : 'Não configurado'}
                                    </div>
                                </div>
                            </div>
                        </div>
                     </InfoCard>
                     <InfoCard title="Observações Internas" icon={<ClipboardCheckIcon className="w-5 h-5" />}>
                        <div className="max-h-[100px] overflow-y-auto custom-scrollbar pr-2 pb-0">
                            <p className="text-sm text-slate-600 leading-relaxed font-medium mb-0">
                                {client.observacoes || 'Nenhuma observação registrada.'}
                            </p>
                        </div>
                     </InfoCard>
                 </div>
                 <div className="space-y-4">
                     <InfoCard title="Identidade Visual" icon={<SparklesIcon className="w-5 h-5" />}>
                        <div className="aspect-video w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-300">
                            {client.logoUrl ? (
                                <img src={client.logoUrl} alt="Logo" className="max-h-24 max-w-full object-contain" />
                            ) : (
                                <>
                                    <PhotoIcon className="w-10 h-10 mb-2 opacity-50" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Logo não carregado</span>
                                </>
                            )}
                        </div>
                        {client.identidadeVisualUrl && (
                            <a href={client.identidadeVisualUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block text-center text-xs font-bold text-orange-500 hover:underline uppercase tracking-wide">
                                Ver Manual da Marca
                            </a>
                        )}
                     </InfoCard>
                     <InfoCard title="Contatos" icon={<UsersIcon className="w-5 h-5" />}>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                <span className="text-xs font-bold text-slate-500 uppercase whitespace-nowrap mr-2">Stake</span>
                                <span className="text-xs font-black text-slate-800 uppercase truncate">{client.Responsavel}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                <span className="text-xs font-bold text-slate-500 uppercase whitespace-nowrap mr-2">Contato Stake</span>
                                <span className="text-xs font-black text-slate-800 uppercase truncate">
                                    {//@ts-ignore
                                    client.contatoStake || 'Não informado'}
                                </span>
                            </div>
                            <div className="text-center pt-2">
                                {client.instagram ? (
                                    <a href={`https://instagram.com/${client.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-pink-600 hover:underline">
                                        {client.instagram}
                                    </a>
                                ) : <span className="text-xs text-slate-400 italic">Rede social não informada</span>}
                            </div>
                        </div>
                     </InfoCard>
                     <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Dia de Otimização</span>
                            <span className="text-xs font-black text-slate-900 uppercase">
                                {client.DiaOtimizacao}
                            </span>
                        </div>
                     </div>
                     {//@ts-ignore
                     client.endereco && (
                        <InfoCard title="Localização" icon={<MapPinIcon className="w-5 h-5" />}>
                            <p className="text-xs font-bold text-slate-700 leading-relaxed uppercase tracking-tight">
                                {//@ts-ignore
                                client.endereco}
                            </p>
                        </InfoCard>
                     )}
                 </div>
             </div>
        </div>
    )};

    const renderContent = () => {
        switch (activeTab) {
            case 'briefing': return renderBriefing();
            case 'nps': return <NPSTable client={client} />;
            case 'funil': return <div className="h-[calc(100vh-280px)]"><KanbanBoard leads={leads} onLeadUpdate={onLeadUpdate} clients={allClients} /></div>;
            case 'creatives': return (
                <div className="space-y-10 pb-20">
                    <CreativesTable 
                        creatives={creatives} 
                        onOpenNewCreativeModal={() => onOpenNewCreativeModal(client.ClienteID)} 
                        onOpenEditCreativeModal={onOpenEditCreativeModal}
                        canManage={canManageCreatives}
                    />
                    <MonthlyRequestsTable 
                        requests={monthlyRequests} 
                        onOpenNewRequestModal={() => onOpenNewMonthlyRequestModal(client.ClienteID)} 
                        onOpenEditRequestModal={onOpenEditMonthlyRequestModal} 
                        canManage={canManageCreatives}
                    />
                </div>
            );
            case 'optimizations': return (
                <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden mb-20 animate-in fade-in duration-500">
                    <div className="p-8 border-b border-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight">Registro de Otimizações</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Histórico de Performance do Cliente</p>
                        </div>
                        {canManageOptimizations && (
                            <button onClick={onOpenNewOptimizationModal} className="flex items-center justify-center bg-orange-500 hover:bg-orange-700 text-white font-black uppercase text-[11px] tracking-widest py-3 px-6 rounded-2xl transition-all shadow-lg active:scale-95">
                                <PlusIcon className="w-4 h-4 mr-2" /> Nova Ação
                            </button>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                                <tr>
                                    <th className="px-8 py-5">Data</th>
                                    <th className="px-8 py-5 w-1/3">Descrição da Ação</th>
                                    <th className="px-8 py-5 text-center">Hipótese/Resultado</th>
                                    <th className="px-8 py-5">Status</th>
                                    <th className="px-8 py-5">Efetividade</th>
                                    {canManageOptimizations && <th className="px-8 py-5 text-center">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {optimizations.sort((a,b) => new Date(b.Data).getTime() - new Date(a.Data).getTime()).map(opt => (
                                    <tr key={opt.OtimizacaoID} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="px-8 py-6">
                                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">{new Date(opt.Data).toLocaleDateString('pt-BR')}</span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <p className="text-sm font-bold text-slate-800 leading-relaxed">{opt.Descricao}</p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase mt-1">por {opt.Responsavel}</p>
                                        </td>
                                        <td className="px-8 py-6 text-center italic text-xs text-slate-500 font-medium">"{opt.HipóteseResultado || '-'}"</td>
                                        <td className="px-8 py-6">
                                            <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${opt.Status === 'Concluido' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{opt.Status}</span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${opt.Efetividade === EfetividadeStatus.Efetiva ? 'bg-emerald-500 text-white' : opt.Efetividade === EfetividadeStatus.NaoEfetiva ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{opt.Efetividade || 'N/A'}</span>
                                        </td>
                                        {canManageOptimizations && (
                                            <td className="px-8 py-6 text-center">
                                                <button onClick={() => onOpenOptimizationModal(opt)} className="p-2 text-slate-300 hover:text-orange-500 transition-colors"><PencilIcon className="w-5 h-5"/></button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
            case 'projection': return <div className="pb-20"><ScenarioProjectionPage clients={allClients} preSelectedClient={client} /></div>;
            case 'meta_ads': return <MetaLiveStats client={client} leads={leads} onOpenConfig={() => onOpenMetaConfigModal(client)} onLeadCreate={onLeadCreate} />;
            case 'reports': return <div className="pb-20"><ReportsPage clients={[client]} leads={leads} investments={investments} /></div>;
            default: return null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden">
            {/* Header com Branding Viga Sales */}
            <header className="bg-white border-b border-slate-200 px-8 py-6 shrink-0 z-20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                    <div className="flex items-center gap-5">
                        <button onClick={onNavigateBack} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-600 transition-all">
                            <ArrowLeftIcon className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">{client.Nome}</h1>
                            <div className="flex items-center gap-3 mt-2">
                                <span className="bg-orange-50 text-orange-500 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">{client.Nicho}</span>
                                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-widest border-l border-slate-200 pl-3">
                                    <UsersIcon className="w-3.5 h-3.5" />
                                    {client.Responsavel}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border ${client.mood === MoodStatus.Vermelho ? 'bg-rose-50 border-rose-100' : client.mood === MoodStatus.Amarelo ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                             <div className={`w-2 h-2 rounded-full ${client.mood === MoodStatus.Vermelho ? 'bg-rose-500 animate-pulse' : client.mood === MoodStatus.Amarelo ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                             <span className={`text-[10px] font-black uppercase tracking-widest ${client.mood === MoodStatus.Vermelho ? 'text-rose-600' : client.mood === MoodStatus.Amarelo ? 'text-amber-600' : 'text-emerald-600'}`}>CSAT: {client.mood || MoodStatus.Verde}</span>
                        </div>
                        <button onClick={onGoToFunnel} className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-orange-100 hover:bg-orange-700 transition-all active:scale-95">
                            <FunnelIcon className="w-4 h-4" /> Gestão de Leads
                        </button>
                    </div>
                </div>

                {/* Tabs de Navegação */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar -mb-6 pb-2 no-scrollbar">
                    {tabs.map(tab => (
                        <button 
                            key={tab.id} 
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            {/* Area de Conteúdo Scrollable */}
            <main className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#f8fafc]">
                <div className="max-w-7xl mx-auto">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default ClientDetailPage;
