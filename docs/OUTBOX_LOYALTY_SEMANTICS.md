# Outbox → Loyalty: delivery semantics (as implemented)

This document describes **actual behaviour** in code and schema, not an ideal.  
Code: `OutboxDispatcherService`, `LoyaltyOrderAccrualRepository`, `V68` / `V69` migrations.  
Tests: `OutboxExactlyOnceIT`.

## Idempotency key (business)

**`(restaurant_id, order_id)`** — same composite as JPA `LoyaltyOrderAccrual` / primary key on `loyalty_order_accruals` (`V68`).  
Loyalty side effects for a closed order are keyed by this pair; the outbox row is separate (UUID) and can exist **more than once** for the same order only if the producer inserts duplicates; the consumer remains safe (below).

## Delivery semantics: **at-least-once** for outbox rows

- The global queue `outbox_events` is **not** a Kafka exactly-once stream. Rows can be:
  - delivered more than once (e.g. `RETRY` after failure, or replay from admin, or `recoverStuckProcessing` putting `PROCESSING` back to `RETRY`);
  - claimed by **one** worker at a time via `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`.
- **Effect** on loyalty for a given `(restaurant_id, order_id)`: **at most one successful “processed” accrual guard row**, enforced by:
  1. **DB:** `PRIMARY KEY (restaurant_id, order_id)` + `INSERT … ON CONFLICT DO UPDATE` to `PROCESSED` (`upsertProcessed`).
  2. **App:** before calling `CampaignEngine`, `existsByRestaurantIdAndOrderIdAndStatus(…, PROCESSED)` short-circuits so **`processOrderEvent` is not invoked again** when the guard already shows processed.

So: **at-least-once** handoff on the outbox event stream; **idempotent consumer** for loyalty at order scope.

## Roles of components

| Piece | Role |
|-------|------|
| **outbox row** | Durable record that work remains after `ORDER_CLOSED` (same TX as business write in `OrderService` path where applicable). |
| **Dispatcher** | Polls/claims work, `recoverStuckProcessing` for crash mid-flight, `handleFailure` for RETRY/DEAD. |
| **`FOR UPDATE SKIP LOCKED`** | Lets multiple app instances (or threads) run `processOutbox()` concurrently: each event row is claimed by at most one worker; others skip locked rows. |
| **ShedLock** on scheduler | Reduces duplicate *polling* work across nodes; **claims in DB** remain the authority for which row is processed. |
| **`loyalty_order_accruals`** | **Guard + idempotency record**: if `PROCESSED` exists, skip campaign; upsert after successful campaign in the same `TransactionTemplate` callback. |

## Ordering inside `processOrderClosed`

1. If guest/restaurant missing in payload → mark outbox `DONE` (no loyalty), no guard row.  
2. In a **single** `transactionTemplate` execution: if guard already `PROCESSED` → **return** (no `CampaignEngine` call).  
3. Else: `CampaignEngine.processOrderEvent` then `upsertProcessed`.  
4. Mark outbox row `DONE` (platform `JdbcTemplate`, after tenant TX).

Retry after failure on step 3: no `PROCESSED` yet → campaign may run again (acceptable if `CampaignEngine` is safe for your campaigns; order-level guard prevents double **guard**; duplicate points from **partial** campaign failure are mitigated by business rules in engine — not expanded here).

## `SKIP LOCKED` in the story

- Competing **workers** (threads or instances) run the same `CLAIM_SQL`: each locks different rows (or none).  
- No two workers process the **same** outbox **row** concurrently.  
- Combined with the **(restaurant_id, order_id)** guard, duplicate **effect** is avoided even if two outbox **rows** exist for the same order (see test `twoOutboxEventsForSameOrder_callCampaignEngineOnce`).

## When this is *not* “exactly-once”

- Multiple **distinct** outbox events for the **same** order are **deduplicated** for loyalty by the guard, not by deleting duplicate rows.  
- **Exactly-once** end-to-end across all subsystems (email, stock, etc.) is **out of scope**; this slice is **loyalty accrual idempotency** only.

---

See also: [ARCHITECTURE_PORTFOLIO.md](ARCHITECTURE_PORTFOLIO.md) (diagram), [docs/TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md) (full system).
