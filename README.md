# Aqsha

> Учёт личных финансов для Казахстана. Веб-приложение в духе CoinKeeper 3, мульти-пользовательское, self-hosted.

- **Frontend** — React 19 + TypeScript + Vite + TailwindCSS, упакован как PWA (iOS / Android / Windows / macOS / Linux)
- **Backend** — NestJS 11 + TypeScript + Prisma + PostgreSQL 17 + Redis 7
- **Деплой** — Docker Compose на Hetzner VPS, проксирование через существующий Nginx Proxy Manager
- **Лицензия** — AGPL-3.0

## Структура

```
aqsha/
├── apps/
│   ├── api/         NestJS API
│   └── web/         React PWA
├── packages/
│   └── shared/      Общие типы и Zod-схемы
├── infra/           docker-compose, скрипты, .env.example, инструкция по деплою
└── .github/         CI/CD пайплайны
```

## Требования к локальной машине

- **Node.js 22 LTS** — [nvm-windows](https://github.com/coreybutler/nvm-windows) или https://nodejs.org
- **pnpm 9** — `npm install -g pnpm` либо `corepack enable`
- **Docker Desktop** — https://docs.docker.com/desktop/install/windows-install/
- **Git**

## Старт локально (Windows / PowerShell)

```powershell
cd C:\Users\n.khamzauly\Documents\github\aqsha

# 1. Заменить заглушку LICENSE полным текстом AGPL-3.0
Invoke-WebRequest https://www.gnu.org/licenses/agpl-3.0.txt -OutFile LICENSE

# 2. Установить зависимости
pnpm install

# 3. Поднять Postgres + Redis в Docker
pnpm infra:up

# 4. Скопировать пример .env для API
Copy-Item apps\api\.env.example apps\api\.env

# 5. Применить схему Prisma (создаст таблицу users)
pnpm --filter @aqsha/api prisma:generate
pnpm --filter @aqsha/api prisma:migrate -- --name init

# 6. Запустить dev-сервер (API + Web одновременно через Turborepo)
pnpm dev
```

После запуска:
- **Web** → http://localhost:5173
- **API** → http://localhost:3000/api/health

Должна открыться страница с заголовком «Aqsha» и блоком «Состояние API: ok».

### Останавливаем зависимости

```powershell
pnpm infra:down
```

## Что внутри скелета

Это **Спринт 0** из дорожной карты ТЗ — рабочая база, на которой строится остальное:

- ✅ Монорепо на pnpm workspaces + Turborepo
- ✅ TypeScript строгий, единая база `tsconfig.base.json`
- ✅ NestJS API с эндпоинтом `GET /api/health`
- ✅ Prisma schema с моделью `User` (роли admin/user, must_change_password, soft delete)
- ✅ React 19 + Vite + Tailwind + TanStack Query
- ✅ PWA-манифест (vite-plugin-pwa)
- ✅ Тёмная тема через `prefers-color-scheme`
- ✅ Docker Compose для локальной разработки (Postgres + Redis)
- ✅ Docker Compose для прода с подключением к external network NPM
- ✅ Multi-stage Dockerfiles для api и web
- ✅ GitHub Actions: CI (typecheck + test) и Build (push в ghcr.io)
- ✅ Скрипты `backup.sh` и `create-admin.sh`
- ✅ Подробная инструкция по деплою через NPM в `infra/README.md`

Что ещё **не** реализовано (это Спринт 1 и далее):
- Auth (регистрация/вход, JWT) — в схеме Prisma модель есть, эндпоинтов нет
- CRUD счетов, категорий, транзакций
- Админ-панель
- Импорт CSV
- Графики и дашборд

## Деплой на VPS

См. `infra/README.md` — там пошаговая инструкция по настройке Proxy Host в NPM, ghcr.io авторизации, бэкапов в Yandex Object Storage.

## Лицензия

[AGPL-3.0](./LICENSE) — © 2026 Nurbol Khamzauly
