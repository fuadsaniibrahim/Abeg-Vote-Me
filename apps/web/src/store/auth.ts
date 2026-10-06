import { create } from 'zustand';
import { ApiError, authApi, type PublicUser } from '../api/client';

interface AuthState {
  user: PublicUser | null;
  /** 'idle' until the first /me check finishes. */
  status: 'idle' | 'loading' | 'ready';
  load: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
  login: (username: string, password: string) => Promise<PublicUser>;
  register: (f: { username: string; password: string; email?: string; acceptTerms: boolean }) => Promise<PublicUser>;
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
  async login(username, password) {
    const { user } = await authApi.login(username, password);
    set({ user });
    return user;
  },
  async register(f) {
    const { user } = await authApi.register(f);
    set({ user });
    return user;
  },
  async logout() {
    await authApi.logout();
    set({ user: null });
  },
}));
