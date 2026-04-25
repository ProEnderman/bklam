# JWT Setup для Telegram Payment Service

## Важно: JWT_SECRET должен совпадать!

Для работы проксирования через Java backend, **JWT_SECRET должен быть одинаковым** в обоих сервисах.

### 1. Проверьте JWT_SECRET в Java backend

В файле `.env` или `application.yml`:
```yaml
jwt:
  secret: your-secret-key-should-be-at-least-256-bits-long-for-hs256-algorithm
```

### 2. Установите тот же JWT_SECRET в NestJS

В файле `telegram-payment-service/.env`:
```env
JWT_SECRET="your-secret-key-should-be-at-least-256-bits-long-for-hs256-algorithm"
```

**Важно:** Значение должно быть **точно таким же** (включая кавычки, если они есть).

### 3. Перезапустите оба сервиса

После изменения JWT_SECRET:
```bash
# Перезапустите Java backend
# Перезапустите NestJS сервис
npm run start:dev
```

### 4. Проверка логов

При запуске NestJS вы должны увидеть:
```
JWT_SECRET configured: YES
```

В логах Java backend при проксировании:
```
Generated JWT token for user: username (userId: 1, role: ADMIN)
Proxying POST to: http://localhost:3001/payment_requests
Authorization header present: true
```

В логах NestJS при получении запроса:
```
JWT Payload received: { "sub": "username", "userId": 1, "role": "ADMIN", ... }
```

### 5. Если все еще 401

1. Проверьте, что токен генерируется:
   - В логах Java должно быть "Generated JWT token"
   
2. Проверьте, что токен передается:
   - В логах Java должно быть "Authorization header present: true"
   
3. Проверьте, что JWT_SECRET совпадает:
   - Используйте один и тот же секрет в обоих `.env` файлах
   
4. Проверьте формат токена:
   - В логах NestJS должно быть "JWT Payload received" с правильными полями
