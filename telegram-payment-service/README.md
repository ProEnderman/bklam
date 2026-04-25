# Telegram Payment Service

Микросервис для генерации платежных ссылок через Telegram Bank Bot.

## Архитектура

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│  Telegram Login Widget │ MTProto Wizard │ Payment Request UI     │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                      API Gateway (NestJS)                         │
│  TelegramController │ PaymentsController │ Guards (JWT, RBAC)    │
└──────────────────────────────────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
   ┌──────────┐          ┌──────────┐          ┌──────────────┐
   │ Postgres │          │  Redis   │          │ BullMQ Worker│
   │ Sessions │          │  Cache   │          │  Bank Bot    │
   │ Payments │          │  Queue   │          │  Integration │
   └──────────┘          └──────────┘          └──────────────┘
```

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка окружения

```bash
cp env.example .env
# Отредактируйте .env и заполните:
# - DATABASE_URL
# - REDIS_URL
# - TG_API_ID, TG_API_HASH (получить на https://my.telegram.org)
# - TG_BOT_TOKEN (создать через @BotFather)
# - BANK_BOT_USERNAME
# - BANK_ALLOWED_DOMAINS
# - MASTER_KEY (сгенерировать: openssl rand -base64 32)
```

### 3. Инициализация базы данных

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4. Запуск

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

### Telegram

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/telegram/link` | Привязать Telegram аккаунт (Login Widget) |
| DELETE | `/telegram/link` | Отвязать Telegram аккаунт |
| POST | `/telegram/mtproto/sendCode` | Шаг 1: Отправить код на телефон |
| POST | `/telegram/mtproto/confirmCode` | Шаг 2: Подтвердить код |
| POST | `/telegram/mtproto/confirmPassword` | Шаг 3: Ввести 2FA пароль (если включен) |
| DELETE | `/telegram/mtproto/sessions/:id` | Отозвать сессию |

### Платежи

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/payment_requests` | Создать запрос на платежную ссылку |
| GET | `/payment_requests/:id` | Получить статус запроса |
| GET | `/payment_requests/:id/qr` | Получить QR-код (PNG) |
| POST | `/payment_requests/:id/cancel` | Отменить запрос |
| POST | `/payment_requests/:id/refresh` | Повторить запрос |
| GET | `/payment_requests/:id/fallback` | Получить fallback URL |
| POST | `/payment_requests/:id/manual-url` | Ввести URL вручную (fallback) |

## Статусы Payment Request

| Status | Описание |
|--------|----------|
| `CREATED` | Запрос создан, задача в очереди |
| `SENT` | Сообщение отправлено в bank bot |
| `LINK_RECEIVED` | Ссылка получена |
| `TIMEOUT` | Bank bot не ответил |
| `UNPARSABLE` | Ответ получен, URL не найден |
| `SESSION_INVALID` | MTProto сессия невалидна |
| `RATE_LIMITED` | Telegram rate limit |
| `CANCELLED` | Отменено пользователем |

## Безопасность

- **Session strings** шифруются AES-256-GCM перед сохранением в БД
- **Пароли и коды** НЕ сохраняются и НЕ логируются
- **Телефоны** маскируются в логах: `+7***1234`
- **RBAC**: Кассиры видят только свои запросы

## Риски MTProto userbot

⚠️ Использование MTProto userbot может привести к:
- Flood wait (временная блокировка запросов)
- Ограничение или бан аккаунта (в редких случаях)
- Bank bot может игнорировать сообщения от userbot

**Fallback UX**: Если bank bot не отвечает, пользователь может открыть Telegram вручную через `tg://resolve` ссылку и скопировать URL.

## Переменные окружения

См. `env.example` для полного списка.
