import React, { useState, useEffect } from 'react';
import { Creative, Client, CreativeStatus } from '../types';
import { XIcon } from './icons';

interface CreativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (creativeData: Omit<Creative, 'CriativoID'> | Creative) => void;
  creative: Creative | null;
  clients: Client[];
  initialClientId: string | null;
}

const CreativeModal: React.FC<CreativeModalProps> = ({ isOpen, onClose, onSave, creative, clients, initialClientId }) => {
  const getInitialState = () => ({
    ClienteID: creative?.ClienteID || initialClientId || '',
    Nome: creative?.Nome || '',
    Formato: creative?.Formato || 'Vídeo',
    Canal: creative?.Canal || 'Meta',
    Status: creative?.Status || CreativeStatus.Pendente,
    LinkVisualizacao: creative?.LinkVisualizacao || '',
    Performance: creative?.Performance || '',
  });

  const [formData, setFormData] = useState(getInitialState());

  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialState());
    }
  }, [isOpen, creative, initialClientId]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSave = {
      ...formData,
      DataCriacao: creative?.DataCriacao || new Date().toISOString(),
    };
    if (creative) {
      onSave({ ...creative, ...dataToSave });
    } else {
      onSave(dataToSave);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">{creative ? 'Editar Criativo' : 'Novo Criativo'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-1 md:col-span-2">
              <label htmlFor="ClienteID" className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
              <select name="ClienteID" id="ClienteID" value={formData.ClienteID} onChange={handleChange} required disabled={!!initialClientId || !!creative} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-100">
                <option value="" disabled>Selecione um cliente</option>
                {clients.map(c => <option key={c.ClienteID} value={c.ClienteID}>{c.Nome}</option>)}
              </select>
            </div>
            <div className="col-span-1 md:col-span-2">
              <label htmlFor="Nome" className="block text-sm font-medium text-slate-700 mb-1">Nome do Criativo</label>
              <input type="text" name="Nome" id="Nome" value={formData.Nome} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            </div>
             <div className="col-span-1 md:col-span-2">
              <label htmlFor="LinkVisualizacao" className="block text-sm font-medium text-slate-700 mb-1">Link de Visualização</label>
              <input type="url" name="LinkVisualizacao" id="LinkVisualizacao" value={formData.LinkVisualizacao} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            </div>
            <div>
              <label htmlFor="Formato" className="block text-sm font-medium text-slate-700 mb-1">Formato</label>
              <select name="Formato" id="Formato" value={formData.Formato} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500">
                {['Vídeo', 'Imagem', 'Carrossel', 'Stories'].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="Canal" className="block text-sm font-medium text-slate-700 mb-1">Canal</label>
              <select name="Canal" id="Canal" value={formData.Canal} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500">
                 {['Meta', 'Google', 'TikTok', 'Outro'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
                <label htmlFor="Status" className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select name="Status" id="Status" value={formData.Status} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500">
                    {Object.values(CreativeStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <div>
              <label htmlFor="Performance" className="block text-sm font-medium text-slate-700 mb-1">Performance</label>
              <input type="text" name="Performance" id="Performance" value={formData.Performance} onChange={handleChange} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            </div>
          </div>
          <div className="p-6 bg-slate-50 rounded-b-lg flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">Cancelar</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-orange-500 border border-transparent rounded-md hover:bg-orange-700">Salvar Criativo</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreativeModal;
