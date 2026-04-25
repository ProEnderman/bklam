# OpenAPI export

## Choice: no CI artifact, no always-committed `openapi.yaml` by default

| Option | Verdict |
|--------|---------|
| **Committed `docs/openapi*.yaml`** | Would drift on every API change unless regenerated on each PR, or a bot runs the app. Large JSON/YAML bloats git history. |
| **CI artifact** | Would require a workflow that **starts the app** (or a dedicated static generator task), plus secrets/DB in CI — more moving parts than a single Gradle check. |
| **Developer-run scripts** (chosen) | **Minimally invasive:** run against a *local* or staging server when you need a snapshot. |

**Springdoc** serves OpenAPI 3.0 as **JSON**; YAML is a cosmetic transform (`yq` / other tools) — the canonical wire format here is **JSON** from Springdoc’s `/v3/api-docs*`.

## Commands (backend on `http://localhost:8080` unless `BASE` is set)

| Output | Command |
|--------|---------|
| **Full** API (all groups) | `make openapi` → `openapi-export.json` in repo root. |
| **Portfolio** group only (aligned with `OpenApiPortfolioConfig`, smaller file) | `make openapi-portfolio` → `docs/openapi-portfolio-snapshot.json` |

**Optional:** If you need a `portfolio-1.0` **release** with a file in the tree, run `make openapi-portfolio` (and optionally `make openapi`) **before tagging**, then commit the generated JSON **once** for that tag. The repo does **not** require keeping those files committed in day-to-day development.

**Prod:** OpenAPI is disabled for `prod` — export only from a **dev** / **local** run.

## URLs

- Full: `GET /v3/api-docs`  
- Portfolio group: `GET /v3/api-docs/portfolio`  

(Swagger UI: [PORTFOLIO_API.md](PORTFOLIO_API.md).)
