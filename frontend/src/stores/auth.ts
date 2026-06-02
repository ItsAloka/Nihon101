import { create } from 'zustand';
import { authApi, silentRefresh, type User } from '../lib/api';

type Status = 'loading' | 'authed' | 'guest';

type AuthState = {
  user: User | null;
  status: Status;
  /** Restore a session from the refresh cookie on first mount. */
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Merge fields into the cached user (e.g. after a profile save). */
  patchUser: (partial: Partial<User>) => void;
  /** Clear session locally after account deletion. */
  clear: () => void;
};

let initStarted = false;

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  init: async () => {
    if (initStarted) return;
    initStarted = true;
    const user = await silentRefresh();
    set({ user, status: user ? 'authed' : 'guest' });
  },

  login: async (email, password) => {
    const user = await authApi.login(email, password);
    set({ user, status: 'authed' });
  },

  register: async (email, password, displayName) => {
    const user = await authApi.register(email, password, displayName);
    set({ user, status: 'authed' });
  },

  logout: async () => {
    await authApi.logout();
    set({ user: null, status: 'guest' });
  },

  patchUser: (partial) =>
    set((s) => (s.user ? { user: { ...s.user, ...partial } } : s)),

  clear: () => set({ user: null, status: 'guest' }),
}));
