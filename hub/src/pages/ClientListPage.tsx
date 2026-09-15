
import React, { useState, useMemo } from 'react';
import { Client } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
    CheckCircleIcon, 
    PauseCircleIcon, 
    XCircleIcon, 
    MagnifyingGlassIcon, 
    ArrowsUpDownIcon, 
    ChevronUpIcon, 
    ChevronDownIcon, 
    UserIcon, 
    CalendarIcon, 
    TrashIcon, 
    PlusIcon,
    UsersIcon,
    ChevronRightIcon
} from '../components/icons';

interface ClientListPageProps {
    clients: Client[];
    onSelectClient: (clientId: string) => void;
    onDeleteClient: (clientId: string) => void;
    onAddClient: () => void;
}

const statusStyles = {
    Ativo: { text: 'text-emerald-800', bg: 'bg-emerald-100', icon: <CheckCircleIcon className="w-4 h-4" /> },
    Pausado: { text: 'text-amber-800', bg: 'bg-amber-100', icon: <PauseCircleIcon className="w-4 h-4" /> },
    Encerrado: { text: 'text-rose-800', bg: 'bg-rose-100', icon: <XCircleIcon className="w-4 h-4" /> },
};

type SortableKeys = 'Nome' | 'OrcamentoMensal' | 'StatusCliente';

