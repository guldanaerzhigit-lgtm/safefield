import { create } from 'zustand';
import { persist } from 'zustand/middleware';
type AuthState = { token: string | null; user: { id: string; fullName: string; email: string; role: string; departmentName?: string } | null; setAuth: (token: string, user: AuthState['user']) => void; logout: () => void };
export const useAuthStore = create<AuthState>()(persist((set) => ({ token: null, user: null, setAuth: (token, user) => set({ token, user }), logout: () => set({ token: null, user: null }) }), { name: 'safefield-auth', partialize: (state) => ({ token: state.token, user: state.user }) }));
