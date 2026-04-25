# Настройка smtp2go для отправки email

## Шаг 1: Регистрация в smtp2go

1. Перейдите на https://www.smtp2go.com
2. Нажмите "Sign Up" или "Start Free Trial"
3. Заполните форму регистрации
4. Подтвердите email адрес

## Шаг 2: Создание SMTP пользователя

1. После входа в smtp2go, перейдите в **Settings** → **SMTP Users**
2. Нажмите **Add SMTP User**
3. Заполните форму:
   - **Username**: выберите или создайте username (например: `restaurant-system`)
   - **Password**: создайте надежный пароль (или используйте автогенерированный)
   - **Email Address**: ваш email адрес (будет использоваться как отправитель)
4. Нажмите **Create**
5. **ВАЖНО**: Скопируйте username и password - они понадобятся для конфигурации

## Шаг 3: Верификация отправителя (опционально, но рекомендуется)

1. Перейдите в **Settings** → **Sender Verification**
2. Добавьте email адрес, который будете использовать как отправитель
3. Проверьте email и подтвердите адрес

## Шаг 4: Настройка application.yml

Добавьте учетные данные в `application.yml`:

```yaml
spring:
  mail:
    username: your-smtp2go-username
    password: your-smtp2go-password

app:
  email:
    from-address: your-email@example.com
```

Или используйте переменные окружения (рекомендуется):

```bash
export SMTP2GO_USERNAME=your-smtp2go-username
export SMTP2GO_PASSWORD=your-smtp2go-password
export SMTP2GO_FROM_EMAIL=your-email@example.com
```

## Шаг 5: Тестирование

После настройки перезапустите приложение и попробуйте отправить код подтверждения.

## Важные замечания

1. **Бесплатный план**: 1000 писем/месяц
2. **SMTP настройки**:
   - Host: `mail.smtp2go.com`
   - Port: `587` (STARTTLS) или `2525` (альтернативный)
   - Username: ваш SMTP username
   - Password: ваш SMTP password
3. **Безопасность**: Храните пароли в секрете, не коммитьте в git
4. **Отправитель**: Email адрес должен быть верифицирован (или использовать ваш зарегистрированный email)

## Альтернативные порты

Если порт 587 не работает, попробуйте:
- **2525**: Альтернативный порт для STARTTLS
- **465**: SSL/TLS порт (требует другую конфигурацию)

## Troubleshooting

Если письма не отправляются:
1. Проверьте, что username и password правильные
2. Убедитесь, что email отправителя верифицирован
3. Проверьте логи приложения
4. Проверьте smtp2go Activity в дашборде
5. Убедитесь, что не превышен лимит бесплатного плана

