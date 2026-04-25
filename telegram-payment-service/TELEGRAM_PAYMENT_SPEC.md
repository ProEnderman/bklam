# Telegram Payment Link Service — Mini-Spec

## 1. Архитектура и основные компоненты

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ Telegram Login   │  │ MTProto Wizard   │  │ Payment Request UI       │   │
│  │ Widget           │  │ (phone→code→2FA) │  │ (Create, QR, Status)     │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY (NestJS)                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ TelegramController│ │ PaymentsController│ │ Guards (JWT, RBAC)       │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ TelegramLogin    │  │ PaymentsService  │  │ AuditService             │   │
│  │ Service          │  │                  │  │                          │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ MtprotoService   │  │ QrService        │  │ CryptoService            │   │
│  │ (gramjs wrapper) │  │ (qrcode + cache) │  │ (AES-GCM encrypt)        │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────────────┐
│    PostgreSQL        │ │     Redis        │ │   BullMQ Worker              │
│ ─────────────────────│ │ ─────────────────│ │ ─────────────────────────────│
│ • users              │ │ • Queue: bank-bot│ │ • sendToBankBot.processor    │
│ • restaurants        │ │ • QR cache       │ │   - MTProto client           │
│ • telegram_accounts  │ │ • Rate limit     │ │   - Send message to @BankBot │
│ • telegram_sessions  │ │                  │ │   - Wait for reply (updates) │
│ • invoices           │ │                  │ │   - Parse URL                │
│ • payment_requests   │ │                  │ │   - Update payment_request   │
│ • payment_links      │ │                  │ │                              │
│ • audit_logs         │ │                  │ │ ┌──────────────────────────┐ │
└──────────────────────┘ └──────────────────┘ │ │ BankBotService           │ │
                                              │ │ ParserService            │ │
                                              │ └──────────────────────────┘ │
                                              └──────────────────────────────┘
```

### Где живёт логика:
| Компонент | Расположение |
|-----------|--------------|
| MTProto клиент (gramjs) | `MtprotoService` + Worker |
| Парсинг ответа bank bot | `ParserService` (вызывается в Worker) |
| Генерация QR | `QrService` (API layer + Redis cache) |
| Шифрование session | `CryptoService` |

---

## 2. End-to-End Flow

### 2.1 Привязка Telegram (Telegram Login Widget)

```
┌────────┐      ┌────────┐      ┌────────────┐      ┌──────────┐
│ Cashier│      │Frontend│      │   API      │      │ Telegram │
└───┬────┘      └───┬────┘      └─────┬──────┘      └────┬─────┘
    │               │                 │                  │
    │ Click Login   │                 │                  │
    │──────────────►│                 │                  │
    │               │  Telegram Widget popup             │
    │               │────────────────────────────────────►
    │               │                 │                  │
    │               │◄───────────── auth data ───────────│
    │               │ (id, first_name, username,         │
    │               │  photo_url, auth_date, hash)       │
    │               │                 │                  │
    │               │ POST /telegram/link                │
    │               │────────────────►│                  │
    │               │                 │                  │
    │               │                 │ verify hash:     │
    │               │                 │ HMAC-SHA256(     │
    │               │                 │   data_check_string,
    │               │                 │   SHA256(bot_token))
    │               │                 │                  │
    │               │                 │ Save to DB:      │
    │               │                 │ telegram_accounts│
    │               │                 │ (telegram_user_id,
    │               │                 │  username,       │
    │               │                 │  auth_date,      │
    │               │                 │  verified_at)    │
    │               │                 │                  │
    │               │◄────── 200 OK ──│                  │
    │               │                 │                  │
