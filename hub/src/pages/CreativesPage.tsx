
import React, { useState, useMemo } from 'react';
import { Client, Creative, MonthlyCreativeRequest } from '../types';
import CreativesTable from '../components/CreativesTable';
import MonthlyRequestsTable from '../components/MonthlyRequestsTable';
import { MagnifyingGlassIcon, PhotoIcon } from '../components/icons';

interface CreativesPageProps {
  clients: Client[];
  creatives: Creative[];
  monthlyRequests: MonthlyCreativeRequest[];
  onOpenNewCreativeModal: (clientId: string) => void;
  onOpenEditCreativeModal: (creative: Creative) => void;
  onOpenNewMonthlyRequestModal: (clientId: string) => void;
  onOpenEditMonthlyRequestModal: (request: MonthlyCreativeRequest) => void;
}

const CreativesPage: React.FC<CreativesPageProps> = ({ 
    clients, 
    creatives, 
    monthlyRequests, 
    onOpenNewCreativeModal, 
    onOpenEditCreativeModal,
    onOpenNewMonthlyRequestModal,
    onOpenEditMonthlyRequestModal
}) => {
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCreatives = useMemo(() => {
    if (!selectedClientId) return [];
    
    return creatives.filter(creative =>
      creative.ClienteID === selectedClientId &&
      creative.Nome.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [creatives, selectedClientId, searchTerm]);

  const filteredRequests = useMemo(() => {
    if (!selectedClientId) return [];
    return monthlyRequests.filter(req => req.ClienteID === selectedClientId);
  }, [monthlyRequests, selectedClientId]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-full mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Gerenciador de Criativos</h1>
        <p className="text-slate-500 mt-1">Filtre por cliente para visualizar e gerenciar os criativos.</p>
      </header>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="w-full md:w-1/3">
          <label htmlFor="client-select" className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
          <select
            id="client-select"
            value={selectedClientId}
            onChange={(e) => {
              setSelectedClientId(e.target.value);
              setSearchTerm('');
            }}
            className="w-full border border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 bg-white text-slate-900 p-2.5"
          >
            <option value="">Selecione um cliente</option>
            {clients.map(client => (
              <option key={client.ClienteID} value={client.ClienteID}>{client.Nome}</option>
            ))}
          </select>
        </div>
        <div className="w-full md:w-2/3">
          <label htmlFor="creative-search" className="block text-sm font-medium text-slate-700 mb-1">Buscar por nome do criativo</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              id="creative-search"
              placeholder="Ex: Promoção de Inverno..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={!selectedClientId}
              className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-md shadow-sm bg-white text-slate-900 placeholder-slate-500 focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-100"
            />
          </div>
        </div>
      </div>

      {selectedClientId ? (
        <div className="space-y-10">
          <CreativesTable
            creatives={filteredCreatives}
            onOpenNewCreativeModal={() => onOpenNewCreativeModal(selectedClientId)}
            onOpenEditCreativeModal={onOpenEditCreativeModal}
          />
          
          <MonthlyRequestsTable 
            requests={filteredRequests}
            onOpenNewRequestModal={() => onOpenNewMonthlyRequestModal(selectedClientId)}
            onOpenEditRequestModal={onOpenEditMonthlyRequestModal}
          />
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm">
          <PhotoIcon className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-semibold text-slate-900">Nenhum cliente selecionado</h3>
          <p className="mt-1 text-sm text-slate-500">Por favor, selecione um cliente no filtro acima para ver seus criativos.</p>
        </div>
      )}
    </div>
  );
};

export default CreativesPage;
