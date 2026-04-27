import { Layout } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <Layout>
      <h1 className="text-2xl font-medium tracking-tight">
        Привет, {user?.displayName ?? user?.email ?? 'пользователь'}
      </h1>
      <p className="mt-2 text-sm text-stone-500">
        Дашборд появится в следующих спринтах. Сейчас здесь пусто — это нормально.
      </p>
    </Layout>
  );
}
