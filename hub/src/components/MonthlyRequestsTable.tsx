
import React from 'react';
import { MonthlyCreativeRequest, RequestStatus } from '../types';
import { PlusIcon, ExternalLinkIcon, PencilIcon, CalendarIcon } from './icons';

interface MonthlyRequestsTableProps {
  requests: MonthlyCreativeRequest[];
  onOpenNewRequestModal: () => void;
  onOpenEditRequestModal: (request: MonthlyCreativeRequest) => void;
  canManage?: boolean;
}

const statusStylesRequest: { [key in RequestStatus]: string } = {
  [RequestStatus.Pendente]: 'bg-amber-100 text-amber-800',
  [RequestStatus.EmProducao]: 'bg-orange-100 text-orange-800',
  [RequestStatus.Finalizado]: 'bg-emerald-100 text-emerald-800',
};

const MonthlyRequestsTable: React.FC<MonthlyRequestsTableProps> = ({ requests, onOpenNewRequestModal, onOpenEditRequestModal, canManage = true }) => {
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-orange-500" />
                <h3 className="text-lg font-bold text-slate-800">Solicitação de Criativos Mensal</h3>
            </div>
             {canManage && (
                <button
                    onClick={onOpenNewRequestModal}
                    className="flex items-center justify-center bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 ease-in-out text-sm shadow-sm"
                >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Nova Solicitação
                </button>
             )}
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-100">
                    <tr>
                        <th scope="col" className="px-6 py-3">Mês</th>
                        <th scope="col" className="px-6 py-3">Link do Drive</th>
                        <th scope="col" className="px-6 py-3">Data</th>
                        <th scope="col" className="px-6 py-3">Status</th>
                        {canManage && <th scope="col" className="px-6 py-3 text-center">Ações</th>}
                    </tr>
                </thead>
                <tbody>
                    {requests.map((req) => (
                        <tr key={req.RequestID} className="bg-white border-b hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-bold text-slate-900">
                                {req.MesReferencia}
                            </td>
                            <td className="px-6 py-4">
                                {req.LinkDrive ? (
                                    <a 
                                        href={req.LinkDrive} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="text-orange-500 hover:text-orange-800 flex items-center font-medium"
                                    >
                                        Acessar Pasta <ExternalLinkIcon className="w-4 h-4 ml-1.5" />
                                    </a>
                                ) : <span className="text-slate-400 italic">Sem link</span>}
                            </td>
                            <td className="px-6 py-4 font-medium">{formatDate(req.DataSolicitacao)}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider ${statusStylesRequest[req.Status]}`}>
                                    {req.Status}
                                </span>
                            </td>
                            {canManage && (
                                <td className="px-6 py-4 flex items-center justify-center space-x-4">
                                    <button 
                                        onClick={() => onOpenEditRequestModal(req)} 
                                        className="p-2 text-slate-400 hover:text-orange-500 bg-slate-100 hover:bg-white rounded-full transition-all"
                                        title="Editar Solicitação"
                                    >
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        
        {requests.length === 0 && (
            <div className="text-center py-12 text-slate-400">
                Nenhuma solicitação mensal registrada para este cliente.
            </div>
        )}
    </div>
  );
};

export default MonthlyRequestsTable;
