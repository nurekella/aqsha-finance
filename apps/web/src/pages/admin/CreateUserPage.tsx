import { FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Layout } from '../../components/Layout';
import { api, ApiError } from '../../lib/api';
import type { CreateUserResponse, UserRole } from '@aqsha/shared';

export function CreateUserPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateUserResponse | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await api<CreateUserResponse>('/api/admin/users', {
        method: 'POST',
        body: { email, displayName, role },
      });
      setResult(created);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Не удалось создать пользователя');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Layout>
        <h1 className="text-2xl font-medium tracking-tight">Пользователь создан</h1>
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-700 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Временный пароль для {result.user.email}
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Скопируйте его сейчас — больше он не будет показан. Передайте пароль пользователю
            безопасным способом.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <code className="flex-1 rounded border border-amber-400 bg-white px-3 py-2 font-mono text-sm dark:border-amber-700 dark:bg-stone-950">
              {result.temporaryPassword}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(result.temporaryPassword);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              {copied ? 'Скопировано' : 'Скопировать'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void navigate({ to: '/admin/users' })}
            className="mt-6 rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
          >
            Готово, я передал пользователю
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="text-2xl font-medium tracking-tight">Создать пользователя</h1>
      <form
        className="mt-6 max-w-md space-y-4"
        onSubmit={(e) => void onSubmit(e)}
      >
        <label className="block text-sm">
          <span className="text-stone-600 dark:text-stone-400">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600 dark:text-stone-400">Имя</span>
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 block w-full rounded border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600 dark:text-stone-400">Роль</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="mt-1 block w-full rounded border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {submitting ? 'Создание…' : 'Создать'}
        </button>
      </form>
    </Layout>
  );
}
