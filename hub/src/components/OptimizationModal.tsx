
import React, { useState, useEffect } from 'react';
import { Optimization, Client, OptimizationStatus, EfetividadeStatus } from '../types';
import { XIcon } from './icons';
import { useAuth } from '../contexts/AuthContext';

interface OptimizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (optimizationData: Omit<Optimization, 'OtimizacaoID'> | Optimization) => void;
  optimization: Partial<Optimization> | null;
  clients: Client[];
}

const OptimizationModal: React.FC<OptimizationModalProps> = ({ isOpen, onClose, onSave, optimization, clients }) => {
  const { userProfile, currentUser } = useAuth();

  // Determina o nome do responsável (Nome do perfil > UID > 'Usuário')
  const activeUserLabel = userProfile?.displayName || currentUser?.uid || 'Usuário';

  const getInitialState = () => ({
    ClienteID: optimization?.ClienteID || '',
    // Se estiver editando, mantém o responsável original, se for novo, usa o usuário logado
    Responsavel: optimization?.Responsavel || activeUserLabel,
    Status: optimization?.Status || OptimizationStatus.Pendente,
    Descricao: optimization?.Descricao || '',
    FonteTrafego: optimization?.FonteTrafego || 'Meta',
    HipóteseResultado: optimization?.HipóteseResultado || '',
    Efetividade: optimization?.Efetividade || EfetividadeStatus.NaoAvaliado,
    Data: optimization?.Data ? optimization.Data.substring(0, 10) : new Date().toISOString().substring(0, 10)
  });

  const [formData, setFormData] = useState(getInitialState());

  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialState());
    }
  }, [isOpen, optimization, userProfile, currentUser]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // FIX: Validate date to prevent RangeError from invalid time values.
    // By parsing the date as UTC noon, we also avoid timezone-related bugs where the date could shift by a day.
    const date = new Date(formData.Data + 'T12:00:00Z');
    if (!formData.Data || isNaN(date.getTime())) {
      console.error("Data inválida fornecida. Não é possível salvar a otimização.");
      // TODO: Add user-facing error feedback.
      return;
    }

    const dataToSave = {
        ...formData,
        Data: date.toISOString(),
    };

    if (optimization && 'OtimizacaoID' in optimization) {
      onSave({ ...optimization, ...dataToSave } as Optimization);
    } else {
      onSave(dataToSave);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">{optimization?.OtimizacaoID ? 'Editar Otimização' : 'Registrar Otimização'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="ClienteID" className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
              <select name="ClienteID" id="ClienteID" value={formData.ClienteID} onChange={handleChange} required disabled className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-100">
                <option value="">Selecione...</option>
                {clients.map(c => <option key={c.ClienteID} value={c.ClienteID}>{c.Nome}</option>)}
              </select>
            </div>
            <div>
                <label htmlFor="Data" className="block text-sm font-medium text-slate-700 mb-1">Data</label>
                <input type="date" name="Data" id="Data" value={formData.Data} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            </div>
            {/* Campo Responsável Adicionado */}
            <div className="col-span-1 md:col-span-2">
                <label htmlFor="Responsavel" className="block text-sm font-medium text-slate-700 mb-1">Responsável</label>
                <input 
                  type="text" 
                  name="Responsavel" 
                  id="Responsavel" 
                  value={formData.Responsavel} 
                  onChange={handleChange} 
                  disabled // Desabilitado para garantir que seja o usuário ativo ou o original
                  className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 bg-slate-100 text-slate-600 cursor-not-allowed" 
                />
            </div>
            <div className="col-span-1 md:col-span-2">
                <label htmlFor="Descricao" className="block text-sm font-medium text-slate-700 mb-1">Descrição da Otimização</label>
                <textarea name="Descricao" id="Descricao" value={formData.Descricao} onChange={handleChange} rows={4} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            </div>
             <div>
                <label htmlFor="FonteTrafego" className="block text-sm font-medium text-slate-700 mb-1">Fonte de Tráfego</label>
                <select name="FonteTrafego" id="FonteTrafego" value={formData.FonteTrafego} onChange={handleChange} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500">
                    {['Meta', 'Google', 'Outro'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="Status" className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select name="Status" id="Status" value={formData.Status} onChange={handleChange} required className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500">
                    {Object.values(OptimizationStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
             <div className="col-span-1 md:col-span-2">
                <label htmlFor="HipóteseResultado" className="block text-sm font-medium text-slate-700 mb-1">Hipótese/Resultado</label>
                <textarea name="HipóteseResultado" id="HipóteseResultado" value={formData.HipóteseResultado} onChange={handleChange} rows={3} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500" />
            </div>
             <div>
                <label htmlFor="Efetividade" className="block text-sm font-medium text-slate-700 mb-1">Efetividade</label>
                <select name="Efetividade" id="Efetividade" value={formData.Efetividade} onChange={handleChange} className="w-full border-slate-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500">
                    {Object.values(EfetividadeStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
          </div>
          <div className="p-6 bg-slate-50 rounded-b-lg flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">Cancelar</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-orange-500 border border-transparent rounded-md hover:bg-orange-700">Salvar Otimização</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OptimizationModal;
