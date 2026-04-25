# Portfolio API surface (OpenAPI & review)

## C1 — Review subset in Swagger

The Springdoc group **“portfolio”** includes:

- `/api/platform/**` — org / tenant admin
- `/api/auth/**` — auth
- `/api/orders/**` — orders (list + mutations)
- `/api/ingredients/**` — stock ingredients
- `/api/dishes/**` — menu

Open the UI → group dropdown → **portfolio**. The default group still exposes the full monolith for local exploration.

**Export:** with the app running, `make openapi` → `openapi-export.json` (full API); `make openapi-portfolio` → `docs/openapi-portfolio-snapshot.json` (subset). Policy: [OPENAPI.md](OPENAPI.md) · [README](../README.md).

## C2 — Where Swagger is enabled

- **Default / dev / local:** OpenAPI and Swagger UI are on (`/swagger-ui.html`, `/api-docs`).
- **Production profile (`prod`):** both are **disabled** in `application-prod.yml`. Do not re-enable in production without an explicit reason and access control.

## C3 — Errors

JSON errors use `ApiErrorResponse` (timestamp, HTTP status, `code`, `message`, `path`). When the request passed through correlation, responses may include **`requestId`** (same value as the `X-Request-Id` response header) for support and log correlation.

## C4 — Versioning

**Versioning:** the API is not uniformly prefixed with `/api/v1`. A full versioned path would be a large, breaking change. The **portfolio** OpenAPI group and stable error codes document the main contract; new endpoints can get a version prefix incrementally if needed.
