
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Client, Lead, Investment, DateRange, MetaInsightsData } from '../types';
import { 
    FunnelIcon, 
    CheckBadgeIcon, 
    ArrowTrendingUpIcon, 
    ChartPieIcon, 
    CurrencyDollarIcon, 
    BanknotesIcon, 
    UsersIcon,
    MagnifyingGlassIcon,
    PencilIcon,
    ChevronDownIcon,
    ArrowPathIcon,
    CubeIcon
} from '../components/icons';
import MetaDateRangePicker from '../components/MetaDateRangePicker';
import { fetchMetaInsights } from '../services/metaApi';

interface ReportsPageProps {
    clients: Client[];
    leads: Lead[];
    investments: Investment[];
}

const ReportsPage: React.FC<ReportsPageProps> = ({ clients, leads, investments }) => {
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [dateRange, setDateRange] = useState<DateRange>(() => {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        return { 
            since: firstDay.toISOString().split('T')[0], 
            until: today.toISOString().split('T')[0], 
            label: 'Este mês' 
        };
    });
    
    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('campaign_name'); // Estado para o tipo de filtro
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    
    // API Data State
    const [apiData, setApiData] = useState<MetaInsightsData | null>(null);
    const [loadingMeta, setLoadingMeta] = useState(false);
    
    // Manual inputs state
    const [manualVendas, setManualVendas] = useState<number>(0);
    const [manualReceita, setManualReceita] = useState<number>(0);
    const [manualSeguidores, setManualSeguidores] = useState<number>(0);

    // Close search menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setIsSearchFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Seleciona o primeiro cliente automaticamente se não houver seleção
    useEffect(() => {
        if (!selectedClientId && clients.length > 0) {
            setSelectedClientId(clients[0].ClienteID);
        }
    }, [clients, selectedClientId]);

    // Fetch Meta API Data
    useEffect(() => {
        const fetchApiData = async () => {
            const client = clients.find(c => c.ClienteID === selectedClientId);
            
            // Se o cliente tem conta de anúncios vinculada, buscamos ao vivo pelo backend
            if (client?.metaAdAccountId) {
                setLoadingMeta(true);
                try {
                    // Passamos o searchTerm e o activeFilter para a API
                    const data = await fetchMetaInsights(
                        client.metaAdAccountId, 
                        dateRange, 
                        searchTerm,
                        activeFilter // Passa o tipo de filtro selecionado
                    );
                    setApiData(data);
                } catch (error) {
                    console.error("Erro ao buscar dados do Meta:", error);
                    setApiData(null);
                } finally {
                    setLoadingMeta(false);
                }
            } else {
                setApiData(null);
                setLoadingMeta(false);
            }
        };

        const timeoutId = setTimeout(() => {
            if (selectedClientId) fetchApiData();
        }, 500); // Debounce de 500ms para a busca

        return () => clearTimeout(timeoutId);
    }, [selectedClientId, dateRange, searchTerm, activeFilter, clients]);

    // Cálculo Local (Fallback para quando não tem API)
    const filteredMetrics = useMemo(() => {
        // Filter leads
        const periodLeads = leads.filter(l => {
            const matchesClient = selectedClientId ? l.ClienteID === selectedClientId : true;
            const matchesPeriod = l.DataEntrada >= dateRange.since && l.DataEntrada <= dateRange.until;
            return matchesClient && matchesPeriod;
        });

        // Filter investments
        const periodInvestments = investments.filter(i => {
            const matchesClient = selectedClientId ? i.ClienteID === selectedClientId : true;
            const investmentDate = i.Periodo + '-01'; 
            const matchesPeriod = investmentDate >= dateRange.since && investmentDate <= dateRange.until;
            return matchesClient && matchesPeriod;
        });

        const totalLeads = periodLeads.length;
        const totalSpend = periodInvestments.reduce((acc, curr) => acc + curr.Valor, 0);

        return {
            leads: totalLeads,
            spend: totalSpend
        };
    }, [leads, investments, selectedClientId, dateRange]);

    const kpis = useMemo(() => {
        // Prioridade: Dados da API > Dados Locais
        // Se apiData existir (mesmo que zeros), usamos ele. Se for null (sem conexão), usamos local.
        const leads = apiData ? apiData.leads : (filteredMetrics.leads || 0);
        const investido = apiData ? apiData.spend : (filteredMetrics.spend || 0);
        
        const mv = manualVendas || 0;
        const mr = manualReceita || 0;
        const ms = manualSeguidores || 0;
        
        const conversao = leads > 0 ? (mv / leads) * 100 : 0;
        const cpl = leads > 0 ? (investido / leads) : 0;
        const cac = mv > 0 ? (investido / mv) : 0; 
        const cps = ms > 0 ? (investido / ms) : 0;
        
        const isApiConnected = !!apiData;

        return [
            { 
                title: 'Leads (Resultado)', 
                value: loadingMeta ? '...' : leads.toLocaleString('pt-BR'), 
                icon: <FunnelIcon className="w-6 h-6 text-white"/>, 
                color: 'bg-orange-500', 
                description: isApiConnected ? 'Fonte: Meta Ads (API)' : 'Fonte: CRM Manual' 
            },
            { 
                title: 'Vendas (Manual)', 
                value: mv.toLocaleString('pt-BR'), 
                icon: <CheckBadgeIcon className="w-6 h-6 text-white"/>, 
                color: 'bg-emerald-500', 
                description: 'Número de vendas fechadas informadas' 
            },
            { 
                title: 'Conversão', 
                value: loadingMeta ? '...' : `${conversao.toFixed(1)}%`, 
                icon: <ArrowTrendingUpIcon className="w-6 h-6 text-white"/>, 
                color: 'bg-amber-500', 
                description: '(Vendas / Leads) * 100' 
            },
            { 
                title: 'CPL (Custo/Res)', 
                value: loadingMeta ? '...' : cpl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
                icon: <ChartPieIcon className="w-6 h-6 text-white"/>, 
                color: 'bg-purple-600', 
                description: 'Custo médio por resultado' 
            },
            { 
                title: 'Investido', 
                value: loadingMeta ? '...' : investido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
                icon: <CurrencyDollarIcon className="w-6 h-6 text-white"/>, 
                color: 'bg-orange-500', 
                description: isApiConnected ? 'Fonte: Meta Ads (API)' : 'Fonte: CRM Manual' 
            },
            { 
                title: 'Receita Total', 
                value: mr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
                icon: <BanknotesIcon className="w-6 h-6 text-white"/>, 
                color: 'bg-emerald-600', 
                description: 'Volume total de faturamento' 
            },
            { 
                title: 'CAC (Custom)', 
                value: loadingMeta ? '...' : cac.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
                icon: <CurrencyDollarIcon className="w-6 h-6 text-white"/>, 
                color: 'bg-rose-500', 
                description: 'Investido / Vendas' 
            },
            { 
                title: 'Seguidores', 
                value: ms.toLocaleString('pt-BR'), 
                icon: <UsersIcon className="w-6 h-6 text-white"/>, 
                color: 'bg-sky-500', 
                description: 'Novos seguidores no período' 
            },
            { 
                title: 'CPS (Seguidor)', 
                value: loadingMeta ? '...' : cps.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
                icon: <UsersIcon className="w-6 h-6 text-white"/>, 
                color: 'bg-slate-700', 
                description: 'Investimento / Seguidores' 
            },
        ];
    }, [filteredMetrics, apiData, manualVendas, manualReceita, manualSeguidores, loadingMeta]);

    const filterOptions = [
        { label: "Nome da campanha", value: "campaign_name" },
        // { label: "Nome do conjunto de anúncios", value: "adset_name" }, // API level=campaign não suporta direto
        // { label: "Nome do anúncio", value: "ad_name" }, // API level=campaign não suporta direto
        { label: "Impressões (Maior que)", value: "impressions" }
    ];

    const getFilterLabel = () => {
        const current = filterOptions.find(opt => opt.value === activeFilter);
        return current ? `Filtrar por: ${current.label}` : 'Pesquisar...';
    };

    return (
        <div className="flex flex-col h-full bg-[#f1f5f9] overflow-hidden relative">
            {/* Header Section */}
            <header className="flex-shrink-0 bg-[#f1f5f9] pt-8 px-8 pb-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            Relatórios & KPIs
                            {apiData && (
                                <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full uppercase tracking-widest border border-green-200">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                    Meta API Conectada
                                </span>
                            )}
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 font-medium">
                            Inteligência de dados unificada: Meta API + Gestão Estratégica.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative">
                            <select
                                value={selectedClientId}
                                onChange={(e) => setSelectedClientId(e.target.value)}
                                className="appearance-none bg-white border border-slate-200 text-slate-900 text-sm font-bold rounded-xl focus:ring-orange-500 focus:border-orange-500 block p-3 pr-10 shadow-sm min-w-[240px] truncate"
                            >
                                <option value="" disabled>Selecione um Cliente</option>
                                {clients.map(client => (
                                    <option key={client.ClienteID} value={client.ClienteID}>{client.Nome}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                <ChevronDownIcon className="h-4 w-4" />
                            </div>
                        </div>
                        <MetaDateRangePicker currentRange={dateRange} onRangeChange={setDateRange} align="right" />
                    </div>
                </div>

                {/* Search Bar with Filter Menu */}
                <div className="relative z-20" ref={searchContainerRef}>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            {loadingMeta ? (
                                <ArrowPathIcon className="h-5 w-5 text-orange-500 animate-spin" />
                            ) : (
                                <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
                            )}
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-11 pr-4 py-3.5 bg-[#f1f5f9] border border-slate-200 rounded-xl leading-5 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-orange-500 focus:border-transparent sm:text-sm font-medium transition-all shadow-sm"
                            placeholder={`${getFilterLabel()}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onFocus={() => setIsSearchFocused(true)}
                        />
                    </div>

                    {/* Dropdown de Filtros */}
                    {isSearchFocused && (
                        <div className="absolute top-14 left-0 w-64 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtrar por métrica</span>
                            </div>
                            <div className="py-2">
                                {filterOptions.map((option, idx) => (
                                    <button 
                                        key={idx}
                                        className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-orange-50 transition-colors flex items-center justify-between ${activeFilter === option.value ? 'text-orange-700 bg-orange-50' : 'text-slate-700'}`}
                                        onClick={() => {
                                            setActiveFilter(option.value);
                                            setIsSearchFocused(false); // Fecha o menu ao selecionar
                                        }}
                                    >
                                        {option.label}
                                        {activeFilter === option.value && <div className="w-1.5 h-1.5 bg-orange-500 rounded-full"></div>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* Main Content (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-8 pt-2 pb-48 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {kpis.map((kpi, idx) => (
                        <div key={idx} className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 flex flex-row items-start gap-5 hover:shadow-md transition-shadow group">
                            <div className={`p-3 rounded-2xl ${kpi.color} shadow-lg shadow-current/20 shrink-0 group-hover:scale-105 transition-transform duration-300`}>
                                {kpi.icon}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">{kpi.title}</p>
                                    <h3 className="text-3xl font-black text-slate-900 tracking-tight leading-none">{kpi.value}</h3>
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold text-right mt-2 truncate">{kpi.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer - Métricas de Fechamento (Fixed at bottom) */}
            <div className="absolute bottom-0 left-0 right-0 bg-[#0f172a] text-white p-6 pt-8 rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-30 mx-4 mb-4">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-orange-500/20 rounded-xl border border-orange-500/30">
                        <PencilIcon className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Métricas de Fechamento</h3>
                        <p className="text-xs text-slate-400 font-medium">Preencha os dados do período para calcular ROI e CAC.</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Vendas</label>
                        <input 
                            type="number" 
                            value={manualVendas} 
                            onChange={(e) => setManualVendas(Number(e.target.value))}
                            className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-xl focus:ring-orange-500 focus:border-orange-500 text-sm font-bold p-3.5 placeholder-slate-600"
                            placeholder="0"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Receita Total (R$)</label>
                        <input 
                            type="number" 
                            value={manualReceita} 
                            onChange={(e) => setManualReceita(Number(e.target.value))}
                            className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-xl focus:ring-orange-500 focus:border-orange-500 text-sm font-bold p-3.5 placeholder-slate-600"
                            placeholder="0.00"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Novos Seguidores</label>
                        <input 
                            type="number" 
                            value={manualSeguidores} 
                            onChange={(e) => setManualSeguidores(Number(e.target.value))}
                            className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-xl focus:ring-orange-500 focus:border-orange-500 text-sm font-bold p-3.5 placeholder-slate-600"
                            placeholder="0"
                        />
                    </div>
                    <div>
                         <button className="w-full bg-orange-500 hover:bg-orange-500 text-white font-black py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-orange-900/20 active:scale-95 text-[11px] uppercase tracking-widest">
                             Salvar Métricas
                         </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReportsPage;
