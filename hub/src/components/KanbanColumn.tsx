import React, { useMemo } from 'react';
import { Lead, LeadStatus, Client } from '../types';
import LeadCard from './LeadCard';

interface KanbanColumnProps {
  status: LeadStatus;
  title: string;
  color: string;
  leads: Lead[];
  clients: Client[];
  onDragStart: (e: React.DragEvent<HTMLDivElement>, leadId: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, newStatus: LeadStatus) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ status, title, color, leads, clients, onDragStart, onDrop }) => {
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const clientMap = useMemo(() => new Map(clients.map(c => [c.ClienteID, c.Nome])), [clients]);

  return (
    <div
      onDrop={(e) => onDrop(e, status)}
      onDragOver={handleDragOver}
      className="flex flex-col bg-slate-200/70 rounded-xl h-full w-72 sm:w-80 flex-shrink-0"
      aria-label={`Coluna ${title}`}
    >
      <div className={`p-4 rounded-t-xl flex justify-between items-center ${color}`}>
        <h2 className="font-bold text-white text-lg">{title}</h2>
        <span className="bg-white/30 text-white text-sm font-semibold px-3 py-1 rounded-full">{leads.length}</span>
      </div>
      <div className="p-2 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
        {leads.map(lead => (
          <LeadCard 
            key={lead.LeadID} 
            lead={lead} 
            clientName={clientMap.get(lead.ClienteID) || 'Cliente Desconhecido'}
            onDragStart={onDragStart} 
          />
        ))}
      </div>
    </div>
  );
};

export default KanbanColumn;