
import React, { useMemo, useState } from 'react';
import { Optimization, Client, EfetividadeStatus } from '../types';
import { ClipboardCheckIcon, MagnifyingGlassIcon, CheckCircleIcon, UsersIcon, PencilIcon, ChevronRightIcon, PlusIcon, CubeIcon } from '../components/icons';

interface GlobalOptimizationsPageProps {
    optimizations: Optimization[];
    clients: Client[];
    onOpenOptimizationModal: (optimization: Optimization) => void;
    onNewOptimization: (clientId?: string) => void;
}

const GlobalOptimizationsPage: React.FC<GlobalOptimizationsPageProps> = ({ optimizations, clients, onOpenOptimizationModal, onNewOptimization }) => {
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');

    // Filtra as otimizações baseadas no cliente selecionado E no termo de busca (Descrição, Responsável ou Nome do Cliente)
    const filteredOptimizations = useMemo(() => {
        let list = [...optimizations];

        // Se houver um cliente selecionado no dropdown
        if (selectedClientId) {
            list = list.filter(opt => opt.ClienteID === selectedClientId);
        }

        // Se houver um termo de busca, filtra por descrição, responsável ou nome do cliente
        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            list = list.filter(opt => {
                const client = clients.find(c => c.ClienteID === opt.ClienteID);
                return (
                    (opt.Descricao || '').toLowerCase().includes(lowerTerm) ||
                    (opt.Responsavel || '').toLowerCase().includes(lowerTerm) ||
                    (client?.Nome || '').toLowerCase().includes(lowerTerm)
                );
            });
        }

        return list.sort((a, b) => new Date(b.Data).getTime() - new Date(a.Data).getTime());
    }, [optimizations, selectedClientId, searchTerm, clients]);

    const getClientName = (clientId: string) => {
        const client = clients.find(c => c.ClienteID === clientId);
        return client?.Nome || 'Cliente Desconhecido';
    };

    const getClientSquad = (clientId: string) => {
        const client = clients.find(c => c.ClienteID === clientId);
        return client?.SquadID || 'Sem Squad';
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <header className="p-6 md:p-8 flex-shrink-0 bg-white border-b border-slate-200">
                <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <ClipboardCheckIcon className="w-8 h-8 text-orange-500" />
                            Central de Otimizações
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 font-medium">Selecione um cliente ou pesquise pelo nome para visualizar o histórico.</p>
                    </div>
                    <button
                        onClick={() => onNewOptimization(selectedClientId)}
                        className="flex items-center justify-center bg-orange-500 hover:bg-orange-700 text-white font-black uppercase text-[11px] tracking-widest py-3 px-5 rounded-2xl transition-all shadow-lg active:scale-95"
                    >
                        <PlusIcon className="w-4 h-4 mr-2" />
                        Nova Otimização
                    </button>
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                    {/* Seletor de Cliente */}
                    <div className="w-full md:w-1/3">
                        <label htmlFor="client-select" className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Filtrar por Cliente</label>
                        <div className="relative">
                            <select
                                id="client-select"
                                value={selectedClientId}
                                onChange={(e) => setSelectedClientId(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl shadow-sm focus:ring-orange-500 focus:border-orange-500 bg-white text-slate-900 p-3 font-bold text-sm appearance-none cursor-pointer"
                            >
                                <option value="">Todos os Clientes</option>
                                {clients.map(client => (
                                    <option key={client.ClienteID} value={client.ClienteID}>{client.Nome}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                <ChevronRightIcon className="h-4 w-4 rotate-90" />
                            </div>
                        </div>
                    </div>

                    {/* Busca Textual */}
                    <div className="w-full md:w-2/3">
                        <label htmlFor="opt-search" className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Buscar no Histórico ou Cliente</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
                            </div>
                            <input
                                type="text"
                                id="opt-search"
                                placeholder="Nome do cliente, ajuste, pausa de anúncio..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl shadow-sm bg-white text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all font-medium text-sm outline-none"
                            />
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-auto p-6 md:p-8 custom-scrollbar">
                {(selectedClientId || searchTerm) ? (
                    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                                    {/* Nova Coluna Responsável adicionada conforme solicitado */}
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsável</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fonte</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/4">Descrição da Ação</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Resultado</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredOptimizations.map(opt => (
                                    <tr 
                                        key={opt.OtimizacaoID} 
                                        className="group hover:bg-slate-50 transition-colors cursor-pointer"
                                        onClick={() => onOpenOptimizationModal(opt)}
                                    >
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                                                {new Date(opt.Data).toLocaleDateString('pt-BR')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate w-32">{getClientName(opt.ClienteID)}</p>
                                        </td>
                                        {/* Exibição da coluna Responsável */}
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-black text-slate-500 uppercase">
                                                    {opt.Responsavel ? opt.Responsavel.substring(0, 1) : 'U'}
                                                </div>
                                                <span className="text-xs font-bold text-slate-600 uppercase truncate max-w-[100px]">{opt.Responsavel || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase border ${opt.FonteTrafego === 'Meta' ? 'bg-orange-50 text-orange-500 border-orange-100' : opt.FonteTrafego === 'Google' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                                                {opt.FonteTrafego || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-bold text-slate-800 line-clamp-2 leading-relaxed">{opt.Descricao}</p>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${opt.Efetividade === 'Efetiva' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : opt.Efetividade === 'Não Efetiva' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                {opt.Efetividade || 'Avaliar'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider flex w-fit items-center gap-1 ${opt.Status === 'Concluido' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {opt.Status === 'Concluido' && <CheckCircleIcon className="w-3 h-3" />}
                                                {opt.Status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); onOpenOptimizationModal(opt); }}
                                                className="p-2 text-slate-400 hover:text-orange-500 rounded-lg hover:bg-orange-50 transition-colors"
                                            >
                                                <PencilIcon className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredOptimizations.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-20 text-center">
                                            <div className="mx-auto w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                                <ClipboardCheckIcon className="w-8 h-8 text-slate-300" />
                                            </div>
                                            <h3 className="text-slate-900 font-bold text-lg">Nenhuma otimização encontrada</h3>
                                            <p className="text-slate-500 text-sm mt-1">Nenhum registro localizado para os filtros aplicados.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center pb-20 animate-in fade-in duration-700">
                        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 max-w-md w-full">
                            <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <ClipboardCheckIcon className="w-10 h-10 text-orange-500" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 mb-2">Central de Otimizações</h3>
                            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                                Escolha um cliente no menu ou utilize o campo de busca para pesquisar pelo nome do cliente e visualizar as ações realizadas.
                            </p>
                            <div className="h-1 w-20 bg-orange-100 rounded-full mx-auto"></div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default GlobalOptimizationsPage;
