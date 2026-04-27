# Aqsha — контекст для Claude Code

Этот файл читается Claude Code автоматически. Здесь — всё, что нужно знать об этом проекте.

## О проекте

**Aqsha** — self-hosted веб-приложение для учёта личных финансов в духе CoinKeeper 3, адаптированное под Казахстан. Мульти-пользовательское, без публичной регистрации (юзеров создаёт админ). Деплоится на Hetzner VPS, домен `aqsha.nurekella.tech`. Лицензия AGPL-3.0.

Полное ТЗ продукта: `TZ-finance-tracker.md` (если присутствует) или см. README.md.

## Стек (фиксированные версии)

| Слой | Технология |
|---|---|
| Менеджер пакетов | pnpm 9 (workspaces) + Turborepo 2 |
| TypeScript | 5.6 strict |
| Backend | Node.js 22 LTS + NestJS 11 + Prisma 6 |
| Frontend | React 19 + Vite 6 + TailwindCSS 3 + TanStack Query 5 |
| База данных | PostgreSQL 17 |
| Кеш / очереди | Redis 7 + BullMQ |
| Auth | Passport JWT + Argon2id |
| Validation | class-validator (бэк) + Zod (общие схемы в `@aqsha/shared`) |
| Reverse proxy | Nginx Proxy Manager (внешний, на проде) |
| CI/CD | GitHub Actions → ghcr.io |

**Не добавляй новые крупные зависимости без обсуждения.** Если задача решается тем, что уже есть, — используй это.

## Структура монорепо

```
aqsha/
├── apps/
│   ├── api/             NestJS API (port 3000)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   └── <feature>/
│   │   │       ├── <feature>.module.ts
│   │   │       ├── <feature>.controller.ts
│   │   │       ├── <feature>.service.ts
│   │   │       └── dto/
│   │   └── prisma/schema.prisma
│   └── web/             React PWA (port 5173)
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── pages/
│           ├── components/
│           ├── lib/      api-клиент, auth-store, helpers
│           └── routes/
├── packages/
│   └── shared/          Zod-схемы и типы, общие для api и web
├── infra/               docker-compose, скрипты
├── docs/                ТЗ конкретных спринтов
└── .github/workflows/   CI/CD
```

## Команды

```bash
# Установка
pnpm install

# Поднять Postgres + Redis локально
pnpm infra:up

# Применить миграции Prisma (после изменения schema.prisma)
pnpm --filter @aqsha/api prisma:migrate -- --name <название_миграции>

# Сгенерировать Prisma Client (после migrate делается автоматически)
pnpm --filter @aqsha/api prisma:generate

# Запустить всё сразу (api + web)
pnpm dev

# Запустить только api или только web
pnpm --filter @aqsha/api dev
pnpm --filter @aqsha/web dev

# Проверки
pnpm typecheck
pnpm test

# Форматирование
pnpm format
```

## Конвенции кода

### TypeScript
- Strict mode везде. Никаких `any`. Если нужен escape — `unknown` + явная проверка.
- Импорты группируются: внешние библиотеки, потом `@aqsha/*` пакеты, потом относительные.
- Никаких default exports в API-коде. В React-компонентах — named exports.

### NestJS
- Один модуль на фичу. Контроллер тонкий, вся логика в сервисе.
- Все входные данные валидируются через DTO с `class-validator` декораторами.
- Все DTO в подпапке `dto/` модуля.
- Бизнес-исключения — через стандартные NestJS exceptions (`UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `BadRequestException`, `ConflictException`).
- Auth guards — на уровне контроллера (`@UseGuards(...)`) или глобально через `APP_GUARD`.
- Никогда не возвращай `password_hash` или другие секреты в HTTP-ответах. Используй явные select/exclude.

### Prisma
- Migrations через `prisma migrate dev --name <слово>`.
- Названия моделей в `schema.prisma` — PascalCase, в БД через `@@map("snake_case")`.
- Поля в моделях — camelCase, в БД через `@map("snake_case")`.
- Денежные суммы — `Decimal` с `@db.Decimal(18, 4)`.

### React / Frontend
- Компоненты — функциональные, named export.
- Серверное состояние — TanStack Query. Никаких самописных useEffect для fetch.
- Клиентское состояние — Zustand (для глобального) или useState (для локального).
- Tailwind — utility-first, никаких отдельных CSS-файлов кроме `index.css`.
- Тёмная тема — через `dark:` модификаторы. Уже работает через `prefers-color-scheme`.
- Локализация — i18next (добавится в Спринте 6, пока хардкод RU).

### Безопасность (важно)
- Пароли — **только Argon2id** (`argon2` пакет), параметры m=64MB, t=3, p=4.
- JWT access-токен — TTL 15 минут, в памяти SPA.
- JWT refresh-токен — TTL 30 дней, в HttpOnly + Secure + SameSite=Strict cookie.
- Refresh-токены хранятся в БД (таблица `refresh_tokens`) с хешем (SHA-256 от токена), чтобы можно было отозвать.
- Все эндпоинты `/api/admin/*` требуют роль `admin` через `@Roles('admin')` и `RolesGuard`.
- Все эндпоинты, кроме `/api/health` и `/api/auth/login`, требуют JWT.
- Изоляция данных: каждый запрос пользователя должен фильтровать ресурсы по `userId = currentUser.id`.

### Чего НЕ делать
- Не коммить `.env`, секреты, токены.
- Не отключай TypeScript strict mode.
- Не добавляй `console.log` в проде — используй Pino logger.
- Не делай `git push --force` в `main`.
- Не используй ORM raw queries без причины (Prisma type-safe API почти всегда хватает).
- Не пиши тесты ради тестов — покрывай критичные пути (auth, расчёты денег, изоляция).

## Текущий спринт

**Спринт 1: Auth + БД + админ-панель.** Полное ТЗ: `docs/SPRINT-1.md`.

После этого пойдём в Спринт 2 (счета и категории), Спринт 3 (транзакции), и далее по дорожной карте в README.md.

## Когда сомневаешься

- Сомневаешься в архитектурном выборе → спроси автора (Nurbol) до того, как писать код.
- Сомневаешься в именовании → следуй существующим конвенциям в кодбейзе.
- Не уверен, что делать дальше → загляни в `docs/SPRINT-1.md`, секция Acceptance Criteria.