```

**Сохраняемые данные в `telegram_accounts`:**
- `telegram_user_id` (bigint)
- `username` (varchar)
- `first_name`, `last_name` (varchar, nullable)
- `photo_url` (varchar, nullable)
- `auth_date` (timestamp)
- `hash` (varchar) — для аудита
- `verified_at` (timestamp)

### 2.2 MTProto Onboarding Wizard

```
┌────────┐      ┌────────┐      ┌────────────┐      ┌──────────┐
│ Cashier│      │Frontend│      │   API      │      │ Telegram │
└───┬────┘      └───┬────┘      └─────┬──────┘      └────┬─────┘
    │               │                 │                  │
    │ Enter phone   │                 │                  │
    │──────────────►│                 │                  │
    │               │ POST /telegram/mtproto/sendCode    │
    │               │────────────────►│                  │
    │               │                 │                  │
    │               │                 │ gramjs.sendCode()│
    │               │                 │─────────────────►│
    │               │                 │◄─── code sent ───│
    │               │                 │                  │
    │               │◄── 200 {phoneCodeHash} ──          │
    │               │                 │                  │
    │ Enter code    │                 │                  │
    │──────────────►│                 │                  │
    │               │ POST /telegram/mtproto/confirmCode │
    │               │────────────────►│                  │
    │               │                 │                  │
    │               │                 │ gramjs.signIn()  │
    │               │                 │─────────────────►│
    │               │                 │◄─ SESSION_PASSWORD_NEEDED
    │               │                 │  (if 2FA enabled)│
    │               │◄── 200 {requires2FA: true} ────────│
    │               │                 │                  │
    │ Enter 2FA pwd │                 │                  │
    │──────────────►│                 │                  │
    │               │ POST /telegram/mtproto/confirmPassword
    │               │────────────────►│                  │
    │               │                 │                  │
    │               │                 │ gramjs.checkPassword()
    │               │                 │─────────────────►│
    │               │                 │◄─── authorized ──│
    │               │                 │                  │
    │               │                 │ session = client.session.save()
    │               │                 │ encrypted = AES-GCM(session)
    │               │                 │ store in telegram_sessions
    │               │                 │ audit_log(SESSION_CREATED)
    │               │                 │                  │
    │               │◄── 200 OK {sessionLinked: true} ───│
```

**Хранение в `telegram_sessions`:**
- `encrypted_session` (text) — AES-GCM зашифрованный session string
- `key_id` (varchar) — идентификатор ключа шифрования (для ротации)
- `created_at`, `last_used_at` (timestamp)
- `revoked_at` (timestamp, nullable)
- `failure_count` (int) — счётчик ошибок (flood wait, invalid session)

**Аудит событий:**
- `SESSION_CREATED`
- `SESSION_USED`
- `SESSION_REVOKED`
- `SESSION_FAILED`

### 2.3 Создание оплаты

```
┌────────┐      ┌────────┐      ┌────────────┐      ┌──────────┐      ┌────────┐
│ Cashier│      │Frontend│      │   API      │      │  Redis   │      │ Worker │
└───┬────┘      └───┬────┘      └─────┬──────┘      └────┬─────┘      └───┬────┘
    │               │                 │                  │                │
    │ Click         │                 │                  │                │
    │ "Сформировать │                 │                  │                │
    │  ссылку"      │                 │                  │                │
    │──────────────►│                 │                  │                │
    │               │ POST /payment_requests             │                │
    │               │ {invoiceId}     │                  │                │
    │               │────────────────►│                  │                │
    │               │                 │                  │                │
    │               │                 │ Check idempotency_key             │
    │               │                 │ (invoiceId + cashierId)           │
    │               │                 │                  │                │
    │               │                 │ Create payment_request            │
    │               │                 │ status=CREATED   │                │
    │               │                 │                  │                │
    │               │                 │ Queue job        │                │
    │               │                 │─────────────────►│                │
    │               │                 │ sendToBankBot    │                │
    │               │                 │ (paymentRequestId)                │
    │               │                 │                  │                │
    │               │◄── 201 {id, status} ───────────────│                │
    │               │                 │                  │                │
    │               │                 │                  │ Dequeue job    │
    │               │                 │                  │───────────────►│
    │               │                 │                  │                │
