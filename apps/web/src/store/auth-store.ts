import { create } from "zustand";
import type { User } from "@/types";

// ============================================================
// Auth Store (Zustand)
// ============================================================

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  clearUser: () => set({ user: null, isLoading: false }),
}));
