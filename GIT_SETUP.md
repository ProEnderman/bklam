# Инструкция по настройке Git и пуша в репозиторий

## Шаг 1: Проверка .gitignore

Убедитесь, что `.gitignore` содержит все необходимые исключения (уже проверено).

## Шаг 2: Добавление всех файлов

```bash
cd /path/to/your/clone
git add .
```

(используйте реальный путь к клону; не коммитьте `git add .`, если в проект попадают кэши вроде `.gradle-home/` — сначала `.gitignore` и `git status`.)

## Шаг 3: Первый коммит

```bash
git commit -m "Initial commit: Restaurant Management System with authentication and email verification"
```

## Шаг 4: Создание репозитория на GitHub/GitLab

1. Создайте новый репозиторий на GitHub/GitLab (не инициализируйте его)
2. Скопируйте URL репозитория (например: `https://github.com/username/repo-name.git`)

## Шаг 5: Добавление remote и push

```bash
# Добавьте remote репозиторий (замените URL на ваш)
git remote add origin https://github.com/username/repo-name.git

# Переименуйте ветку в main (если нужно)
git branch -M main

# Запушьте код
git push -u origin main
```

## Альтернатива: Если репозиторий уже создан на GitHub

Если вы создали репозиторий с README, выполните:

```bash
git remote add origin https://github.com/username/repo-name.git
git branch -M main
git pull origin main --allow-unrelated-histories
git push -u origin main
```

## Важно перед пушем:

1. ✅ Проверьте, что в `.gitignore` есть `.env` и `logs/`
2. ✅ Убедитесь, что нет паролей в `application.yml` (используются переменные окружения)
3. ✅ Проверьте, что нет личных данных в коммитах

## Проверка перед пушем:

```bash
# Посмотрите, что будет добавлено
git status

# Проверьте, что нет чувствительных данных
git diff --cached | grep -i "password\|secret\|key" || echo "OK"
```






