# Test pyramid

## How tests are split

| Layer | What | Examples in this repo |
|--------|------|------------------------|
| **Unit** | Pure logic, no Spring context | `InMemoryBucketRateLimiterTest`, config helpers |
| **Web slice** | MVC + security/critical filters in isolation | e.g. CSRF / auth–related `*IT` when they use `MockMvc` with a narrow slice |
| **DB integration** | Real PostgreSQL, Flyway, JPA, RLS | `RlsIsolationIT`, `RlsInsertIsolationIT`, outbox / loyalty `*IT` under `src/test/java/com/restaurant/...` |
| **E2E / API** | Full stack or docker-compose | `./gradlew dockerIT` / scripts as documented in README |

This is a **pragmatic** split: names and packages vary.

## `Clock` bean

Not used globally: time-dependent tests rely on existing mechanisms where needed.

## Flagship invariants

- **Tenant isolation (DB):** `RlsIsolationIT` / `RlsInsertIsolationIT` — PostgreSQL RLS blocks cross-tenant access even if application code forgets a `restaurant_id` filter.
- **Outbox / loyalty (application):** `OutboxExactlyOnceIT` and related outbox tests — accrual / dispatch invariants for the outbox path.

Together these are the main hard guarantees: data plane isolation + critical async correctness.

## Flaky tests

Prefer fixing test lifecycle (`@DynamicPropertySource`, single Flyway) over `@Disabled` when a test order issue appears.
