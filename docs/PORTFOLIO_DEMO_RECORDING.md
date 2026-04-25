# Portfolio: ~2 min screen recording script

Use this as a **shot list** (no video file in repo). Target length **≤ 2 minutes** at a calm pace.  
Prereq: **JDK 17**, **Docker**, repo cloned, `.env` from `.env.example` with dev secrets set.

---

## Shot 1 — What you are running (0:00–0:20)

**Show:** terminal (large font, dark theme is fine).

**Do / say (short):**
- This is a Spring Boot + PostgreSQL restaurant backend; the **flagship** story is **loyalty accrual via outbox** (reliable, idempotent consumer).

**Commands (pick one path, as in README):**
```bash
# Infra only
docker compose up -d postgres redis
./gradlew devBootRun
# or: make run
```

**Cut:** as soon as log line shows the app started (e.g. “Started RestaurantManagementApplication”).

---

## Shot 2 — Health + “stack is up” (0:20–0:35)

**Show:** same terminal (or a second pane).

**Command:**
```bash
curl -fsS http://localhost:8080/actuator/health
```

**Say:** “Actuator health — minimal proof the process and probes are live.”

---

## Shot 3 — Request correlation (`X-Request-Id` + body) (0:35–0:55)

**Show:** `curl` with headers visible.

**Command:**
```bash
curl -sS -D - -o /tmp/health.json http://localhost:8080/actuator/health
head -1 /tmp/health.json
```

**Point on screen:** response header **`X-Request-Id`**.  
**Optional one-liner** (if JSON errors are configured): any `4xx` from a real route shows `requestId` in the body; health is `200` so no error body.

**Say:** “Every request gets a stable id; it’s echoed on the response and in logs (MDC).”

---

## Shot 4 — Logs with correlation id (0:55–1:15)

**Show:** either **console where `bootRun` runs** (scroll so `[reqId]` is visible) or **tail** the log file if you use `logging.file.name`.

**Say:** “Same id appears in the log line and in the access line (`com.restaurant.http.access`), so you can tie client → logs.”

**Optional command** (if logging to `logs/application.log`):
```bash
tail -n 5 logs/application.log
```

---

## Shot 5 — Outbox / loyalty proof (code + test, not only prod traffic) (1:15–1:40)

**Show:** terminal running the scripted proof (fast, no flaky manual order close required).

**Command:**
```bash
./scripts/demo-outbox-loyalty.sh
```

**Say:** “This runs the outbox + loyalty idempotency integration test: duplicate outbox rows for the same order still yield **one** campaign application — semantics in `docs/OUTBOX_LOYALTY_SEMANTICS.md`.”

**Optional cutaway (5–10 s):** open in editor or browser (rendered) **`docs/OUTBOX_LOYALTY_SEMANTICS.md`** or the diagram in **`docs/ARCHITECTURE_PORTFOLIO.md`**.

---

## Shot 6 — Reconciliation read (optional, if you have time) (1:40–1:55)

**Context:** `GET /api/platform/loyalty/accrual` is **HEAD_ADMIN**-only. For a 2 min reel, it is OK to **skip** live call and instead **show the route in Swagger** or the controller one-liner in the doc.

**If you have a HEAD_ADMIN JWT** (or session from your env):

```text
GET /api/platform/loyalty/accrual?restaurantId=1&orderId=<id>
```

**Say:** “Minimal reconciliation: guard row for `(restaurantId, orderId)` — the idempotency key for the slice.”

**Fallback:** show **`LoyaltyAccrualStatusController`** in IDE or the **Operations** list in Swagger under platform.

---

## Shot 7 — Close (1:55–2:00)

**Show:** README or `ARCHITECTURE_PORTFOLIO.md` in the browser for one second, or the repo root.

**Say:** “Stack, RLS, outbox, and tests are documented in-repo.”

---

## Quick reference: URLs & commands

| Item | Where |
|------|--------|
| Run path | [README.md](../README.md) Quick start |
| Health | `GET /actuator/health` |
| Correlation | Header `X-Request-Id`; MDC / logs |
| Outbox semantics | [OUTBOX_LOYALTY_SEMANTICS.md](OUTBOX_LOYALTY_SEMANTICS.md) |
| Architecture | [ARCHITECTURE_PORTFOLIO.md](ARCHITECTURE_PORTFOLIO.md) |
| Demo test script | `./scripts/demo-outbox-loyalty.sh` |
| Reconciliation (admin) | `GET /api/platform/loyalty/accrual?restaurantId=&orderId=` |
| Outbox counts (admin) | `GET /api/platform/outbox/stats` |
| API docs (dev) | `http://localhost:8080/swagger-ui.html` → group **portfolio** |

**Do not** show real JWTs, passwords, or full `.env` on screen. Use a masked token or skip authenticated shots.
