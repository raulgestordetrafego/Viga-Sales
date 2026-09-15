import React from 'react';
import { hubApi } from '../api';
import { Notification } from '../types';
import { XIcon, CheckCircleIcon, ChatBubbleLeftRightIcon, PhotoIcon, ClipboardCheckIcon, SparklesIcon, TrashIcon } from './icons';

interface NotificationInboxProps {
    notifications: Notification[];
    onClose: () => void;
    onNotificationClick: (notification: Notification) => void;
}

const NotificationInbox: React.FC<NotificationInboxProps> = ({ notifications, onClose, onNotificationClick }) => {
    const markAsRead = async (id: string) => {
        try {
            await hubApi.notificacoes.marcarLida(id);
        } catch (error) {
            console.error("Erro ao marcar como lida:", error);
        }
    };

    const markAllAsRead = async () => {
        try {
            await hubApi.notificacoes.marcarTodasLidas();
        } catch (error) {
            console.error("Erro ao marcar todas como lidas:", error);
        }
    };

    const deleteNotification = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await hubApi.notificacoes.remove(id);
        } catch (error) {
            console.error("Erro ao excluir notificação:", error);
        }
    };

    const formatNotificationTime = (timestamp: any) => {
        if (!timestamp) return 'Agora';
        const date = new Date(timestamp);
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getIcon = (type: string) => {
        switch(type) {
            case 'chat': return <ChatBubbleLeftRightIcon className="w-4 h-4 text-emerald-500" />;
            case 'creative': return <PhotoIcon className="w-4 h-4 text-orange-500" />;
            case 'optimization': return <ClipboardCheckIcon className="w-4 h-4 text-amber-500" />;
            default: return <SparklesIcon className="w-4 h-4 text-slate-400" />;
        }
    };

    return (
        <div className="absolute right-0 mt-3 w-80 bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden z-[300] animate-in fade-in zoom-in-95 duration-200 origin-top-right">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Notificações</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">{notifications.length} registros</p>
                </div>
                <div className="flex gap-2">
                    {notifications.some(n => !n.read) && (
                        <button onClick={markAllAsRead} className="text-[9px] font-black text-orange-500 uppercase hover:underline mr-2">Lido Tudo</button>
                    )}
                    <button onClick={onClose} className="p-1 hover:bg-white rounded-lg text-slate-400 transition-colors"><XIcon className="w-4 h-4" /></button>
                </div>
            </div>
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                    <div className="p-10 text-center">
                        <CheckCircleIcon className="w-10 h-10 text-slate-100 mx-auto mb-3" />
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-relaxed">Nenhuma notificação<br/>gravada.</p>
                    </div>
                ) : (
                    notifications.map(n => (
                        <div 
                            key={n.id} 
                            onClick={() => {
                                if (!n.read) markAsRead(n.id);
                                onNotificationClick(n);
                            }}
                            className={`p-4 border-b border-slate-50 hover:bg-orange-50/30 transition-colors relative group cursor-pointer ${!n.read ? 'bg-orange-50/20' : 'opacity-70'}`}
                        >
                            <div className="flex gap-3">
                                <div className="mt-0.5 p-2 bg-white rounded-xl shadow-sm border border-slate-100">{getIcon(n.type)}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-0.5">
                                        <p className="text-[11px] font-black text-slate-800 leading-tight uppercase truncate">{n.title}</p>
                                        {!n.read && <div className="w-2 h-2 bg-orange-500 rounded-full"></div>}
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed line-clamp-2">{n.message}</p>
                                    <p className="text-[9px] text-orange-400 mt-2 font-black uppercase tracking-tighter">
                                        {formatNotificationTime(n.timestamp)}
                                    </p>
                                </div>
                                <button 
                                    onClick={(e) => deleteNotification(n.id, e)} 
                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-rose-600 hover:bg-white rounded-lg transition-all"
                                    title="Remover permanentemente"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div className="p-3 bg-orange-500 text-center">
                <p className="text-[9px] font-black text-white uppercase tracking-widest">Histórico de Performance</p>
            </div>
        </div>
    );
};

export default NotificationInbox;
