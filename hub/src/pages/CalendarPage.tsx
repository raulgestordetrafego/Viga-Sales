
import React, { useState, useMemo } from 'react';
import { Client, Optimization, OptimizationStatus } from '../types';
import { UserIcon, CheckCircleIcon, ClipboardCheckIcon, MagnifyingGlassIcon, Cog6ToothIcon } from '../components/icons';

interface CalendarPageProps {
    clients: Client[];
    optimizations: Optimization[];
    onOpenOptimizationModal: (optimization: Optimization) => void;
    onSelectClient: (clientId: string, tab?: string) => void;
}

const weekDays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'] as const;

const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setHours(0,0,0,0);
    return new Date(date.setDate(diff));
};

const CalendarPage: React.FC<CalendarPageProps> = ({ clients, optimizations, onOpenOptimizationModal, onSelectClient }) => {
    const [searchTerm, setSearchTerm] = useState('');
    
    const weekStartDate = getStartOfWeek(new Date());
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 4);
    
    const weekStartDateString = weekStartDate.toISOString().split('T')[0];

    // Filter optimizations for the current week and create a map
    const optimizationMap = useMemo(() => {
        const map = new Map<string, Optimization>();
        optimizations
            .filter(opt => {
                // FIX: Add guard against invalid dates to prevent crashes.
                if (!opt.Data || isNaN(new Date(opt.Data).getTime())) {
                    return false;
                }
                const optDate = new Date(opt.Data);
                const optWeekStart = getStartOfWeek(optDate).toISOString().split('T')[0];
                return optWeekStart === weekStartDateString;
            })
            .forEach(opt => map.set(opt.ClienteID, opt));
        return map;
    }, [optimizations, weekStartDateString]);
    
    const filteredClients = useMemo(() => {
        const activeClients = clients.filter(c => c.StatusCliente === 'Ativo');
        if (!searchTerm.trim()) return activeClients;
        return activeClients.filter(client => client.Nome.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [clients, searchTerm]);

    const formatDateRange = (start: Date, end: Date) => {
        const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long' };
        return `${start.toLocaleDateString('pt-BR', options)} - ${end.toLocaleDateString('pt-BR', options)}`;
    }

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <header className="p-4 sm:p-6 lg:p-8 flex-shrink-0">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-slate-900">Calendário de Otimizações</h1>
                    <p className="text-slate-500 mt-1">
                        Tarefas da semana: <span className="font-semibold">{formatDateRange(weekStartDate, weekEndDate)}</span>
                    </p>
                </div>
                 <div className="w-full max-w-md">
                    <label htmlFor="search-client" className="sr-only">Pesquisar cliente</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" aria-hidden="true" />
                        </div>
                        <input
                            type="text"
                            name="search-client"
                            id="search-client"
                            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-500 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                            placeholder="Pesquisar por nome..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </header>
            
            <main className="flex-1 overflow-hidden px-4 sm:px-6 lg:p-8 pb-4 sm:pb-6 lg:pb-8 flex flex-col">
                <div className="flex-1 overflow-x-auto kanban-scroll">
                    <div className="flex space-x-4 h-full">
                        {weekDays.map(day => (
                            <div key={day} className="bg-slate-200/70 rounded-xl flex flex-col w-64 sm:w-72 flex-shrink-0">
                                <div className="p-4 rounded-t-xl bg-white border-b border-slate-300">
                                    <h2 className="font-bold text-slate-800 text-center text-lg">{day}</h2>
                                </div>
                                <div className="p-2 space-y-3 overflow-y-auto flex-1 custom-scrollbar min-h-[300px]">
                                    {filteredClients
                                        .filter(client => client.DiaOtimizacao === day)
                                        .map(client => {
                                            const optimization = optimizationMap.get(client.ClienteID);
                                            const isCompleted = optimization?.Status === OptimizationStatus.Concluido;

                                            return (
                                                <div 
                                                    key={client.ClienteID} 
                                                    className={`bg-white p-4 rounded-lg shadow border transition-all cursor-pointer hover:shadow-md ${isCompleted ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 hover:border-orange-300'}`}
                                                    onClick={() => onSelectClient(client.ClienteID, 'optimizations')}
                                                >
                                                    <h3 className={`font-bold transition-colors ${isCompleted ? 'text-slate-500 line-through' : 'text-slate-800 hover:text-orange-500'}`}>{client.Nome}</h3>
                                                    <div className="flex items-center text-sm text-slate-500 mt-2">
                                                        <UserIcon className="w-4 h-4 mr-2" />
                                                        <span>{client.Responsavel}</span>
                                                    </div>
                                                    <div className="mt-4 pt-3 border-t border-slate-200">
                                                        {isCompleted ? (
                                                            <div className="flex items-center justify-between text-emerald-600 font-semibold text-sm">
                                                                <div className="flex items-center"><CheckCircleIcon className="w-5 h-5 mr-2" /><span>Concluída</span></div>
                                                                 <button onClick={(e) => { e.stopPropagation(); optimization && onOpenOptimizationModal(optimization); }} className="text-slate-400 hover:text-orange-500 p-1 rounded-md hover:bg-white" title="Editar Otimização"><Cog6ToothIcon className="w-5 h-5" /></button>
                                                            </div>
                                                        ) : (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); optimization && onOpenOptimizationModal(optimization); }} 
                                                                className="w-full flex items-center justify-center bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-3 rounded-md text-sm transition shadow-sm active:scale-95" 
                                                                disabled={!optimization}
                                                            >
                                                                <ClipboardCheckIcon className="w-4 h-4 mr-2" />
                                                                {optimization ? 'Registrar' : 'Pendente'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    }
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default CalendarPage;