const formatCurrency = (value?: number): string => {
    if (typeof value !== 'number' || isNaN(value)) {
        return 'N/A';
    }
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const TableHeader: React.FC<{ sortKey: SortableKeys; label: string; currentSort: { key: SortableKeys; direction: 'ascending' | 'descending' }; onRequestSort: (key: SortableKeys) => void; className?: string; }> = ({ sortKey, label, currentSort, onRequestSort, className }) => {
    const getSortIcon = () => {
        if (currentSort.key !== sortKey) {
            return <ArrowsUpDownIcon className="w-4 h-4 ml-2 text-slate-400" />;
        }
        if (currentSort.direction === 'ascending') {
            return <ChevronUpIcon className="w-4 h-4 ml-2 text-slate-600" />;
        }
        return <ChevronDownIcon className="w-4 h-4 ml-2 text-slate-600" />;
    };

    return (
        <th scope="col" className={`px-6 py-4 sticky top-0 bg-slate-50 z-10 ${className}`}>
            <button className="flex items-center font-black uppercase text-[10px] tracking-widest text-slate-400" onClick={() => onRequestSort(sortKey)}>
                {label}
                {getSortIcon()}
            </button>
        </th>
    );
};

const ClientListPage: React.FC<ClientListPageProps> = ({ clients, onSelectClient, onDeleteClient, onAddClient }) => {
    const { userProfile } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [squadFilter, setSquadFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'Nome', direction: 'ascending' });

    // Extrair lista única de squads para o filtro
    const squads = useMemo(() => {
        const unique = new Set(clients.map(c => c.SquadID).filter(Boolean));
        return Array.from(unique).sort();
    }, [clients]);

    const sortedAndFilteredClients = useMemo(() => {
        let sortableClients = [...clients];

        if (searchTerm.trim()) {
            sortableClients = sortableClients.filter(client =>
                (client.Nome || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (squadFilter) {
            sortableClients = sortableClients.filter(client => client.SquadID === squadFilter);
        }

        sortableClients.sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (aValue == null && bValue == null) return 0;
            if (aValue == null) return -1;
            if (bValue == null) return 1;
            
            let comparison = 0;
            if (aValue > bValue) {
                comparison = 1;
            } else if (aValue < bValue) {
                comparison = -1;
            }

            return sortConfig.direction === 'ascending' ? comparison : -comparison;
        });

        return sortableClients;
    }, [clients, searchTerm, squadFilter, sortConfig]);
    
    const requestSort = (key: SortableKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const canAddClient = userProfile?.role === 'adm_supremo' || userProfile?.role === 'admin' || userProfile?.role === 'vendedor';
    const canDeleteClient = userProfile?.role === 'adm_supremo' || userProfile?.role === 'admin';

    return (
        <div className="flex flex-col lg:flex-row h-full bg-slate-50 overflow-hidden">
            {/* Sidebar de Filtros e Ações */}
            <aside className="w-full lg:w-80 bg-white border-r border-slate-200 p-8 space-y-8 overflow-y-auto shrink-0 shadow-sm z-20">
                <div className="space-y-6">
                    {canAddClient && (
                        <button
                            onClick={onAddClient}
                            className="w-full flex items-center justify-center bg-orange-500 hover:bg-orange-700 text-white font-black uppercase text-[11px] tracking-widest py-4 px-6 rounded-2xl transition-all shadow-xl shadow-orange-100 active:scale-95"
                        >
                            <PlusIcon className="w-5 h-5 mr-2" />
                            Adicionar Cliente
                        </button>
                    )}

                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Lista de Clientes</h1>
                        <p className="text-slate-400 text-xs font-medium mt-1">Gerencie, filtre e visualize seus clientes em larga escala.</p>
                    </div>

                    <div className="space-y-4 pt-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Pesquisar por Nome</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-orange-500 transition-colors">
                                    <MagnifyingGlassIcon className="h-4 w-4" />
                                </div>
                                <input
                                    type="text"
                                    className="w-full pl-10 pr-4 py-3 bg-slate-100 border-none rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all outline-none"
                                    placeholder="Ex: Ana Paula Adv..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Squads</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-orange-500 transition-colors">
                                    <UsersIcon className="h-4 w-4" />
                                </div>
                                <select
                                    className="w-full pl-10 pr-4 py-3 bg-slate-100 border-none rounded-xl text-slate-900 text-sm font-bold appearance-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all outline-none cursor-pointer"
                                    value={squadFilter}
                                    onChange={(e) => setSquadFilter(e.target.value)}
                                >
                                    <option value="">Todos os Squads</option>
                                    {squads.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-400">
                                    <ChevronDownIcon className="h-4 w-4" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-8 border-t border-slate-100">
                    <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100">
                        <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">Resumo da Base</p>
                        <div className="flex items-end gap-2">
                             <span className="text-3xl font-black text-orange-500 tracking-tighter">{sortedAndFilteredClients.length}</span>
                             <span className="text-[10px] font-black text-orange-400 uppercase mb-1.5">Clientes {squadFilter ? 'do Squad' : 'Totais'}</span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Container da Tabela com Scroll Independente */}
            <main className="flex-1 flex flex-col h-full min-w-0">
                <div className="flex-1 overflow-auto custom-scrollbar p-4 lg:p-8">
                    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden min-w-[800px]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50">
                                    <TableHeader sortKey="Nome" label="Cliente" currentSort={sortConfig} onRequestSort={requestSort} />
                                    <TableHeader sortKey="StatusCliente" label="Status" currentSort={sortConfig} onRequestSort={requestSort} />
                                    <TableHeader sortKey="OrcamentoMensal" label="Investimento" currentSort={sortConfig} onRequestSort={requestSort} />
                                    <th className="px-6 py-4 font-black uppercase text-[10px] tracking-widest text-slate-400">Squads</th>
                                    <th className="px-6 py-4 font-black uppercase text-[10px] tracking-widest text-slate-400 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sortedAndFilteredClients.map(client => (
                                    <tr 
                                        key={client.ClienteID} 
                                        onClick={() => onSelectClient(client.ClienteID)}
                                        className="group hover:bg-slate-50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xs uppercase group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                                    {client.Nome.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="font-black text-slate-800 text-sm uppercase tracking-tight group-hover:text-orange-500 transition-colors">{client.Nome}</p>
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase">ID: {client.ClienteID.substring(0,8)} • {client.Nicho}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${statusStyles[client.StatusCliente].bg} ${statusStyles[client.StatusCliente].text}`}>
                                                {statusStyles[client.StatusCliente].icon}
                                                {client.StatusCliente}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-black text-slate-700 text-sm">
                                            {formatCurrency(client.OrcamentoMensal)}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-500 text-xs">
                                            {client.SquadID || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onSelectClient(client.ClienteID); }}
                                                    className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                                                    title="Ver Detalhes"
                                                >
                                                    <ChevronRightIcon className="w-5 h-5" />
                                                </button>
                                                {canDeleteClient && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onDeleteClient(client.ClienteID); }}
                                                        className="p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-all"
                                                        title="Excluir Cliente e Dados"
                                                    >
                                                        <TrashIcon className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {sortedAndFilteredClients.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-20 text-center">
                                            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Nenhum cliente encontrado</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer Informativo da Listagem */}
                <div className="bg-white border-t border-slate-200 px-8 py-3 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <div className="flex items-center gap-6">
                        <span>Total Visível: <strong className="text-slate-800">{sortedAndFilteredClients.length}</strong></span>
                        <div className="h-3 w-px bg-slate-200"></div>
                        <span className="flex items-center text-emerald-500"><CheckCircleIcon className="w-3 h-3 mr-1" /> Lista Atualizada</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <UsersIcon className="w-3.5 h-3.5" />
                        <span>Sincronizado com Viga Sales Hub</span>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ClientListPage;
