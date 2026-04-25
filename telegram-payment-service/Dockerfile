# Telegram Payment Service (NestJS). Uses same Postgres/Redis as main app (DB: telegram_payments).
# Debian slim: Prisma engine needs glibc/OpenSSL; Alpine (musl) often fails with "Error load..." / schema engine.
FROM node:20-slim
WORKDIR /app
# node-gyp (utf-8-validate, etc.) + OpenSSL for Prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3001
# Apply migrations on startup, then run the app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
