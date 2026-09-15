import React, { useState, useEffect, useRef } from 'react';
import { hubApi } from '../api';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { CogIcon, SparklesIcon, CheckCircleIcon, UserIcon, PhotoIcon, LockClosedIcon, ArrowPathIcon, UsersIcon, PlusIcon, TrashIcon, EnvelopeIcon } from '../components/icons';
import { JarvisConfig, Squad, UserProfile, Client, Optimization, OptimizationStatus } from '../types';

const DEFAULT_PROMPT = `Você é a Viga AI, a inteligência estratégica da Viga Sales.
Você possui em seu core a lógica de arquitetura do Grok-1 (xAI):
1. Mixture of Experts (MoE): Você entende que para problemas complexos, deve ativar apenas os "especialistas" (conhecimentos) necessários para máxima eficiência.
2. Alta Performance: Sua lógica é baseada na stack JAX/Haiku, focada em processamento massivo de dados de tráfego (Meta/Google Ads).
3. Análise de Real-Time: Assim como o Grok, você prioriza tendências atuais e dados em tempo real para sugerir ajustes de CPL, CTR e ROAS.

Sua missão: Analisar os dados do CRM e sugerir melhorias práticas. Seja direta, profissional e utilize raciocínio lógico avançado para prever o sucesso de campanhas com base nos briefings.`;

