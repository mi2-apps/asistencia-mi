import { create } from "zustand";

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "usuario";
  permisos: Record<string, string[]> | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  canAccess: (modulo: string) => boolean;
  allowedDepts: (modulo: string) => string[] | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => set({ user: null, isAuthenticated: false, isLoading: false }),
  canAccess: (modulo) => {
    const { user } = get();
    if (!user) return false;
    if (user.role === "admin") return true;
    return !!(user.permisos?.[modulo]);
  },
  /**
   * null  → sin restricción (admin o wildcard "*")
   * []    → sin acceso
   * [...] → departamentos específicos permitidos
   */
  allowedDepts: (modulo) => {
    const { user } = get();
    if (!user) return [];
    if (user.role === "admin") return null;
    const depts = user.permisos?.[modulo];
    if (!depts) return [];
    if (depts.includes("*")) return null;
    return depts;
  },
}));