```

### 2.4 Worker sendToBankBot

```
┌────────┐      ┌────────────┐      ┌──────────┐      ┌──────────┐
│ Worker │      │ MtprotoSvc │      │ BankBot  │      │    DB    │
└───┬────┘      └─────┬──────┘      └────┬─────┘      └────┬─────┘
    │                 │                  │                 │
    │ Process job     │                  │                 │
    │ (paymentRequestId)                 │                 │
    │                 │                  │                 │
    │ Load telegram_session              │                 │
    │───────────────────────────────────────────────────── │
    │◄────────────── encrypted_session ──────────────────  │
    │                 │                  │                 │
    │ Decrypt session │                  │                 │
    │ Init gramjs     │                  │                 │
    │────────────────►│                  │                 │
    │                 │ client.connect() │                 │
    │                 │                  │                 │
    │                 │ sendMessage(     │                 │
    │                 │   @BankBot,      │                 │
    │                 │   template)      │                 │
    │                 │─────────────────►│                 │
    │                 │                  │                 │
    │                 │◄── message sent ─│                 │
    │                 │ (msg.id)         │                 │
    │◄────────────────│                  │                 │
    │                 │                  │                 │
    │ Update DB:      │                  │                 │
    │ sent_message_id │                  │                 │
    │ status=SENT     │                  │                 │
    │─────────────────────────────────────────────────────►│
    │                 │                  │                 │
    │                 │ Wait for reply   │                 │
    │                 │ (updates, 30s    │                 │
    │                 │  timeout)        │                 │
    │                 │◄─────────────────│                 │
    │                 │ reply message    │                 │
    │◄────────────────│                  │                 │
    │                 │                  │                 │
    │ Match reply:    │                  │                 │
    │ reply_to_msg_id │                  │                 │
    │ OR invoiceId    │                  │                 │
    │ marker in text  │                  │                 │
    │                 │                  │                 │
    │ Parse URL       │                  │                 │
    │ (ParserService) │                  │                 │
    │                 │                  │                 │
    │ Update DB:      │                  │                 │
    │ payment_link    │                  │                 │
    │ status=LINK_    │                  │                 │
    │ RECEIVED        │                  │                 │
    │─────────────────────────────────────────────────────►│
    │                 │                  │                 │
```

**Возможные статусы `payment_request.status`:**
| Status | Описание |
|--------|----------|
| `CREATED` | Запрос создан, job в очереди |
| `SENT` | Сообщение отправлено в bank bot |
| `LINK_RECEIVED` | Ссылка получена и распарсена |
| `TIMEOUT` | Bank bot не ответил за 30s |
| `UNPARSABLE` | Ответ получен, но URL не найден |
| `SESSION_INVALID` | Сессия MTProto невалидна |
| `RATE_LIMITED` | Flood wait от Telegram |
| `CANCELLED` | Отменено кассиром |

### 2.5 QR Code Flow

```
┌────────┐      ┌────────┐      ┌────────────┐      ┌──────────┐
│ Cashier│      │Frontend│      │   API      │      │  Redis   │
└───┬────┘      └───┬────┘      └─────┬──────┘      └────┬─────┘
    │               │                 │                  │
    │               │ GET /payment_requests/:id          │
    │               │ (polling every 2s)                 │
    │               │────────────────►│                  │
    │               │                 │                  │
    │               │◄── {status: LINK_RECEIVED} ────────│
    │               │                 │                  │
    │               │ GET /payment_requests/:id/qr       │
    │               │────────────────►│                  │
    │               │                 │                  │
    │               │                 │ Check cache:     │
    │               │                 │ qr:{id}:{urlHash}│
    │               │                 │─────────────────►│
    │               │                 │                  │
    │               │                 │◄── cache miss ───│
    │               │                 │                  │
    │               │                 │ Generate QR PNG  │
    │               │                 │ (qrcode lib)     │
    │               │                 │                  │
    │               │                 │ Cache QR         │
    │               │                 │ TTL=15min        │
    │               │                 │─────────────────►│
    │               │                 │                  │
    │               │◄── image/png ───│                  │
    │               │                 │                  │
    │ Show QR       │                 │                  │
    │◄──────────────│                 │                  │
