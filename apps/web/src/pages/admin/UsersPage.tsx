import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Layout } from '../../components/Layout';
import { api } from '../../lib/api';
import type { ListUsersResponse } from '@aqsha/shared';

export function UsersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api<ListUsersResponse>('/api/admin/users?page=1&limit=50'),
  });

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight">Пользователи</h1>
        <Link
          to="/admin/users/new"
          className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Создать
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
        {isLoading && <p className="p-4 text-sm text-stone-500">Загрузка…</p>}
        {error && (
          <p className="p-4 text-sm text-red-600 dark:text-red-400">
            Не удалось загрузить пользователей
          </p>
        )}
        {data && (
          <table className="min-w-full divide-y divide-stone-200 text-sm dark:divide-stone-800">
            <thead className="bg-stone-50 text-left dark:bg-stone-900">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Имя</th>
                <th className="px-4 py-3 font-medium">Роль</th>
                <th className="px-4 py-3 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                    {u.displayName ?? '—'}
                  </td>
                  <td className="px-4 py-3">{u.role}</td>
                  <td className="px-4 py-3">
                    {u.disabledAt
                      ? <span className="text-red-600">отключён</span>
                      : u.mustChangePassword
                        ? <span className="text-amber-600">сменить пароль</span>
                        : <span className="text-emerald-700 dark:text-emerald-400">активен</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
