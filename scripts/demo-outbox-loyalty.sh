#!/usr/bin/env bash
# Run outbox + loyalty idempotency IT. See docs/OUTBOX_LOYALTY_SEMANTICS.md
#
# A) Proof in CI / local (no running API):
#    ./scripts/test.sh --tests 'com.restaurant.outbox.OutboxExactlyOnceIT'
#
# B) Optional manual checks (API + DB) when backend is up with real Postgres + HEAD_ADMIN session:
#    1) Start: ./scripts/run.sh  (or make run)
#    2) Health: curl -fsS http://localhost:8080/actuator/health
#    3) (After closing an order with guest + outbox row, or after IT data) list guard:
#       GET /api/platform/loyalty/accrual?restaurantId=1&orderId=100
#       — with HEAD_ADMIN cookie / JWT (same auth as /api/platform/outbox).
#    4) Platform outbox stats: GET /api/platform/outbox/stats
#    5) Duplicate-path behaviour is covered by tests: two outbox rows / same order → one CampaignEngine call.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== A) Run outbox+loyalty integration tests (PostgreSQL Testcontainers) ==="
./gradlew test --no-daemon --tests "com.restaurant.outbox.OutboxExactlyOnceIT"
echo "OK. For semantics and diagram: docs/OUTBOX_LOYALTY_SEMANTICS.md"
