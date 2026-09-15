import React, { useState, useEffect } from 'react';
import { Lead, Client, LeadStatus } from '../types';
import { XIcon } from './icons';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newLead: Omit<Lead, 'LeadID'>) => void;
  clients: Client[];
  lead?: Lead;
  initialClientId?: string;
}

const LeadModal: React.FC<LeadModalProps> = ({ isOpen, onClose, onSave, clients, lead, initialClientId }) => {
  const getInitialState = () => ({
    ClienteID: lead?.ClienteID || initialClientId || (clients.length > 0 ? clients[0].ClienteID : ''),
    Nome: lead?.Nome || '',
    Telefone: lead?.Telefone || '',
    Origem: lead?.Origem || 'Meta',
    Responsavel: lead?.Responsavel || '',
    Status: lead?.Status || LeadStatus.Lead,
  });

  const [formData, setFormData] = useState(getInitialState());

  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialState());
    }
  }, [isOpen, lead, initialClientId, clients]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      DataEntrada: new Date().toISOString(),
    });
    onClose();
  };
  
  const isNewLeadOnFunnel = !lead && !!initialClientId;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">{lead ? 'Editar Lead' : 'Criar Novo Lead'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="Nome" className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
              <input type="text" name="Nome" id="Nome" value={formData.Nome} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            </div>
            <div>
              <label htmlFor="Telefone" className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
              <input type="tel" name="Telefone" id="Telefone" value={formData.Telefone} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label htmlFor="ClienteID" className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
              <select name="ClienteID" id="ClienteID" value={formData.ClienteID} onChange={handleChange} required disabled={isNewLeadOnFunnel} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-100">
                {clients.map(c => <option key={c.ClienteID} value={c.ClienteID}>{c.Nome}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="Origem" className="block text-sm font-medium text-slate-700 mb-1">Origem</label>
              <input type="text" name="Origem" id="Origem" value={formData.Origem} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            </div>
            <div>
              <label htmlFor="Responsavel" className="block text-sm font-medium text-slate-700 mb-1">Responsável</label>
              <input type="text" name="Responsavel" id="Responsavel" value={formData.Responsavel} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            </div>
          </div>
          <div className="p-6 bg-slate-50 rounded-b-lg flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">Cancelar</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-orange-500 border border-transparent rounded-md hover:bg-orange-700">Salvar Lead</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeadModal;
