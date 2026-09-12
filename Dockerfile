# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

WORKDIR /app

# Оптимизация сетевых запросов npm и отключение лишней телеметрии/аудита
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_PROGRESS=false

# 1. Копируем манифесты зависимостей и конфиги
COPY package*.json tsconfig.json vite.config.ts ./

# 2. Быстрая детерминированная установка через npm ci (без зависаний кэша BuildKit)
RUN if [ -f package-lock.json ]; then \
        npm ci --no-audit --no-fund; \
    else \
        npm install --no-audit --no-fund; \
    fi

# 3. Сборка приложения
COPY . .
RUN npm run build

# 4. Очистка dev-зависимостей перед копированием в рантайм
RUN npm prune --omit=dev

# Финальный легковесный образ
FROM node:22-slim AS runner

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
