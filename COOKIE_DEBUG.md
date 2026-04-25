# Как проверить работу Cookies

## 1. В браузере (Chrome/Edge/Firefox)

### Chrome/Edge:
1. Откройте DevTools (F12 или Cmd+Option+I на Mac)
2. Перейдите на вкладку **Application** (или **Storage** в Firefox)
3. В левом меню найдите **Cookies**
4. Выберите `http://localhost:3000` (или ваш домен)
5. Должны быть видны cookies:
   - `access_token` - должен быть установлен после успешного логина
   - `refresh_token` - должен быть установлен после успешного логина

### Проверка свойств cookie:
- **HttpOnly**: должно быть `true` (не видно в JavaScript)
- **Secure**: должно быть `false` для localhost (true для HTTPS)
- **SameSite**: должно быть `Lax`
- **Path**: `/` для access_token, `/api/auth/refresh` для refresh_token
- **Expires**: должно быть установлено (15 минут для access_token, 30 дней для refresh_token)

## 2. В Network Tab (DevTools)

1. Откройте DevTools → вкладка **Network**
2. Выполните логин
3. Найдите запрос `POST /api/auth/login/verify`
4. Откройте его → вкладка **Response Headers**
5. Должна быть строка: `Set-Cookie: access_token=...`
6. Затем найдите запрос `GET /api/auth/me`
7. Откройте его → вкладка **Request Headers**
8. Должна быть строка: `Cookie: access_token=...`

## 3. В консоли браузера

### Проверить, что cookie установлен:
```javascript
// В консоли браузера (но HttpOnly cookies не видны через document.cookie)
document.cookie
// Должен показать только не-HttpOnly cookies (если есть)
```

### Проверить через DevTools:
- Application → Cookies → видно все cookies, включая HttpOnly

## 4. Проверка в логах backend

После логина должны быть логи:
```
Access token cookie set: HttpOnly=true, Secure=false, Path=/, MaxAge=900
JWT Filter - Path: /api/auth/me, Token found: true
JWT Filter - Valid token for user: ...
JWT Filter - Authentication set for user: ...
```

## 5. Частые проблемы

### Cookie не устанавливается:
- Проверьте CORS настройки: `Access-Control-Allow-Credentials: true`
- Проверьте, что `withCredentials: true` в axios запросах
- Проверьте, что backend отправляет `Set-Cookie` в Response Headers

### Cookie не отправляется:
- Проверьте, что `withCredentials: true` в axios клиенте
- Проверьте CORS: `Access-Control-Allow-Origin` не должен быть `*` (должен быть конкретный домен)
- Проверьте, что cookie не истек (MaxAge)

### Cookie виден, но не работает:
- Проверьте Path: должен быть `/` для access_token
- Проверьте Domain: не должен быть установлен для localhost
- Проверьте Secure: должен быть `false` для http://localhost

## 6. Быстрая проверка через curl

```bash
# 1. Логин и получение cookies
curl -v -X POST http://localhost:8080/api/auth/login/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"...","code":"..."}' \
  -c cookies.txt

# 2. Проверить, что cookies сохранены
cat cookies.txt

# 3. Использовать cookies для запроса /api/auth/me
curl -v http://localhost:8080/api/auth/me \
  -b cookies.txt
```

## 7. Проверка в коде

### Frontend (axios):
```javascript
// В client.ts уже установлено:
withCredentials: true  // ✅ Это правильно
```

### Backend (CORS):
```java
// В CorsConfig должно быть:
config.setAllowCredentials(true);  // ✅ Это правильно
config.setAllowedOrigins(origins); // ✅ Не "*", а конкретные домены
```

## 8. Отладка

Если cookies не работают, добавьте логирование:

### В браузере (Console):
```javascript
// После логина проверьте:
fetch('/api/auth/me', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

### В Network tab:
- Проверьте, что запросы к `/api/auth/me` отправляют `Cookie` header
- Проверьте, что ответы на `/api/auth/login/verify` содержат `Set-Cookie` header

