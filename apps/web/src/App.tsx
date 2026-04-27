import { useQuery } from '@tanstack/react-query';

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  uptime: number;
}

export function App() {
  const { data, isLoading, error } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('API недоступен');
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-white">
            <span className="text-xl font-medium">A</span>
          </div>
          <div>
            <h1 className="text-3xl font-medium tracking-tight">Aqsha</h1>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Учёт личных финансов для Казахстана
            </p>
          </div>
        </div>

        <div className="mt-12 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="text-xs font-medium uppercase tracking-wider text-stone-500">
            Состояние API
          </h2>
          <div className="mt-4">
            {isLoading && <p className="text-stone-500">Проверяю…</p>}
            {error && (
              <p className="text-red-600 dark:text-red-400">
                {(error as Error).message}
              </p>
            )}
            {data && (
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-stone-500">Статус</dt>
                <dd className="font-medium text-emerald-600 dark:text-emerald-400">
                  {data.status}
                </dd>
                <dt className="text-stone-500">Сервис</dt>
                <dd className="font-medium">{data.service}</dd>
                <dt className="text-stone-500">Версия</dt>
                <dd className="font-medium">{data.version}</dd>
                <dt className="text-stone-500">Uptime</dt>
                <dd className="font-medium">{data.uptime.toFixed(1)} сек</dd>
              </dl>
            )}
          </div>
        </div>

        <p className="mt-12 text-xs text-stone-500">
          v0.1.0 · Скелет инициализирован. Следующий шаг — Спринт 1: Auth + БД + админка.
        </p>
      </main>
    </div>
  );
}
