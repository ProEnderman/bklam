# DX — thin wrappers. Requires: Java 17, optional Docker for Postgres.
.PHONY: test run migrate openapi openapi-portfolio

test:
	@./scripts/test.sh

run:
	@./scripts/run.sh

migrate:
	@./scripts/migrate.sh

openapi:
	@./scripts/openapi-export.sh

# Springdoc "portfolio" group only (smaller) → docs/openapi-portfolio-snapshot.json
openapi-portfolio:
	@./scripts/openapi-portfolio-snapshot.sh
