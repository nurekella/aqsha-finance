import { FormEvent, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { login } from '../hooks/useAuth';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.mustChangePassword) {
        await navigate({ to: '/change-password' });
      } else {
        await navigate({ to: '/' });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 429 ? 'Слишком много попыток. Попробуйте позже.' : 'Неверный email или пароль');
      } else {
        setError('Не удалось подключиться к серверу');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 dark:bg-stone-950">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 dark:border-stone-800 dark:bg-stone-900">
        <h1 className="text-2xl font-medium tracking-tight">Aqsha</h1>
        <p className="mt-1 text-sm text-stone-500">Войдите в систему</p>
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm">
            <span className="text-stone-600 dark:text-stone-400">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              autoComplete="email"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600 dark:text-stone-400">Пароль</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {submitting ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
