# Performance notes

## Heavy list-style endpoints (examples)

Candidates for pagination cap + index:

| Area        | Endpoint pattern        | Rationale |
|------------|-------------------------|-----------|
| Orders     | `GET /api/orders`        | Large tenant order history, date filters, sort. |
| Dishes     | `GET /api/dishes`        | Full menu with search, pagination. |
| Ingredients | `GET /api/ingredients`  | Full ingredient list with search. |

## Pagination

Controllers above use a shared cap: **`PaginationConstraints.MAX_PAGE_SIZE` (200)**. Requests with `size` above the cap are clamped (no unbounded `PageRequest`).

## N+1 (orders)

`OrderService` + `OrderRepositoryCustomImpl` use a **two-step** list: page of IDs, then `findOrdersWithItemsByIdIn` with join-fetch for items, avoiding a classic N+1 on order lines. Dishes/ingredients list paths are covered by the pagination cap above; deeper graph optimizations are optional follow-ups.

## Flyway index

- **`V91__idx_orders_portfolio_list.sql`:** `orders (restaurant_id, created_at DESC)` — supports the tenant order list path that filters by `restaurant_id` and orders by `created_at` (see `findOrderIdsPageOrdered`). Complements single-column indexes from earlier migrations.

## Before / after (rationale, not a benchmark)

- **Rationale:** Without a cap, a single `size=10000` (or client bug) could load thousands of rows and join-heavy graphs. Capping + a composite index aligned to the list query is a **low-cost** guard and improves planner choice for the common `WHERE restaurant_id = ? ORDER BY created_at DESC` pattern.
- **Query count:** measure with `EXPLAIN` / `statistics` in your environment; the index matches the list query shape in code.
