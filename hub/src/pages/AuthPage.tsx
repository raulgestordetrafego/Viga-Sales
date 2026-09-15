
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../api';
import { UserIcon, ArrowRightOnRectangleIcon, LockClosedIcon, XIcon, CheckCircleIcon } from '../components/icons';

const AuthPage: React.FC = () => {
  const { login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (isForgotPassword) {
        alert('Solicite a redefinição de senha ao administrador.');
        setIsForgotPassword(false);
      } else if (isLogin) {
        await login(email, password);
      } else {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '', email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Erro ao criar conta');
        setSuccess('Conta criada com sucesso! Aguarde a aprovação do administrador.');
        setIsLogin(true);
      }
    } catch (err: any) {
      console.error("Erro de Autenticação:", err?.message);

      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('credenciais') || msg.includes('senha') || msg.includes('e-mail') || msg.includes('email') || msg.includes('incorret')) {
        setError('E-mail ou senha incorretos ou expirados. Verifique suas credenciais.');
      } else if (msg.includes('aprov')) {
        setError('Sua conta ainda aguarda aprovação do administrador.');
      } else if (msg.includes('suspens') || msg.includes('bloquead')) {
        setError('Sua conta está suspensa. Contate o administrador.');
      } else if (msg.includes('em uso') || msg.includes('already')) {
        setError('Este e-mail já está em uso.');
      } else if (msg.includes('muitas') || msg.includes('many')) {
        setError('Muitas tentativas. Sua conta foi temporariamente bloqueada. Tente novamente mais tarde.');
      } else {
        setError(err?.message || 'Erro de acesso. Verifique sua conexão ou tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setIsForgotPassword(false);
    setError(null);
    setSuccess(null);
    setEmail('');
    setPassword('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-md p-10 border border-slate-100">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-[#0e2448] rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-xl shadow-[#0e2448]/20">
            <LockClosedIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-2">Viga Sales Hub</h1>
          <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">
            {isForgotPassword ? 'Recuperar Acesso' : isLogin ? 'Área Restrita' : 'Solicitar Acesso'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-xs border border-rose-100 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <XIcon className="w-5 h-5 shrink-0" />
              <span className="font-bold">{error}</span>
            </div>
          )}
          
          {success && (
            <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-xs border border-emerald-100 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircleIcon className="w-5 h-5 shrink-0" />
              <span className="font-bold">{success}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">E-mail Corporativo</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                <UserIcon className="h-5 w-5 text-slate-400 group-focus-within:text-[#123a6e] transition-colors" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-14 w-full bg-slate-100 border-slate-200 rounded-2xl text-slate-900 shadow-sm focus:ring-2 focus:ring-[#123a6e] focus:bg-white py-4 transition-all outline-none font-black text-sm placeholder:text-slate-400"
                placeholder="nome@vigasales.com.br"
              />
            </div>
          </div>

          {!isForgotPassword && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center ml-1">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Senha de Acesso</label>
                {isLogin && (
                  <button 
                    type="button" 
                    onClick={() => setIsForgotPassword(true)}
                    className="text-[10px] text-orange-500 hover:text-orange-800 font-black uppercase tracking-widest"
                  >
                    Esqueceu?
                  </button>
                )}
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <LockClosedIcon className="h-5 w-5 text-slate-400 group-focus-within:text-[#123a6e] transition-colors" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-14 w-full bg-slate-100 border-slate-200 rounded-2xl text-slate-900 shadow-sm focus:ring-2 focus:ring-[#123a6e] focus:bg-white py-4 transition-all outline-none font-black text-sm placeholder:text-slate-400"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-4 px-4 rounded-2xl shadow-xl shadow-[#0e2448]/20 text-sm font-black text-white bg-gradient-to-r from-[#E67E22] to-[#F97316] hover:from-[#d97a1d] hover:to-[#ea6a12] transition-all disabled:opacity-50 active:scale-[0.98] uppercase tracking-[0.2em] mt-8"
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processando...
              </span>
            ) : (isForgotPassword ? 'Enviar Recuperação' : isLogin ? 'Entrar no Sistema' : 'Solicitar Conta')}
          </button>
        </form>

        <div className="mt-12 pt-8 border-t border-slate-100">
          <div className="text-center text-[11px] font-black text-slate-400 tracking-widest uppercase">
            {isForgotPassword ? (
              <button onClick={() => setIsForgotPassword(false)} className="text-orange-500 hover:text-orange-800 transition-colors">
                Voltar para o login
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <span>{isLogin ? 'Novo na Viga Sales?' : 'Já possui acesso?'}</span>
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-[#123a6e] hover:text-[#0e2448] transition-colors font-black"
                >
                  {isLogin ? 'SOLICITAR CADASTRO' : 'VOLTAR PARA LOGIN'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
