# Portfolio hardening backlog

Use this file as a backend checklist. Tick items as you complete them.

---

## A. Architecture & documentation

- [x] **A1** — System inventory: HTTP entrypoints, auth, DB/Flyway, multi-tenant/RLS, outbox, schedulers, external integrations (Telegram, payments, etc.).
- [x] **A2** — Architecture doc (~1 page): components, data flow, trust boundaries, failure modes.
- [x] **A3** — Diagram: clients → API → services → DB/cache/queues; tenant boundary if relevant.
- [x] **A4** — README: prominent “Architecture” link to the doc.

---

## B. CI / quality signal

- [x] **B1** — Test profile: scheduling (and similar background work) **off** during tests; no stray scheduled paths.
- [x] **B2** — Quiet CI logs: Hibernate `show-sql` off in test/CI unless debugging a single test.
- [x] **B3** — Gradle + JDK consistent; cache Gradle in GitHub Actions.
- [ ] **B4** — (Optional) Split `test` vs `integrationTest` — *one `:test` job is enough for now*
- [ ] **B5** — (Optional) Dependabot / OWASP — *deferred: no extra job*

---

## C. API contract & consistency

- [ ] **C1** — OpenAPI (e.g. Springdoc) for the public/admin subset you want reviewed.
- [ ] **C2** — Swagger UI: dev-only or profile-gated (`dev` / `local`).
- [ ] **C3** — Standard JSON error body for 4xx/5xx; no stack traces in API responses.
- [ ] **C4** — API versioning: `/api/v1` for that subset; document any deprecated paths.

---

## D. Observability (demo-friendly)

- [ ] **D1** — Request correlation: `X-Request-Id` or W3C `traceparent`; include in logs.
- [ ] **D2** — Structured log fields: correlation id, method/path, status, duration; tenant/user only where safe.
- [ ] **D3** — Micrometer HTTP metrics; document hitting `/actuator/metrics` (or Prometheus if added).
- [ ] **D4** — (Optional) OpenTelemetry behind a profile + one-line enable doc.

---

## E. Performance (targeted)

- [ ] **E1** — Pick 2–3 heavy list/report endpoints.
- [ ] **E2** — Pagination + max page size on those endpoints.
- [ ] **E3** — Remove obvious N+1 (`@EntityGraph`, fetch join, or projections).
- [ ] **E4** — Flyway indexes for real `WHERE`/`ORDER BY`; comment why each exists.
- [ ] **E5** — Short before/after note (query count or rationale) in architecture doc or PR description.

---

## F. Security narrative

- [ ] **F1** — `.env.example`: every variable with a one-line description; no secrets.
- [ ] **F2** — Confirm no secrets in git; document env-based config and rotation in one paragraph.
- [ ] **F3** — Authorization: tenant/restaurant-scoped mutations check ownership/tenant (IDOR prevention).
- [ ] **F4** — Rate limiting: document limits and 429; add a small test if feasible.
- [ ] **F5** — Document CSRF/session story if you use cookie-based auth.

---

## G. Test pyramid & invariants

- [ ] **G1** — Classify tests: unit vs web slice vs DB integration vs minimal e2e.
- [ ] **G2** — `Clock` bean (or similar) for time-dependent tests where needed.
- [ ] **G3** — One flagship invariant test (tenant isolation or accrual/money invariant).
- [ ] **G4** — Remove flaky patterns: shared static state, unclear container lifecycle.

---

## H. Developer experience

- [x] **H1** — `docker compose` (or documented stack): from zero to running API + DB.
- [x] **H2** — Seed data: minimal admin/restaurant/menu (or script) for local demo.
- [x] **H3** — Scripts: `test`, `run`, `migrate`, openapi export (Makefile / just / shell).
- [x] **H4** — README “Quick start”: copy-paste commands verified on a clean machine.

---

## I. Vertical slice — loyalty accrual via outbox (reliable + provable)

- [x] **I1** — Document semantics in architecture doc: at-least-once + idempotent handler (or your exact model).
- [x] **I2** — Explicit idempotency key: e.g. `(restaurant_id, order_id)` aligned with `loyalty_order_accruals` / outbox.
- [x] **I3** — DB guard: unique constraint or equivalent so duplicate processing cannot double the effect.
- [x] **I4** — Handler: safe retry without corrupting state (campaign/dispatcher path).
- [x] **I5** — Test: same logical event processed twice → single accrual / single `PROCESSED` outcome.
- [x] **I6** — Test or doc: concurrent workers + `SKIP LOCKED` as part of the story.
- [x] **I7** — Minimal reconciliation read: accrual status by order or small admin list (narrow scope OK).
- [x] **I8** — Demo script (5–7 steps): enqueue → dispatch → verify DB → repeat → still one effect.

---

## J. Closeout

- [x] **J1** — ~2 min screen recording script: [docs/PORTFOLIO_DEMO_RECORDING.md](docs/PORTFOLIO_DEMO_RECORDING.md)
- [x] **J2** — README: overview, flagship slice, stack, observability, limitations, doc links
- [ ] **J3** — Git tag (e.g. `portfolio-1.0`) when ready; see [docs/PORTFOLIO_GIT_TAG.md](docs/PORTFOLIO_GIT_TAG.md).

---

## Optional extras

- [x] **O1** — Export policy + scripts: [docs/OPENAPI.md](docs/OPENAPI.md), `make openapi` / `make openapi-portfolio` (no CI bloat, optional commit snapshot at tag time)
- [x] **O2** — [docs/collections/rms-portfolio.postman_collection.json](docs/collections/rms-portfolio.postman_collection.json)

---

## Notes for agents / future sessions

- Work on a dedicated feature branch and merge when sections are complete.
- Order that usually works: **H → B → A → I** (run/CI/docs/core story), then **C–G** in parallel where possible, **J** last.
- Item **I** is the flagship “deep feature”; keep scope bounded by **I7–I8** so it stays shippable.
