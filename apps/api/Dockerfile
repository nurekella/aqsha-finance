# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml* package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app /app
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN pnpm prisma generate
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Workspace metadata + hoisted root node_modules (pnpm symlinks resolve via these)
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules

# Workspace package referenced by api as @aqsha/shared (symlink target)
COPY --from=build /app/packages/shared ./packages/shared

# API artifacts
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
