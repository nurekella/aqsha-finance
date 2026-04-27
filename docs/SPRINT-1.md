# Спринт 1 — Auth + БД + админ-панель

> Длительность: ~7 дней.
> Перед началом убедись, что Спринт 0 работает: `pnpm dev` поднимает страницу с зелёным `Состояние API: ok` на http://localhost:5173.

## Цель

Получить рабочую систему, в которой:
1. Админ создаётся через CLI-скрипт.
2. Админ логинится, видит панель управления пользователями, создаёт обычных юзеров.
3. Обычный юзер логинится, его принуждают сменить временный пароль и пускают на (пока пустой) дашборд.
4. Все действия пишутся в audit_log.
5. Все эндпоинты под защитой JWT, `/api/admin/*` — только для админа.

## Изменения в схеме БД

Обнови `apps/api/prisma/schema.prisma`. Добавь:

```prisma
model RefreshToken {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  tokenHash   String    @unique @map("token_hash")  // SHA-256 от refresh-токена
  expiresAt   DateTime  @map("expires_at") @db.Timestamptz
  revokedAt   DateTime? @map("revoked_at") @db.Timestamptz
  userAgent   String?   @map("user_agent")
  ipAddress   String?   @map("ip_address")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_tokens")
}

model AuditLog {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String?  @map("user_id") @db.Uuid    // null = системное событие
  entity      String                                 // "user", "auth", и т.д.
  entityId    String?  @map("entity_id")
  action      String                                 // "login.success", "user.created", "password.changed"
  diff        Json?    @db.JsonB                     // что изменилось
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([entity, entityId])
  @@map("audit_log")
}
```

И добавь обратные связи в `User`:

```prisma
model User {
  // ... существующие поля
  refreshTokens RefreshToken[]
  auditLogs     AuditLog[]
}
```

После правки:

```bash
pnpm --filter @aqsha/api prisma:migrate -- --name auth-and-audit
```

## Backend (`apps/api`)

### Зависимости (добавить)

```bash
pnpm --filter @aqsha/api add @nestjs/jwt @nestjs/passport @nestjs/throttler passport passport-jwt cookie-parser
pnpm --filter @aqsha/api add -D @types/passport-jwt @types/cookie-parser
```

### Структура

```
apps/api/src/
├── prisma/
│   ├── prisma.module.ts          # Global module, экспортирует PrismaService
│   └── prisma.service.ts          # extends PrismaClient, onModuleInit/onModuleDestroy
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts         # /api/auth/*
│   ├── auth.service.ts
│   ├── dto/
│   │   ├── login.dto.ts
│   │   └── change-password.dto.ts
│   ├── strategies/
│   │   ├── jwt-access.strategy.ts
│   │   └── jwt-refresh.strategy.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── jwt-refresh.guard.ts
│   │   └── roles.guard.ts
│   └── decorators/
│       ├── public.decorator.ts    # @Public() — пропускает JWT-проверку
│       ├── roles.decorator.ts     # @Roles('admin')
│       └── current-user.decorator.ts
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts        # /api/admin/users/*
│   ├── users.service.ts
│   └── dto/
│       ├── create-user.dto.ts
│       └── update-user.dto.ts
├── me/
│   ├── me.module.ts
│   └── me.controller.ts           # /api/me — текущий пользователь
├── audit/
│   ├── audit.module.ts            # Global module, экспортирует AuditService
│   └── audit.service.ts
└── cli/
    └── create-admin.ts            # Standalone скрипт
```

### API-контракты

#### Аутентификация (роутер `/api/auth`)

| Метод | Путь | Доступ | Тело | Ответ |
|---|---|---|---|---|
| POST | `/login` | публичный, throttle 5/15min | `{email, password}` | `{accessToken, mustChangePassword}` + Set-Cookie refresh |
| POST | `/refresh` | требует refresh cookie | — | `{accessToken}` (выдаёт новый refresh, ротация) |
| POST | `/logout` | JWT | — | `{ok: true}` (отзывает текущий refresh) |
| POST | `/change-password` | JWT | `{currentPassword, newPassword}` | `{ok: true}` |

Особенности:
- При `mustChangePassword=true` пользователю выдаётся access-токен с особым claim `pwd_change_required: true`. Все эндпоинты, кроме `POST /auth/change-password` и `GET /me`, должны возвращать `403 PASSWORD_CHANGE_REQUIRED`.
- После успешной смены пароля выставить `mustChangePassword = false` и принудительно отозвать все остальные refresh-токены пользователя.
- При логине обновлять `users.last_login_at`.
- Логировать в audit_log: `auth.login.success`, `auth.login.failed`, `auth.logout`, `password.changed`, `password.change.required`.

