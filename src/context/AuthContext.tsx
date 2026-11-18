import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { UserProfile, UserRole } from '../types';
import { api } from '../lib/api';
import { firebaseAuth, firestoreDb, googleAuthProvider, isFirebaseConfigured } from '../lib/firebase';

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
  googleLogin: () => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function resolveFirebaseUserProfile(fbUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
}): Promise<UserProfile> {
  const email = (fbUser.email || '').trim().toLowerCase();
  const displayName = fbUser.displayName?.trim() || email.split('@')[0] || 'Google User';
  const now = new Date().toISOString();
  const fallbackProfile: UserProfile = {
    uid: fbUser.uid,
    name: displayName,
    email,
    role: 'SUCCESSOR',
    department: 'Engineering',
    title: 'Workspace Member (Google)',
    createdAt: now,
    updatedAt: now,
  };

  try {
    const userRef = doc(firestoreDb, 'users', fbUser.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    await setDoc(userRef, fallbackProfile);
  } catch {
    // Firestore offline or rules pending; return safe non-Admin profile
  }
  return fallbackProfile;
}

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
      const fbUser = firebaseAuth.currentUser;
      if (fbUser) {
        const profile = await resolveFirebaseUserProfile(fbUser);
        setUser(profile);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
    if (!isFirebaseConfigured) return;
    const unsub = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      try {
        const raw = localStorage.getItem('handoveriq_cloud_user_v1');
        if (raw) {
          const parsed = JSON.parse(raw) as UserProfile;
          if (parsed && parsed.uid && parsed.role) {
            setUser(parsed);
            return;
          }
        }
      } catch {
        // ignore
      }
      if (fbUser && !user) {
        const profile = await resolveFirebaseUserProfile(fbUser);
        setUser((prev) => prev || profile);
      }
    });
    return () => unsub();
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

  const googleLogin = async (): Promise<UserProfile> => {
    if (!isFirebaseConfigured) {
      throw new Error('Firebase Authentication is not configured.');
    }
    const cred = await signInWithPopup(firebaseAuth, googleAuthProvider);
    const fbUser = cred.user;
    const email = (fbUser.email || '').trim().toLowerCase();
    const name = fbUser.displayName?.trim() || email.split('@')[0] || 'Google User';
    if (!email) {
      throw new Error('Google account did not return an email address.');
    }

    try {
      const res = await api.auth.googleLogin({ email, name });
      setUser(res.user);
      return res.user;
    } catch {
      const profile = await resolveFirebaseUserProfile(fbUser);
      setUser(profile);
      return profile;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await signOut(firebaseAuth).catch(() => null);
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