```

**UI элементы:**
- QR-код
- Таймер (время до истечения ссылки, если известно)
- Кнопка "Обновить ссылку" → POST /payment_requests/:id/refresh
- Кнопка "Отменить" → POST /payment_requests/:id/cancel
- Fallback: "Открыть Telegram" (если bank bot не отвечает)

---

## 3. Формат сообщения в Bank Bot

**Шаблон настраивается через env или таблицу `settings`:**

```env
BANK_BOT_MESSAGE_TEMPLATE="Оплата заказа №{invoiceId}\nСумма: {amount} {currency}\nМаркер: {paymentRequestId}"
```

**Пример сообщения:**
```
Оплата заказа №INV-2026-00142
Сумма: 1500.00 RUB
Маркер: pr_abc123def456
```

> **TODO:** Формат зависит от конкретного bank bot. Необходимо уточнить:
> - Какие команды принимает бот (`/pay`, `/invoice`, plain text?)
> - Требуется ли специальный формат суммы
> - Какой формат ответа (inline button, text с URL?)

**Маркер `paymentRequestId`** используется для сопоставления ответа, если bank bot не использует `reply_to_message_id`.

---

## 4. Парсинг ответа Bank Bot

```typescript
// ParserService.extractPaymentUrl()

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

function extractPaymentUrl(messageText: string, allowedDomains: string[]): string | null {
  const urls = messageText.match(URL_REGEX) || [];
  
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (allowedDomains.some(domain => parsed.hostname.endsWith(domain))) {
        return url;
      }
    } catch {
      continue;
    }
  }
  
  return null; // UNPARSABLE
}
```

**Конфигурация:**
```env
BANK_ALLOWED_DOMAINS=pay.bank.ru,secure.bank.ru,payment.bank.ru
```

**Минимизация данных:**
- НЕ хранить полный текст сообщений бота
- Хранить только:
  - `bot_message_id` — ID сообщения с ответом
  - `url_hash` — SHA256 от URL (для дедупликации и кэша QR)

---

## 5. Сущности БД (PostgreSQL + Prisma)

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Restaurant {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users    User[]
  invoices Invoice[]

  @@map("restaurants")
}

model User {
  id           String  @id @default(cuid())
  email        String  @unique
  passwordHash String
  role         Role    @default(CASHIER)
  
  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])

  telegramAccount  TelegramAccount?
  telegramSessions TelegramSession[]
  paymentRequests  PaymentRequest[]
  auditLogs        AuditLog[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}

enum Role {
  ADMIN
  OWNER
  MANAGER
  CASHIER
}

model TelegramAccount {
  id             String   @id @default(cuid())
  userId         String   @unique
  user           User     @relation(fields: [userId], references: [id])

  telegramUserId BigInt   @unique
  username       String?
  firstName      String?
  lastName       String?
  photoUrl       String?
  authDate       DateTime
  hash           String   // Original hash from widget for audit
  verifiedAt     DateTime @default(now())

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("telegram_accounts")
}

model TelegramSession {
  id               String    @id @default(cuid())
  userId           String
  user             User      @relation(fields: [userId], references: [id])

  encryptedSession String    // AES-GCM encrypted session string
  keyId            String    // Encryption key identifier for rotation
  phone            String    // Phone number (masked in logs)
  
  lastUsedAt       DateTime?
  revokedAt        DateTime?
  failureCount     Int       @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, revokedAt])
  @@map("telegram_sessions")
}

model Invoice {
  id           String   @id @default(cuid())
  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])

  invoiceNumber String   @unique
  amount        Decimal  @db.Decimal(10, 2)
  currency      String   @default("RUB")
  description   String?

  paymentRequests PaymentRequest[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("invoices")
}

model PaymentRequest {
  id             String              @id @default(cuid())
  invoiceId      String
  invoice        Invoice             @relation(fields: [invoiceId], references: [id])
  userId         String
  user           User                @relation(fields: [userId], references: [id])

  idempotencyKey String              @unique // hash(invoiceId + userId)
  status         PaymentRequestStatus @default(CREATED)
  
  sentMessageId  BigInt?             // Telegram message ID
  attemptNo      Int                 @default(1)
  
  errorCode      String?             // TIMEOUT, SESSION_INVALID, etc.
  errorMessage   String?

  paymentLink    PaymentLink?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([invoiceId, userId])
  @@index([status])
  @@map("payment_requests")
}

enum PaymentRequestStatus {
  CREATED
  SENT
  LINK_RECEIVED
  TIMEOUT
  UNPARSABLE
  SESSION_INVALID
  RATE_LIMITED
  CANCELLED
}

model PaymentLink {
  id               String   @id @default(cuid())
  paymentRequestId String   @unique
  paymentRequest   PaymentRequest @relation(fields: [paymentRequestId], references: [id])

  encryptedUrl     String?  // Optional: encrypt if storing full URL
  urlHash          String   // SHA256 of URL for caching/dedup
  botMessageId     BigInt?  // ID of bot's reply message
  
  expiresAt        DateTime?

  createdAt DateTime @default(now())

  @@map("payment_links")
}

model AuditLog {
  id       String   @id @default(cuid())
  userId   String?
  user     User?    @relation(fields: [userId], references: [id])
  
  action   String   // SESSION_CREATED, SESSION_REVOKED, PAYMENT_REQUESTED, etc.
  entity   String   // telegram_session, payment_request
  entityId String?
  
  metadata Json?    // Additional context (masked)
  ip       String?
  userAgent String?

  createdAt DateTime @default(now())

  @@index([userId, createdAt])
  @@index([action, createdAt])
  @@map("audit_logs")
}
```