#### Текущий пользователь (`/api/me`)

| Метод | Путь | Доступ | Ответ |
|---|---|---|---|
| GET | `/` | JWT | `{id, email, displayName, role, locale, timezone, mustChangePassword}` |

#### Управление пользователями (`/api/admin/users`)

| Метод | Путь | Доступ | Тело | Ответ |
|---|---|---|---|---|
| GET | `/` | admin | query: `?page=1&limit=20&search=...` | `{items, total, page, limit}` |
| POST | `/` | admin | `{email, displayName, role}` | `{user, temporaryPassword}` |
| GET | `/:id` | admin | — | пользователь |
| PATCH | `/:id` | admin | `{displayName?, role?}` | пользователь |
| POST | `/:id/reset-password` | admin | — | `{temporaryPassword}` |
| POST | `/:id/disable` | admin | — | `{ok: true}` (выставляет `disabledAt = now()`) |
| POST | `/:id/enable` | admin | — | `{ok: true}` (выставляет `disabledAt = null`) |
| DELETE | `/:id` | admin | — | `{ok: true}` (hard delete, только если у юзера нет транзакций — пока всегда можно) |

Особенности:
- `temporaryPassword` — генерируется на сервере функцией типа `crypto.randomBytes(9).toString('base64url')` (12 символов), хешируется Argon2id, новому пользователю выставляется `mustChangePassword = true`.
- Пароль возвращается админу **только один раз** в HTTP-ответе. В БД хранится только хеш.
- Действия логируются: `user.created`, `user.updated`, `user.password.reset`, `user.disabled`, `user.enabled`, `user.deleted`.
- Запретить админу отключать/удалять самого себя (вернуть `400`).
- Запретить понижать роль последнего активного админа.

### main.ts — глобальные настройки

- Подключи `cookie-parser`.
- Подключи `@nestjs/throttler` глобально (10 req/s базовый лимит, кастомный для login).
- Сделай глобальный `JwtAuthGuard` через `APP_GUARD` + `@Public()` декоратор для опт-аут.

### CLI: создание первого админа

`apps/api/src/cli/create-admin.ts` — standalone скрипт без поднятия Nest:

```ts
// Пример скелета (доработай детали)
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: node dist/cli/create-admin.js <email> <password>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: UserRole.admin, mustChangePassword: false },
    create: {
      email,
      passwordHash,
      role: UserRole.admin,
      mustChangePassword: false,
      displayName: 'Admin',
    },
  });

  console.log(`Admin ready: ${user.email} (id=${user.id})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Запуск локально: `pnpm --filter @aqsha/api exec ts-node src/cli/create-admin.ts admin@local.test 'admin123'`.
В проде через docker: `docker compose run --rm api node dist/cli/create-admin.js <email> <pass>`.

Соответственно, в `nest-cli.json` или `tsconfig` убедись, что `src/cli/*.ts` компилируется в `dist/cli/*.js`.

## Frontend (`apps/web`)

### Зависимости

```bash
pnpm --filter @aqsha/web add @tanstack/react-router
pnpm --filter @aqsha/web add -D @tanstack/router-devtools
```

(Опционально: `axios` или оставь `fetch` — на твой вкус.)

### Структура

```
apps/web/src/
├── main.tsx                       # уже есть, добавить RouterProvider
├── routes.tsx                     # определение всех роутов
├── lib/
│   ├── api.ts                     # fetch-клиент с auth-интерцептором
│   └── auth-store.ts              # Zustand: accessToken, user
├── components/
│   ├── Layout.tsx                 # шапка + main + nav
│   └── ProtectedRoute.tsx
├── pages/
│   ├── LoginPage.tsx
│   ├── ChangePasswordPage.tsx
│   ├── DashboardPage.tsx          # заглушка "Привет, {name}"
│   └── admin/
│       ├── UsersPage.tsx          # таблица + кнопка "Создать"
│       └── CreateUserPage.tsx     # форма + показ временного пароля
└── hooks/
    └── useAuth.ts
```

### Роуты

| Путь | Кто видит | Компонент |
|---|---|---|
| `/login` | гость | LoginPage |
| `/change-password` | юзер с `mustChangePassword=true` | ChangePasswordPage |
| `/` | юзер | DashboardPage |
| `/admin/users` | admin | UsersPage |
| `/admin/users/new` | admin | CreateUserPage |

### Auth flow

