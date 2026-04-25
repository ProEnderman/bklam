# Техническая документация проекта COURSE_PROJECT

Полное описание системы для онбординга разработчиков. Документ построен по реальному коду; предположения и неопределённости явно помечены.

---

## 1. Общее назначение проекта

**Restaurant Management System (RMS)** — система управления рестораном и сетью ресторанов: операционный учёт (заказы, меню, склад, зал), бронирования и тарифы, лояльность и гости, смены, аналитика и ML-прогноз, цифровые каналы (QR-меню, Telegram-заказ и оплата). Multi-tenant: данные изолированы по ресторану; платформенный уровень (HEAD_ADMIN) управляет ресторанами и пользователями.

**Технологический стек:**
- **Backend:** Java 17, Spring Boot 3.2, Spring Security, JPA/Hibernate, PostgreSQL, Flyway, Redis (rate limit), JWT (access + refresh в cookie).
- **Frontend:** React 18, TypeScript, Vite 5, React Router 6, Axios. Прокси `/api` и `/uploads` на Java (порт 8080).
- **Forecasting:** Python 3, FastAPI; данные только через HTTP к Java (`/api/internal/forecast-data/orders`), без своей БД.
- **Telegram Payment:** NestJS (Node), отдельный сервис на порту 3001; генерация QR оплаты, MTProto-авторизация Telegram; Java проксирует запросы к нему.

---

## 2. Архитектура проекта целиком

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Browser (React SPA, port 3000)                                              │
│  - Vite dev proxy: /api → :8080, /uploads → :8080                           │
│  - Auth: Cookie (access_token, refresh_token), CSRF (X-XSRF-TOKEN)           │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTP
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Java Backend (Spring Boot, port 8080)                                       │
│  - TenantFilter → JwtAuthenticationFilter → Security chain → Controllers     │
│  - TenantContext (thread-local): restaurantId из JWT                         │
│  - RLS (PostgreSQL): row-level security по restaurant_id                    │
│  - Outbox: события в outbox_events, диспетчер шлёт в подписчиков             │
└───┬─────────────────────┬─────────────────────┬─────────────────────────────┘
    │                     │                     │
    │ HTTP (internal JWT) │ HTTP (proxy)        │ HTTP
    ▼                     ▼                     ▼
