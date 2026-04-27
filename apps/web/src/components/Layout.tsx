import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuth, logout } from '../hooks/useAuth';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <span className="text-base font-medium">A</span>
            </div>
            <span className="text-lg font-medium tracking-tight">Aqsha</span>
          </Link>
          {user && (
            <nav className="flex items-center gap-4 text-sm">
              {user.role === 'admin' && (
                <Link
                  to="/admin/users"
                  className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                  activeProps={{ className: 'text-emerald-700 dark:text-emerald-400' }}
                >
                  Админ-панель
                </Link>
              )}
              <span className="text-stone-500">{user.displayName ?? user.email}</span>
              <button
                type="button"
                onClick={() => {
                  void logout().then(() => {
                    window.location.href = '/login';
                  });
                }}
                className="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
              >
                Выйти
              </button>
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
