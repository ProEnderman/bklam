# Git tag (release anchor)

## Recommended tag name

**`portfolio-1.0`** or **`v1.0.0-portfolio`** (SemVer with a suffix).

Use a human-readable name for public links to a fixed point in history.

## When to create the tag

Create it **after**:

- `main` (or your default branch) has the README + docs you consider current;
- **CI green**: `./gradlew test` (and any checks you rely on);
- no committed secrets or WIP tokens.

Do not tag a dirty working tree you would not share as-is.

## Checklist before tagging

- [ ] README: what the project is, how to run, flagship flow, limitations ([README.md](../README.md)).
- [ ] Architecture doc: [ARCHITECTURE_PORTFOLIO.md](ARCHITECTURE_PORTFOLIO.md).
- [ ] Outbox → loyalty: [OUTBOX_LOYALTY_SEMANTICS.md](OUTBOX_LOYALTY_SEMANTICS.md), tests e.g. `OutboxExactlyOnceIT`.
- [ ] No committed `.env` with real secrets.
- [ ] (Optional) Postman [rms-portfolio collection](collections/rms-portfolio.postman_collection.json); OpenAPI policy: [OPENAPI.md](OPENAPI.md).

## Commands (example)

```bash
git checkout main
git pull
./gradlew test
git tag -a portfolio-1.0 -m "RMS backend: outbox, loyalty, docs"
git push origin portfolio-1.0
```

## Link

Example: `https://github.com/<user>/<repo>/releases/tag/portfolio-1.0` or the tagged commit hash.

## Optional: GitHub Release

Short notes: stack, outbox flow, how to run, link to [PORTFOLIO_DEMO_RECORDING.md](PORTFOLIO_DEMO_RECORDING.md). No secrets in attachments.
