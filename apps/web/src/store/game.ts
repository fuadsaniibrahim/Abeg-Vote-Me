import { create } from 'zustand';
import { ApiError, gameApi, type Clock, type Notification, type Profile } from '../api/client';

interface GameState {
  profile: Profile | null;
  /** 'missing' = signed in but no character yet. */
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
  error: string | null;
  load: () => Promise<void>;
  setProfile: (p: Profile) => void;
  clock: Clock | null;
  loadClock: () => Promise<void>;
  notifications: Notification[];
  loadNotifications: () => Promise<void>;
  pushNotification: (n: Notification) => void;
  markAllRead: () => Promise<void>;
}

export const useGame = create<GameState>((set, get) => ({
  profile: null,
  status: 'idle',
  error: null,
  async load() {
    set({ status: 'loading', error: null });
    try {
      const { character } = await gameApi.me();
      set({ profile: character, status: 'ready' });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'no_character') set({ profile: null, status: 'missing' });
      else set({ status: 'error', error: e instanceof ApiError ? e.message : 'Could not load your character.' });
    }
  },
  setProfile: (p) => set({ profile: p, status: 'ready' }),
  clock: null,
  async loadClock() {
    try {
      set({ clock: await gameApi.clock() });
    } catch {
      // clock is decorative; keep the old value
    }
  },
  notifications: [],
  async loadNotifications() {
    try {
      set({ notifications: (await gameApi.notifications()).notifications });
    } catch {
      // ignore: the bell just shows nothing
    }
  },
  pushNotification(n) {
    const p = get().profile;
    set({ notifications: [n, ...get().notifications].slice(0, 50), profile: p ? { ...p, unreadNotifications: p.unreadNotifications + 1 } : p });
  },
  async markAllRead() {
    await gameApi.markRead();
    const p = get().profile;
    set({ notifications: get().notifications.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })), profile: p ? { ...p, unreadNotifications: 0 } : p });
  },
}));
