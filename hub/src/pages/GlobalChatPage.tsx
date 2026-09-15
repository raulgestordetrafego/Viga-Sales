import React, { useState, useEffect, useRef } from 'react';
import { hubApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { ChatMessage, UserProfile } from '../types';
import { ChatBubbleLeftRightIcon, UserIcon, TrashIcon, UsersIcon, SparklesIcon, Bars3Icon, ArrowPathIcon } from '../components/icons';

const GlobalChatPage: React.FC = () => {
    const { currentUser, userProfile } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [activeChannel, setActiveChannel] = useState<'global' | 'squad' | string>('global');
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
    const [showMentionList, setShowMentionList] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Carrega todos os usuários para o sistema de menções (com polling de 10s)
    useEffect(() => {
        let active = true;
        const loadUsers = async () => {
            try {
                const data = await hubApi.usuarios.list();
                if (!active) return;
                setTeamMembers(data || []);
            } catch (err) {
                console.error("Erro ao carregar usuários:", err);
            }
        };
        loadUsers();
        const t = setInterval(loadUsers, 10000);
        return () => { active = false; clearInterval(t); };
    }, []);

    // Carrega mensagens do canal ativo (com polling de 3s)
    useEffect(() => {
        setLoading(true);
        let channelId = '';
        if (activeChannel === 'global') channelId = 'global';
        else if (activeChannel === 'squad') channelId = `squad_${userProfile?.squadID || 'none'}`;
        else {
            const ids = [currentUser?.uid, activeChannel].sort();
            channelId = `dm_${ids[0]}_${ids[1]}`;
        }

        let active = true;
        const loadMessages = async () => {
            try {
                const msgs = await hubApi.mensagens.list(channelId);
                if (!active) return;
                setMessages((msgs || []).sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)).slice(-100));
                setLoading(false);
            } catch (err) {
                console.error("Erro ao carregar mensagens:", err);
                if (active) setLoading(false);
            }
        };
        loadMessages();
        const t = setInterval(loadMessages, 3000);
        return () => { active = false; clearInterval(t); };
    }, [activeChannel, userProfile?.squadID, currentUser?.uid]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setNewMessage(val);

        const cursorPosition = e.target.selectionStart || 0;
        const textBeforeCursor = val.substring(0, cursorPosition);
        const lastWord = textBeforeCursor.split(/\s/).pop() || '';

        if (lastWord.startsWith('@')) {
            setMentionQuery(lastWord.substring(1).toLowerCase());
            setShowMentionList(true);
        } else {
            setShowMentionList(false);
        }
    };

    const insertMention = (user: UserProfile) => {
        const nick = user.displayName || user.email.split('@')[0];
        const words = newMessage.split(/\s/);
        words[words.length - 1] = `@${nick} `;
        setNewMessage(words.join(' '));
        setShowMentionList(false);
        inputRef.current?.focus();
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentUser || !userProfile) return;

        const msgText = newMessage.trim();
        setNewMessage('');
        
        const isDM = activeChannel !== 'global' && activeChannel !== 'squad';
        let channelId = activeChannel === 'global' ? 'global' : 
                        activeChannel === 'squad' ? `squad_${userProfile.squadID}` : 
                        `dm_${[currentUser.uid, activeChannel].sort().join('_')}`;

        try {
            await hubApi.mensagens.create({ channelId, text: msgText });

            // NOTIFICAÇÃO DE MENSAGEM PRIVADA (DM)
            if (isDM && selectedUser) {
                await hubApi.notificacoes.create({
                    userId: selectedUser.uid,
                    title: 'Mensagem Privada',
                    message: `${userProfile.displayName} enviou uma mensagem para você.`,
                    type: 'chat',
                    link: 'internalChat'
                });
            }

            // SISTEMA DE NOTIFICAÇÕES POR MENÇÃO (@Nome)
            teamMembers.forEach(async (member) => {
                const nick = (member.displayName || member.email.split('@')[0]).toLowerCase();
                const textLower = msgText.toLowerCase();
                
                if (textLower.includes(`@${nick}`) && member.uid !== currentUser.uid) {
                    // Evita duplicar se for uma DM (já notificado acima)
                    if (isDM && member.uid === selectedUser?.uid) return;

                    await hubApi.notificacoes.create({
                        userId: member.uid,
                        title: 'Nova Menção',
                        message: `${userProfile.displayName} mencionou você em #${activeChannel === 'global' ? 'chat-geral' : 'squad'}`,
                        type: 'chat',
                        link: 'internalChat'
                    });
                }
            });
        } catch (error) { console.error("Erro ao enviar mensagem:", error); }
    };

    const formatBrasiliaTime = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
        return date.toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="flex h-full bg-[#1e1f22] text-slate-200 overflow-hidden">
            <aside className="w-64 bg-[#2b2d31] flex flex-col border-r border-black/20 hidden md:flex shrink-0">
                <div className="p-4 border-b border-black/10">
                    <h2 className="font-black text-white text-xs uppercase tracking-widest">Canais & Time</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase px-2 mb-2 tracking-widest">Público</p>
                        <button onClick={() => { setActiveChannel('global'); setSelectedUser(null); }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-bold ${activeChannel === 'global' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}># chat-geral</button>
                        <button onClick={() => { setActiveChannel('squad'); setSelectedUser(null); }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-bold mt-1 ${activeChannel === 'squad' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}># meu-squad</button>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase px-2 mb-2 tracking-widest">Membros Online</p>
                        {teamMembers.filter(u => u.uid !== currentUser?.uid).map(member => (
                            <button key={member.uid} onClick={() => { setSelectedUser(member); setActiveChannel(member.uid); }} className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-sm font-bold ${activeChannel === member.uid ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}>
                                <div className="w-7 h-7 bg-slate-600 rounded-full flex items-center justify-center text-[10px] uppercase font-black overflow-hidden shrink-0">
                                    {member.photoUrl ? <img src={member.photoUrl} className="w-full h-full object-cover" alt="" /> : (member.displayName || 'U').substring(0,2)}
                                </div>
                                <span className="truncate">{member.displayName || member.email}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 bg-[#313338]">
                <header className="h-12 border-b border-black/10 flex items-center px-4 shadow-sm shrink-0">
                    <span className="text-xl text-slate-400 mr-2">#</span>
                    <h1 className="font-bold text-white uppercase text-xs tracking-widest truncate">
                        {activeChannel === 'global' ? 'chat-geral' : activeChannel === 'squad' ? 'meu-squad' : (selectedUser?.displayName || 'Privado')}
                    </h1>
                </header>

                <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {messages.map((msg, i) => (
                        <div key={msg.id || i} className="flex gap-4 group px-2 py-1 hover:bg-black/5 rounded-lg">
                            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-lg overflow-hidden">
                                {msg.photoUrl ? <img src={msg.photoUrl} className="w-full h-full object-cover" alt="" /> : msg.senderName.substring(0,2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                    <span className="font-bold text-white text-sm">{msg.senderName}</span>
                                    <span className="text-[9px] text-slate-500 font-black uppercase">{msg.senderRole}</span>
                                    <span className="text-[9px] text-slate-500 font-medium ml-auto">
                                        {formatBrasiliaTime(msg.timestamp)}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-300 leading-relaxed break-words">{msg.text}</p>
                            </div>
                        </div>
                    ))}
                </main>

                <footer className="p-4 relative">
                    {showMentionList && (
                        <div className="absolute bottom-full left-4 mb-2 w-64 bg-[#2b2d31] rounded-xl shadow-2xl border border-black/20 overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200">
                            <div className="p-2 border-b border-black/10 bg-black/10"><span className="text-[9px] font-black text-slate-400 uppercase px-2 tracking-widest">Mencionar Membro</span></div>
                            <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                {teamMembers.filter(u => (u.displayName || u.email).toLowerCase().includes(mentionQuery)).map(u => (
                                    <button key={u.uid} onClick={() => insertMention(u)} className="w-full text-left px-3 py-2.5 hover:bg-orange-500 text-sm flex items-center gap-3 transition-colors">
                                        <div className="w-7 h-7 bg-slate-600 rounded-full text-[10px] flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                                            {u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover" alt="" /> : (u.displayName || 'U').substring(0,2)}
                                        </div>
                                        <span className="font-bold text-white">{u.displayName || u.email}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <form onSubmit={handleSendMessage} className="bg-[#383a40] rounded-lg px-4 py-3">
                        <input
                            ref={inputRef}
                            type="text"
                            value={newMessage}
                            onChange={handleInputChange}
                            placeholder={`Escreva algo em #${activeChannel === 'global' ? 'chat-geral' : activeChannel === 'squad' ? 'meu-squad' : (selectedUser?.displayName || 'Privado')}`}
                            className="w-full bg-transparent border-none focus:ring-0 text-sm placeholder:text-slate-500 text-white"
                        />
                    </form>
                </footer>
            </div>
        </div>
    );
};

export default GlobalChatPage;
