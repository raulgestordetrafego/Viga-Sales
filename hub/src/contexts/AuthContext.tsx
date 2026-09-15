import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api, { API_BASE } from '../api';
import { UserProfile } from '../types';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  role?: string;
}

interface AuthContextType {
  currentUser: AppUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  return context;
};

// Mapeia role do CRM para role do Hub
const mapRole = (role?: string) => {
  if (role === 'master') return 'adm_supremo';
  if (role === 'admin') return 'admin';
  return 'user';
};

const toProfile = (user: any, role: string): UserProfile => ({
  uid: user.id || user.uid,
  email: user.email,
  displayName: user.name || user.displayName || '',
  role: mapRole(role || user.role),
  status: 'approved',
  createdAt: new Date().toISOString(),
});

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = (user: any) => {
    const appUser: AppUser = {
      uid: user.id || user.uid,
      email: user.email,
      displayName: user.name || user.displayName,
      role: user.role,
    };
    setCurrentUser(appUser);
    setUserProfile(toProfile(user, user.role));
  };

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem('crm_user') || 'null'); } catch { return null; }
    })();

    if (token && stored) {
      applySession(stored);
      setLoading(false);
      // Valida o token em background; se inválido, o interceptor do axios recarrega
      api.get('/auth/verify').catch(() => {});
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === 'pending') throw new Error(data.message || 'Conta aguarda aprovação.');
      if (data.error === 'suspended') throw new Error(data.message || 'Conta suspensa.');
      throw new Error(data.message || data.error || 'Erro ao fazer login');
    }
    localStorage.setItem('crm_token', data.token);
    localStorage.setItem('crm_user', JSON.stringify(data.user));
    applySession(data.user);
  };

  const logout = async () => {
    const token = localStorage.getItem('crm_token');
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch { /* stateless */ }
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    setCurrentUser(null);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem('crm_user') || 'null'); } catch { return null; }
    })();
    if (stored) applySession(stored);
  };

  const value = { currentUser, userProfile, loading, login, logout, refreshProfile };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

interface AuthProviderProps {
  children: ReactNode;
}

export default AuthProvider;
