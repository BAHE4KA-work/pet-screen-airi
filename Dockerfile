# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

WORKDIR /app

# 1. Принудительный IPv4 DNS (устраняет зависание на IPv6 в Docker Desktop / WSL2)
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

# 2. Ограничиваем таймауты сетевых запросов
ENV NPM_CONFIG_FETCH_TIMEOUT=25000 \
    NPM_CONFIG_FETCH_RETRIES=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=2000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=10000 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

# 3. Поддержка прокси и кастомных зеркал при сборке
ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    NO_PROXY=${NO_PROXY}

# Копируем манифесты зависимостей и конфигурацию сборщика
COPY package.json tsconfig.json vite.config.ts ./

# 4. Проверка доступности реестра + установка зависимостей.
# ВАЖНО: Не используем --omit=optional, так как Rollup и esbuild
# хранят платформозависимые бинарники (linux-x64) в optionalDependencies!
RUN set -e; \
    CHOSEN_REGISTRY="${NPM_REGISTRY}"; \
    echo "Testing npm registry connectivity: ${CHOSEN_REGISTRY}..."; \
    if ! node -e "fetch('${CHOSEN_REGISTRY}', { signal: AbortSignal.timeout(3500) }).then(r => process.exit(r.ok || r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"; then \
        echo "--> WARNING: ${CHOSEN_REGISTRY} is unreachable. Switching to mirror https://registry.npmmirror.com/"; \
        CHOSEN_REGISTRY="https://registry.npmmirror.com/"; \
    else \
        echo "--> Connected to ${CHOSEN_REGISTRY} successfully."; \
    fi; \
    npm config set registry "${CHOSEN_REGISTRY}"; \
    echo "Installing packages from ${CHOSEN_REGISTRY}..."; \
    npm install --no-audit --no-fund; \
    if [ ! -d "node_modules/@rollup/rollup-linux-x64-gnu" ]; then \
        echo "Ensuring native @rollup/rollup-linux-x64-gnu module is present..."; \
        npm install --no-save --no-audit --no-fund @rollup/rollup-linux-x64-gnu; \
    fi

# 5. Копируем исходный код и собираем продакшн-билд
COPY . .
RUN npm run build

# 6. Очищаем dev-зависимости для минимизации размера итогового образа
RUN npm prune --omit=dev

# 7. Финальный минимальный рантайм-образ
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/metadata.json ./metadata.json
COPY --from=builder /app/modules ./modules

RUN mkdir -p /app/storage

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
