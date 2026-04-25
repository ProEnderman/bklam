# Заглушки и плейсхолдеры в проекте

Обход по проекту (без node_modules и тестовых моков).

---

## 1. Реальные данные (не заглушки)

- **Java:** заказы, бронирования, рестораны, пользователи, смены, календари, тарифы, аналитика бронирований (dashboard), RFM, прогнозные блоки в `BookingAnalyticsService` (при ≥14 днях истории) — всё из БД/сервисов.
- **Frontend:** дашборды (тарифы/аналитика, платформа, ресторан, loyalty) ходят в API; прогноз — в Java `/forecast/*`, который проксирует в ML-сервис.
- **Forecasting (Python):** выручка и бронирования загружаются из Java `GET /api/internal/forecast-data/orders`; факты за месяц (`load_daily_actuals_for_month`, `load_actual_monthly`) — из того же API.

---

## 2. Осознанные «пустые» ответы (не баги)

| Место | Поведение | Причина |
|------|-----------|--------|
| **BookingAnalyticsService** (`forecastRevenue`/`forecastBookings`) | Пустые карты + `trend: "insufficient_data"` | Меньше 14 дней истории — прогноз не считается |
| **BookingAnalyticsService** (`segments`/`clients`) | `emptyMap`/`emptyList` | Нет оплаченных бронирований за период |
| **BookingAnalyticsService** `safeCompute` / `safeComputeList` | `emptyMap`/`emptyList` при исключении | Обработка ошибок, в лог пишется stack trace |
| **RfmService** | `List.of()` | Нет гостей — пустой список |
| **OrderService** | `PageImpl(List.of(), ...)` | Пустая страница заказов по фильтру |
| **Frontend** (AnalyticsContext, clientStore, Calendar и т.д.) | `return {}` / `return []` в catch | Защита при ошибке парсинга/хранилища или пустой ввод |
| **Forecasting** `_empty_ts` | Пустой ряд | Нет токена или Java вернул пустой список заказов |

---

## 3. Заглушки (фичи без данных в бэкенде)

### 3.1 Forecasting (Python)

| Функция | Сейчас | Причина |
|--------|--------|--------|
| `list_segments()` | `[]` | В Java нет сущности «сегмент/активность» для прогноза |
| `load_daily_revenue_by_activity()` | `{}` | Нет разбивки заказов по активностям в API |
| `load_daily_bookings_by_activity()` | `{}` | То же |
| `load_special_events(start, end)` | Пустой DataFrame | Нет календаря событий (праздники/акции) |
| `load_daily_cancel_rate()` | Пустой ряд | В API заказов нет данных об отменах |
| `load_daily_utilization()` | Пустой ряд | Нет модели «ресурс/вместимость» и загрузки по дням |

Убрать заглушки можно только после появления соответствующих данных/API в Java (или другом источнике).

### 3.2 Telegram Payment Service

| Что | Где | Назначение |
|-----|-----|------------|
| **MOCK_BANK_BOT** | `bank-bot.service.ts` | Режим «симуляция ответа банк-бота» без реального Telegram; включается явно через env `MOCK_BANK_BOT=true` для разработки/тестов |

В проде при `MOCK_BANK_BOT=false` используются реальные запросы к боту.

---

## 4. Итог

- **Аналитика и прогнозы:** данные реальные (БД, Java API, ML-сервис с токеном); пустые ответы — из-за недостаточной истории, отсутствия данных за период или ошибок (с логированием).
- **Заглушки в коде:** только в forecasting (сегменты, события, отмены, утилизация) и опциональный mock банк-бота в telegram-payment-service. Остальное — либо нормальная логика «нет данных», либо обработка ошибок.
