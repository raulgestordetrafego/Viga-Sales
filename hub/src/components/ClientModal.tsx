
import React, { useState, useEffect } from 'react';
import { Client, MoodStatus } from '../types';
import { XIcon, CubeIcon, UsersIcon, PhotoIcon, CurrencyDollarIcon, SparklesIcon, Cog6ToothIcon, BanknotesIcon, LightBulbIcon, ClipboardCheckIcon, MapPinIcon, PhoneIcon } from './icons';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (clientData: Client) => void;
  client: Client | null;
}

const ClientModal: React.FC<ClientModalProps> = ({ isOpen, onClose, onSave, client }) => {
  const [squads, setSquads] = useState([{ id: 'geral', nome: 'Geral' }]);
  
  const getInitialState = (): Client => ({
    ClienteID: client?.ClienteID || '',
    Nome: client?.Nome || '',
    Nicho: client?.Nicho || '',
    Responsavel: client?.Responsavel || '',
    //@ts-ignore
    contatoStake: client?.contatoStake || '',
    SquadID: client?.SquadID || '',
    DiaOtimizacao: client?.DiaOtimizacao || 'Segunda',
    Filmagem: client?.Filmagem || 'Não',
    OrcamentoMensal: client?.OrcamentoMensal || 0,
    StatusCliente: client?.StatusCliente || 'Ativo',
    mood: client?.mood || MoodStatus.Verde,
    NovosSeguidores: client?.NovosSeguidores || 0,
    ticketMedio: client?.ticketMedio || 0,
    receitaGerada: client?.receitaGerada || 0,
    faturamentoMedio: client?.faturamentoMedio || 0,
    servicosVendidos: client?.servicosVendidos || '',
    metaAdsLink: client?.metaAdsLink || '',
    googleAdsLink: client?.googleAdsLink || '',
    instagram: client?.instagram || '',
    resumo: client?.resumo || '',
    doresDesejos: client?.doresDesejos || '',
    produtoPrincipal: client?.produtoPrincipal || '',
    fotoUrl: client?.fotoUrl || '',
    logoUrl: client?.logoUrl || '',
    identidadeVisualUrl: client?.identidadeVisualUrl || '',
    observacoes: client?.observacoes || '',
    metaAdAccountId: client?.metaAdAccountId || '',
    metaFormId: client?.metaFormId || '',
    usingN8N: client?.usingN8N || false,
    //@ts-ignore
    endereco: client?.endereco || '',
  });

  const [formData, setFormData] = useState<Client>(getInitialState());

  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialState());
    }
  }, [isOpen, client]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const isNumber = ['OrcamentoMensal', 'NovosSeguidores', 'ticketMedio', 'receitaGerada', 'faturamentoMedio'].includes(name);
    const isCheckbox = type === 'checkbox';
    
    setFormData(prev => ({ 
        ...prev, 
        [name]: isCheckbox ? (e.target as HTMLInputElement).checked : (isNumber ? Number(value) : value) 
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{client ? 'Ficha de Edição Completa' : 'Novo Cliente'}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{formData.Nome || 'Dados Gerais'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-slate-400 transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10">
          
          {/* Sessão: Identificação */}
          <section className="space-y-6">
            <h3 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] flex items-center gap-2">
               <UsersIcon className="w-4 h-4" /> Identificação do Cliente
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nome do Cliente</label>
                    <input type="text" name="Nome" value={formData.Nome} onChange={handleChange} required className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nicho / Segmento</label>
                    <input type="text" name="Nicho" value={formData.Nicho} onChange={handleChange} className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all" />
                </div>
            </div>
          </section>

          {/* Sessão: Financeiro */}
          <section className="space-y-6">
            <h3 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] flex items-center gap-2">
               <CurrencyDollarIcon className="w-4 h-4" /> Dados Financeiros
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Receita Gerada (CRM)</label>
                    <input type="number" name="receitaGerada" value={formData.receitaGerada} onChange={handleChange} className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Faturamento Médio Mensal</label>
                    <input type="number" name="faturamentoMedio" value={formData.faturamentoMedio} onChange={handleChange} className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all" />
                </div>
            </div>
          </section>

          {/* Sessão: Estratégia */}
          <section className="space-y-6">
            <h3 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] flex items-center gap-2">
               <LightBulbIcon className="w-4 h-4" /> Estratégia e Briefing
            </h3>
            <div className="space-y-6">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Serviços Contratados</label>
                    <input type="text" name="servicosVendidos" value={formData.servicosVendidos} onChange={handleChange} placeholder="Ex: Gestão de Tráfego + Criativos" className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Resumo Executivo</label>
                    <textarea name="resumo" value={formData.resumo} onChange={handleChange} rows={3} className="w-full bg-slate-50 border-slate-200 rounded-xl font-medium text-sm py-3 px-4 focus:bg-white transition-all resize-none" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Dores e Desejos do Público Alvo</label>
                    <textarea name="doresDesejos" value={formData.doresDesejos} onChange={handleChange} rows={3} className="w-full bg-slate-50 border-slate-200 rounded-xl font-medium text-sm py-3 px-4 focus:bg-white transition-all resize-none" />
                </div>
            </div>
          </section>

          {/* Sessão: Identidade Visual (Destaque) */}
          <section className="p-6 bg-slate-900 rounded-[2rem] text-white space-y-6">
            <h3 className="text-xs font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-2">
               <SparklesIcon className="w-4 h-4" /> Identidade Visual
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">Link do Manual da Marca / Identidade</label>
                    <input type="url" name="identidadeVisualUrl" value={formData.identidadeVisualUrl} onChange={handleChange} placeholder="https://..." className="w-full bg-white/5 border-white/10 rounded-xl font-medium text-sm py-3 px-4 focus:bg-white/10 transition-all text-white outline-none" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">URL do Logo (Imagem PNG/SVG)</label>
                    <input type="url" name="logoUrl" value={formData.logoUrl} onChange={handleChange} placeholder="https://..." className="w-full bg-white/5 border-white/10 rounded-xl font-medium text-sm py-3 px-4 focus:bg-white/10 transition-all text-white outline-none" />
                </div>
            </div>
          </section>

          {/* Sessão: Produto e Orçamento */}
          <section className="space-y-6">
            <h3 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] flex items-center gap-2">
               <BanknotesIcon className="w-4 h-4" /> Produto e Investimento
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Produto / Serviço Principal</label>
                    <input type="text" name="produtoPrincipal" value={formData.produtoPrincipal} onChange={handleChange} className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Orçamento de Tráfego Mensal (R$)</label>
                    <input type="number" name="OrcamentoMensal" value={formData.OrcamentoMensal} onChange={handleChange} className="w-full bg-slate-50 border-slate-200 rounded-xl font-black py-3 px-4 focus:bg-white transition-all text-orange-500" />
                </div>
            </div>
          </section>

          {/* Sessão: Conexão Meta API (Integrada) */}
          <section className="space-y-6 border-t pt-10">
            <h3 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] flex items-center gap-2">
               <Cog6ToothIcon className="w-4 h-4" /> Conexão Meta API
            </h3>
            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">ID da Conta de Anúncio</label>
                        <input type="text" name="metaAdAccountId" value={formData.metaAdAccountId} onChange={handleChange} placeholder="Ex: act_7500..." className="w-full bg-white border-slate-200 rounded-xl font-mono text-xs py-3 px-4" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">ID do Formulário (Opcional)</label>
                        <input type="text" name="metaFormId" value={formData.metaFormId} onChange={handleChange} className="w-full bg-white border-slate-200 rounded-xl font-mono text-xs py-3 px-4" />
                    </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-orange-500 rounded-2xl text-white">
                    <input type="checkbox" name="usingN8N" checked={formData.usingN8N} onChange={handleChange} className="w-5 h-5 rounded border-white/20 text-orange-500 focus:ring-0" />
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest">Ativar n8n Live Sync</p>
                        <p className="text-[9px] text-orange-100 font-medium">Habilita a automação de captura de leads em tempo real.</p>
                    </div>
                </div>
            </div>
          </section>

          {/* Sessão: Contatos e Endereço */}
          <section className="space-y-6">
            <h3 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] flex items-center gap-2">
               <UsersIcon className="w-4 h-4" /> Contatos e Localização
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Instagram / Contato</label>
                    <input type="text" name="instagram" value={formData.instagram} onChange={handleChange} placeholder="@usuario" className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Dia de Otimização</label>
                    <select name="DiaOtimizacao" value={formData.DiaOtimizacao} onChange={handleChange} className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all">
                        {['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
            </div>
            <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 flex items-center gap-1">
                    <MapPinIcon className="w-3 h-3" /> Endereço Comercial
                </label>
                {//@ts-ignore
                <input type="text" name="endereco" value={formData.endereco} onChange={handleChange} placeholder="Rua, Número, Bairro, Cidade - UF" className="w-full bg-slate-50 border-slate-200 rounded-xl font-medium text-sm py-3 px-4 focus:bg-white transition-all" />
                }
            </div>
          </section>

          {/* Sessão: Notas Internas */}
          <section className="space-y-6">
            <h3 className="text-xs font-black text-orange-500 uppercase tracking-[0.2em] flex items-center gap-2">
               <ClipboardCheckIcon className="w-4 h-4" /> Notas e Squad
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Stake</label>
                    <input type="text" name="Responsavel" value={formData.Responsavel} onChange={handleChange} className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Contato do Stake</label>
                    {//@ts-ignore
                    <input type="text" name="contatoStake" value={formData.contatoStake} onChange={handleChange} placeholder="(00) 00000-0000" className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all" />
                    }
                </div>
                <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Squad Atribuído</label>
                    <select name="SquadID" value={formData.SquadID} onChange={handleChange} className="w-full bg-slate-50 border-slate-200 rounded-xl font-bold py-3 px-4 focus:bg-white transition-all">
                        <option value="">Sem Squad</option>
                        {squads.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
                    </select>
                </div>
            </div>
            <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Observações Internas</label>
                <textarea name="observacoes" value={formData.observacoes} onChange={handleChange} rows={4} className="w-full bg-slate-50 border-slate-200 rounded-xl font-medium text-sm py-3 px-4 focus:bg-white transition-all resize-none" />
            </div>
          </section>

        </form>
        
        <div className="p-6 bg-white border-t flex justify-end gap-3 sticky bottom-0 z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
          <button type="button" onClick={onClose} className="px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
          <button onClick={handleSubmit} className="px-10 py-4 bg-orange-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-orange-700 transition-all shadow-xl shadow-orange-100 active:scale-95">Salvar Alterações</button>
        </div>
      </div>
    </div>
  );
};

export default ClientModal;
