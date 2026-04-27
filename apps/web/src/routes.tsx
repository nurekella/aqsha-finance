import {
  Outlet,
  RootRoute,
  Route,
  Router,
  redirect,
} from '@tanstack/react-router';
import { useAuthBootstrap } from './hooks/useAuth';
import { useAuthStore } from './lib/auth-store';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/admin/UsersPage';
import { CreateUserPage } from './pages/admin/CreateUserPage';

function RootComponent() {
  useAuthBootstrap();
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  if (!bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-500 dark:bg-stone-950">
        Загрузка…
      </div>
    );
  }
  return <Outlet />;
}

const rootRoute = new RootRoute({ component: RootComponent });

const loginRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (user) throw redirect({ to: user.mustChangePassword ? '/change-password' : '/' });
  },
});

const changePasswordRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/change-password',
  component: ChangePasswordPage,
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (!user) throw redirect({ to: '/login' });
    if (!user.mustChangePassword) throw redirect({ to: '/' });
  },
});

const dashboardRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (!user) throw redirect({ to: '/login' });
    if (user.mustChangePassword) throw redirect({ to: '/change-password' });
  },
});

const adminUsersRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/admin/users',
  component: UsersPage,
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (!user) throw redirect({ to: '/login' });
    if (user.mustChangePassword) throw redirect({ to: '/change-password' });
    if (user.role !== 'admin') throw redirect({ to: '/' });
  },
});

const adminCreateUserRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/admin/users/new',
  component: CreateUserPage,
  beforeLoad: () => {
    const { user } = useAuthStore.getState();
    if (!user) throw redirect({ to: '/login' });
    if (user.mustChangePassword) throw redirect({ to: '/change-password' });
    if (user.role !== 'admin') throw redirect({ to: '/' });
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  changePasswordRoute,
  dashboardRoute,
  adminUsersRoute,
  adminCreateUserRoute,
]);

export const router = new Router({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
