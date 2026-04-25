# Restaurant Management Frontend

React + TypeScript фронтенд для системы управления рестораном.

## Технологии

- React 18
- TypeScript
- Vite
- React Router
- Axios
- date-fns

## Установка

```bash
cd frontend
npm install
```

## Запуск

```bash
npm run dev
```

Приложение будет доступно на http://localhost:3000

## Структура

```
src/
├── api/           # HTTP клиент и сервисы
├── components/    # Переиспользуемые компоненты
├── hooks/         # React хуки
└── pages/         # Страницы приложения
```

## Экраны

1. **Dashboard** - выручка, критичные позиции, топ блюд
2. **Ingredients** - остатки ингредиентов, приход/списание
3. **Dishes** - список блюд, редактор рецептов
4. **New Order** - создание и закрытие заказа
5. **Orders History** - история заказов

## API

Фронтенд работает с бэкендом на `http://localhost:8080/api` (настроено через proxy в vite.config.ts)