┌──────────────┐  ┌──────────────────┐  ┌────────────────────────────┐
│  Forecasting │  │  PostgreSQL      │  │  Telegram Payment Service   │
│  (Python     │  │  (основное       │  │  (NestJS, port 3001)        │
│   :8090)     │  │   хранилище)     │  │  QR, MTProto, BullMQ        │
└──────────────┘  └──────────────────┘  └────────────────────────────┘
```

**Потоки данных:**
- Пользователь логинится: запрос кода на email → верификация кода → выдача JWT в cookie; refresh по cookie.
- Все запросы к `/api/*` (кроме публичных) проходят JWT → из principal извлекается `restaurantId` → выставляется `TenantContext` → RLS и репозитории фильтруют по tenant.
- Прогноз: Java по расписанию или по запросу выдаёт внутренний JWT и дергает Python `GET /api/forecast/summary?horizon=31&restaurant_id=N`; Python запрашивает у Java `GET /api/internal/forecast-data/orders` с этим JWT и строит ряд выручки/броней, обучает модель, сохраняет результат в файлы (`specs/`, по tenant_id).
- Оплата по QR: фронт/клиент вызывает Java `POST /api/telegram-payment/payment_requests`; Java проксирует в telegram-payment-service; тот создаёт заявку, генерирует QR; статус опрашивается или через webhook.

---

## 3. Структура репозитория и назначение модулей

### 3.1 Корень проекта

| Путь | Назначение |
|------|------------|
| `build.gradle`, `settings.gradle` | Сборка Java: Spring Boot 3.2, PostgreSQL, Redis, Flyway, JWT, Lombok, SpringDoc, POI, Testcontainers |
| `src/main/java/com/restaurant/` | Исходники бэкенда |
| `src/main/resources/` | `application.yml`, миграции Flyway `db/migration/` |
| `frontend/` | React SPA (Vite) |
| `forecasting/` | Python-сервис прогнозирования |
| `telegram-payment-service/` | NestJS-сервис оплаты и Telegram MTProto |
| `docs/` | Документация (в т.ч. BACKLOG, TECHNICAL_DOCUMENTATION) |
| `start-all.sh` | Скрипт запуска БД/Redis/бэкенда/фронта/прогноза/telegram-payment (по конфигу) |

### 3.2 Backend (Java) — пакеты

| Пакет | Назначение |
|-------|------------|
| `config` | SecurityConfig, CorsConfig, WebConfig, RateLimitConfig, RedisRateLimitService, MultiDataSourceConfig, RestTemplate/Jackson, loyalty executor |
| `controller` | REST-контроллеры (см. раздел API); вложенный `controller.loyalty` |
| `dto` | Request/Response DTO и record’ы; вложенный `dto.loyalty` |
| `exception` | GlobalExceptionHandler, ResourceNotFoundException, BusinessException, InsufficientStockException, ErrorResponse |
| `model` | JPA-сущности (Order, Dish, Booking, User, …); вложенный `model.loyalty` |
| `repository` | JPA-репозитории и кастомные (OrderRepositoryCustom); вложенный `repository.loyalty` |
| `service` | Бизнес-логика; вложенный `service.loyalty` |
| `event` | OrderClosedEvent, OrderClosedEventListener (публикация в outbox и вызов loyalty) |
| `security` | JwtTokenProvider, JwtAuthenticationFilter, CustomUserDetailsService, UserPrincipal, TelegramWebAppAuthUtil, QR signing |
| `forecast` | InternalForecastJwtService, InternalForecastAuthFilter, InternalForecastAuthentication, ForecastUpdateInProgressStore |
| `tenant` | TenantContext (thread-local), TenantFilter, TenantAwareDataSource (если используется) |
| `util` | PasswordHashGenerator (для миграций) |

### 3.3 Frontend — каталоги

| Путь | Назначение |
|------|------------|
| `src/main.tsx` | Точка входа, рендер в `#root` |
| `src/App.tsx` | Роутинг: публичные (/login, /qr, /telegram), защищённые под Layout, роли (HEAD_ADMIN, ADMIN) |
| `src/api/` | `client.ts` (axios, interceptors, refresh, CSRF), `services.ts` (все вызовы API), `types.ts`, `qrService.ts`, `splitService.ts`, `telegramPaymentService.ts`, `telegramShopService.ts`, `loyaltyService.ts` |
| `src/components/` | AuthProvider, Layout, Sidebar, ProtectedRoute, Modal, PaymentQrModal, SplitBill, DishOptionsModal, TimeControl, DataTable, NotificationBell, TelegramLinkModal и др. |
| `src/contexts/` | AuthContext (user, login, logout, refresh) |
| `src/hooks/` | useNotification |
| `src/pages/` | Страницы по разделам: platform/, restaurant/, tariffs/, loyalty/, а также Login, QrMenu, TelegramShop, Profile, Users, ActivityLog и др. |
| `src/utils/` | timeOverride, qrSession, cache, clientStore, apiRetry, imageBackground, spatialIndex, excelCharts, cohortFormat |

### 3.4 Forecasting (Python)

| Файл | Назначение |
|------|------------|
| `api.py` | FastAPI-приложение: эндпоинты прогноза, обучение, summary, export Excel; зависимость `_require_forecast_auth` (JWT → token + tenant_id) |
| `service.py` | ForecastService: train_and_select, forecast, get_monthly_forecast, get_month_progress, run_monthly_monitoring; вызовы repository и selector |
| `repository.py` | Загрузка/сохранение spec, forecast, monthly rollup; загрузка рядов через java_client (без своей БД) |
| `java_client.py` | HTTP к Java `/api/internal/forecast-data/orders`, преобразование в revenue/bookings series |
| `config.py` | JAVA_BACKEND_URL, SPECS_DIR, METRICS, DEFAULT_HORIZON_DAYS и др. |
| `forecast_context.py` | ContextVar для token и tenant_id в синхронном коде |
| `selector.py` | Выбор модели (baselines, SARIMA, Prophet и т.д.), бэктест |
| `excel_exporter.py` | Сбор датасетов и сборка Excel-отчёта |
| Остальные | baselines, sarima, prophet_model, ensemble, hierarchical, aggregation, metrics, backtest, types_ и др. |

### 3.5 Telegram-payment-service (NestJS)

| Модуль | Назначение |
|--------|------------|
| `auth/` | JWT strategy, guards, decorators @Public(), @Roles(), @CurrentUser() |
| `payments/` | Создание payment request, QR, статусы, отмена, ручной ввод URL; интеграция с BankBot (очередь) |
| `telegram/` | MTProto: sendCode, confirmCode, confirmPassword; статус и настройки |
| `queue/` | BullMQ: отправка в Bank Bot |
| `crypto/` | Шифрование (AES-GCM) для чувствительных данных |
| `prisma/` | Подключение к БД сервиса |

---

## 4. Ключевые компоненты: назначение, параметры, возвраты, связи

### 4.1 Backend — цепочка запроса

**TenantFilter** (`tenant/TenantFilter.java`)
- **Назначение:** Установить TenantContext из аутентифицированного пользователя для изоляции по ресторану.
- **Вход:** HttpServletRequest, HttpServletResponse, FilterChain.
- **Логика:** Не выполняется для `/api/auth/`, `/api/public/`, `/api/telegram/`, Swagger, actuator, `/api/forecast/health`. Иначе из SecurityContext берётся UserPrincipal → restaurantId; для HEAD_ADMIN на `/api/platform/` tenant может быть null; для остальных при отсутствии tenant — 401.
- **Побочный эффект:** TenantContext.set(tenantId) до chain.doFilter, TenantContext.clear() в finally.
- **Связи:** JwtAuthenticationFilter (до него), все сервисы и RLS.

**JwtAuthenticationFilter** (`security/JwtAuthenticationFilter.java`)
- **Назначение:** Проверить JWT из cookie и установить SecurityContext.
- **Вход:** Request, Response, FilterChain.
- **Логика:** Для путей логина/refresh/logout и Swagger — пропуск. Иначе чтение токена из cookie; при валидном токене — извлечение username, загрузка UserDetails, установка UsernamePasswordAuthenticationToken.
- **Связи:** JwtTokenProvider (validate, extractUsername), CustomUserDetailsService.

**AuthController** (`controller/AuthController.java`)
- **Эндпоинты:**  
  - `POST /api/auth/login/request-code` — запрос кода на email (LoginRequest: email). Возврат: RequestCodeResponse.  
  - `POST /api/auth/login/verify` — верификация кода (VerifyCodeRequest: email, code, challenge?). Возврат: AuthResponse (user, accessToken, refreshToken); токены в cookie.  
  - `POST /api/auth/refresh` — обновление пары токенов по refresh cookie.  
  - `POST /api/auth/logout` — инвалидация refresh.  
  - `GET /api/auth/me` — текущий пользователь (User) по JWT.
- **Зависимости:** AuthService, JwtTokenProvider; cookie path/httponly/secure из конфига.

### 4.2 Order и склад

**OrderService.closeOrder** (упрощённо)
- **Вход:** orderId (Long).
- **Возврат:** Order (закрытый) или исключение.
- **Логика:** Проверка статуса OPEN; проверка рецептов у позиций; расход ингредиентов = рецепт × кол-во блюда, с учётом **опций**: у шаблона группы (`option_group_templates`) можно задать `stock_ingredient_id` + `stock_scale_base` для типов RANGE_STEPPER / SINGLE_REQUIRED / SINGLE_OPTIONAL — тогда норма этого ингредиента из рецепта умножается на выбранное значение (степпер или `valueInt` у карточки). У позиции опции (`option_item_templates`) можно задать доп. списание `stock_qty_per_unit` на 1 единицу `optionQty`. Затем списание (StockService); CLOSED, события.
- **Побочные эффекты:** Движения склада, события outbox (loyalty начисление и т.д.).
- **Связи:** OrderRepository, StockService, EventPublisher, Loyalty (через listener/outbox).

**StockService** — приход/расход, проверка остатков; при закрытии заказа вызывается списание по рецептам. InsufficientStockException при нехватке.

### 4.3 Frontend — клиент и авторизация

**client** (`api/client.ts`)
- **Назначение:** Axios instance с baseURL `/api`, withCredentials, interceptors.
- **Request interceptor:** Добавление X-XSRF-TOKEN для мутирующих методов; X-Time-Offset-Ms для тестов; при истечении access — превентивный refresh; при идущем refresh — ожидание одной и той же promise.
- **Response interceptor:** При 401 — попытка refresh, очередь запросов, повтор исходного запроса; при 401 от refresh — редирект на /login. Вызовы startTokenRefreshTimer / stopTokenRefreshTimer.
- **Экспорт:** startTokenRefreshTimer, stopTokenRefreshTimer, markRefreshSuccess.

**AuthProvider** (`components/AuthProvider.tsx`)
- **Назначение:** Обёртка над AuthContext: загрузка user через authService.getMe() при монтировании, запуск таймера refresh, раздача user/login/logout в контексте.
- **Связи:** AuthContext, authService, client (refresh timer).

**ProtectedRoute** (`components/ProtectedRoute.tsx`)
- **Назначение:** Рендер children при наличии user и (при переданном allowedRoles) при совпадении роли; иначе редирект на /login или /403.
- **Параметры:** allowedRoles?: string[], children.
- **Связи:** AuthContext (user).

### 4.4 Forecasting — вход в сервис

**ForecastService.forecast** (Python, `service.py`)
- **Вход:** metric (str), horizon (int), restaurant_id (Optional[int]), token (Optional[str]).
- **Возврат:** dict с полями forecast (dates), values (yhat), bounds, model info или {"error": "no_data"} / {"error": "training_failed"}.
- **Логика:** Загрузка spec по tenant; при отсутствии spec — train_and_select; загрузка ряда load_metric(metric); прогноз по выбранной модели; save_forecast_result; возврат структуры.
- **Связи:** repository (load_spec, load_metric, save_forecast_result), selector, модели (sarima, prophet, baselines и т.д.).

---

## 5. Бизнес-логика: сценарии, потоки данных, ошибки

### 5.1 Пользовательские сценарии (кратко)

- **Вход:** Запрос кода на email → ввод кода (и при необходимости challenge) → выдача JWT в cookie → редирект на /home или платформа.
- **Платформа (HEAD_ADMIN):** Список ресторанов, CRUD ресторана, назначение админов ресторана, список пользователей, смена роли, глобальный activity log, outbox replay.
- **Ресторан (ADMIN/WORKER):** Меню (блюда, категории, рецепты, опции), склад (остатки, движения, загрузка Excel), заказы (создание, позиции, закрытие, отмена, разбивка счёта, метки оплат), зал (зоны, столы, карта), брони столов, тарифы и календарь, активности и брони (бронирование с тарифами), смены и шаблоны, аналитика ресторана, QR-меню (конфиг), отчёт по бронированиям и прогноз (тарифы), лояльность (гости, кампании, тиры, бонусы, сегменты, миссии/достижения, офферы), пользователи, activity log, профиль.
- **Публично:** QR-меню (чтение меню по подписанной ссылке), Telegram-магазин (меню и заказ), публичное заказное меню по сессии (PublicOrderingController).

### 5.2 Поток данных

- Запрос → CORS → Rate limit (Redis) → JWT (cookie) → Tenant → Controller → Service → Repository → БД (с RLS). Ответ в JSON; при валидации (Bean Validation) ошибки собираются в GlobalExceptionHandler в ErrorResponse (timestamp, status, error, message).
- Loyalty: при закрытии заказа генерируется событие → outbox → асинхронная обработка (начисление бонусов, миссии и т.д.).
- Прогноз: фронт/планировщик → Java → внутренний JWT → Python; Python → Java GET orders → агрегация по дням → обучение/прогноз → сохранение в файлы; ответ в Java → фронт.

### 5.3 Обработка ошибок

- **GlobalExceptionHandler:** ResourceNotFoundException → 404; BusinessException → 400; InsufficientStockException → 409; MethodArgumentNotValidException → 400 (поля и сообщения); BadCredentialsException → 401; ResourceAccessException / HttpServerErrorException / HttpClientErrorException (payment service) → 502/соответствующий код; IllegalStateException (в т.ч. "not authenticated") → 401/400; IllegalArgumentException → 400; Exception → 500 (в debug — message).
- Формат ошибки: `{ "timestamp", "status", "error", "message" }`.

### 5.4 Валидация, авторизация, хранение

- **Валидация:** Jakarta Validation в DTO (@NotNull, @Size и т.д.); при невалидном теле — MethodArgumentNotValidException.
- **Авторизация:** Роли из JWT (UserPrincipal); метод-уровень через @PreAuthorize или проверки в сервисе; HEAD_ADMIN — доступ к /api/platform/* без привязки к ресторану; для остальных обязателен tenant.
- **Состояние:** Сессии нет (stateless); состояние в JWT и в БД; фронт хранит user в контексте и cookie.
- **Хранение:** PostgreSQL (основное); Redis — rate limit; файлы — прогноз (specs, monthly rollups по tenant).

---

## 6. Backend и Frontend — краткое разделение

**Backend:** REST API, многопоточность, транзакции, RLS, outbox, планировщик (прогноз по cron), прокси к Python и telegram-payment. Документация API: Swagger UI `/swagger-ui.html`, OpenAPI `/api-docs`.

**Frontend:** SPA на React; маршрутизация по ролям; все данные через `api/services.ts` и специализированные сервисы (loyalty, telegram, qr, split); загрузка/ошибки/состояния в компонентах страниц; единый axios client с refresh и CSRF.

---

## 7. Сводка API (endpoint, метод, назначение)

Полный перечень базовых путей и основных методов (детали параметров — в Swagger и в коде контроллеров).

### 7.1 Auth
| Endpoint | Метод | Назначение |
|----------|--------|------------|
| /api/auth/login/request-code | POST | Запрос кода на email (body: email) |
| /api/auth/login/verify | POST | Верификация кода, выдача JWT в cookie |
| /api/auth/login/verify-legacy | POST | Legacy верификация |
| /api/auth/refresh | POST | Обновление access/refresh по cookie |
| /api/auth/logout | POST | Выход, инвалидация refresh |
| /api/auth/me | GET | Текущий пользователь |
| /api/auth/csrf | GET | Получить CSRF token (cookie) |

### 7.2 Platform (HEAD_ADMIN)
| /api/platform/restaurants | GET, POST | Список, создание |
| /api/platform/restaurants/{id} | GET, PUT, DELETE | Ресторан |
| /api/platform/restaurants/{id}/admins | POST | Создать админа ресторана |
| /api/platform/users | GET | Пользователи (опционально restaurantId) |
| /api/platform/users/{userId}/role | PATCH | Смена роли |
| /api/platform/outbox | GET | Список outbox событий |
| /api/platform/outbox/{id}/replay | POST | Повтор события |

### 7.3 Orders
| /api/orders | GET (фильтры, пагинация), POST | Список, создание |
| /api/orders/{id} | GET, PATCH, DELETE | Заказ |
| /api/orders/{id}/items | POST | Добавить позицию |
| /api/orders/{id}/items/{itemId} | PUT, DELETE | Обновить/удалить позицию |
| /api/orders/{id}/close | POST | Закрыть заказ (продажа + списание) |
| /api/orders/{id}/cancel | POST | Отмена |
| /api/orders/{id}/mark-paid, mark-unpaid | POST | Оплата |
| /api/orders/{id}/payment-marks | GET, POST | Слоты оплаты (QR и т.д.) |
| /api/orders/open-by-table/{tableId} | GET | Открытый заказ по столу |
| /api/orders/by-table/{tableId} | POST | Создать/получить заказ по столу |
| /api/orders/{orderId}/split | GET, POST, DELETE | Разбивка счёта |
| /api/orders/export | GET | Экспорт CSV (from, to) |
| /api/orders/import | POST | Импорт CSV (multipart) |

### 7.4 Dishes, categories, ingredients, stock
| /api/dishes | GET, POST | Список/создание |
| /api/dishes/{id} | GET, PUT, DELETE | Блюдо |
| /api/dishes/{id}/recipe | GET, PUT | Рецепт |
| /api/dishes/{id}/image | POST | Загрузка изображения |
| /api/categories | GET, POST, PUT, DELETE, image | Категории блюд |
| /api/ingredients | GET, POST, PUT, DELETE | Ингредиенты |
| /api/ingredients/below-minimum | GET | Ниже минимума |
| /api/stock/in, out | POST | Приход/расход |
| /api/stock/movements | GET | История движений |
| /api/stock/inventory | GET | Остатки |
| /api/stock/upload-excel | POST | Загрузка Excel |

### 7.5 Hall, tables, reservations
| /api/hall/view | GET | Полная карта зала |
| /api/hall/map | PUT | Обновить карту |
| /api/hall/zones | GET, POST, PATCH, DELETE | Зоны |
| /api/hall/items | GET, PUT, PATCH | Размещённые элементы |
| /api/hall/assets | GET, POST, image | Ассеты |
| /api/hall/tables | GET, POST | Столы |
| /api/hall/tables/active | GET | Активные столы |
| /api/table-reservations | GET, POST, PUT | Брони столов |
| /api/table-reservations/{id}/cancel, complete | POST | Отмена/завершение |

### 7.6 Bookings (тарифы/активности)
| /api/bookings | GET (пагинация, фильтры), POST, PUT | Брони |
| /api/bookings/{id}/cancel, mark-paid | POST | Действия |
| /api/bookings/export | GET | CSV экспорт |
| /api/bookings/import | POST | CSV импорт |
| /api/activities | GET, POST, PUT, DELETE | Активности |
| /api/availability | GET | Доступность (activity, период) |
| /api/calendars | GET, POST, PUT, DELETE | Календари |
| /api/calendars/{id}/special-dates | POST, DELETE | Особые даты |
| /api/tariffs/plans | GET, POST, PUT, DELETE | Тарифные планы |
| /api/tariffs/plans/{id}/rules | GET, POST | Правила |
| /api/tariffs/rules/{id} | PUT, DELETE | Правило |
| /api/tariffs/{planId}/special-date-modifiers | GET, PUT, POST, DELETE | Модификаторы по датам |
| /api/pricing/preview | POST | Предпросмотр расчёта цены |
| /api/pricing/run | POST | Расчёт и сохранение цены |
| /api/booking-notifications | GET, POST resolve, check-now | Уведомления по броням |
| /api/booking-analytics/* | GET | Дашборд, volume, revenue, conversion, capacity, stop-check, tariffs, notifications |

### 7.7 Shifts
| /api/shifts | GET, POST, PUT, DELETE | Смены |
| /api/shifts/bulk | POST | Массовое создание |
| /api/shifts/{id}/publish | POST | Опубликовать |
| /api/shifts/publish-week | POST | Опубликовать неделю |
| /api/shifts/{id}/lock | POST | Заблокировать |
| /api/shifts/conflicts | GET | Конфликты |
| /api/shifts/templates | GET, POST, DELETE | Шаблоны |
| /api/shifts/templates/{id}/generate | POST | Сгенерировать смены |
| /api/shifts/swap | POST | Запрос обмена |
| /api/shifts/swap/{id}/accept, reject | POST | Принять/отклонить |

### 7.8 Loyalty
| /api/loyalty/guests | GET, POST, PUT, merge, count | Гости |
| /api/loyalty/guests/by-phone | GET | По телефону |
| /api/loyalty/guests/{id}, profile | GET | Профиль гостя |
| /api/loyalty/bonus/{guestId} | GET | Бонусный счёт |
| /api/loyalty/bonus/earn, burn, adjust | POST | Начисление/списание/коррекция |
| /api/loyalty/bonus/{guestId}/history, reconcile | GET, POST | История, сверка |
| /api/loyalty/campaigns | GET, POST, PUT, PATCH, DELETE | Кампании |
| /api/loyalty/campaigns/active | GET | Активные |
| /api/loyalty/tiers | GET, POST, PUT, DELETE | Тиры |
| /api/loyalty/tiers/evaluate/{guestId} | POST | Пересчёт тира |
| /api/loyalty/segments | GET, POST, PUT, DELETE | Сегменты |
| /api/loyalty/rfm/guest/{id}, distribution, run | GET, POST | RFM |
| /api/loyalty/gamification/missions, achievements | GET, POST, DELETE, award | Миссии и достижения |
| /api/loyalty/offers | GET by guest, POST, redeem | Персональные офферы |

### 7.9 Forecast (прокси к Python)
| /api/forecast/{metric} | GET | Прогноз (horizon, period=month, year, month, force_refresh, breakdown, restaurantId) |
| /api/forecast/summary | GET | Сводка по всем метрикам (horizon, restaurantId) |
| /api/forecast/updating | GET | Флаг «прогноз обновляется» (restaurantId) |
| /api/forecast/{metric}/month-progress | GET | Трекер месяца (year, month) |
| /api/forecast/{metric}/monthly-accuracy | GET | История точности |
| /api/forecast/{metric}/accuracy | GET | Точность модели |
| /api/forecast/train/{metric} | POST | Обучение (restaurantId, force) |
| /api/forecast/health | GET | Проверка доступности Python |

### 7.10 Public, Telegram, QR, option-templates, analytics, users, time
| /api/public/menu | GET | Публичное меню (query params) |
| /api/public/sessions | POST | Создать сессию заказа (QR) |
| /api/public/orders/current | GET | Текущий заказ сессии |
| /api/public/orders | POST | Создать заказ |
| /api/public/orders/{id}/items | POST, DELETE | Позиции |
| /api/telegram/webhook | POST | Webhook бота |
| /api/telegram/menu | GET | Меню для Telegram |
| /api/telegram/orders/current | POST | Текущий/новый заказ |
| /api/telegram/orders/{id}/items | POST, DELETE | Позиции |
| /api/telegram/orders/{id} | GET | Заказ |
| /api/telegram-payment/payment_requests | POST | Создать заявку на оплату (прокси) |
| /api/telegram-payment/payment_requests/{id} | GET | Статус |
| /api/telegram-payment/.../qr, cancel, refresh, fallback, manual-url | GET/POST | QR, отмена, ручной ввод и т.д. |
| /api/telegram-payment/telegram/mtproto/* | POST | Коды, 2FA |
| /api/qr-menu/config | GET, PATCH | Конфиг QR-меню, срок действия |
| /api/option-templates | GET, POST, PUT, DELETE | Шаблоны опций |
| /api/option-templates/dish/{dishId} | GET, PUT | Опции блюда |
| /api/analytics/overview, revenue, employees, top-dishes, problem-ingredients, ingredient-usage, product-sales, export | GET | Аналитика ресторана |
| /api/users | GET, POST, PATCH | Пользователи |
| /api/users/{id}/activate, deactivate | PATCH | Активация/деактивация |
| /api/activity-log | GET | Журнал действий (фильтры) |
| /api/time-override | GET, POST, DELETE | Смещение времени (тесты) |
| /api/forecast-data/orders | GET | Агрегаты заказов по дням (tenant, для фронта аналитики) |
| /api/internal/forecast-data/orders | GET | То же для Python (internal JWT) |

**Формат ответов:** JSON; при ошибке — тело от GlobalExceptionHandler (timestamp, status, error, message). Коды: 200/201 — успех, 400 — валидация/бизнес, 401 — не авторизован, 403 — нет прав, 404 — не найден, 409 — конфликт (например недостаток на складе), 502 — ошибка прокси (Python или payment service), 500 — внутренняя ошибка.

---

## 8. Сущности данных (модели, таблицы)

Основные JPA-сущности и таблицы (имена таблиц по умолчанию или явно заданы в @Table).

### 8.1 Ядро
- **Restaurant** — restaurants (id, name, telegram_bot_token, qr_token_expires_at).
- **User** — users (id, username, password_hash, role, restaurant_id, permissions, active).
- **Order** — orders (id, status, total_amount, created_at, closed_at, name, table_id, guest_id, order_source, idempotency_key, paid_at, unpaid_reason, restaurant_id, created_by).
- **OrderItem** — order_items (id, order_id, dish_id, quantity, price, comment).
- **OrderItemOption** — привязка опций к позиции.
- **OrderPaymentMark** — order_payment_marks (order_id, slot, paid_amount, paid_via); слоты оплаты (QR и т.д.).
- **OrderShare / OrderShareItem** — разбивка счёта между плательщиками.
- **Dish** — dishes (id, name, price, category_id, restaurant_id, is_active, image_url, updated_at).
- **DishCategory** — dish_categories.
- **DishIngredient** — dish_ingredients (dish_id, ingredient_id, quantity, unit).
- **Ingredient** — ingredients (id, name, unit, min_quantity, restaurant_id, version).
- **StockMovement** — stock_movements (id, ingredient_id, type IN/OUT, quantity, reason, order_id, created_at).
- **OptionGroupTemplate, OptionItemTemplate** — шаблоны опций; DishOptionGroup — привязка к блюду.

### 8.2 Зал и брони столов
- **HallMap** — hall_maps (restaurant, version).
- **HallZone** — hall_zones (hall_map_id, name, geometry).
- **HallTable** — hall_tables (zone_id, label, capacity).
- **HallPlacedItem, HallAsset** — элементы на карте.
- **TableReservation** — table_reservations (restaurant_id, start_at, end_at, status, guest info).

### 8.3 Брони и тарифы
- **Activity** — activities (id, name, branch_id, tariff_plan_id, duration, gap_filler, stop_check_hours, booking_hours).
- **Booking** — bookings (id, activity_id, branch_id, start_at, end_at, status, paid_status, client, pricing_run_id, ...).
- **TariffPlan** — tariff_plans (restaurant_id, calendar_id, name, booking_hours).
- **TariffRule** — tariff_rules (plan_id, rule_type, conditions JSON, pricing_formula).
- **Calendar** — calendars (restaurant_id, name, weekend_days).
- **TariffSpecialDateModifier** — модификаторы по датам.
- **PricingRun** — результат расчёта цены брони.
- **BookingNotification** — уведомления по бронированиям (тип, статус).

### 8.4 Смены
- **Shift** — shifts (id, user_id, restaurant_id, start_time, end_time, status).
- **ShiftTemplate** — shift_templates (restaurant_id, name, правила).
- **ShiftSwapRequest** — запросы обмена сменами.

### 8.5 Loyalty
- **Guest** — loyalty_guests (restaurant_id, phone_normalized, name, email, segment_id, tier_id).
- **BonusAccount** — loyalty_bonus_accounts (guest_id, balance, status).
- **BonusLedgerEntry** — проводки по бонусам.
- **Campaign** — loyalty_campaigns (restaurant_id, type, status).
- **Tier** — loyalty_tiers (segment_id, name, level).
- **Segment** — loyalty_segments (restaurant_id, name).
- **RfmSnapshot** — loyalty_rfm_snapshots (guest_id, snapshot_date, rfm scores).
- **Mission, MissionProgress** — миссии и прогресс гостя.
- **Achievement, GuestAchievement** — достижения.
- **PersonalizedOffer** — персональные офферы (статус, погашение).
- **LoyaltyOrderAccrual** — начисление за заказ (idempotency по order).

### 8.6 Прочее
- **RefreshToken** — refresh_tokens (user_id, token, expiry).
- **VerificationCode** — verification_codes (user_id, code, challenge, expiry).
- **ActivityLog** — activity_log (action_type, entity_type, entity_id, user_name, created_at).
- **OutboxEvent** — outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status, retries).
- **GuestSession** — guest_sessions (данные сессии публичного заказа).
- **TelegramSession** — telegram_sessions (token, restaurant_id).
- **Resource** — resources (type, identifier) — например, изображения.

Типы и интерфейсы фронта определены в `api/types.ts` и в специализированных файлах (loyaltyTypes, qrTypes и т.д.); они повторяют DTO бэкенда (поля, вложенные объекты).

---

## 9. Зависимости и библиотеки

### 9.1 Backend (Gradle)
- **Spring Boot** (web, data-jpa, jdbc, validation, actuator, security, mail) — ядро и безопасность.
- **PostgreSQL** — драйвер БД.
- **Redis** (spring-boot-starter-data-redis) — rate limiting (buckets по путям).
- **Flyway** — миграции (V1–V72 в `db/migration/`).
- **SpringDoc OpenAPI** — Swagger UI и api-docs.
- **JWT** (jjwt-api, jjwt-impl, jjwt-jackson) — выпуск и проверка access/refresh.
- **Lombok** — конструкторы, геттеры, логи.
- **Apache POI** — Excel (загрузка склада, отчёты).
- **Testcontainers** — тесты с PostgreSQL.

### 9.2 Frontend (package.json)
- **react, react-dom** — UI.
- **react-router-dom** — маршрутизация.
- **axios** — HTTP.
- **date-fns** — даты.
- **exceljs, xlsx, file-saver** — экспорт Excel.
- **qrcode.react** — отображение QR.
- **vite, @vitejs/plugin-react** — сборка и dev-сервер.
- **typescript** — типы.

### 9.3 Forecasting (Python)
- **fastapi, uvicorn** — API.
- **pandas, numpy** — ряды и расчёты.
- **requests** — вызовы к Java.
- **openpyxl** — Excel в excel_exporter.
- **statsmodels, prophet** (и др. по коду) — модели прогноза.

### 9.4 Telegram-payment-service (Node)
- **NestJS** — фреймворк.
- **Passport JWT** — авторизация.
- **Prisma** — БД.
- **BullMQ** — очереди.
- **Telegram (mtproto)** — интеграция с Telegram.

---

## 10. Слабые места, потенциальные баги, технический долг, улучшения

### 10.1 Слабые места
- **Нет offline-first:** Касса и фронт полностью зависят от сети; при обрыве связи работа останавливается.
- **Один источник правды по tenant:** TenantContext в thread-local; при асинхронных вызовах (например, @Async) контекст может не передаваться без явной передачи.
- **Прогноз:** Хранение в файлах (specs по tenant_id); при масштабировании нужна общая файловая система или перенос в БД/объектное хранилище.
- **Rate limit:** Привязан к IP/ключу; при прокси (Nginx/Cloudflare) нужна корректная настройка trust_proxy и, при необходимости, идентификация по заголовкам.

### 10.2 Потенциальные баги
- **Refresh token:** При параллельных запросах с истёкшим access возможна гонка refresh; на фронте есть очередь — при падении refresh все ожидающие получают ошибку и редирект; дублирование refresh на бэкенде при высокой нагрузке может давать лишние выдачи токенов (зависит от реализации AuthService).
- **Закрытие заказа:** При одновременном закрытии одного и того же заказа возможен двойной списание склада, если нет блокировки строки/оптимистичной блокировки (в коде есть транзакции; наличие блокировки нужно проверять по OrderRepository и статусу).
- **Импорт заказов/броней:** Большие файлы и некорректный CSV могут приводить к таймаутам или неинформативным ошибкам; валидация по строкам может оставлять частично загруженные данные при ошибке в середине.

### 10.3 Технический долг
- Дублирование логики между Telegram-заказом и публичным заказом (разные контроллеры, возможна рассинхронизация правил).
- Жёстко заданные строки (роли, статусы) в коде и на фронте; при добавлении новых ролей/статусов нужны правки в нескольких местах.
- Не все эндпоинты покрыты интеграционными тестами; критичные (заказ, склад, брони) желательно покрыть.
- Forecasting: контекст (token) передаётся явно в сервисные методы из-за ограничений ContextVar в многопоточности — при рефакторинге легко забыть проброс параметра.

### 10.4 Улучшения
- Ввести версионирование API (префикс /api/v1/) и политику обратной совместимости.
- Документировать контракты (OpenAPI) и использовать их для генерации клиентов и тестов.
- Вынести конфигурацию фич (прогноз, loyalty, telegram) в feature flags для поэтапного включения.
- Добавить метрики (latency, ошибки по endpoint) и алерты (например, падение сервиса прогноза или payment).
- Унифицировать формат ошибок (код приложения, ссылка на документацию) для фронта и мобильных клиентов.
- Рассмотреть вынос тяжёлых отчётов и экспорта в фоновые задачи с уведомлением о готовности.

---

## 11. Предположения и неопределённости

**Предположения:**
- Роли пользователей ограничены набором HEAD_ADMIN, ADMIN, WORKER (и, возможно, другими из enum Role); разграничение по конкретным операциям может частично дублироваться в сервисах, а не только в @PreAuthorize.
- Поле `permissions` в User используется для гранулярных прав (например, UserPermissionListConverter); полный список сценариев, где они проверяются, по коду не везде прослеживается — предполагается, что в основном для платформенных и административных действий.
- Telegram webhook secret и bot token задаются в переменных окружения; при пустом токене вебхук может возвращать ошибку или игнорировать запросы — точное поведение зависит от реализации TelegramOrderingController.
- Срок действия QR-токена меню хранится в `restaurants.qr_token_expires_at`; логика подписи и проверки срока в QrMenuConfigService и при отдаче публичного меню — предполагается согласованность с фронтом (QrMenu, qrSession).

**Не удалось определить по коду:**
- Точный формат и объём данных, возвращаемых внутренним эндпоинтом `/api/internal/forecast-data/orders` (поля, фильтры по датам) — описание есть в ForecastDataService и InternalForecastDataController; детальный контракт лучше смотреть в Java и в `java_client.py`.
- Полный список подписчиков outbox и условия доставки (какие event_type куда идут) — известен OrderClosedEventListener; другие типы событий и обработчики могут быть в loyalty и других модулях — требуется выборочный поиск по OutboxEvent и диспетчеру.
- Поведение telegram-payment-service при недоступности Bank Bot или очереди BullMQ — по основному репозиторию не видно; нужно смотреть код NestJS-сервиса.

---

## 12. Карта связей между модулями

```
                    ┌─────────────┐
                    │   Browser   │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  frontend    │  │  Java        │  │  Python      │
│  (React)    │  │  (Spring)    │  │  (Forecast)  │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       │  /api, /uploads │  internal JWT   │
       └────────────────►│◄────────────────┘
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL  │  │  Redis       │  │  Telegram    │
│  (RLS)       │  │  (rate limit)│  │  Payment Svc │
└──────────────┘  └──────────────┘  └──────────────┘
```

**Зависимости модулей (логические):**
- **Frontend** → Java: все данные и действия через REST; Java — единственный backend для SPA.
- **Java** → PostgreSQL: основное хранилище; RLS по restaurant_id.
- **Java** → Redis: rate limit (RedisRateLimitService).
- **Java** → Python: прогноз (ForecastController, ForecastSchedulerService, InternalForecastJwtService); Python запрашивает данные у Java (InternalForecastDataController).
- **Java** → Telegram-payment-service: создание заявок на оплату, статусы, QR (TelegramPaymentProxyService).
- **Forecasting** → Java: только HTTP GET orders; не использует БД и Redis.
- **Telegram-payment-service** → своя БД (Prisma), очередь (BullMQ/Redis), внешние API (Telegram, банк).

**Внутри Java:**
- Controller → Service → Repository; события → Outbox → Dispatcher; после закрытия заказа → OrderClosedEventListener → outbox и loyalty.
- TenantFilter и JwtAuthenticationFilter задают контекст для всех контроллеров (кроме публичных путей).
- ForecastController и ForecastSchedulerService используют ForecastUpdateInProgressStore для флага «прогноз обновляется».

**Внутри Frontend:**
- Страницы используют api/services.ts и специализированные сервисы; client.ts общий для всех запросов.
- AuthProvider и AuthContext дают user; ProtectedRoute ограничивает доступ по ролям.
- Разделы: platform (HEAD_ADMIN), restaurant (меню, заказы, склад, зал, аналитика), tariffs (тарифы, брони, смены, аналитика бронирований, прогноз), loyalty (гости, кампании, тиры, сегменты, геймификация).

---

## 13. Детальное описание ключевых сервисов и сценариев

### 13.1 OrderService (Java)

**Методы (кратко):**
- `createOrder(dto)` — создаёт заказ в статусе OPEN; при наличии idempotencyKey проверяет дубликат.
- `addItem(orderId, request)` — добавляет OrderItem (dish, qty, price); при опциях создаёт OrderItemOption из шаблонов.
- `closeOrder(orderId)` — проверяет OPEN, рецепты у всех блюд; вызывает StockService для списания по рецептам; обновляет Order (CLOSED, closedAt, totalAmount); публикует OrderClosedEvent; привязка к гостю и начисление loyalty — через listener/outbox.
- `exportOrdersToCsv(from, to)` — выборка заказов за период, формирование CSV по позициям (один ряд — одна позиция с полями заказа).
- `importOrdersFromCsv(bytes)` — парсинг CSV, группировка по (created_at, name) в заказы, создание Order и OrderItem; сохраняет переданные даты (Order.@PrePersist не перезаписывает createdAt если уже задан).

**Типичные сценарии:** Официант создаёт заказ → добавляет позиции (с модификаторами) → закрывает заказ (продажа + списание склада + loyalty); импорт/экспорт для переноса данных.

### 13.2 BookingService (Java)

**Расчёт цены:** PricingService использует тарифный план, календарь, правила и особые даты; возвращает breakdown. Booking сохраняется с total_amount из pricing run.

**Импорт/экспорт броней:** export — CSV по броням (branch, activity, даты, статус, клиент); import — разбор CSV, привязка branch/activity по id, создание броней, при необходимости расчёт цены.

**Связи:** Activity (branch, tariff_plan), Calendar, TariffRule, TariffSpecialDateModifier; уведомления (BookingNotification) при смене статусов/оплате.

### 13.3 ForecastService (Python) — train_and_select и get_monthly_forecast

**train_and_select(metric, restaurant_id, force, token):**
- Загружает ряд load_metric(metric) (через repository → java_client к Java).
- При пустом ряде возвращает {"error": "no_data"}.
- Запускает selector (бэктест, сравнение моделей), сохраняет лучшую spec через save_spec(metric, tenant_id).
- Возвращает {"status": "trained", "spec": ...}.

**get_monthly_forecast(metric, year, month, force_refresh, token, restaurant_id):**
- Пытается загрузить кэш load_monthly_rollup(metric, year, month, tenant_id); при отсутствии — load_latest_forecast(metric, tenant_id). При отсутствии дневного прогноза возвращает {"error": "no_forecast_available", "message": "..."}.
- Строит месячный снимок (build_full_month_snapshot) по дневным прогнозам и фактическим данным за месяц; сохраняет rollup; возвращает dict для API (status, predicted_total, covered_days и т.д.).
- В repository есть fallback: при заданном tenant_id, если файлы не найдены в specs/{tenant_id}/, загрузка идёт из specs/ (legacy).

### 13.4 Loyalty — начисление за заказ

После закрытия заказа OrderClosedEventListener публикует событие в outbox или вызывает обработчик; loyalty-контур по событию находит гостя (order.guestId), проверяет кампании и правила, создаёт LoyaltyOrderAccrual (идемпотентность по order_id), начисляет бонусы (BonusLedgerEntry), обновляет миссии (MissionProgress). Детали — в service/loyalty и в обработчиках outbox.

### 13.5 Фронт — загрузка прогноза и «прогноз обновляется»

**ExecutiveLayer (тарифы/аналитика):** При монтировании вызывается loadMonthly: параллельно getUpdating(), getMonthlyForecast(revenue), getMonthlyForecast(bookings); результат getUpdating() задаёт updatingFromServer. Пока monthlyLoading || updatingFromServer показывается «Прогноз в процессе обновления». При updatingFromServer запускается интервал 5 с: getUpdating(); при false — сброс флага и повтор loadMonthly(). Ошибки no_data / no_forecast_available отображаются дружелюбным сообщением (INSUFFICIENT_DATA_MESSAGE).

**Связи:** forecastService.getUpdating, getMonthlyForecast, getMonthProgress; бэкенд выставляет флаг «обновляется» в ForecastUpdateInProgressStore при запуске scheduler и при вызове summary/train.

---

*Документ актуален по состоянию кода на момент составления. При изменении API или структуры проекта разделы 3–9 и 12 следует обновить.*
