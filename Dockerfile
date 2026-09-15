# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

WORKDIR /app

# 1. Принудительный IPv4 DNS (устраняет зависание на IPv6 в Docker Desktop / WSL2)
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

# 2. Сетевые таймауты и повторные попытки (защита от разрывов TLS и медленных соединений)
ENV NPM_CONFIG_FETCH_TIMEOUT=60000 \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=5000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=60000 \
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
COPY package.json package-lock.json* tsconfig.json vite.config.ts ./

# 4. Надежная установка зависимостей с автоматическим переключением зеркал
RUN set -e; \
    install_with_registry() { \
      REG="$1"; \
      echo "--> Trying to install dependencies using registry: $REG"; \
      npm config set registry "$REG"; \
      if npm install --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=4; then \
        return 0; \
      else \
        echo "--> Installation failed on $REG"; \
        return 1; \
      fi; \
    }; \
    if ! install_with_registry "${NPM_REGISTRY}"; then \
      echo "--> Primary registry failed. Trying fallback: https://registry.yarnpkg.com/"; \
      if ! install_with_registry "https://registry.yarnpkg.com/"; then \
        echo "--> Fallback registry failed. Trying: https://registry.npmmirror.com/"; \
        install_with_registry "https://registry.npmmirror.com/"; \
      fi; \
    fi; \
    if [ ! -d "node_modules/@rollup/rollup-linux-x64-gnu" ]; then \
      echo "Ensuring native @rollup/rollup-linux-x64-gnu module is present..."; \
      npm install --no-save --no-audit --no-fund @rollup/rollup-linux-x64-gnu || true; \
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
