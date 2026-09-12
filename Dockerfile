# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder

WORKDIR /app

# 1. Установка с кэшированием Docker BuildKit
COPY package*.json tsconfig.json vite.config.ts ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

# 2. Сборка приложения
COPY . .
RUN npm run build

# 3. Очистка dev-зависимостей
RUN npm prune --omit=dev

# Финальный легковесный образ
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Копируем готовые модули и билд
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/metadata.json ./metadata.json
COPY --from=builder /app/modules ./modules

RUN mkdir -p /app/storage

EXPOSE 3000

CMD ["node", "dist/server.cjs"]