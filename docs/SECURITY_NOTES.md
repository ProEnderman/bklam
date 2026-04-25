# Security & config

## Environment and secrets

- **Config:** all deployment-sensitive values are **environment- or file-based** (see `.env.example` in the repo root: copy to `.env`, never commit real secrets).
- **Rotation:** rotate `JWT_SECRET`, `QR_SIGNING_SECRET`, `FORECAST_INTERNAL_JWT_SECRET_B64`, DB passwords, and third-party API keys on the same schedule as your org policy; after rotation, restart affected services.
- **Git:** secrets must not be committed; use `.gitignore` for `.env` and local overrides.

## F3 — Tenant / IDOR (mutations)

- **JPA** paths are combined with `TenantContext` / RLS; **defense in depth** is documented in architecture docs.
- **RLS** integration tests (`RlsIsolationIT`, `RlsInsertIsolationIT`) demonstrate cross-tenant denial at the database.

Trust boundaries: **app filters + RLS**; new endpoints should continue to scope by `restaurant_id` / tenant and rely on RLS in production roles.

## Rate limiting

- Implementation: in-memory **Bucket4j**-style limiter (see `RateLimitInterceptor` and `InMemoryBucketRateLimiter`).
- **HTTP 429** with JSON body: code `RATE_LIMITED` (see `ApiErrorResponse`).
- Tunables: `application.yml` → `rate_limit.*_per_min` (e.g. `auth_per_min`, `write_per_min`, `standard_per_min`). Trust proxy: `TRUST_PROXY`.
- **Tests:** `InMemoryBucketRateLimiterTest` (unit) exercises limiter behavior.

## CSRF & sessions

- **Session:** `SessionCreationPolicy.STATELESS` — the API is **JWT-first** for authenticated calls.
- **CSRF:** Spring Security still configures **cookie-based CSRF** (e.g. for cookie flows such as `POST /api/auth/refresh` which is *not* on the CSRF ignore list). Browsers and cookie-based clients must send `X-XSRF-TOKEN` for those routes; pure `Authorization: Bearer` patterns for other APIs are the primary app narrative.

**Summary:** not a classic server-session app; CSRF is relevant for **cookie + refresh** flows, not for typical bearer-only API clients.
