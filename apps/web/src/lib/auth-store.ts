import { create } from 'zustand';
import type { MeResponse } from '@aqsha/shared';

interface AuthState {
  accessToken: string | null;
  user: MeResponse | null;
  bootstrapped: boolean;
  setSession: (accessToken: string, user: MeResponse) => void;
  setUser: (user: MeResponse) => void;
  setAccessToken: (accessToken: string) => void;
  setBootstrapped: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootstrapped: false,
  setSession: (accessToken, user) => set({ accessToken, user }),
  setUser: (user) => set({ user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setBootstrapped: () => set({ bootstrapped: true }),
  clear: () => set({ accessToken: null, user: null }),
}));
