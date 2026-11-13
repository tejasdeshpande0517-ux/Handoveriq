import React, { createContext, useContext, useEffect, useState } from 'react';
import type { UserProfile, UserRole } from '../types';
import { api } from '../lib/api';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    department?: string;
    title?: string;
  }) => Promise<UserProfile>;
  googleLogin: (email: string, name: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const res = await api.auth.me();
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string): Promise<UserProfile> => {
    const res = await api.auth.login(email, password);
    setUser(res.user);
    return res.user;
  };

  const register = async (payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    department?: string;
    title?: string;
  }): Promise<UserProfile> => {
    const res = await api.auth.register(payload);
    setUser(res.user);
    return res.user;
  };

  const googleLogin = async (email: string, name: string): Promise<UserProfile> => {
    const res = await api.auth.googleLogin({ email, name });
    setUser(res.user);
    return res.user;
  };

  const logout = async (): Promise<void> => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore if session already expired
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        googleLogin,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