1. На загрузке приложения — попытка `POST /api/auth/refresh` (browser автоматически шлёт cookie). Если 200 — сохранить `accessToken` в Zustand store. Если 401 — редирект на `/login`.
2. После `POST /api/auth/login` — сохранить токен, прочитать `mustChangePassword` из ответа, при `true` редирект на `/change-password`.
3. На `/change-password` — форма с currentPassword + newPassword + confirmNewPassword. Минимум 12 символов (валидация на фронте и бэке).
4. После смены пароля — редирект на `/`.
5. Logout — POST `/api/auth/logout`, очистить store, редирект на `/login`.
6. На 401 от любого запроса — попытка refresh; если он тоже 401 — logout.

### Страница «Создание пользователя»

После `POST /api/admin/users` сервер вернёт `temporaryPassword`. Покажи его в выделенном блоке с кнопками **«Скопировать»** и **«Готово, я передал пользователю»**. Предупреди, что пароль больше не будет показан.

## Что добавить в `packages/shared`

Расширь `packages/shared/src/index.ts` Zod-схемами:

```ts
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  mustChangePassword: z.boolean(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(12).max(200),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  role: UserRoleSchema,
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const MeResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: UserRoleSchema,
  locale: z.string(),
  timezone: z.string(),
  mustChangePassword: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
```

И на бэке, и на фронте используй эти схемы как источник истины.

## Тесты

### Минимум, который должен пройти

`apps/api/test/auth.e2e-spec.ts` (Jest + Supertest):

1. `POST /api/auth/login` с правильными credentials → 200 + accessToken.
2. `POST /api/auth/login` с неверным паролем → 401.
3. `POST /api/auth/login` 6 раз подряд → 429 (throttle).
4. `GET /api/me` без токена → 401.
5. `GET /api/me` с токеном → 200 + данные пользователя.
6. `GET /api/admin/users` обычным юзером → 403.
7. `POST /api/admin/users` админом → 201 + temporaryPassword.
8. Юзер с `mustChangePassword=true` пытается зайти на `/api/admin/users` → 403 PASSWORD_CHANGE_REQUIRED.
9. После `POST /api/auth/change-password` все старые refresh-токены инвалидируются.

Unit-тесты для `AuthService.validateUser`, `AuthService.rotateRefreshToken`.

## Acceptance Criteria

После завершения спринта эти сценарии должны работать.

### Сценарий 1: Создание первого админа и вход

```bash
pnpm infra:up
pnpm --filter @aqsha/api prisma:migrate -- --name auth-and-audit
pnpm --filter @aqsha/api exec ts-node src/cli/create-admin.ts admin@local.test 'admin1234'
pnpm dev
```

Идём в http://localhost:5173 → редирект на `/login` → вводим `admin@local.test` / `admin1234` → попадаем на `/` → видим заглушку дашборда с приветствием. В правом верхнем углу — переход на «Админ-панель», доступный только админам.

### Сценарий 2: Создание обычного пользователя

Админ → `/admin/users` → видит таблицу (один админ) → «Создать» → заполняет форму с email и именем, роль user → нажимает «Создать» → видит блок с временным паролем `xR5h-pQ2-fT9k` → копирует.

### Сценарий 3: Первый вход обычного юзера

Logout админа. Логинимся под новым email и временным паролем → редирект на `/change-password` → пытаемся пойти на `/admin/users` → 403 (или редирект обратно на `/change-password`) → меняем пароль на минимум 12 символов → попадаем на `/` → дашборд показывает приветствие новому юзеру. В админ-панель не пускает (403).

### Сценарий 4: Изоляция данных

Сейчас данных нет, но проверь, что в `users.service.ts` все методы `findMany` для не-админских эндпоинтов фильтруют по `userId`. Это будет критично в Спринте 2, заложи в код привычку.

### Сценарий 5: Audit log

После всех вышеуказанных шагов в `audit_log` лежит:
- 1 запись `user.created` для админа (системное создание через CLI — `userId = null`)
- N записей `auth.login.success` и `auth.login.failed`
- 1 запись `user.created` для нового юзера
- 1 запись `password.changed`

Проверка: `pnpm --filter @aqsha/api prisma:studio` → таблица `audit_log`.

### Сценарий 6: CI зелёный

```bash
pnpm typecheck   # без ошибок
pnpm test        # все тесты проходят
```

GitHub Actions `CI` workflow проходит на пуше.

## Что НЕ делаем в этом спринте

- Самостоятельная регистрация пользователей.
- Email-подтверждение, восстановление пароля по email.
- 2FA TOTP (фаза 2).
- Audit log UI (только пишем в БД, читать научимся в фазе 2).
- CRUD счетов/категорий/транзакций (Спринты 2–3).

## Готово?

Закоммить с понятным сообщением и открой PR. В описании PR — checklist по acceptance criteria.

```bash
git checkout -b feat/sprint-1-auth
git add .
git commit -m "feat(auth): sprint 1 — login, refresh, admin panel, audit log"
git push -u origin feat/sprint-1-auth
```
