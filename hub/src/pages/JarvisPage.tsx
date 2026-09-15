import React, { useState, useRef, useEffect } from 'react';
import { hubApi } from '../api';
import { SparklesIcon, ArrowRightOnRectangleIcon, UserIcon, TrashIcon, CircleStackIcon } from '../components/icons';

interface Message {
    role: 'user' | 'model'; 
    content: string;
}

const JarvisPage: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [systemPrompt, setSystemPrompt] = useState('');
    const [crmContext, setCrmContext] = useState('');
    const [isDbConnected, setIsDbConnected] = useState(false);
    
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const initJarvis = async () => {
            try {
                // 1. Busca configurações de personalidade (app_settings/jarvis_config via hubApi.config)
                let basePrompt = 'Você é a Viga AI, a inteligência estratégica da Viga Sales.';
                try {
                    const cfg = await hubApi.config.get('jarvis_config');
                    const raw = cfg?.value;
                    if (typeof raw === 'string' && raw.trim()) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed && typeof parsed === 'object' && parsed.systemPrompt) {
                                basePrompt = parsed.systemPrompt;
                            }
                        } catch {
                            basePrompt = raw;
                        }
                    } else if (cfg && typeof cfg === 'object' && (cfg as any).systemPrompt) {
                        basePrompt = (cfg as any).systemPrompt;
                    }
                } catch (e) {
                    console.warn("Não foi possível carregar jarvis_config:", e);
                }
                setSystemPrompt(basePrompt);

                // 2. Busca de Dados Otimizada (Apenas Clientes Ativos e Limites nas coleções)
                const clientsList = await hubApi.clientes.list();
                const activeClients = (clientsList || []).filter((c: any) => c.StatusCliente === 'Ativo');
                
                // Busca coleções auxiliares com limite para evitar payload excessivo
                const [creatives, optimizations] = await Promise.all([
                    hubApi.criativos.list().then((list: any) => (list || []).slice(0, 100)),
                    hubApi.otimizacoes.list().then((list: any) => (list || []).slice(0, 50))
                ]);

                // 3. Montagem do Contexto Compacto (Token Saver)
                const clientContexts = activeClients.map((d: any) => {
                    const cid = d.ClienteID;

                    // Filtra e mapeia apenas dados essenciais
                    const cCreatives = (creatives as any[])
                        .filter(c => c.ClienteID === cid)
                        .slice(0, 3) // Apenas os 3 mais recentes
                        .map(c => `${c.Nome} [${c.Status}]`);

                    const cOpts = (optimizations as any[])
                        .filter(o => o.ClienteID === cid)
                        .slice(0, 2) // Apenas as 2 últimas otimizações
                        .map(o => `${o.Data?.split('T')[0]}: ${o.Descricao?.substring(0, 60)}...`);

                    // Resumo dos dados de API (apenas números principais)
                    const metaInfo = d.lastMetaInsights ? 
                        `Invest:${d.lastMetaInsights.spend}|Leads:${d.lastMetaInsights.leads}|CPL:${d.lastMetaInsights.cpl?.toFixed(2)}` : 'Sem dados Meta';

                    // Trunca textos longos
                    const resumo = d.resumo ? d.resumo.substring(0, 150) + '...' : 'N/A';

                    return `
> ${d.Nome} (${d.Nicho}) | Squad: ${d.SquadID || '-'}
Meta: ${metaInfo}
Brief: ${resumo}
Otimiz: ${cOpts.join(' | ') || 'Nenhuma recente'}
Cria: ${cCreatives.join(' | ') || 'Nenhum recente'}
`;
                }).join('\n');

                const fullContext = `
RESUMO DA CARTEIRA ATIVA (DADOS COMPACTADOS PARA ANÁLISE):
${clientContexts}

DIRETRIZES:
1. Analise com base nos dados compactados acima.
2. Se faltarem detalhes, faça inferências lógicas baseadas no nicho.
3. Seja objetiva e estratégica.
`;
                setCrmContext(fullContext);
                setIsDbConnected(true);

            } catch (err) {
                console.error("Erro Crítico de Acesso ao Contexto:", err);
            }
        };
        initJarvis();
    }, []);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isLoading]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '40px';
            const scrollHeight = textareaRef.current.scrollHeight;
            textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 40), 300)}px`;
        }
    }, [input]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const currentText = input.trim();
        if (!currentText || isLoading) return;

        const newUserMsg: Message = { role: 'user', content: currentText };
        const updatedMessages = [...messages, newUserMsg];
        setMessages(updatedMessages);
        setInput('');
        setIsLoading(true);

        try {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                throw new Error("Sem conexão com a internet.");
            }

            // Mapeia o histórico para o formato da API do Hub
            const history = updatedMessages.slice(0, -1).map(m => ({
                role: m.role,
                content: m.content
            }));

            // Injeta conhecimento do cérebro de tráfego quando relevante
            let brainKnowledge = '';
            try {
                const kb = await hubApi.cerebro.knowledge(currentText, 2);
                brainKnowledge = kb?.knowledge || '';
            } catch (e) {
                console.warn("Cérebro indisponível:", e);
            }

            // Envia a mensagem via hubApi.ai (backend do CRM)
            const result = await hubApi.ai.perguntar({
                messages: [...history, { role: 'user', content: currentText }],
                systemPrompt: `${systemPrompt}\n\n${crmContext}\n\n${brainKnowledge}`,
            });
            const text = result?.content;

            if (!text) throw new Error("Resposta vazia do modelo.");

            setMessages(prev => [...prev, { role: 'model', content: text }]);

        } catch (err: any) {
            console.error("IA Error:", err);
            let errorMsg = `🔴 ERRO IA: ${err.message || 'Falha de conexão.'}`;
            
            if (err.message && (err.message.includes('API key') || err.message.includes('403') || err.message.includes('401') || err.message.includes('400'))) {
                errorMsg = "🔴 ERRO DE CHAVE: A API Key de IA não foi configurada corretamente no backend.";
            } else if (err.message && (err.message.includes('429') || err.message.includes('quota'))) {
                errorMsg = "🔴 LIMITE ATINGIDO: O sistema está sobrecarregado (Quota Exceeded). Tente novamente em instantes.";
            } else if (err.message && err.message.includes('fetch')) {
                errorMsg = "🔴 ERRO DE MÓDULO: Não foi possível conectar ao serviço de IA. Tente recarregar a página.";
            }

            setMessages(prev => [...prev, { role: 'model', content: errorMsg }]);
        } finally {
            setIsLoading(false);
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); 
            handleSendMessage();
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-sans">
            <header className="px-6 py-4 border-b border-orange-900/30 flex items-center justify-between bg-slate-900/50 backdrop-blur-xl sticky top-0 z-20">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="p-2.5 bg-orange-500 rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.5)]">
                            <SparklesIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-orange-500'}`}></div>
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2 uppercase">
                            Viga AI <span className="text-orange-400">Smart Context</span>
                        </h1>
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest italic">Smart Context Link</p>
                            {isDbConnected && (
                                <span className="flex items-center gap-1 text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold uppercase">
                                    <CircleStackIcon className="w-3 h-3" /> Memória Otimizada
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <button onClick={() => setMessages([])} className="p-2 text-slate-500 hover:text-rose-400 transition-colors">
                    <TrashIcon className="w-5 h-5" />
                </button>
            </header>

            <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar bg-[radial-gradient(circle_at_50%_-20%,_#1e1b4b_0%,_transparent_50%)]">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center py-20 animate-in fade-in duration-700">
                        <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mb-6 border border-orange-500/30">
                            <SparklesIcon className="w-10 h-10 text-orange-500" />
                        </div>
                        <h2 className="text-2xl font-black text-white mb-2 tracking-tight uppercase">Conexão Inteligente.</h2>
                        <p className="text-slate-400 max-w-sm text-sm">Acesso aos dados dos clientes ativos (Fichas, Meta Ads, Criativos recentes). Otimizado para alta performance.</p>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`flex gap-3 max-w-[85%] sm:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${msg.role === 'user' ? 'bg-orange-500 border-orange-400' : 'bg-slate-900 border-orange-700/50'}`}>
                                {msg.role === 'user' ? <UserIcon className="w-4 h-4 text-white" /> : <SparklesIcon className="w-4 h-4 text-orange-400" />}
                            </div>
                            <div className={`p-4 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-orange-500 text-white rounded-tr-none shadow-lg' : 'bg-slate-900 text-slate-200 border border-orange-900/20 rounded-tl-none shadow-2xl'}`}>
                                {msg.content.split('\n').map((t, idx) => <p key={idx} className={idx > 0 ? 'mt-2' : ''}>{t}</p>)}
                            </div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start animate-in fade-in duration-300">
                        <div className="flex gap-3 items-center text-orange-400">
                             <div className="w-8 h-8 rounded-lg bg-slate-900 border border-orange-700/50 flex items-center justify-center shadow-lg">
                                <div className="animate-spin h-4 w-4 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                             </div>
                             <span className="text-xs font-black uppercase tracking-widest animate-pulse">IA Analisando...</span>
                        </div>
                    </div>
                )}
            </main>

            <footer className="p-4 sm:p-6 bg-slate-950/80 backdrop-blur-xl border-t border-orange-900/20">
                <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-end gap-3">
                    <div className="flex-1 bg-slate-900 border border-orange-900/30 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 transition-all">
                        <textarea 
                            ref={textareaRef}
                            rows={1}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                            placeholder="Análise rápida da base..."
                            className="w-full bg-transparent border-none px-4 py-3 text-sm outline-none resize-none placeholder:text-slate-600 text-white font-medium overflow-hidden"
                            style={{ height: '40px', scrollbarWidth: 'none' }}
                        />
                    </div>
                    <button 
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="bg-orange-500 hover:bg-emerald-600 text-white p-3.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-orange-500/20"
                    >
                        <ArrowRightOnRectangleIcon className="w-6 h-6 rotate-180" />
                    </button>
                </form>
            </footer>
        </div>
    );
};

export default JarvisPage;
