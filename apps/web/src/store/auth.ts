import { create } from 'zustand';
import { ApiError, authApi, type PublicUser } from '../api/client';

interface AuthState {
  user: PublicUser | null;
  /** 'idle' until the first /me check finishes. */
  status: 'idle' | 'loading' | 'ready';
  load: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (email: string, password: string, acceptTerms: boolean) => Promise<PublicUser>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  async load() {
    set({ status: 'loading' });
    try {
      const { user } = await authApi.me();
      set({ user, status: 'ready' });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      set({ user: null, status: 'ready' });
    }
  },
  setUser: (user) => set({ user }),
  async login(email, password) {
    const { user } = await authApi.login(email, password);
    set({ user });
    return user;
  },
  async register(email, password, acceptTerms) {
    const { user } = await authApi.register(email, password, acceptTerms);
    set({ user });
    return user;
  },
  async logout() {
    await authApi.logout();
    set({ user: null });
  },
}));