---

## 6. RBAC (Role-Based Access Control)

### Матрица разрешений:

| Действие | ADMIN | OWNER | MANAGER | CASHIER |
|----------|-------|-------|---------|---------|
| Привязка своего TG | ✓ | ✓ | ✓ | ✓ |
| Отвязка своего TG | ✓ | ✓ | ✓ | ✓ |
| MTProto onboarding (свой) | ✓ | ✓ | ✓ | ✓ |
| Отзыв своей сессии | ✓ | ✓ | ✓ | ✓ |
| Отзыв чужой сессии | ✓ | ✓ | ✗ | ✗ |
| Просмотр аудит-лога | ✓ | ✓ | ✓ (свои) | ✗ |
| Создание payment_request | ✓ | ✓ | ✓ | ✓ |
| Просмотр QR | ✓ | ✓ | ✓ | ✓ (свои) |
| Просмотр всех payment_requests | ✓ | ✓ | ✓ | ✗ |
| Отмена payment_request | ✓ | ✓ | ✓ (свои) | ✓ (свои) |

### Проверки в API:

```typescript
// guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<Role[]>('roles', context.getHandler());
    const user = context.switchToHttp().getRequest().user;
    return requiredRoles.includes(user.role);
  }
}

// Пример использования
@Post('payment_requests')
@Roles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.CASHIER)
@UseGuards(JwtAuthGuard, RolesGuard)
createPaymentRequest(@CurrentUser() user, @Body() dto: CreatePaymentRequestDto) {
  // ...
}

// Проверка "свои" ресурсы
@Get('payment_requests/:id')
async getPaymentRequest(@CurrentUser() user, @Param('id') id: string) {
  const pr = await this.paymentsService.findById(id);
  
  if (user.role === Role.CASHIER && pr.userId !== user.id) {
    throw new ForbiddenException('Access denied');
  }
  
  return pr;
}
```

