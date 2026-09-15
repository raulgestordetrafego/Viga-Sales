
import React from 'react';
import { Creative, CreativeStatus } from '../types';
import { PlusIcon, EyeIcon, PencilIcon } from './icons';

interface CreativesTableProps {
  creatives: Creative[];
  onOpenNewCreativeModal: () => void;
  onOpenEditCreativeModal: (creative: Creative) => void;
  canManage?: boolean;
}

const statusStylesCreative: { [key in CreativeStatus]: string } = {
  [CreativeStatus.Aprovado]: 'bg-emerald-100 text-emerald-800',
  [CreativeStatus.Pendente]: 'bg-slate-100 text-slate-800',
  [CreativeStatus.Reprovado]: 'bg-rose-100 text-rose-800',
  [CreativeStatus.EmAnalise]: 'bg-amber-100 text-amber-800',
};

const CreativesTable: React.FC<CreativesTableProps> = ({ creatives, onOpenNewCreativeModal, onOpenEditCreativeModal, canManage = true }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm">
        <div className="p-4 border-b flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <h3 className="text-lg font-bold text-slate-800">Controle de Criativos</h3>
             {canManage && (
                <button
                    onClick={onOpenNewCreativeModal}
                    className="flex items-center justify-center bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 ease-in-out text-sm"
                >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Novo Criativo
                </button>
             )}
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden p-4 space-y-4">
            {creatives.map((creative) => (
                <div key={creative.CriativoID} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                        <h4 className="font-bold text-slate-800 break-all">{creative.Nome}</h4>
                        <span className={`px-2 py-1 rounded-full font-semibold text-xs whitespace-nowrap ${statusStylesCreative[creative.Status]}`}>{creative.Status}</span>
                    </div>
                     <div className="text-sm text-slate-600 space-y-1 pt-2 border-t">
                        <p><strong>Formato:</strong> {creative.Formato}</p>
                        <p><strong>Canal:</strong> {creative.Canal}</p>
                        <p><strong>Data:</strong> {formatDate(creative.DataCriacao)}</p>
                        <p><strong>Performance:</strong> {creative.Performance || '-'}</p>
                     </div>
                     <div className="flex items-center justify-end space-x-4 pt-2 border-t">
                        <a href={creative.LinkVisualizacao} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm font-medium text-orange-500 hover:text-orange-800" title="Visualizar">
                            <EyeIcon className="w-5 h-5 mr-1" /> Ver
                        </a>
                        {canManage && (
                            <button onClick={() => onOpenEditCreativeModal(creative)} className="flex items-center text-sm font-medium text-slate-600 hover:text-orange-500" title="Editar">
                                <PencilIcon className="w-5 h-5 mr-1" /> Editar
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                    <tr>
                        <th scope="col" className="px-6 py-3">Nome</th>
                        <th scope="col" className="px-6 py-3">Formato</th>
                        <th scope="col" className="px-6 py-3">Canal</th>
                        <th scope="col" className="px-6 py-3">Data</th>
                        <th scope="col" className="px-6 py-3">Status</th>
                        <th scope="col" className="px-6 py-3">Performance</th>
                        <th scope="col" className="px-6 py-3 text-center">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {creatives.map((creative) => (
                        <tr key={creative.CriativoID} className="bg-white border-b hover:bg-slate-50">
                            <th scope="row" className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                                {creative.Nome}
                            </th>
                            <td className="px-6 py-4">{creative.Formato}</td>
                            <td className="px-6 py-4">{creative.Canal}</td>
                            <td className="px-6 py-4">{formatDate(creative.DataCriacao)}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full font-semibold text-xs ${statusStylesCreative[creative.Status]}`}>
                                    {creative.Status}
                                </span>
                            </td>
                            <td className="px-6 py-4">{creative.Performance || '-'}</td>
                            <td className="px-6 py-4 flex items-center justify-center space-x-4">
                                <a href={creative.LinkVisualizacao} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-orange-500" title="Visualizar">
                                    <EyeIcon className="w-5 h-5" />
                                </a>
                                {canManage && (
                                    <button onClick={() => onOpenEditCreativeModal(creative)} className="text-slate-500 hover:text-orange-500" title="Editar">
                                        <PencilIcon className="w-5 h-5" />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        
        {creatives.length === 0 && (
            <div className="text-center py-10 text-slate-500">
                Nenhum criativo encontrado.
            </div>
        )}
    </div>
  );
};

export default CreativesTable;
