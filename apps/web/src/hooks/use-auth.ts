'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface User {
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  tier: string;
  isAdmin: boolean;
}

interface AuthState {
  user: User | null;
  isGuest: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  createGuest: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isGuest: false,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    // Check for existing session
    const token = typeof window !== 'undefined' ? localStorage.getItem('vs_token') : null;
    if (token) {
      // Verify token with API
      setState((prev) => ({ ...prev, isLoading: false, isAuthenticated: true }));
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Supabase auth integration
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      // TODO: Implement actual Supabase auth
      setState((prev) => ({ ...prev, isLoading: false, isAuthenticated: true }));
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    // TODO: Implement Google OAuth via Supabase
  }, []);

  const logout = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vs_token');
    }
    setState({ user: null, isGuest: false, isLoading: false, isAuthenticated: false });
  }, []);

  const createGuest = useCallback(() => {
    const guestUser: User = {
      id: `guest_${Date.now()}`,
      tier: 'guest',
      isAdmin: false,
    };
    setState({ user: guestUser, isGuest: true, isLoading: false, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithGoogle, logout, createGuest }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
