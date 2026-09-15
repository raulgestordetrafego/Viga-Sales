import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { XIcon, CubeIcon, ExternalLinkIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, ClipboardCheckIcon, LightBulbIcon, ChevronDownIcon, LockClosedIcon, ShieldCheckIcon, UserPlusIcon, MagnifyingGlassIcon } from './icons';

interface MetaConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (clientData: Client) => void;
  client: Client | null;
}

const MetaConfigModal: React.FC<MetaConfigModalProps> = ({ isOpen, onClose, onSave, client }) => {
  const [adAccountId, setAdAccountId] = useState('');
  const [metaFormId, setMetaFormId] = useState('');
  const [usingN8N, setUsingN8N] = useState(false);
  const [copied, setCopied] = useState(false);
  const [authMethod, setAuthMethod] = useState<'service_account' | 'oauth2'>('service_account');
  const [showKeyErrorHelp, setShowKeyErrorHelp] = useState(false);

  useEffect(() => {
    if (isOpen && client) {
      setAdAccountId(client.metaAdAccountId || '');
      setMetaFormId(client.metaFormId || '');
      setUsingN8N(client.usingN8N || false);
    }
  }, [isOpen, client]);

  if (!isOpen || !client) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = adAccountId.replace(/^act_/, '').trim();
    onSave({
      ...client,
      metaAdAccountId: cleanId,
      metaFormId: metaFormId.trim(),
      usingN8N: usingN8N
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        <div className="p-6 border-b flex justify-between items-center bg-orange-500 flex-shrink-0">
          <div className="flex items-center">
            <div className="p-2 bg-white/20 rounded-lg mr-3">
               <CubeIcon className="w-6 h-6 text-white" />
            </div>
            <div>
                 <h2 className="text-lg font-bold text-white">Integração n8n e API</h2>
                 <p className="text-xs text-orange-100">{client.Nome} • Configuração</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-6 space-y-6">
            
            <div className="bg-slate-900 rounded-xl p-5 text-white shadow-inner border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Método de Conexão n8n</h3>
                    <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                        <button 
                            type="button"
                            onClick={() => setAuthMethod('service_account')}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${authMethod === 'service_account' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            JSON Key
                        </button>
                        <button 
                            type="button"
                            onClick={() => setAuthMethod('oauth2')}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${authMethod === 'oauth2' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            OAuth2 (Sem Chave)
                        </button>
                    </div>
                </div>
                
                {authMethod === 'service_account' ? (
                    <div className="space-y-4 text-[11px] text-slate-300">
                        <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                            <p className="font-bold text-emerald-400 mb-2 flex items-center gap-2">
                                <UserPlusIcon className="w-4 h-4" /> Passo a passo (JSON):
                            </p>
                            <ol className="list-decimal list-inside space-y-2 leading-relaxed opacity-90">
                                <li>Crie a conta de serviço <code className="text-white">n8n-leads</code></li>
                                <li>Papel: <strong>Usuário do Cloud Datastore</strong></li>
                                <li>Aba <strong>CHAVES</strong> → Adicionar → Criar JSON.</li>
                            </ol>
                        </div>

                        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg overflow-hidden">
                            <button 
                                type="button"
                                onClick={() => setShowKeyErrorHelp(!showKeyErrorHelp)}
                                className="w-full flex items-center justify-between p-3 text-rose-200 hover:bg-rose-500/20 transition-all text-left"
                            >
                                <div className="flex items-center gap-2">
                                    <ExclamationTriangleIcon className="w-4 h-4 text-rose-400" />
                                    <span className="font-bold">Botão de chave bloqueado?</span>
                                </div>
                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showKeyErrorHelp ? 'rotate-180' : ''}`} />
                            </button>

                            {showKeyErrorHelp && (
                                <div className="p-4 bg-slate-800 text-[10px] space-y-3 border-t border-rose-500/30">
                                    <p className="text-rose-300">Se não conseguir criar o JSON, use a aba <strong className="text-white">OAuth2</strong> acima. É o método que não exige chaves de arquivo.</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 text-[11px] text-slate-300 animate-in fade-in duration-300">
                        <div className="bg-orange-900/30 p-3 rounded-lg border border-orange-500/30">
                            <p className="font-bold text-orange-300 mb-2 flex items-center gap-2">
                                <ShieldCheckIcon className="w-4 h-4" /> Alternativa OAuth2 (Sem arquivo):
                            </p>
                            <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                                <li>No Google Cloud, vá em <strong>APIs e Serviços → Credenciais</strong>.</li>
                                <li>Criar Credenciais → <strong>ID do cliente OAuth</strong>.</li>
                                <li>Tipo: <strong>Aplicativo da Web</strong>.</li>
                                <li>No n8n, crie credencial "Firestore OAuth2" e copie a <strong>Redirect URI</strong>.</li>
                                <li>Cole essa URI no Google Cloud e salve.</li>
                                <li>Use o <strong>Client ID</strong> e <strong>Secret</strong> no n8n.</li>
                            </ol>
                        </div>
                        <p className="text-[10px] text-slate-500 italic">Este método faz o login via navegador e não usa o arquivo que sua empresa bloqueou.</p>
                    </div>
                )}

                <div className="mt-5 pt-4 border-t border-slate-800 flex justify-between items-center text-[11px]">
                    <span className="text-slate-400">ID do Projeto (n8n):</span>
                    <div className="flex items-center">
                        <code className="text-orange-400 font-bold mr-2">vigasales-hub</code>
                        <button type="button" onClick={() => copyToClipboard('vigasales-hub')} className="text-slate-500 hover:text-white">
                            <ClipboardCheckIcon className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Configurações Meta Ads</h4>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="adAccountId" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ID da Conta de Anúncios</label>
                  <input
                    type="text"
                    id="adAccountId"
                    value={adAccountId}
                    onChange={(e) => setAdAccountId(e.target.value)}
                    placeholder="Ex: 458617333979446"
                    className="w-full border-slate-200 rounded-lg shadow-sm focus:ring-orange-500 focus:border-orange-500 font-mono text-sm p-3 bg-slate-50/50"
                  />
                </div>

                <div>
                  <label htmlFor="metaFormId" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ID do Formulário de Leads</label>
                  <input
                    type="text"
                    id="metaFormId"
                    value={metaFormId}
                    onChange={(e) => setMetaFormId(e.target.value)}
                    placeholder="ID do formulário"
                    className="w-full border-slate-200 rounded-lg shadow-sm focus:ring-orange-500 focus:border-orange-500 font-mono text-sm p-3 bg-slate-50/50"
                  />
                </div>
              </div>

              <div className="flex items-center p-3 bg-orange-50 rounded-xl border border-orange-100">
                  <input
                      type="checkbox"
                      id="usingN8N"
                      checked={usingN8N}
                      onChange={(e) => setUsingN8N(e.target.checked)}
                      className="h-5 w-5 text-orange-500 focus:ring-orange-500 border-slate-300 rounded cursor-pointer"
                  />
                  <label htmlFor="usingN8N" className="ml-3 block text-sm font-bold text-orange-900 cursor-pointer">
                      Habilitar Sincronização n8n (Live Sync)
                  </label>
              </div>
            </div>
          </div>
          
          <div className="p-5 bg-slate-50 flex justify-end space-x-3 border-t flex-shrink-0">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all">Cancelar</button>
            <button type="submit" className="px-5 py-2.5 text-sm font-bold text-white bg-orange-500 border border-transparent rounded-xl hover:bg-orange-700 shadow-lg transition-all active:scale-95">Salvar Configurações</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MetaConfigModal;
