import React from 'react';
import { Lead } from '../types';
import { PhoneIcon, UserIcon, CalendarIcon, TagIcon } from './icons';

interface LeadCardProps {
  lead: Lead;
  clientName: string;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, leadId: string) => void;
}

const LeadCard: React.FC<LeadCardProps> = ({ lead, clientName, onDragStart }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.LeadID)}
      className="bg-white p-4 rounded-lg shadow-md border border-slate-200 cursor-grab active:cursor-grabbing"
      aria-labelledby={`lead-name-${lead.LeadID}`}
    >
      <div className="mb-3">
        <h3 id={`lead-name-${lead.LeadID}`} className="font-bold text-slate-800">{lead.Nome}</h3>
        <p className="text-xs text-slate-500 font-medium">{clientName}</p>
      </div>
      <div className="space-y-2 text-sm text-slate-600">
        <div className="flex items-center">
          <PhoneIcon className="w-4 h-4 mr-2 text-slate-400" aria-hidden="true" />
          <span>{lead.Telefone}</span>
        </div>
        <div className="flex items-center">
          <UserIcon className="w-4 h-4 mr-2 text-slate-400" aria-hidden="true" />
          <span>{lead.Responsavel}</span>
        </div>
        <div className="flex items-center">
          <CalendarIcon className="w-4 h-4 mr-2 text-slate-400" aria-hidden="true" />
          <span>{formatDate(lead.DataEntrada)}</span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-200">
        <span className="inline-flex items-center bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-1 rounded-full">
          <TagIcon className="w-3 h-3 mr-1.5" aria-hidden="true" />
          {lead.Origem}
        </span>
      </div>
    </div>
  );
};

export default LeadCard;
