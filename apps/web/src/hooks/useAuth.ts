import { useEffect } from 'react';
import { useAuthStore } from '../lib/auth-store';
import { api, ApiError } from '../lib/api';
import type { MeResponse, RefreshResponse, LoginResponse } from '@aqsha/shared';

export function useAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  return { accessToken, user, bootstrapped };
}

export function useAuthBootstrap(): void {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const setBootstrapped = useAuthStore((s) => s.setBootstrapped);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    if (bootstrapped) return;
    let cancelled = false;
    (async () => {
      try {
        const refreshed = await api<RefreshResponse>('/api/auth/refresh', {
          method: 'POST',
          skipAuth: true,
          skipRefreshOn401: true,
        });
        if (cancelled) return;
        setAccessToken(refreshed.accessToken);
        const me = await api<MeResponse>('/api/me');
        if (cancelled) return;
        setUser(me);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          // network error: leave user logged out
        }
        clear();
      } finally {
        if (!cancelled) setBootstrapped();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapped, setAccessToken, setUser, setBootstrapped, clear]);
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await api<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });
  useAuthStore.getState().setAccessToken(response.accessToken);
  const me = await api<MeResponse>('/api/me');
  useAuthStore.getState().setUser(me);
  return response;
}

export async function logout(): Promise<void> {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore — local cleanup is what matters
  }
  useAuthStore.getState().clear();
}
