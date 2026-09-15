
import React, { useState, useEffect } from 'react';
import { MonthlyCreativeRequest, Client, RequestStatus } from '../types';
import { XIcon } from './icons';

interface MonthlyRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (requestData: Omit<MonthlyCreativeRequest, 'RequestID'> | MonthlyCreativeRequest) => void;
  request: MonthlyCreativeRequest | null;
  clients: Client[];
  initialClientId: string | null;
}

const MonthlyRequestModal: React.FC<MonthlyRequestModalProps> = ({ isOpen, onClose, onSave, request, clients, initialClientId }) => {
  const getInitialState = () => ({
    ClienteID: request?.ClienteID || initialClientId || '',
    MesReferencia: request?.MesReferencia || '',
    LinkDrive: request?.LinkDrive || '',
    Status: request?.Status || RequestStatus.Pendente,
    DataSolicitacao: request?.DataSolicitacao ? request.DataSolicitacao.substring(0, 10) : new Date().toISOString().substring(0, 10)
  });

  const [formData, setFormData] = useState(getInitialState());

  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialState());
    }
  }, [isOpen, request, initialClientId]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (request) {
      onSave({ ...request, ...formData });
    } else {
      onSave(formData);
    }
  };

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="p-6 border-b flex justify-between items-center bg-orange-500 text-white">
          <h2 className="text-xl font-bold">{request ? 'Editar Solicitação' : 'Nova Solicitação Mensal'}</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            <div>
              <label htmlFor="ClienteID" className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-1.5">Cliente</label>
              <select name="ClienteID" id="ClienteID" value={formData.ClienteID} onChange={handleChange} required disabled={!!initialClientId || !!request} className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-50 font-bold text-slate-700">
                <option value="" disabled>Selecione um cliente</option>
                {clients.map(c => <option key={c.ClienteID} value={c.ClienteID}>{c.Nome}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                <label htmlFor="MesReferencia" className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-1.5">Mês de Referência</label>
                <select name="MesReferencia" id="MesReferencia" value={formData.MesReferencia} onChange={handleChange} required className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-orange-500 focus:border-orange-500 font-bold text-slate-700">
                    <option value="">Escolha o mês</option>
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                </div>
                <div>
                    <label htmlFor="DataSolicitacao" className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-1.5">Data da Solicitação</label>
                    <input type="date" name="DataSolicitacao" id="DataSolicitacao" value={formData.DataSolicitacao} onChange={handleChange} required className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-orange-500 focus:border-orange-500 font-bold text-slate-700" />
                </div>
            </div>

            <div>
              <label htmlFor="LinkDrive" className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-1.5">Link da Pasta (Drive)</label>
              <input type="url" name="LinkDrive" id="LinkDrive" value={formData.LinkDrive} onChange={handleChange} placeholder="https://drive.google.com/..." className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-orange-500 focus:border-orange-500 p-3 bg-slate-50/50" />
            </div>

            <div>
                <label htmlFor="Status" className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-1.5">Status da Produção</label>
                <select name="Status" id="Status" value={formData.Status} onChange={handleChange} required className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-orange-500 focus:border-orange-500 font-bold text-slate-700">
                    {Object.values(RequestStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
          </div>
          <div className="p-6 bg-slate-50 border-t flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">Cancelar</button>
            <button type="submit" className="px-6 py-2.5 text-sm font-black text-white bg-orange-500 rounded-xl hover:bg-orange-700 shadow-lg shadow-orange-200 active:scale-95 transition-all">Salvar Solicitação</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MonthlyRequestModal;
