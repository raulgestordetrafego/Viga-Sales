
import React, { useMemo, useState, useEffect } from 'react';
import { Client, MoodStatus, Squad } from '../types';
import { hubApi } from '../api';
import { 
    ExclamationTriangleIcon, 
    CheckCircleIcon, 
    SparklesIcon, 
    UsersIcon, 
    MagnifyingGlassIcon,
    FunnelIcon,
    ChatBubbleLeftRightIcon,
    ArrowTrendingUpIcon,
    PhotoIcon,
    BanknotesIcon,
    // Fix: Added missing ChevronDownIcon import
    ChevronDownIcon
} from '../components/icons';

interface ChurnometroPageProps {
    clients: Client[];
    onSelectClient: (clientId: string) => void;
}

const ChurnometroPage: React.FC<ChurnometroPageProps> = ({ onSelectClient }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSquad, setSelectedSquad] = useState('');
    const squads: Squad[] = [{ id: 'geral', nome: 'Geral', createdAt: new Date().toISOString() }];
    const [clientsWithNps, setClientsWithNps] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        let active = true;
        const load = async () => {
            try {
                const data = await hubApi.clientes.list();
                if (!active) return;
                setClientsWithNps(data || []);
                setLoading(false);
            } catch (err) {
                console.error("Erro ao carregar clientes:", err);
                if (active) setLoading(false);
            }
        };
        load();
        const t = setInterval(load, 30000);
        return () => { active = false; clearInterval(t); };
    }, []);

    const filteredClients = useMemo(() => {
        return clientsWithNps
            .filter(c => c.StatusCliente === 'Ativo')
            .filter(c => (c.Nome || '').toLowerCase().includes(searchTerm.toLowerCase()))
            .filter(c => selectedSquad === '' || c.SquadID === selectedSquad);
    }, [clientsWithNps, searchTerm, selectedSquad]);

    const stats = useMemo(() => {
        const total = filteredClients.length;
        const red = filteredClients.filter(c => c.mood === MoodStatus.Vermelho).length;
        const yellow = filteredClients.filter(c => c.mood === MoodStatus.Amarelo).length;
        const green = filteredClients.filter(c => c.mood === MoodStatus.Verde || !c.mood).length;
        
        return { 
            total, 
            red, 
            yellow, 
            green,
            riskRate: total > 0 ? ((red + yellow) / total) * 100 : 0
        };
    }, [filteredClients]);

    const getMoodConfig = (mood?: MoodStatus) => {
        switch(mood) {
            case MoodStatus.Vermelho: return { color: 'bg-rose-500', text: 'Crítico / Risco Churn', border: 'border-rose-100', iconColor: 'text-rose-500', bgSoft: 'bg-rose-50' };
            case MoodStatus.Amarelo: return { color: 'bg-amber-500', text: 'Alerta / Atenção', border: 'border-amber-100', iconColor: 'text-amber-500', bgSoft: 'bg-amber-50' };
            default: return { color: 'bg-emerald-500', text: 'Saudável / Satisfeito', border: 'border-emerald-100', iconColor: 'text-emerald-500', bgSoft: 'bg-emerald-50' };
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-400 font-bold uppercase text-xs tracking-widest animate-pulse">Cruzando Dados de Saúde...</div>;

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden animate-in fade-in duration-500">
            <header className="p-8 bg-white border-b border-slate-200 shrink-0">
                <div className="max-w-full mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3 uppercase">
                            <ExclamationTriangleIcon className="w-8 h-8 text-rose-600" />
                            Visão Geral de Saúde
                        </h1>
                        <p className="text-slate-500 text-sm font-medium mt-1 uppercase tracking-widest">Monitoramento consolidado de NPS da carteira</p>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 px-5 py-3 rounded-2xl">
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest leading-none mb-1">Índice de Instabilidade</p>
                        <p className="text-2xl font-black text-rose-600">{stats.riskRate.toFixed(1)}%</p>
                    </div>
                </div>

                <div className="max-w-full mx-auto mt-8 flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Pesquisar por nome do cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-100 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all outline-none"
                        />
                    </div>
                    <div className="w-full md:w-72 relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <UsersIcon className="h-5 w-5 text-slate-400" />
                        </div>
                        <select
                            value={selectedSquad}
                            onChange={(e) => setSelectedSquad(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-100 border-none rounded-xl text-sm font-bold appearance-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all outline-none cursor-pointer"
                        >
                            <option value="">Todos os Squads</option>
                            {squads.map(s => (
                                <option key={s.id} value={s.nome}>{s.nome}</option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-400">
                            <ChevronDownIcon className="h-4 w-4" />
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="max-w-full mx-auto space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-emerald-100 flex items-center gap-5">
                            <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-100">
                                <CheckCircleIcon className="w-7 h-7" strokeWidth={2.5} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">SAUDÁVEIS</p>
                                <p className="text-4xl font-black text-emerald-600 tracking-tighter">{stats.green}</p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-amber-100 flex items-center gap-5">
                            <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-amber-100">
                                <SparklesIcon className="w-7 h-7" strokeWidth={2.5} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">EM ALERTA</p>
                                <p className="text-4xl font-black text-amber-500 tracking-tighter">{stats.yellow}</p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-rose-100 flex items-center gap-5">
                            <div className="w-14 h-14 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-rose-100">
                                <ExclamationTriangleIcon className="w-7 h-7" strokeWidth={2.5} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">CRÍTICOS</p>
                                <p className="text-4xl font-black text-rose-600 tracking-tighter">{stats.red}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/50">
                            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Listagem Consolidada de Satisfação</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white border-b border-slate-100">
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Squad</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Responsável</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status de Saúde</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredClients.sort((a, b) => {
                                        const moodOrder = { [MoodStatus.Vermelho]: 0, [MoodStatus.Amarelo]: 1, [MoodStatus.Verde]: 2 };
                                        return (moodOrder[a.mood || MoodStatus.Verde] || 2) - (moodOrder[b.mood || MoodStatus.Verde] || 2);
                                    }).map(client => {
                                        const mood = getMoodConfig(client.mood);
                                        return (
                                            <tr key={client.ClienteID} className="group hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => onSelectClient(client.ClienteID)}>
                                                <td className="px-8 py-6">
                                                    <div>
                                                        <p className="font-black text-slate-900 uppercase text-sm tracking-tight">{client.Nome}</p>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{client.Nicho}</p>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-1.5 bg-orange-50 text-orange-500 rounded-lg">
                                                            <UsersIcon className="w-3.5 h-3.5" />
                                                        </div>
                                                        <span className="text-xs font-black text-slate-600 uppercase">{client.SquadID || 'Sem Squad'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-center text-xs font-bold text-slate-500 uppercase">
                                                    {client.Responsavel}
                                                </td>
                                                <td className="px-8 py-6 text-center">
                                                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${mood.border} ${mood.bgSoft}`}>
                                                        <div className={`w-2 h-2 rounded-full ${mood.color} ${client.mood === MoodStatus.Vermelho ? 'animate-pulse' : ''}`}></div>
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${mood.iconColor}`}>{mood.text}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredClients.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest">Nenhum cliente ativo localizado com os filtros atuais.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ChurnometroPage;