---

## 7. Безопасность, комплаенс и риски MTProto userbot

### 7.1 Защита данных

| Что | Как защищаем |
|-----|--------------|
| Session string | AES-256-GCM шифрование |
| Ключи шифрования | MASTER_KEY из env (prod: KMS/Vault) |
| Пароли/коды | НЕ храним, НЕ логируем |
| Телефоны в логах | Маскируем: `+7***1234` |
| URL платежей | Опционально шифруем, храним urlHash |

### 7.2 Шифрование session string

```typescript
// crypto.service.ts
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

async function encrypt(plaintext: string, masterKey: string): Promise<string> {
  const key = await deriveKey(masterKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const tag = cipher.getAuthTag();
  
  // Format: base64(iv + tag + encrypted)
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

async function decrypt(ciphertext: string, masterKey: string): Promise<string> {
  const key = await deriveKey(masterKey);
  const data = Buffer.from(ciphertext, 'base64');
  
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  return decipher.update(encrypted) + decipher.final('utf8');
}
```

### 7.3 Rate Limiting & Idempotency

```typescript
// Idempotency key: hash(invoiceId + userId)
// Дедупликация: проверяем существующий payment_request с тем же ключом

@Post('payment_requests')
async create(@Body() dto: CreatePaymentRequestDto, @CurrentUser() user) {
  const idempotencyKey = createHash('sha256')
    .update(`${dto.invoiceId}:${user.id}`)
    .digest('hex');
  
  const existing = await this.prisma.paymentRequest.findUnique({
    where: { idempotencyKey }
  });
  
  if (existing) {
    return existing; // Возвращаем существующий, не создаём новый
  }
  
  // Create new...
}
```

### 7.4 Риски MTProto userbot

| Риск | Вероятность | Mitigation |
|------|-------------|------------|
| Flood wait от Telegram | Высокая | Exponential backoff, queue delays |
| Временная блокировка аккаунта | Средняя | Предупреждение пользователя, low-frequency requests |
| Bank bot игнорирует userbot | Средняя | Fallback UX |
| Инвалидация сессии | Низкая | Re-auth flow, уведомление |
| Полный бан аккаунта | Низкая | Явное предупреждение при onboarding |

### 7.5 Fallback UX

Если bank bot не отвечает (TIMEOUT) или блокирует userbot:

```typescript
// Frontend fallback
const fallbackUrl = `tg://resolve?domain=${BANK_BOT_USERNAME}&text=${encodeURIComponent(messageTemplate)}`;

// Показать кнопку:
// "Открыть Telegram и отправить запрос вручную"
// → window.open(fallbackUrl)
```

**UI Flow:**
1. Показать сообщение: "Bank bot не отвечает. Попробуйте отправить запрос вручную."
2. Кнопка "Открыть Telegram" — открывает чат с предзаполненным текстом
3. Инструкция: "Скопируйте ссылку из ответа бота и вставьте сюда"
4. Input для ручного ввода URL
5. Валидация URL (allowedDomains)
6. Генерация QR

### 7.6 Метрики и логи

**Метрики (Prometheus):**
```
tg_payment_requests_total{status="LINK_RECEIVED"}
tg_payment_requests_total{status="TIMEOUT"}
tg_payment_requests_total{status="SESSION_INVALID"}
tg_mtproto_flood_wait_seconds_bucket
tg_bankbot_response_time_seconds_bucket
```

**Логи (структурированные):**
```json
{
  "level": "info",
  "message": "Payment request created",
  "paymentRequestId": "pr_xxx",
  "invoiceId": "inv_xxx",
  "userId": "user_xxx",
  "phone": "+7***1234"
}
```

---

## 8. Код-скелет

См. директорию `src/` для полной структуры.
