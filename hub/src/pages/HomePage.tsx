
import React, { useMemo } from 'react';
import { Page } from '../types';
import { Client, Optimization, MoodStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
    UsersIcon,
    PlusIcon,
    BanknotesIcon,
    SparklesIcon,
    ChevronRightIcon,
    ClockIcon,
    ExclamationTriangleIcon,
    IconProps
} from '../components/icons';

interface HomePageProps {
  navigateTo: (page: Page, clientId?: string | null, tab?: string) => void;
  clients: Client[];
  optimizations: Optimization[];
  onAddClient: () => void;
}

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactElement<IconProps>; color: string }> = ({ title, value, icon, color }) => (
  <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all group">
    {/* FIX: Properly type the icon as React.ReactElement<IconProps> to allow cloning with className */}
    <div className={`w-10 h-10 rounded-2xl ${color} flex items-center justify-center text-white mb-2 shadow-lg shadow-current/10 group-hover:scale-110 transition-transform`}>
      {React.cloneElement(icon, { className: 'w-5 h-5' })}
    </div>
    <div>
      <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.1em] mb-0.5">{title}</p>
      <p className="text-xl font-black text-slate-900 tracking-tight">{value}</p>
    </div>
  </div>
);

const HomePage: React.FC<HomePageProps> = ({ navigateTo, clients, onAddClient }) => {
  const { userProfile } = useAuth();
  const activeClients = useMemo(() => clients.filter(c => c.StatusCliente === 'Ativo'), [clients]);
  
  const totalBudget = useMemo(() => 
    activeClients.reduce((acc, curr) => acc + (curr.OrcamentoMensal || 0), 0)
  , [activeClients]);

  const churnRiskClients = useMemo(() => 
    activeClients.filter(c => c.mood === MoodStatus.Vermelho)
  , [activeClients]);

  const todayStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const weekDayName = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(new Date());
  const capitalizedWeekDay = weekDayName.charAt(0).toUpperCase() + weekDayName.slice(1).split('-')[0];

  const clientsToOptimizeToday = useMemo(() => 
    activeClients.filter(c => c.DiaOtimizacao === capitalizedWeekDay)
  , [activeClients, capitalizedWeekDay]);

  const canAddClient = userProfile?.role === 'adm_supremo' || userProfile?.role === 'admin' || userProfile?.role === 'vendedor';

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-700 h-full overflow-y-auto custom-scrollbar">
        {/* Banner de Boas-Vindas */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-0.5">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard <span className="text-orange-500">Viga Sales</span></h1>
                <div className="flex items-center gap-2 text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                    <SparklesIcon className="w-3 h-3 text-amber-500" />
                    <span>{todayStr}</span>
                </div>
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={() => navigateTo('clientList')}
                    className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                >
                    <UsersIcon className="w-3.5 h-3.5" /> Clientes
                </button>
                {canAddClient && (
                    <button 
                        onClick={onAddClient}
                        className="flex items-center gap-2 bg-orange-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-orange-700 transition-all shadow-xl shadow-orange-100 active:scale-95"
                    >
                        <PlusIcon className="w-3.5 h-3.5" /> Novo
                    </button>
                )}
            </div>
        </header>

        {/* KPIs de Topo */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard 
              title="Clientes Ativos" 
              value={activeClients.length} 
              icon={<UsersIcon />} 
              color="bg-orange-500"
            />
            <StatCard 
              title="Gestão Mensal" 
              value={totalBudget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} 
              icon={<BanknotesIcon />} 
              color="bg-emerald-500"
            />
            <StatCard 
              title="Risco de Churn" 
              value={churnRiskClients.length} 
              icon={<ExclamationTriangleIcon />} 
              color="bg-rose-600"
            />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna Esquerda: Operação do Dia */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-orange-50 text-orange-500 rounded-xl">
                                <ClockIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-800 tracking-tight">Otimização: {capitalizedWeekDay}</h3>
                            </div>
                        </div>
                        <span className="text-[8px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                            {clientsToOptimizeToday.length} Agendados
                        </span>
                    </div>
                    
                    <div className="p-4 max-h-[180px] overflow-y-auto custom-scrollbar">
                        {clientsToOptimizeToday.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {clientsToOptimizeToday.map(client => (
                                    <button 
                                        key={client.ClienteID}
                                        onClick={() => navigateTo('clientDetail', client.ClienteID, 'optimizations')}
                                        className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 hover:border-orange-200 hover:bg-orange-50/30 transition-all text-left group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 font-black text-[10px] uppercase group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                                {client.Nome.substring(0,2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-800 text-[11px] uppercase tracking-tight group-hover:text-orange-500 transition-colors truncate w-32">{client.Nome}</p>
                                                <p className="text-[8px] text-slate-400 font-bold uppercase truncate">{client.Responsavel}</p>
                                            </div>
                                        </div>
                                        <ChevronRightIcon className="w-3 h-3 text-slate-300 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="py-4 text-center">
                                <p className="text-slate-400 font-bold text-xs">Nenhum cliente hoje.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Card Clientes com Risco de Churn (Lista) */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-50 flex items-center gap-2">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                            <ExclamationTriangleIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800 tracking-tight uppercase">Risco de Churn</h3>
                        </div>
                    </div>
                    <div className="p-4 max-h-[150px] overflow-y-auto custom-scrollbar">
                        {churnRiskClients.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {churnRiskClients.map(client => (
                                    <button 
                                        key={client.ClienteID}
                                        onClick={() => navigateTo('clientDetail', client.ClienteID)}
                                        className="flex items-center justify-between p-3 rounded-2xl border border-rose-100 bg-rose-50/20 hover:bg-rose-50 transition-all text-left group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600 font-black text-[10px] uppercase">
                                                {client.Nome.substring(0,2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-800 text-[11px] uppercase tracking-tight truncate w-32">{client.Nome}</p>
                                                <p className="text-[8px] text-rose-500 font-bold uppercase tracking-widest">Crítico</p>
                                            </div>
                                        </div>
                                        <ChevronRightIcon className="w-3 h-3 text-rose-300 group-hover:text-rose-600 group-hover:translate-x-1 transition-all" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="py-2 text-center">
                                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Nenhum risco crítico.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Coluna Direita: Inteligência */}
            <div className="space-y-6">
                {(userProfile?.role !== 'user') && (
                    <div className="bg-orange-50 rounded-3xl border border-orange-100 p-6 flex flex-col justify-between h-full min-h-[200px]">
                         <div>
                            <h3 className="text-[11px] font-black text-orange-900 mb-2 uppercase tracking-widest">Viga AI</h3>
                            <p className="text-[10px] text-orange-700 leading-relaxed mb-4 font-medium">Insights estratégicos baseados em dados em tempo real.</p>
                         </div>
                         <button 
                            onClick={() => navigateTo('jarvis')}
                            className="w-full py-3 bg-orange-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-orange-200 hover:bg-orange-700 transition-all active:scale-95"
                         >
                            Consultar IA
                         </button>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default HomePage;