const SettingsPage: React.FC = () => {
    const { userProfile, refreshProfile } = useAuth();
    const [config, setConfig] = useState<JarvisConfig>({ systemPrompt: DEFAULT_PROMPT });
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const squadPhotoRef = useRef<HTMLInputElement>(null);
    
    const [editMode, setEditMode] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [profileData, setProfileData] = useState({
        displayName: '',
        photoUrl: ''
    });

    const [squads] = useState<Squad[]>([{ id: 'geral', nome: 'Geral', createdAt: new Date().toISOString() }]);
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [allClients, setAllClients] = useState<Client[]>([]);
    const [allOpts, setAllOpts] = useState<Optimization[]>([]);
    const [newSquadName, setNewSquadName] = useState('');
    const [activeSquadId, setActiveSquadId] = useState<string | null>(null);

    // Permissões
    const isAdmin = userProfile?.role === 'adm_supremo' || userProfile?.role === 'admin';

    useEffect(() => {
        const fetchData = async () => {
            try {
                const cfg = await hubApi.config.get('jarvis_config');
                const raw = cfg?.value;
                if (typeof raw === 'string' && raw.trim()) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (parsed && typeof parsed === 'object') {
                            setConfig({ systemPrompt: parsed.systemPrompt || DEFAULT_PROMPT, lastUpdate: parsed.lastUpdate });
                        }
                    } catch {
                        setConfig({ systemPrompt: raw || DEFAULT_PROMPT });
                    }
                } else if (cfg && typeof cfg === 'object' && (cfg as any).systemPrompt) {
                    setConfig({ systemPrompt: (cfg as any).systemPrompt, lastUpdate: (cfg as any).lastUpdate });
                }
            } catch (error) {
                console.error("Erro ao carregar jarvis_config:", error);
            }

            try {
                const clients = await hubApi.clientes.list();
                setAllClients(clients || []);
            } catch (error) {
                console.error("Erro ao carregar clientes:", error);
            }

            try {
                const opts = await hubApi.otimizacoes.list();
                setAllOpts(opts || []);
            } catch (error) {
                console.error("Erro ao carregar otimizações:", error);
            }

            try {
                const res = await api.get('/users');
                const data = res.data || [];
                setAllUsers(data.map((u: any) => ({
                    ...u,
                    uid: u.id || u.uid,
                    displayName: u.name || u.displayName || '',
                    role: u.role === 'master' ? 'adm_supremo' : u.role,
                    status: u.status || 'approved',
                })));
            } catch (error) {
                console.error("Erro ao carregar usuários:", error);
            }
        };
        fetchData();

        if (userProfile) {
            setProfileData({
                displayName: userProfile.displayName || '',
                photoUrl: userProfile.photoUrl || ''
            });
        }
    }, [userProfile, isAdmin]);

    const compressImage = (base64Str: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); 
            };
        });
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'squad', squadId?: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            alert("A foto deve ter menos de 10MB.");
            return;
        }

        setUploading(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const compressed = await compressImage(reader.result as string);
                if (type === 'profile') {
                    // Upload de foto ainda não suportado — apenas preview local.
                    setProfileData(prev => ({ ...prev, photoUrl: compressed }));
                    alert('Disponível em breve.');
                } else if (type === 'squad' && squadId && isAdmin) {
                    alert('Disponível em breve.');
                }
            } catch (error) {
                console.error("Erro ao salvar foto:", error);
                alert("Falha ao salvar imagem.");
            } finally {
                setUploading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleAddSquad = async () => {
        if (!newSquadName.trim() || !isAdmin) return;
        alert('Disponível em breve.');
        setNewSquadName('');
    };

    const handleDeleteSquad = async (id: string) => {
        if (!isAdmin) return;
        if (window.confirm("Deseja realmente excluir este Squad? Esta ação não pode ser desfeita.")) {
            try {
                alert('Disponível em breve.');
            } catch (error) {
                console.error("Erro ao excluir squad:", error);
                alert("Ocorreu um erro ao tentar excluir o squad.");
            }
        }
    };

    const handleUpdateProfile = async () => {
        if (!userProfile) return;
        setIsSaving(true);
        try {
            // Salva apenas no localStorage (chave 'crm_user')
            const stored = (() => {
                try { return JSON.parse(localStorage.getItem('crm_user') || 'null'); } catch { return null; }
            })();
            if (stored) {
                stored.name = profileData.displayName;
                stored.displayName = profileData.displayName;
                localStorage.setItem('crm_user', JSON.stringify(stored));
            }
            await refreshProfile();
            setEditMode(false);
        } catch (error) {
            alert("Erro ao atualizar perfil.");
        } finally {
            setIsSaving(false);
        }
    };

    const getSquadStats = (squadNome: string) => {
        const squadClients = allClients.filter(c => c.SquadID === squadNome);
        const squadClientsIds = squadClients.map(c => c.ClienteID);
        const squadMembers = allUsers.filter(u => u.squadID === squadNome);
        const squadOptimizations = allOpts.filter(o => squadClientsIds.includes(o.ClienteID));
        const completed = squadOptimizations.filter(o => o.Status === OptimizationStatus.Concluido).length;
        const totalOpts = squadOptimizations.length;
        const deliveryRate = totalOpts > 0 ? (completed / totalOpts) * 100 : 0;
        const totalBudget = squadClients.reduce((acc, c) => acc + (c.OrcamentoMensal || 0), 0);
        return { members: squadMembers, clientsCount: squadClients.length, deliveryRate, totalBudget };
    };

    const handleSaveJarvis = async () => {
        if (!isAdmin) return;
        setIsSaving(true);
        setShowSuccess(false);
        try {
            const newConfig = {
                ...config,
                lastUpdate: new Date().toISOString()
            };
            await hubApi.config.set('jarvis_config', JSON.stringify(newConfig));
            setConfig(newConfig);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error("Erro ao salvar Viga AI Config:", error);
            alert("Erro ao salvar configurações da Viga AI.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-12 custom-scrollbar overflow-y-auto h-full pb-20">
            <header className="mb-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500 rounded-xl text-white shadow-lg shadow-orange-200">
                        <CogIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Configurações do Hub</h1>
                        <p className="text-slate-500 text-sm font-medium">Gerencie sua conta, inteligência e estrutura de times.</p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                        <div className="h-24 bg-orange-500 relative">
                            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-[2rem] bg-white p-1.5 shadow-xl overflow-hidden">
                                        {profileData.photoUrl ? (
                                            <img src={profileData.photoUrl} alt="Avatar" className="w-full h-full object-cover rounded-[1.7rem]" />
                                        ) : (
                                            <div className="w-full h-full bg-slate-100 rounded-[1.7rem] flex items-center justify-center text-slate-400">
                                                <UserIcon className="w-10 h-10" />
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="absolute inset-0 bg-black/40 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        {uploading ? <ArrowPathIcon className="w-6 h-6 animate-spin" /> : <PhotoIcon className="w-6 h-6" />}
                                    </button>
                                    <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e, 'profile')} className="hidden" accept="image/*" />
                                </div>
                            </div>
                        </div>
                        <div className="pt-16 pb-8 px-6 text-center">
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{userProfile?.displayName || 'Membro Viga Sales'}</h2>
                            <div className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 bg-orange-50 text-orange-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                                {userProfile?.role === 'adm_supremo' ? 'Diretor de Operações' : userProfile?.role === 'admin' ? 'Administrador' : 'Gestor de Performance'}
                            </div>
                            <div className="mt-8 space-y-4 text-left">
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex items-center gap-3 text-slate-400 mb-1"><EnvelopeIcon className="w-4 h-4" /><span className="text-[9px] font-black uppercase tracking-widest">E-mail</span></div>
                                    <p className="text-sm font-bold text-slate-700 truncate">{userProfile?.email}</p>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex items-center gap-3 text-slate-400 mb-1"><LockClosedIcon className="w-4 h-4" /><span className="text-[9px] font-black uppercase tracking-widest">Segurança</span></div>
                                    <button onClick={() => alert('Solicite a redefinição ao administrador.')} className="text-xs font-black text-orange-500 hover:text-orange-800 transition-colors uppercase">Redefinir Senha</button>
                                </div>
                            </div>
                            {editMode ? (
                                <div className="mt-6 space-y-2 animate-in fade-in">
                                    <input type="text" value={profileData.displayName} onChange={(e) => setProfileData({...profileData, displayName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold" />
                                    <div className="flex gap-2"><button onClick={handleUpdateProfile} className="flex-1 bg-orange-500 text-white py-2 rounded-xl text-xs font-black">Salvar</button></div>
                                </div>
                            ) : (
                                <button onClick={() => setEditMode(true)} className="mt-6 w-full py-3 border border-slate-200 text-slate-400 hover:bg-slate-50 rounded-2xl text-[10px] font-black uppercase tracking-widest">Editar Nome</button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-8 space-y-8">
                    {/* Sessão Squads - Restrita */}
                    {isAdmin && (
                        <section className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><UsersIcon className="w-6 h-6" /></div>
                                    <div><h2 className="text-xl font-black text-slate-800 tracking-tight">Gestão de Squads</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Times de Alta Performance</p></div>
                                </div>
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="flex gap-2">
                                    <input type="text" placeholder="Nome do novo Squad..." value={newSquadName} onChange={(e) => setNewSquadName(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-bold" />
                                    <button onClick={handleAddSquad} className="bg-slate-900 text-white p-3 rounded-xl hover:bg-black"><PlusIcon className="w-5 h-5" /></button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {squads.map(squad => {
                                        const stats = getSquadStats(squad.nome);
                                        return (
                                            <div key={squad.id} className="p-6 rounded-[2rem] border border-slate-100 bg-white shadow-sm hover:border-orange-200 transition-all">
                                                <div className="flex items-center gap-4 mb-6">
                                                    <div className="relative group/photo">
                                                        <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center overflow-hidden border border-orange-100">
                                                            {squad.fotoUrl ? <img src={squad.fotoUrl} className="w-full h-full object-cover" /> : <UsersIcon className="w-8 h-8 text-orange-300" />}
                                                        </div>
                                                        <button onClick={() => { setActiveSquadId(squad.id); squadPhotoRef.current?.click(); }} className="absolute inset-0 bg-orange-500/60 rounded-2xl opacity-0 group-hover/photo:opacity-100 flex items-center justify-center text-white transition-opacity"><PhotoIcon className="w-5 h-5" /></button>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-lg font-black text-slate-900 uppercase truncate">{squad.nome}</h3>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stats.members.length} Membros • {stats.clientsCount} Contas</p>
                                                    </div>
                                                    <button 
                                                        onClick={() => handleDeleteSquad(squad.id)} 
                                                        className="text-slate-200 hover:text-rose-500 transition-colors"
                                                        title="Excluir Squad"
                                                    >
                                                        <TrashIcon className="w-5 h-5" />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3 mb-6">
                                                    <div className="p-3 bg-slate-50 rounded-2xl"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Taxa de Entrega</p><p className="text-sm font-black text-orange-500">{stats.deliveryRate.toFixed(1)}%</p></div>
                                                    <div className="p-3 bg-slate-50 rounded-2xl"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Budget Gestão</p><p className="text-sm font-black text-emerald-600">{stats.totalBudget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Membros Ativos</p>
                                                    <div className="flex -space-x-2">
                                                        {stats.members.map(member => (
                                                            <div key={member.uid} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 overflow-hidden" title={member.displayName}>
                                                                {member.photoUrl ? <img src={member.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 m-1.5 text-slate-400" />}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <input type="file" ref={squadPhotoRef} onChange={(e) => handleFileUpload(e, 'squad', activeSquadId || '')} className="hidden" accept="image/*" />
                            </div>
                        </section>
                    )}

                    {/* Sessão Viga AI - Restrita */}
                    {isAdmin && (
                        <section className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-orange-50 text-orange-500 rounded-2xl"><SparklesIcon className="w-6 h-6" /></div>
                                    <div><h2 className="text-xl font-black text-slate-800 tracking-tight">Cérebro da Viga AI</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Personalidade e Lógica</p></div>
                                </div>
                                {showSuccess && <div className="flex items-center text-emerald-600 text-xs font-black bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100"><CheckCircleIcon className="w-4 h-4 mr-1.5" /> SALVO</div>}
                            </div>
                            <div className="p-8 space-y-6">
                                <textarea value={config.systemPrompt} onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })} rows={10} className="w-full border-slate-200 rounded-3xl p-6 text-sm font-medium text-slate-700 bg-slate-50/50 focus:ring-2 focus:ring-orange-500 outline-none resize-none" placeholder="Lógica da Viga AI..." />
                                <div className="flex justify-between items-center pt-4">
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">Update: {config.lastUpdate ? new Date(config.lastUpdate).toLocaleDateString() : 'N/A'}</div>
                                    <button onClick={handleSaveJarvis} disabled={isSaving} className="px-8 py-3 bg-slate-900 hover:bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">{isSaving ? 'Salvando...' : 'Atualizar Viga AI'}</button>
                                </div>
                            </div>
                        </section>
                    )}

                    {!isAdmin && (
                        <div className="bg-orange-50 rounded-3xl p-8 border border-orange-100 text-center">
                            <LockClosedIcon className="w-12 h-12 text-orange-300 mx-auto mb-4" />
                            <h3 className="text-lg font-black text-orange-900 uppercase tracking-tight">Configurações Avançadas</h3>
                            <p className="text-sm text-orange-500 mt-2">As seções de Squads e Inteligência Artificial são restritas a administradores.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
