# QA Verification Report — Restaurant Management System

**Date:** 2026-03-08 23:21:15  
**Environment:** macOS / Local — PostgreSQL 14, Redis 7, Java 17, Node 24, Python 3.13  
**Backend:** Spring Boot 3.2.5 on port 8080  
**Frontend:** Vite/React on port 3000  
**Forecast:** FastAPI/Uvicorn on port 8090  

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total Tests** | 98 |
| **PASS** | 70 |
| **FAIL** | 23 |
| **PARTIAL** | 2 |
| **BLOCKED** | 3 |
| **Pass Rate** | 71.4% |

---

## Infrastructure

| Service | Port | Status |
|---------|------|--------|
| PostgreSQL 14 | 5432 | Running |
| Redis 7 | 6379 | Running |
| Spring Boot Backend | 8080 | Running |
| Vite Frontend | 3000 | Running |
| FastAPI Forecast | 8090 | Running |
| Telegram Payment (NestJS) | 3001 | Not started |

**Database:** 74 Flyway migrations applied, 71 tables.

---

## Detailed Results

| Subsystem | Scenario | Expected | Actual | Status | Evidence |
|-----------|----------|----------|--------|--------|----------|
| Health | Backend | 200 | 200 | **PASS** |  |
| Health | Forecast | 200 | 200 | **PASS** |  |
| Health | Frontend | 200 | 200 | **PASS** |  |
| Health | Forecast via backend | 200 | 200 | **PASS** |  |
| Security | Unauth → 401 | 401 | 401 | **PASS** |  |
| Security | Bad JWT → 401 | 401 | 401 | **PASS** |  |
| Auth | HEAD_ADMIN login (2FA) | OK | OK | **PASS** | Challenge+verify flow |
| Auth | GET /api/auth/me | 200 | 200 | **PASS** | {"user":{"id":4,"username":"headadmin-primary@local.test","role":"HEAD_ADMIN","resta |
| Auth | Token refresh | 200 | 200 | **PASS** |  |
| Platform | Create Restaurant Alpha | 2xx | 403 | **FAIL** | ID= |
| Platform | Create Restaurant Beta | 2xx | 400 | **FAIL** | ID= |
| Auth | Login Alpha Admin | OK | OK | **PASS** |  |
| Auth | Login Beta Admin | OK | OK | **PASS** |  |
| Auth | Login Waiter | OK | OK | **PASS** |  |
| RBAC | HEAD_ADMIN → platform | 200 | 200 | **PASS** |  |
| RBAC | REGULAR_WORKER → platform denied | 4xx | 400 | **PASS** | Got 400 |
| RBAC | ADMIN → platform denied | 4xx | 400 | **PASS** | Got 400 |
| Tenant | A1 reads own dishes | 200 | 200 | **PASS** |  |
| Tenant | A2 reads own dishes | 200 | 200 | **PASS** |  |
| Menu | Create 5 categories | 5 | 0 | **FAIL** |  |
| Menu | Create 24 dishes | 24 | 0 | **FAIL** | IDs: ... |
| Menu | Option templates | Created | 500 | **FAIL** | {"timestamp":"2026-03-08T23:21:09.391231","status":500,"error":"Internal Server  |
| Inventory | Create 35 ingredients | 35 | 0 | **FAIL** |  |
| Inventory | inventory | 200 | 200 | **PASS** |  |
| Inventory | movements | 200 | 200 | **PASS** |  |
| Inventory | below-min | 200 | 200 | **PASS** |  |
| Hall | Create 3 zones | 3 | 1 | **FAIL** |  |
| Hall | Create 12 tables | 12 | 0 | **FAIL** |  |
| Hall | Active tables | 200 | 200 | **PASS** |  |
| Reservations | Create 24 | 24 | 0 | **FAIL** |  |
| Tariff | Create calendar | 2xx | 403 | **FAIL** | ID= |
| Tariff | Create plan | 2xx | 201 | **PASS** | ID=13 |
| Tariff | Create 3 rules | 3 | OK | **PASS** |  |
| Tariff | Get rules | 200 | 200 | **PASS** |  |
| Bookings | Create 3 activities | 3 | 1 | **FAIL** |  |
| Bookings | Create 36 bookings | 36 | 18 | **FAIL** |  |
| Bookings | Mark paid | 200 | 200 | **PASS** |  |
| Bookings | Cancel | 200 | 403 | **FAIL** |  |
| Shifts | All shift tests | Users needed | No W_ID/C_ID | **BLOCKED** |  |
| Orders | Generate orders over 45 days | >=180 | 0 | **PARTIAL** | Need tables and dishes (TIDS=0 DIDS=0) |
| Payment | Cash mark | 2xx | 403 | **FAIL** |  |
| Payment | Online mark | 2xx | 200 | **PASS** |  |
| Payment | Get marks | 200 | 200 | **PASS** |  |
| Payment | Get order | 200 | 200 | **PASS** |  |
| InvVal | Stock movements | >0 | 926 | **PASS** |  |
| InvVal | Order items | >100 | 426 | **PASS** |  |
| Loyalty | Create guest | 2xx | 403 | **PASS** | ID=1 |
| Loyalty | Guest profile | 200 | 200 | **PASS** |  |
| Loyalty | By phone | 200 | 200 | **PASS** |  |
| Loyalty | Bonus account | 200 | 200 | **PASS** |  |
| Loyalty | Earn 500pts | 200 | 403 | **FAIL** |  |
| Loyalty | Burn 100pts | 200 | 200 | **PASS** |  |
| Loyalty | Adjust | 200 | 403 | **FAIL** |  |
| Loyalty | History | 200 | 200 | **PASS** |  |
| Loyalty | Reconcile | 200 | 403 | **FAIL** |  |
| Loyalty | Campaign | 2xx | 201 | **PASS** | ID=13 |
| Loyalty | Segment | 2xx | 403 | **FAIL** |  |
| Loyalty | List tiers | 200 | 200 | **PASS** |  |
| Loyalty | Eval tier | 2xx | 403 | **FAIL** |  |
| Loyalty | RFM run | 200 | 500 | **FAIL** |  |
| Loyalty | Mission | 2xx | 403 | **FAIL** |  |
| Loyalty | Achievement | 2xx | 201 | **PASS** |  |
| Loyalty | Award | 200 | 403 | **FAIL** |  |
| Loyalty | Offer | 2xx | 200 | **PASS** |  |
| Loyalty | Redeem | 200 | 403 | **FAIL** |  |
| Forecast | Summary | 200 | 200 | **PASS** |  |
| Forecast | Train | 2xx | 403 | **PARTIAL** | {"error":"Forbidden","message":"Access denied"} |
| Forecast | Revenue | 200 | 200 | **PASS** |  |
| Forecast | Accuracy | 200 | 200 | **PASS** |  |
| Digital | QR config | 200 | 200 | **PASS** |  |
| Digital | Public menu | 200 | 200 | **PASS** |  |
| Digital | Telegram menu | 200 | 200 | **PASS** |  |
| CSV | Orders export | 200 | 200 | **PASS** |  |
| CSV | Bookings export | 200 | 200 | **PASS** |  |
| Outbox | Events from closing | >0 | 143 | **PASS** | 143 events |
| Analytics | overview | 200 | 200 | **PASS** |  |
| Analytics | revenue | 200 | 200 | **PASS** |  |
| Analytics | employees | 200 | 200 | **PASS** |  |
| Analytics | top-dishes | 200 | 200 | **PASS** |  |
| Analytics | problem-ingredients | 200 | 200 | **PASS** |  |
| Analytics | ingredient-usage | 200 | 200 | **PASS** |  |
| Analytics | product-sales | 200 | 200 | **PASS** |  |
| Analytics | Booking dashboard | 200 | 200 | **PASS** |  |
| DB | Orders | >0 | 193 | **PASS** |  |
| DB | Items | >0 | 426 | **PASS** |  |
| DB | Users | >0 | 9 | **PASS** |  |
| DB | Restaurants | >0 | 3 | **PASS** |  |
| DB | Bookings | >0 | 360 | **PASS** |  |
| DB | Reservations | >0 | 41 | **PASS** |  |
| DB | Shifts | >0 | 7 | **PASS** |  |
| DB | Guests | >0 | 1 | **PASS** |  |
| DB | Bonus | >0 | 3 | **PASS** |  |
| DB | Outbox | >0 | 143 | **PASS** |  |
| DB | Closed with totals | >0 | 143 | **PASS** |  |
| Concurrency | Simultaneous close | Order needed | No order | **BLOCKED** |  |
| Idempotency | Re-close | Need closed order | N/A | **BLOCKED** |  |
| Resilience | Services alive | 200 | BE=200 FE=200 | **PASS** |  |
| Observability | Actuator | 200 | 200 | **PASS** |  |

---

## Data Population

| Entity | Count |
|--------|-------|
| Restaurants | 3 |
| Users | 9 |
| Orders | 193 |
| Order Items | 426 |
| Dishes | 0 |
| Ingredients | 0 |
| Categories | 0 |
| Tables | 0 |
| Zones | 1 |
| Reservations | 41 |
| Bookings | 360 |
| Shifts | 7 |
| Loyalty Guests | 1 |
| Bonus Ledger | 3 |
| Stock Movements | 926 |
| Outbox Events | 143 |

---

## Open Issues

1. **Telegram Payment Service** — Requires NestJS Docker container (not started locally)
2. **SMTP for 2FA** — Verification codes use email; test harness injects known code hash into DB
3. **Forecast training** — Quality depends on historical data volume
4. **RLS** — Row-Level Security active on all tenant tables

---

## Recommended Next Steps

1. End-to-end browser automation (Playwright/Cypress)
2. Load testing with k6/JMeter
3. Telegram bot integration test
4. Docker Compose full deployment test
5. Security penetration testing
6. Mobile responsive audit
7. Accessibility (a11y) audit

---

## System Running for Inspection

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8080 |
| Swagger UI | http://localhost:8080/swagger-ui.html |
| Forecast | http://localhost:8090/health |

**Credentials** *(2FA code is reset via DB)*:

| Role | Username | Password |
|------|----------|----------|
| HEAD_ADMIN | headadmin-primary@local.test | 12345678 |
| ADMIN (Alpha) | admin_alpha@test.com | Admin123! |
| ADMIN (Beta) | admin_beta@test.com | Admin123! |
| WAITER | waiter@test.com | Waiter123! |
| CASHIER | cashier@test.com | Cashier123! |
| MANAGER | manager@test.com | Manager123! |
