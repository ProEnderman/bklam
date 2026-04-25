# Настройка SMTP2GO REST API

## ✅ Что было сделано

1. **Переписан EmailService** - теперь использует SMTP2GO REST API вместо SMTP
2. **Добавлен RestTemplateConfig** - конфигурация HTTP клиента для API запросов
3. **Обновлен application.yml** - добавлена настройка для API ключа
4. **Удалена зависимость от JavaMailSender** - больше не нужна (но можно оставить в зависимостях)

## 🔑 Настройка API ключа

Ваш API ключ: `<your-smtp2go-api-key>`

### Вариант 1: Через переменные окружения (рекомендуется)

Создайте файл `.env` в корне проекта:

```bash
# SMTP2GO REST API
SMTP2GO_API_KEY=<your-smtp2go-api-key>
SMTP2GO_FROM_EMAIL=your-email@example.com  # Замените на ваш email
```

Или установите переменные окружения:

```bash
export SMTP2GO_API_KEY=<your-smtp2go-api-key>
export SMTP2GO_FROM_EMAIL=your-email@example.com
```

### Вариант 2: Через application.yml (не рекомендуется для продакшена)

Добавьте в `application.yml`:

```yaml
app:
  email:
    smtp2go:
      api-key: <your-smtp2go-api-key>
    from-address: your-email@example.com
```

⚠️ **ВАЖНО:** Не коммитьте API ключ в git! Файл `.env` уже в `.gitignore`.

## 📧 Настройка email отправителя

Укажите ваш email адрес в `SMTP2GO_FROM_EMAIL`. Этот адрес должен быть:
- Верифицирован в вашем аккаунте SMTP2GO
- Или это должен быть ваш зарегистрированный email в SMTP2GO

## 🧪 Тестирование

После настройки:

1. Запустите приложение:
   ```bash
   ./gradlew bootRun
   ```

2. Попробуйте запросить код подтверждения через API:
   ```bash
   curl -X POST http://localhost:8080/api/auth/login/request-code \
     -H "Content-Type: application/json" \
     -d '{"email": "your-email@example.com", "password": "your-password"}'
   ```

3. Проверьте логи приложения - должны быть сообщения об отправке email

4. Проверьте ваш email - должен прийти код подтверждения

## 🔍 Проверка работы

В логах вы должны увидеть:
```
DEBUG - Preparing to send verification code to: your-email@example.com via SMTP2GO REST API
DEBUG - Sending email via SMTP2GO API from: your-email@example.com to: your-email@example.com
INFO - Verification code sent successfully to: your-email@example.com via SMTP2GO. Email ID: ...
```

## ⚠️ Troubleshooting

### Ошибка: "SMTP2GO API key is not configured"
- Проверьте, что переменная окружения `SMTP2GO_API_KEY` установлена
- Перезапустите приложение после установки переменной

### Ошибка: "Failed to send email via SMTP2GO API"
- Проверьте, что API ключ правильный
- Проверьте, что email отправителя верифицирован в SMTP2GO
- Проверьте логи для деталей ошибки

### Email не приходит
- Проверьте папку "Спам"
- Проверьте Activity в дашборде SMTP2GO
- Проверьте логи приложения на наличие ошибок

## 📝 Что изменилось

- **EmailService** теперь использует HTTP запросы к `https://api.smtp2go.com/v3/email/send`
- Больше не используется JavaMailSender и SMTP протокол
- API ключ передается в каждом запросе
- Ответ от API содержит email_id для отслеживания

## 🔒 Безопасность

- API ключ хранится в переменных окружения (не в коде)
- Файл `.env` в `.gitignore` (не попадет в git)
- Для продакшена используйте секреты (AWS Secrets Manager, HashiCorp Vault и т.д.)

