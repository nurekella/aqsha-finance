import { FormEvent, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import type { MeResponse } from '@aqsha/shared';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('Новые пароли не совпадают');
      return;
    }
    if (newPassword.length < 12) {
      setError('Минимум 12 символов');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      // refresh tokens revoked → re-login
      const refreshed = await api<{ accessToken: string }>('/api/auth/refresh', {
        method: 'POST',
        skipAuth: true,
        skipRefreshOn401: true,
      }).catch(() => null);

      if (refreshed) {
        useAuthStore.getState().setAccessToken(refreshed.accessToken);
        const me = await api<MeResponse>('/api/me');
        useAuthStore.getState().setUser(me);
        await navigate({ to: '/' });
      } else {
        useAuthStore.getState().clear();
        await navigate({ to: '/login' });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Не удалось сохранить пароль');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 dark:bg-stone-950">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 dark:border-stone-800 dark:bg-stone-900">
        <h1 className="text-xl font-medium tracking-tight">Смена пароля</h1>
        <p className="mt-1 text-sm text-stone-500">
          Установите постоянный пароль (минимум 12 символов).
        </p>
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm">
            <span className="text-stone-600 dark:text-stone-400">Текущий пароль</span>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 block w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600 dark:text-stone-400">Новый пароль</span>
            <input
              type="password"
              required
              minLength={12}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 block w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600 dark:text-stone-400">Повторите пароль</span>
            <input
              type="password"
              required
              minLength={12}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 block w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </button>
        </form>
      </div>
    </div>
  );
}
