
import React, { useState, useRef } from 'react';
import { Client, Lead, LeadStatus } from '../types';
import { PlusIcon, ArrowUpTrayIcon } from './icons';
import LeadModal from './LeadModal';

interface HeaderProps {
  clients: Client[];
  selectedClientId: string;
  onClientChange: (clientId: string) => void;
  onLeadCreate: (newLead: Omit<Lead, 'LeadID'>) => void;
  onBulkLeadCreate: (newLeads: Omit<Lead, 'LeadID'>[]) => Promise<void>;
  filterPeriod: string;
  onPeriodChange: (period: string) => void;
}

const Header: React.FC<HeaderProps> = ({ clients, selectedClientId, onClientChange, onLeadCreate, onBulkLeadCreate, filterPeriod, onPeriodChange }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedClientId) return;

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n');
        const newLeads: Omit<Lead, 'LeadID'>[] = [];
        const timestamp = new Date().toISOString();

        // Pula o cabeçalho se houver (assume que a primeira linha pode ser cabeçalho se contiver "Nome")
        const startIndex = lines[0].toLowerCase().includes('nome') ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Suporta CSV com vírgula ou ponto-e-vírgula
          const columns = line.includes(';') ? line.split(';') : line.split(',');
          
          if (columns.length >= 2) {
            newLeads.push({
              ClienteID: selectedClientId,
              Nome: columns[0]?.trim() || 'Sem Nome',
              Telefone: columns[1]?.trim() || '',
              Origem: columns[2]?.trim() || 'Importação CSV',
              Responsavel: columns[3]?.trim() || 'Sistema',
              Status: LeadStatus.Lead,
              DataEntrada: timestamp
            });
          }
        }

        if (newLeads.length > 0) {
          await onBulkLeadCreate(newLeads);
          alert(`${newLeads.length} leads importados com sucesso!`);
        } else {
          alert("Nenhum lead válido encontrado no arquivo.");
        }
      } catch (err) {
        console.error("Erro ao processar CSV:", err);
        alert("Erro ao processar o arquivo CSV. Verifique o formato.");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsText(file);
  };

  return (
    <>
      <header className="bg-white shadow-sm p-4 border-b border-slate-200 flex-shrink-0">
        <div className="max-w-full mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="w-full sm:w-auto flex-shrink-0">
                <h1 className="text-xl font-bold text-slate-800">Funil por Cliente</h1>
            </div>
            <div className="w-full sm:w-auto flex-grow flex flex-wrap items-center justify-start sm:justify-end gap-4">
                <div className="w-full sm:w-auto sm:flex-1 md:flex-none md:w-64">
                    <label htmlFor="client-select-funnel" className="sr-only">Selecione um cliente</label>
                    <select
                      id="client-select-funnel"
                      value={selectedClientId}
                      onChange={(e) => onClientChange(e.target.value)}
                      className="bg-slate-100 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block w-full p-2.5"
                    >
                      <option value="" disabled>Selecione um Cliente</option>
                      {clients.map(client => (
                        <option key={client.ClienteID} value={client.ClienteID}>{client.Nome}</option>
                      ))}
                    </select>
                </div>
                
                <div className="w-full sm:w-auto flex items-center gap-2">
                    <div className="flex-1 sm:flex-none">
                        <label htmlFor="period-funnel" className="sr-only">Período</label>
                        <input
                          id="period-funnel"
                          type="month"
                          value={filterPeriod}
                          onChange={(e) => onPeriodChange(e.target.value)}
                          className="bg-slate-100 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-orange-500 focus:border-orange-500 block w-full p-2.5 disabled:bg-slate-200"
                          disabled={!selectedClientId}
                        />
                    </div>

                    <div className="flex-shrink-0 flex gap-2">
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleFileChange} 
                          accept=".csv" 
                          className="hidden" 
                        />
                        <button
                          onClick={handleImportClick}
                          disabled={!selectedClientId || isImporting}
                          className="flex items-center justify-center bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-2.5 px-4 rounded-lg transition duration-150 ease-in-out disabled:opacity-50"
                          title="Importar leads de arquivo CSV"
                        >
                          {isImporting ? (
                             <svg className="animate-spin h-5 w-5 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                             </svg>
                          ) : (
                            <>
                              <ArrowUpTrayIcon className="w-5 h-5 sm:mr-2" />
                              <span className="hidden sm:inline">Importar</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => setIsModalOpen(true)}
                          className="flex items-center justify-center bg-orange-500 hover:bg-orange-700 text-white font-bold py-2.5 px-4 rounded-lg transition duration-150 ease-in-out disabled:bg-orange-300 h-full w-full sm:w-auto"
                          disabled={!selectedClientId}
                          title="Criar Novo Lead"
                        >
                          <PlusIcon className="w-5 h-5 sm:mr-2" />
                          <span className="hidden sm:inline">Criar Lead</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </header>
      <LeadModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={onLeadCreate}
        clients={clients}
        initialClientId={selectedClientId}
      />
    </>
  );
};

export default Header;
