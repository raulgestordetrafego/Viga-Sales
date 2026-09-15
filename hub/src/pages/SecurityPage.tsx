import React, { useState, useEffect } from 'react';
import api from '../api';
import { UserProfile, UserRole, UserStatus, Squad } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { UserIcon, CheckCircleIcon, XCircleIcon, ShieldCheckIcon, MagnifyingGlassIcon, TrashIcon, UsersIcon } from '../components/icons';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

const SecurityPage: React.FC = () => {
    const { currentUser, userProfile: me } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const squads: Squad[] = [{ id: 'geral', nome: 'Geral', createdAt: new Date().toISOString() }];
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; uid: string | null; email: string | null }>({
        isOpen: false,
        uid: null,
        email: null
    });

    useEffect(() => {
        let active = true;
        const loadUsers = async () => {
            try {
                const res = await api.get('/users');
                const data = res.data || [];
                if (!active) return;
                setUsers(data.map((u: any) => ({
                    ...u,
                    uid: u.id || u.uid,
                    displayName: u.name || u.displayName || '',
                    role: u.role === 'master' ? 'adm_supremo' : u.role,
                    status: u.status || 'approved',
                })));
                setLoading(false);
            } catch (error) {
                console.error("Erro ao carregar usuários:", error);
                if (active) setLoading(false);
            }
        };
        loadUsers();
        const t = setInterval(loadUsers, 10000);
        return () => { active = false; clearInterval(t); };
    }, []);

    const updateUserStatus = async (uid: string, status: UserStatus) => {
        try {
            await api.patch(`/users/${uid}/status`, { status });
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
        }
    };

    const updateUserRole = async (uid: string, role: UserRole) => {
        try {
            await api.patch(`/users/${uid}/role`, { role });
        } catch (error) {
            console.error("Erro ao atualizar função:", error);
        }
    };

    const updateUserSquad = async (uid: string, squadID: string) => {
        // Squads são fixos na Viga Sales (apenas 'Geral') — no-op.
        try {
            console.warn("Vinculação de squad disponível em breve.", uid, squadID);
        } catch (error) {
            console.error("Erro ao atualizar squad:", error);
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteModal.uid) return;
        try {
            await api.delete(`/users/${deleteModal.uid}`);
            setUsers(prev => prev.filter(u => u.uid !== deleteModal.uid));
            setDeleteModal({ isOpen: false, uid: null, email: null });
        } catch (error) {
            console.error("Erro ao excluir usuário:", error);
            alert("Erro ao excluir perfil do usuário.");
        }
    };

    const filteredUsers = users.filter(user => 
        (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.displayName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const statusBadge = (status: UserStatus) => {
        switch(status) {
            case 'approved': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircleIcon className="w-3 h-3 mr-1"/> Aprovado</span>;
            case 'blocked': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircleIcon className="w-3 h-3 mr-1"/> Bloqueado</span>;
            case 'pending': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"> Pendente</span>;
            default: return null;
        }
    };

    const isSupremo = me?.role === 'adm_supremo';
    const isAdmin = me?.role === 'admin';

    if (loading) return <div className="p-8 text-center text-slate-500">Carregando usuários...</div>;

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-full mx-auto">
             <header className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900 flex items-center">
                    <ShieldCheckIcon className="w-8 h-8 mr-3 text-orange-500" />
                    Segurança e Permissões
                </h1>
                <p className="text-slate-500 mt-1">Gerencie acessos e vincule membros aos seus respectivos squads.</p>
            </header>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                     <div className="relative w-full sm:w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-500 sm:text-sm"
                            placeholder="Buscar usuário..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                            <tr>
                                <th className="px-6 py-3">Usuário</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Squad / Time</th>
                                <th className="px-6 py-3">Função</th>
                                <th className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map(user => {
                                const isSelf = user.uid === currentUser?.uid;
                                
                                // Regra: Supremo pode tudo. 
                                // Admin pode gerenciar users e vendedores, mas não outros admins ou supremo.
                                const canEditThisUser = isSupremo || (isAdmin && user.role !== 'admin' && user.role !== 'adm_supremo');
                                const canDeleteThisUser = isSupremo || (isAdmin && user.role !== 'admin' && user.role !== 'adm_supremo');

                                return (
                                    <tr key={user.uid} className="bg-white border-b hover:bg-slate-50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center mr-3 overflow-hidden">
                                                    {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 text-slate-500" />}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-slate-900">{user.email}</div>
                                                    <div className="text-xs text-slate-500">{user.displayName || 'Sem nome'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-2">
                                                {statusBadge(user.status)}
                                                {canEditThisUser && user.status === 'pending' && (
                                                    <div className="flex gap-1">
                                                        <button 
                                                            onClick={() => updateUserStatus(user.uid, 'approved')}
                                                            className="text-[10px] bg-emerald-600 text-white px-2 py-1 rounded font-bold hover:bg-emerald-700 transition-colors uppercase"
                                                        >
                                                            Aceitar
                                                        </button>
                                                        <button 
                                                            onClick={() => updateUserStatus(user.uid, 'blocked')}
                                                            className="text-[10px] bg-slate-400 text-white px-2 py-1 rounded font-bold hover:bg-slate-500 transition-colors uppercase"
                                                        >
                                                            Recusar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {canEditThisUser ? (
                                                <select 
                                                    value={user.squadID || ''} 
                                                    onChange={(e) => updateUserSquad(user.uid, e.target.value)}
                                                    className="text-xs bg-slate-50 border-slate-200 rounded p-1 font-bold text-orange-500 focus:ring-orange-500"
                                                >
                                                    <option value="">Sem Squad</option>
                                                    {squads.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
                                                </select>
                                            ) : (
                                                <span className="text-xs font-bold">{user.squadID || '-'}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {canEditThisUser ? (
                                                <select 
                                                    value={user.role} 
                                                    onChange={(e) => updateUserRole(user.uid, e.target.value as UserRole)}
                                                    className="text-xs bg-slate-50 border-slate-200 rounded p-1 font-bold text-slate-800 focus:ring-orange-500"
                                                >
                                                    <option value="user">User</option>
                                                    <option value="vendedor">Consultor Vendas</option>
                                                    <option value="admin">Admin</option>
                                                    {isSupremo && <option value="adm_supremo">Supremo</option>}
                                                </select>
                                            ) : (
                                                <span className="text-[10px] font-black tracking-widest px-2 py-1 rounded bg-slate-100 text-slate-800 uppercase">
                                                    {user.role === 'vendedor' ? 'Consultor Vendas' : user.role}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                {canEditThisUser && user.status !== 'pending' && (
                                                    <button 
                                                        onClick={() => updateUserStatus(user.uid, user.status === 'blocked' ? 'approved' : 'blocked')}
                                                        className={`p-1 rounded transition-colors ${user.status === 'blocked' ? 'text-emerald-500 hover:bg-emerald-50' : 'text-amber-500 hover:bg-amber-50'}`}
                                                        title={user.status === 'blocked' ? "Desbloquear" : "Bloquear"}
                                                    >
                                                        {user.status === 'blocked' ? <CheckCircleIcon className="w-5 h-5" /> : <XCircleIcon className="w-5 h-5" />}
                                                    </button>
                                                )}
                                                {canDeleteThisUser && !isSelf && (
                                                    <button 
                                                        onClick={() => setDeleteModal({ isOpen: true, uid: user.uid, email: user.email })}
                                                        className="text-rose-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded"
                                                        title="Excluir Permanentemente"
                                                    >
                                                        <TrashIcon className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <DeleteConfirmationModal 
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, uid: null, email: null })}
                onConfirm={handleDeleteUser}
                title="Excluir Usuário"
                message={`Deseja realmente remover o acesso de ${deleteModal.email}?`}
            />
        </div>
    );
};

export default SecurityPage;
