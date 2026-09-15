
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { hubApi } from './api';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationService } from './services/NotificationService';
import NotificationInbox from './components/NotificationInbox';

// Import Pages (lazy — code-splitting por página)
const HomePage = React.lazy(() => import('./pages/HomePage'));
const LeadsFunnelPage = React.lazy(() => import('./pages/LeadsFunnelPage'));
const ClientListPage = React.lazy(() => import('./pages/ClientListPage'));
const ClientDetailPage = React.lazy(() => import('./pages/ClientDetailPage'));
const CalendarPage = React.lazy(() => import('./pages/CalendarPage'));
const CreativesPage = React.lazy(() => import('./pages/CreativesPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const DailyFollowUpPage = React.lazy(() => import('./pages/DailyFollowUpPage'));
const ScenarioProjectionPage = React.lazy(() => import('./pages/ScenarioProjectionPage'));
const MetaAccountsPage = React.lazy(() => import('./pages/MetaAccountsPage'));
const GoogleAccountsPage = React.lazy(() => import('./pages/GoogleAccountsPage'));
const SearchConsolePage = React.lazy(() => import('./pages/SearchConsolePage'));
const JarvisPage = React.lazy(() => import('./pages/JarvisPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const SecurityPage = React.lazy(() => import('./pages/SecurityPage'));
const GlobalOptimizationsPage = React.lazy(() => import('./pages/GlobalOptimizationsPage'));
const GlobalChatPage = React.lazy(() => import('./pages/GlobalChatPage'));
const MonthlyReportsPage = React.lazy(() => import('./pages/MonthlyReportsPage'));
const ChurnometroPage = React.lazy(() => import('./pages/ChurnometroPage'));
const TrafficBrainPage = React.lazy(() => import('./pages/TrafficBrainPage'));

import AuthPage from './pages/AuthPage';

// Import Modals
import ClientModal from './components/ClientModal';
import CreativeModal from './components/CreativeModal';
import MonthlyRequestModal from './components/MonthlyRequestModal';
import OptimizationModal from './components/OptimizationModal';
import LeadModal from './components/LeadModal';
import MetaConfigModal from './components/MetaConfigModal';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';

// Import Types
import { Client, Lead, Investment, Creative, Optimization, MonthlyCreativeRequest, Notification, Page } from './types';
import {
    HomeIcon,
    UsersIcon,
    FunnelIcon,
    CalendarDaysIcon,
    PhotoIcon,
    DocumentChartBarIcon,
    ChartBarSquareIcon,
    LightBulbIcon,
    CubeIcon,
    MagnifyingGlassIcon,
    ChevronDownIcon,
    EyeIcon,
    UserPlusIcon,
    WifiSlashIcon,
    Bars3Icon,
    ArrowRightOnRectangleIcon,
    ShieldCheckIcon,
    LockClosedIcon,
    UserIcon,
    ChevronUpIcon,
    ArrowLeftIcon,
    SparklesIcon,
    CogIcon,
    XCircleIcon,
    ExclamationTriangleIcon,
    ClipboardCheckIcon,
    ChartPieIcon,
    ChatBubbleLeftRightIcon,
    XIcon
} from './components/icons';

const VigaLogo: React.FC<{ className?: string }> = ({ className = "w-5 h-6" }) => (
  <svg viewBox="0 0 48 110" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <polygon points="24,2 38,9 24,16 10,9"   fill="#F0A020"/>
    <polygon points="10,9 24,16 24,30 10,23"  fill="#C07518"/>
    <polygon points="38,9 24,16 24,30 38,23"  fill="#904E10"/>
    <polygon points="24,34 38,41 24,48 10,41" fill="#D98920"/>
    <polygon points="10,41 24,48 24,56 10,49" fill="#C07518"/>
    <polygon points="38,41 24,48 24,56 38,49" fill="#904E10"/>
    <polygon points="10,49 24,56 24,98 10,91" fill="#1C3F70"/>
    <polygon points="38,49 24,56 24,98 38,91" fill="#0E2448"/>
  </svg>
);

const NavLink: React.FC<{
    pageName: Page;
    icon: React.ReactNode;
    label: string;
    activePage: Page;
    isCollapsed: boolean;
    onNavigate: (page: Page) => void;
    showChevron?: boolean;
    specialStyle?: string;
    badgeCount?: number;
}> = ({ pageName, icon, label, activePage, isCollapsed, onNavigate, showChevron, specialStyle, badgeCount }) => (
    <li className="relative list-none">
        <button
            onClick={() => onNavigate(pageName)}
            title={isCollapsed ? label : ""}
            className={`w-full flex items-center p-3 text-sm font-medium rounded-md transition-all ${
                activePage === pageName
                    ? (specialStyle ? specialStyle : 'bg-[#1c3f70] text-white')
                    : 'text-slate-200 hover:bg-[#123a6e]'
            } ${isCollapsed ? 'justify-center' : ''} ${specialStyle && activePage !== pageName ? 'border border-transparent hover:border-current opacity-80' : ''}`}
        >
            <div className="flex-shrink-0 relative">
                {icon}
                {badgeCount ? badgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-lg">
                        {badgeCount}
                    </span>
                ) : null}
            </div>
            {(!isCollapsed || window.innerWidth < 1024) && <span className="ml-3 truncate">{label}</span>}
            {(!isCollapsed || window.innerWidth < 1024) && showChevron && <ChevronDownIcon className="ml-auto w-4 h-4" />}
        </button>
    </li>
);

const AuthenticatedApp: React.FC = () => {
    const { logout, currentUser, userProfile } = useAuth();

    // Navigation State
    const [page, setPage] = useState<Page>('home');
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [initialDetailTab, setInitialDetailTab] = useState<string>('briefing');
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);

    // Data State
    const [clients, setClients] = useState<Client[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [investments, setInvestments] = useState<Investment[]>([]);
    const [creatives, setCreatives] = useState<Creative[]>([]);
    const [monthlyRequests, setMonthlyRequests] = useState<MonthlyCreativeRequest[]>([]);
    const [optimizations, setOptimizations] = useState<Optimization[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [clientModal, setClientModal] = useState<{ isOpen: boolean, client: Client | null }>({ isOpen: false, client: null });
    const [creativeModal, setCreativeModal] = useState<{ isOpen: boolean, creative: Creative | null, clientId: string | null }>({ isOpen: false, creative: null, clientId: null });
    const [requestModal, setRequestModal] = useState<{ isOpen: boolean, request: MonthlyCreativeRequest | null, clientId: string | null }>({ isOpen: false, request: null, clientId: null });
    const [optimizationModal, setOptimizationModal] = useState<{ isOpen: boolean, optimization: Partial<Optimization> | null }>({ isOpen: false, optimization: null });
    const [metaConfigModal, setMetaConfigModal] = useState<{ isOpen: boolean, client: Client | null }>({ isOpen: false, client: null });
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, clientId: string | null }>({ isOpen: false, clientId: null });

    const loadNotifications = useCallback(async () => {
        try {
            const data = await hubApi.notificacoes.list(currentUser?.uid);
            const sorted = data.sort((a, b) => {
                const timeA = a.timestamp?.seconds || 0;
                const timeB = b.timestamp?.seconds || 0;
                return timeB - timeA;
            });
            setNotifications(sorted);
        } catch (e) { /* silencioso */ }
    }, [currentUser?.uid]);

    const loadAll = useCallback(async () => {
        try {
            const [c, l, inv, cr, s, o] = await Promise.all([
                hubApi.clientes.list(),
                hubApi.leads.list(),
                hubApi.investimentos.list(),
                hubApi.criativos.list(),
                hubApi.solicitacoes.list(),
                hubApi.otimizacoes.list(),
            ]);
            const uniqueClients: Client[] = [];
            const seenNames = new Set<string>();
            (c || []).forEach((client: Client) => {
                const normalizedName = client.Nome?.toLowerCase().trim();
                if (!seenNames.has(normalizedName)) {
                    uniqueClients.push(client);
                    seenNames.add(normalizedName);
                }
            });
            setClients(uniqueClients);
            setLeads(l || []);
            setInvestments(inv || []);
            setCreatives(cr || []);
            setMonthlyRequests(s || []);
            setOptimizations(o || []);
            setLoading(false);
        } catch (e) {
            console.error("Erro ao carregar dados do hub:", e);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!userProfile || userProfile.status !== 'approved') return;
        loadAll();
        loadNotifications();
        const t1 = setInterval(loadAll, 30000);
        const t2 = setInterval(loadNotifications, 20000);
        return () => { clearInterval(t1); clearInterval(t2); };
    }, [userProfile, loadAll, loadNotifications]);

    const navigateTo = (newPage: Page, clientId: string | null = null, tab: string = 'briefing') => {
        setPage(newPage);
        setSelectedClientId(clientId);
        setInitialDetailTab(tab);
        setIsMobileMenuOpen(false);
    };

    const handleNotificationClick = (notification: Notification) => {
        setIsNotificationOpen(false);
        hubApi.notificacoes.marcarLida(notification.id).catch(() => {});
        if (notification.link) {
            navigateTo(notification.link as Page);
        } else if (notification.type === 'chat') {
            navigateTo('internalChat');
        } else if (notification.type === 'creative') {
            navigateTo('creatives');
        } else if (notification.type === 'optimization') {
            navigateTo('optimizations');
        }
    };

    const handleSaveClient = async (clientData: Client) => {
        try {
            if (clientData.ClienteID && clientData.ClienteID.length > 5) {
                await hubApi.clientes.update(clientData.ClienteID, clientData);
            } else {
                await hubApi.clientes.create(clientData);
            }
            setClientModal({ isOpen: false, client: null });
            loadAll();
        } catch (error) {
            console.error("Erro ao salvar cliente:", error);
            alert("Erro ao salvar dados do cliente.");
        }
    };

    const handleDeleteClient = async () => {
        if (!deleteModal.clientId) return;
        try {
            await hubApi.clientes.remove(deleteModal.clientId);
            setDeleteModal({ isOpen: false, clientId: null });
            if (page === 'clientDetail') {
                setPage('clientList');
            }
            loadAll();
        } catch (error) {
            console.error("Erro ao excluir cliente:", error);
            alert("Erro ao excluir o cliente do banco de dados.");
        }
    };

    const handleSaveCreative = async (creativeData: Omit<Creative, 'CriativoID'> | Creative) => {
        try {
            if ('CriativoID' in creativeData && creativeData.CriativoID) {
                await hubApi.criativos.update(creativeData.CriativoID, creativeData);
            } else {
                const created = await hubApi.criativos.create(creativeData);
                const client = clients.find(c => c.ClienteID === creativeData.ClienteID);
                if (client?.SquadID && userProfile) {
                    await NotificationService.notifyNewCreative(
                        client.Nome,
                        client.SquadID,
                        userProfile.displayName || 'Membro',
                        userProfile.uid
                    );
                }
                void created;
            }
            setCreativeModal({ isOpen: false, creative: null, clientId: null });
            loadAll();
        } catch (error) { console.error(error); }
    };

    const handleSaveMonthlyRequest = async (requestData: Omit<MonthlyCreativeRequest, 'RequestID'> | MonthlyCreativeRequest) => {
        try {
            if ('RequestID' in requestData && requestData.RequestID) {
                await hubApi.solicitacoes.update(requestData.RequestID, requestData);
            } else {
                await hubApi.solicitacoes.create(requestData);
                const client = clients.find(c => c.ClienteID === requestData.ClienteID);
                if (client?.SquadID && userProfile) {
                    await NotificationService.notifyNewMonthlyRequest(
                        client.Nome,
                        client.SquadID,
                        userProfile.displayName || 'Membro',
                        userProfile.uid,
                        requestData.MesReferencia
                    );
                }
            }
            setRequestModal({ isOpen: false, request: null, clientId: null });
            loadAll();
        } catch (error) {
            console.error("Erro ao salvar solicitação:", error);
            alert("Falha ao salvar solicitação mensal.");
        }
    };

    const handleSaveOptimization = async (optData: Omit<Optimization, 'OtimizacaoID'> | Optimization) => {
        try {
            if ('OtimizacaoID' in optData && optData.OtimizacaoID) {
                await hubApi.otimizacoes.update(optData.OtimizacaoID, optData);
            } else {
                await hubApi.otimizacoes.create(optData);
            }
            setOptimizationModal({ isOpen: false, optimization: null });
            loadAll();
        } catch (error) {
            console.error("Erro ao salvar otimização:", error);
            alert("Falha ao registrar ação.");
        }
    };

    const handleLeadUpdate = async (l: Lead) => {
        try {
            await hubApi.leads.update(l.LeadID, l);
            loadAll();
        } catch (e) { console.error(e); }
    };
    const handleLeadCreate = async (l: Omit<Lead, 'LeadID'>) => {
        try {
            await hubApi.leads.create(l);
            loadAll();
        } catch (e) { console.error(e); }
    };
    const handleBulkLeadCreate = async (ls: Omit<Lead, 'LeadID'>[]) => {
        try {
            for (const l of ls) await hubApi.leads.create(l);
            loadAll();
        } catch (e) { console.error(e); }
    };

    const renderPageContent = () => {
        if (loading) return <div className="flex justify-center items-center h-full text-slate-400 font-bold uppercase tracking-widest text-[10px]">Carregando Viga Sales Hub...</div>;
        const pageEl = (() => {
            switch(page) {
                case 'home': return <HomePage navigateTo={navigateTo} clients={clients} optimizations={optimizations} onAddClient={() => setClientModal({ isOpen: true, client: null })} />;
                case 'clientList': return <ClientListPage clients={clients} onSelectClient={(id) => navigateTo('clientDetail', id)} onDeleteClient={(id) => setDeleteModal({ isOpen: true, clientId: id })} onAddClient={() => setClientModal({ isOpen: true, client: null })} />;
                case 'clientDetail': 
                    const client = clients.find(c => c.ClienteID === selectedClientId);
                    if (!client) return null;
                    return <ClientDetailPage 
                        client={client} leads={leads.filter(l => l.ClienteID === selectedClientId)} 
                        investments={investments.filter(i => i.ClienteID === selectedClientId)} 
                        creatives={creatives.filter(c => c.ClienteID === selectedClientId)} 
                        monthlyRequests={monthlyRequests.filter(r => r.ClienteID === selectedClientId)}
                        optimizations={optimizations.filter(o => o.ClienteID === selectedClientId)} 
                        allClients={clients} onLeadUpdate={handleLeadUpdate} 
                        onLeadCreate={handleLeadCreate} 
                        onNavigateBack={() => navigateTo('clientList')} onGoToFunnel={() => navigateTo('leadsFunnel', selectedClientId)} 
                        onOpenEditModal={(c) => setClientModal({ isOpen: true, client: c })} 
                        onDeleteClient={(id) => setDeleteModal({ isOpen: true, clientId: id })} 
                        onOpenNewCreativeModal={(id) => setCreativeModal({ isOpen: true, creative: null, clientId: id })} 
                        onOpenEditCreativeModal={(c) => setCreativeModal({ isOpen: true, creative: c, clientId: c.ClienteID })} 
                        onOpenNewMonthlyRequestModal={(id) => setRequestModal({ isOpen: true, request: null, clientId: id })}
                        onOpenEditMonthlyRequestModal={(r) => setRequestModal({ isOpen: true, request: r, clientId: r.ClienteID })}
                        onSaveOptimization={handleSaveOptimization} 
                        onOpenOptimizationModal={(o) => setOptimizationModal({ isOpen: true, optimization: o })} 
                        onOpenNewOptimizationModal={() => setOptimizationModal({ isOpen: true, optimization: { ClienteID: selectedClientId || '' } })} 
                        onOpenMetaConfigModal={(c) => setMetaConfigModal({ isOpen: true, client: c })} 
                        initialTab={initialDetailTab}
                    />;
                case 'leadsFunnel': return <LeadsFunnelPage leads={leads} clients={clients} onLeadUpdate={handleLeadUpdate} onLeadCreate={handleLeadCreate} onBulkLeadCreate={handleBulkLeadCreate} initialClientId={selectedClientId} />;
                case 'calendar': return <CalendarPage clients={clients} optimizations={optimizations} onOpenOptimizationModal={(o) => setOptimizationModal({ isOpen: true, optimization: o })} onSelectClient={(id, tab) => navigateTo('clientDetail', id, tab)} />;
                case 'creatives': return <CreativesPage clients={clients} creatives={creatives} monthlyRequests={monthlyRequests} onOpenNewCreativeModal={(id) => setCreativeModal({ isOpen: true, creative: null, clientId: id })} onOpenEditCreativeModal={(c) => setCreativeModal({ isOpen: true, creative: c, clientId: c.ClienteID })} onOpenNewMonthlyRequestModal={(id) => setRequestModal({ isOpen: true, request: null, clientId: id })} onOpenEditMonthlyRequestModal={(r) => setRequestModal({ isOpen: true, request: r, clientId: r.ClienteID })} />;
                case 'reports': return <ReportsPage clients={clients} leads={leads} investments={investments} />;
                case 'dailyFollowUp': return <DailyFollowUpPage clients={clients} />;
                case 'scenarioProjection': return <ScenarioProjectionPage clients={clients} />;
                case 'optimizations': return <GlobalOptimizationsPage optimizations={optimizations} clients={clients} onOpenOptimizationModal={(o) => setOptimizationModal({ isOpen: true, optimization: o })} onNewOptimization={(clientId) => setOptimizationModal({ isOpen: true, optimization: { ClienteID: clientId } })} />;
                case 'monthlyReports': return <MonthlyReportsPage clients={clients} />;
                case 'metaAccounts': return <MetaAccountsPage clients={clients} navigateTo={navigateTo} onOpenConfigModal={(c) => setMetaConfigModal({ isOpen: true, client: c })} onChanged={loadAll} />;
                case 'googleAccounts': return <GoogleAccountsPage clients={clients} navigateTo={navigateTo} />;
                case 'searchConsole': return <SearchConsolePage navigateTo={navigateTo} />;
                case 'jarvis': return <JarvisPage />;
                case 'trafficBrain': return <TrafficBrainPage />;
                case 'churnometro': return <ChurnometroPage clients={clients} onSelectClient={(id) => navigateTo('clientDetail', id)} />;
                case 'settings': return <SettingsPage />;
                case 'security': return <SecurityPage />;
                case 'internalChat': return <GlobalChatPage />;
                default: return <HomePage navigateTo={navigateTo} clients={clients} optimizations={optimizations} onAddClient={() => setClientModal({ isOpen: true, client: null })} />;
            }
        })();
        return <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400 font-bold uppercase tracking-widest text-[10px]">Carregando...</div>}>{pageEl}</Suspense>;
    };

    const sidebarContent = (
        <>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                 <NavLink pageName="home" icon={<HomeIcon className="w-5 h-5" />} label="Dashboard" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />
                 <NavLink pageName="clientList" icon={<UsersIcon className="w-5 h-5" />} label="Clientes" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />
                 <NavLink pageName="leadsFunnel" icon={<FunnelIcon className="w-5 h-5" />} label="Funil de Leads" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />
                 <NavLink pageName="calendar" icon={<CalendarDaysIcon className="w-5 h-5" />} label="Calendário" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />
                 <NavLink pageName="creatives" icon={<PhotoIcon className="w-5 h-5" />} label="Criativos" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />
                 <NavLink pageName="optimizations" icon={<ClipboardCheckIcon className="w-5 h-5" />} label="Otimizações" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} specialStyle={page === 'optimizations' ? 'bg-orange-500 text-white' : ''} />
                 <NavLink pageName="reports" icon={<DocumentChartBarIcon className="w-5 h-5" />} label="Relatórios" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />
                 <NavLink pageName="monthlyReports" icon={<ChartPieIcon className="w-5 h-5" />} label="Relatório Mensal" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />
                 <NavLink pageName="dailyFollowUp" icon={<ChartBarSquareIcon className="w-5 h-5" />} label="Report Diário" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />
                 
                 <NavLink 
                    pageName="internalChat" 
                    icon={<ChatBubbleLeftRightIcon className="w-5 h-5" />} 
                    label="Comunidade" 
                    activePage={page} 
                    isCollapsed={isSidebarCollapsed} 
                    onNavigate={navigateTo}
                    specialStyle={page === 'internalChat' ? 'bg-emerald-600 text-white' : ''}
                    badgeCount={notifications.filter(n => !n.read && n.type === 'chat').length}
                 />

                 <div className="pt-4 pb-2">
                    {(!isSidebarCollapsed || window.innerWidth < 1024) && <h4 className="px-3 text-[10px] font-black text-slate-500 uppercase mb-2">IA & Performance</h4>}
                    <NavLink pageName="jarvis" icon={<SparklesIcon className="w-5 h-5 text-orange-400" />} label="Viga AI" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} specialStyle="bg-orange-500/20 text-orange-100 hover:bg-orange-500/40" />
                    <NavLink pageName="trafficBrain" icon={<LightBulbIcon className="w-5 h-5 text-amber-400" />} label="Cérebro de Tráfego" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} specialStyle="bg-amber-500/10 text-amber-100 hover:bg-amber-500/25" />
                    <NavLink pageName="searchConsole" icon={<MagnifyingGlassIcon className="w-5 h-5 text-blue-400" />} label="Search Console" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />
                    
                    {(userProfile?.role === 'adm_supremo' || userProfile?.role === 'admin') && (
                        <NavLink 
                            pageName="churnometro" 
                            icon={<ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />} 
                            label="Churnômetro" 
                            activePage={page} 
                            isCollapsed={isSidebarCollapsed} 
                            onNavigate={navigateTo}
                            specialStyle={page === 'churnometro' ? 'bg-rose-600 text-white shadow-lg' : 'hover:bg-rose-500/10 text-rose-200'}
                        />
                    )}
                 </div>
            </div>
             <div className="p-2 space-y-1 border-t border-[#1c3f70]">
                 {(userProfile?.role === 'adm_supremo' || userProfile?.role === 'admin') && <NavLink pageName="settings" icon={<CogIcon className="w-5 h-5" />} label="Configurações" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />}
                 <NavLink pageName="security" icon={<ShieldCheckIcon className="w-5 h-5" />} label="Segurança" activePage={page} isCollapsed={isSidebarCollapsed} onNavigate={navigateTo} />
                 <button onClick={logout} className="w-full flex items-center p-3 text-sm font-medium rounded-md text-slate-400 hover:bg-rose-900/20 hover:text-rose-400 transition-colors"><ArrowRightOnRectangleIcon className="w-5 h-5" />{(!isSidebarCollapsed || window.innerWidth < 1024) && <span className="ml-3">Sair</span>}</button>
             </div>
        </>
    );

    return (
        <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
            <nav className={`hidden lg:flex bg-[#0e2448] text-slate-200 flex-col fixed h-full transition-all duration-300 ease-in-out z-40 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
                <div className="flex items-center justify-between p-4 border-b border-[#1c3f70] h-20">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#0a1c38] border border-[#1c3f70] shadow-lg shrink-0">
                            <VigaLogo className="w-5 h-6" />
                        </div>
                        {!isSidebarCollapsed && <h1 className="text-lg font-bold text-white truncate uppercase tracking-tighter">Viga Sales Hub</h1>}
                    </div>
                    <button onClick={() => setSidebarCollapsed(!isSidebarCollapsed)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 ml-auto"><Bars3Icon className="w-6 h-6" /></button>
                </div>
                {sidebarContent}
            </nav>

            <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex flex-col bg-[#0e2448] shadow-xl">
                <div className="flex items-center justify-between p-4 h-16 border-b border-[#1c3f70]">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#0a1c38] border border-[#1c3f70] shrink-0">
                            <VigaLogo className="w-4 h-5" />
                        </div>
                        <h1 className="text-lg font-bold text-white uppercase tracking-tighter">Viga Sales Hub</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <button onClick={() => setIsNotificationOpen(!isNotificationOpen)} className="p-2 text-slate-400 hover:text-white relative transition-colors">
                                <ChartBarSquareIcon className="w-6 h-6" />
                                {notifications.filter(n => !n.read).length > 0 && (
                                    <span className="absolute top-1 right-1 bg-rose-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                                        {notifications.filter(n => !n.read).length}
                                    </span>
                                )}
                            </button>
                            {isNotificationOpen && <NotificationInbox notifications={notifications} onClose={() => setIsNotificationOpen(false)} onNotificationClick={handleNotificationClick} />}
                        </div>
                        <button 
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
                        >
                            {isMobileMenuOpen ? <XIcon className="w-6 h-6 text-white" /> : <Bars3Icon className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
                
                <div className={`overflow-hidden transition-all duration-500 ease-in-out bg-[#0e2448] ${isMobileMenuOpen ? 'max-h-[85vh] border-b border-slate-800' : 'max-h-0'}`}>
                    <div className="p-2 pb-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                        {sidebarContent}
                    </div>
                </div>
            </div>

            {isMobileMenuOpen && (
                <div 
                    className="lg:hidden fixed inset-0 bg-black/50 z-40 mt-16" 
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            <main className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300 ease-in-out pt-16 lg:pt-0 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
                <div className="hidden lg:flex h-16 bg-white border-b border-slate-200 items-center justify-end px-8 shrink-0 relative">
                    <div className="relative">
                        <button onClick={() => setIsNotificationOpen(!isNotificationOpen)} className="p-2 text-slate-400 hover:text-orange-500 relative transition-colors">
                            <ChartBarSquareIcon className="w-6 h-6" />
                            {notifications.filter(n => !n.read).length > 0 && (
                                <span className="absolute top-0 right-0 bg-rose-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-lg">
                                    {notifications.filter(n => !n.read).length}
                                </span>
                            )}
                        </button>
                        {isNotificationOpen && <NotificationInbox notifications={notifications} onClose={() => setIsNotificationOpen(false)} onNotificationClick={handleNotificationClick} />}
                    </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    {renderPageContent()}
                </div>
            </main>
            
            {clientModal.isOpen && (
                <ClientModal
                    isOpen={clientModal.isOpen}
                    onClose={() => setClientModal({ isOpen: false, client: null })}
                    onSave={handleSaveClient}
                    client={clientModal.client}
                />
            )}
            
            {creativeModal.isOpen && (
                <CreativeModal
                    isOpen={creativeModal.isOpen}
                    onClose={() => setCreativeModal({ isOpen: false, creative: null, clientId: null })}
                    onSave={handleSaveCreative}
                    creative={creativeModal.creative}
                    clients={clients}
                    initialClientId={creativeModal.clientId}
                />
            )}

            {requestModal.isOpen && (
                <MonthlyRequestModal
                    isOpen={requestModal.isOpen}
                    onClose={() => setRequestModal({ isOpen: false, request: null, clientId: null })}
                    onSave={handleSaveMonthlyRequest}
                    request={requestModal.request}
                    clients={clients}
                    initialClientId={requestModal.clientId}
                />
            )}

            {optimizationModal.isOpen && (
                <OptimizationModal
                    isOpen={optimizationModal.isOpen}
                    onClose={() => setOptimizationModal({ isOpen: false, optimization: null })}
                    onSave={handleSaveOptimization}
                    optimization={optimizationModal.optimization}
                    clients={clients}
                />
            )}

            {metaConfigModal.isOpen && (
                <MetaConfigModal 
                    isOpen={metaConfigModal.isOpen} 
                    onClose={() => setMetaConfigModal({ isOpen: false, client: null })} 
                    onSave={async (client) => {
                        await hubApi.clientes.update(client.ClienteID, client);
                        setMetaConfigModal({ isOpen: false, client: null });
                        loadAll();
                    }} 
                    client={metaConfigModal.client} 
                />
            )}
            
            {deleteModal.isOpen && (
                <DeleteConfirmationModal
                    isOpen={deleteModal.isOpen}
                    onClose={() => setDeleteModal({ isOpen: false, clientId: null })}
                    onConfirm={handleDeleteClient}
                />
            )}
        </div>
    );
};

const AppContent: React.FC = () => {
    const { currentUser, loading } = useAuth();

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-slate-100 text-slate-400 font-bold uppercase text-xs tracking-widest">Carregando Sistema...</div>;
    }

    if (!currentUser) {
        return <AuthPage />;
    }

    return <AuthenticatedApp />;
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
};

export default App;
