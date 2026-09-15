import React, { useState, useMemo } from 'react';
import { Lead, LeadStatus, Client } from '../types';
import ActionModal from './ActionModal';
import KanbanColumn from './KanbanColumn';

interface KanbanBoardProps {
  leads: Lead[];
  clients: Client[];
  onLeadUpdate: (updatedLead: Lead) => void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ leads, onLeadUpdate, clients }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    lead: Lead | null;
    targetStatus: LeadStatus | null;
  }>({ isOpen: false, lead: null, targetStatus: null });
  
  const columns = useMemo(() => [
    { status: LeadStatus.Lead, title: 'Lead', color: 'bg-sky-500' },
    { status: LeadStatus.Agendamento, title: 'Agendamento', color: 'bg-amber-500' },
    { status: LeadStatus.Comparecimento, title: 'Comparecimento', color: 'bg-purple-500' },
    { status: LeadStatus.Venda, title: 'Venda', color: 'bg-emerald-500' },
    { status: LeadStatus.Perdido, title: 'Perdido', color: 'bg-rose-500' },
  ], []);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, leadId: string) => {
    e.dataTransfer.setData('leadId', leadId);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, newStatus: LeadStatus) => {
    const leadId = e.dataTransfer.getData('leadId');
    const leadToMove = leads.find(l => l.LeadID === leadId);
    
    if (leadToMove && leadToMove.Status !== newStatus) {
      if (newStatus === LeadStatus.Venda || newStatus === LeadStatus.Perdido) {
        setModalState({ isOpen: true, lead: leadToMove, targetStatus: newStatus });
      } else {
        // FIX: Instead of setting fields to `undefined`, which Firestore rejects,
        // create a new object omitting the unwanted keys.
        const { MotivoPerda, ValorVenda, ...restOfLead } = leadToMove;
        const updatedLead = { ...restOfLead, Status: newStatus };
        onLeadUpdate(updatedLead as Lead);
      }
    }
  };
  
  const handleModalSave = (details: { valorVenda?: number; motivoPerda?: string }) => {
    if (modalState.lead && modalState.targetStatus) {
      // FIX: To ensure data integrity, create a base object and explicitly delete
      // fields that are not relevant to the new status. This prevents carrying over
      // a 'MotivoPerda' when a lead becomes a 'Venda', for example.
      const baseLead: Partial<Lead> = { ...modalState.lead };
      delete baseLead.MotivoPerda;
      delete baseLead.ValorVenda;

      const updatedLead = {
        ...baseLead,
        Status: modalState.targetStatus,
        ...details,
      };
      onLeadUpdate(updatedLead as Lead);
      handleModalClose();
    }
  };

  const handleModalClose = () => {
    setModalState({ isOpen: false, lead: null, targetStatus: null });
  };

  return (
    <>
      <div className="flex space-x-4 pb-4">
        {columns.map(column => (
          <KanbanColumn
            key={column.status}
            status={column.status}
            title={column.title}
            color={column.color}
            leads={leads.filter(lead => lead.Status === column.status)}
            clients={clients}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        ))}
      </div>
      <ActionModal
          isOpen={modalState.isOpen}
          onClose={handleModalClose}
          onSave={handleModalSave}
          status={modalState.targetStatus}
      />
    </>
  );
};

export default KanbanBoard;