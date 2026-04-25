# Как проверить Cookies - Пошаговая инструкция

## 1. Проверка в Application Tab (браузер)

### Шаги:
1. **Откройте DevTools**: F12 или Cmd+Option+I (Mac) / Ctrl+Shift+I (Windows)
2. **Перейдите на вкладку Application** (Chrome/Edge) или **Storage** (Firefox)
3. **В левом меню найдите "Cookies"**
4. **Выберите `http://localhost:3000`** (ваш frontend домен)

### Что должно быть после логина:
- ✅ `access_token` - должен быть виден
- ⚠️ `refresh_token` - может быть не виден, если Path ограничен (это нормально!)

**Важно**: `refresh_token` имеет `Path=/api/auth/refresh`, поэтому он виден только для этого пути. Но в Application tab он все равно должен отображаться.

## 2. Проверка в Network Tab (пошагово)

### Шаг 1: Откройте Network Tab
1. Откройте DevTools (F12)
2. Перейдите на вкладку **Network**
3. **ВАЖНО**: Убедитесь, что Network tab открыт ДО того, как вы начнете логин!

### Шаг 2: Очистите запросы (опционально)
- Нажмите кнопку 🚫 (Clear) в левом верхнем углу Network tab

### Шаг 3: Выполните логин
1. На странице логина введите email и password
2. Нажмите "Send verification code"
3. Введите 6-значный код
4. Нажмите "Verify & Sign in"

### Шаг 4: Проверьте запросы

#### Запрос 1: `POST /api/auth/login/request-code`
1. Найдите этот запрос в списке (может быть свернут)
2. Кликните на него
3. Откройте вкладку **Headers**
4. Прокрутите вниз до **Response Headers**
5. **НЕ должно быть** `Set-Cookie` (код еще не верифицирован)

#### Запрос 2: `POST /api/auth/login/verify` ⭐ ГЛАВНЫЙ
1. Найдите этот запрос
2. Кликните на него
3. Откройте вкладку **Headers**
4. Прокрутите вниз до **Response Headers**
5. **ДОЛЖНЫ БЫТЬ** две строки:
   ```
   Set-Cookie: access_token=eyJhbGc...; Path=/; HttpOnly; SameSite=Lax
   Set-Cookie: refresh_token=eyJhbGc...; Path=/api/auth/refresh; HttpOnly; SameSite=Lax
   ```

#### Запрос 3: `GET /api/auth/me`
1. Найдите этот запрос (должен быть после логина)
2. Кликните на него
3. Откройте вкладку **Headers**
4. Прокрутите вверх до **Request Headers**
5. **ДОЛЖНА БЫТЬ** строка:
   ```
   Cookie: access_token=eyJhbGc...
   ```

### Если запросов нет:
- Убедитесь, что Network tab был открыт ДО логина
- Проверьте фильтр в Network tab (может быть установлен фильтр, который скрывает запросы)
- Нажмите "Preserve log" (сохранять логи) в Network tab

## 3. Проверка refresh_token

### Почему refresh_token может быть не виден в Application tab:
- `refresh_token` имеет `Path=/api/auth/refresh`
- Это означает, что cookie отправляется только для запросов к `/api/auth/refresh`
- Но в Application tab он все равно должен отображаться

### Как проверить, что refresh_token установлен:
1. В Network tab найдите запрос `POST /api/auth/login/verify`
2. В Response Headers должна быть строка `Set-Cookie: refresh_token=...`
3. Если она есть - cookie установлен правильно!

## 4. Проверка через консоль браузера

### После логина выполните в консоли:
```javascript
// Проверить все cookies (HttpOnly cookies не видны через document.cookie)
console.log('Cookies:', document.cookie);

// Но в Application → Cookies они должны быть видны
```

## 5. Проверка в логах backend

После логина в логах backend должны быть:
```
Access token cookie set: HttpOnly=true, Secure=false, Path=/, MaxAge=900
Refresh token cookie set: HttpOnly=true, Secure=false, Path=/api/auth/refresh, MaxAge=2592000
Login successful for user: ...
```

## 6. Частые проблемы

### Проблема: refresh_token не виден в Application tab
**Решение**: Это нормально, если Path ограничен. Проверьте в Network tab, что `Set-Cookie: refresh_token` есть в Response Headers запроса `/api/auth/login/verify`.

### Проблема: В Network tab пусто
**Решение**: 
- Убедитесь, что Network tab открыт ДО логина
- Нажмите "Preserve log" в Network tab
- Очистите фильтры в Network tab

### Проблема: Нет Set-Cookie в Response Headers
**Решение**: 
- Проверьте CORS настройки
- Проверьте, что backend запущен
- Проверьте логи backend на ошибки

## 7. Скриншоты того, что должно быть

### Network Tab - Response Headers (POST /api/auth/login/verify):
```
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: access_token=eyJhbGc...; Path=/; HttpOnly; SameSite=Lax
Set-Cookie: refresh_token=eyJhbGc...; Path=/api/auth/refresh; HttpOnly; SameSite=Lax
```

### Network Tab - Request Headers (GET /api/auth/me):
```
GET /api/auth/me HTTP/1.1
Host: localhost:8080
Cookie: access_token=eyJhbGc...
```

