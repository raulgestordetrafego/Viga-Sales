
import React, { useState, useMemo, useEffect } from 'react';
import Header from '../components/Header';
import KanbanBoard from '../components/KanbanBoard';
import { Client, Lead } from '../types';

interface LeadsFunnelPageProps {
  leads: Lead[];
  clients: Client[];
  onLeadUpdate: (updatedLead: Lead) => void;
  onLeadCreate: (newLead: Omit<Lead, 'LeadID'>) => void;
  onBulkLeadCreate: (newLeads: Omit<Lead, 'LeadID'>[]) => Promise<void>;
  initialClientId?: string | null;
}

const LeadsFunnelPage: React.FC<LeadsFunnelPageProps> = ({ leads, clients, onLeadUpdate, onLeadCreate, onBulkLeadCreate, initialClientId }) => {
  const [filterPeriod, setFilterPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [selectedClientId, setSelectedClientId] = useState<string>(initialClientId || clients[0]?.ClienteID || '');

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
    } else if (clients.length > 0 && !selectedClientId) {
      setSelectedClientId(clients[0].ClienteID);
    }
  }, [initialClientId, clients, selectedClientId]);

  const filteredLeads = useMemo(() => {
    return selectedClientId 
      ? leads.filter(lead => lead.ClienteID === selectedClientId && lead.DataEntrada.startsWith(filterPeriod))
      : [];
  }, [leads, selectedClientId, filterPeriod]);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header 
        clients={clients}
        selectedClientId={selectedClientId}
        onClientChange={setSelectedClientId}
        onLeadCreate={onLeadCreate}
        onBulkLeadCreate={onBulkLeadCreate}
        filterPeriod={filterPeriod}
        onPeriodChange={setFilterPeriod}
      />
      <main className="flex-1 overflow-hidden p-4 sm:p-6 lg:p-8 flex flex-col">
          {selectedClientId ? (
            <div className="flex-1 overflow-x-auto kanban-scroll">
              <KanbanBoard leads={filteredLeads} onLeadUpdate={onLeadUpdate} clients={clients} />
            </div>
          ) : (
              <div className="flex items-center justify-center h-full">
                  <p className="text-slate-500 text-lg">Por favor, selecione um cliente para visualizar o funil de leads.</p>
              </div>
          )}
      </main>
    </div>
  );
};

export default LeadsFunnelPage;
