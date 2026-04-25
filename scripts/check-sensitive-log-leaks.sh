#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

TARGETS=(
  "src/main/java"
  "telegram-payment-service/src"
)

# Patterns that indicate direct exposure of sensitive values in logs.
# Keep strict to avoid noisy false positives.
PATTERN='(System\.out\.println\(.*(JWT_SECRET|secret)|console\.log\(.*(first 20 chars|last 10 chars|JWT Payload received)|log\.(debug|info|warn|error)\(.*(full value=|full value '\''|token preview|token starts with|first 20 chars|last 10 chars|Current value:|Authorization: Bearer|refresh token.*full|Refresh token .* not found in database.*\{))'

echo "Running sensitive log leak check..."

if command -v rg >/dev/null 2>&1; then
  SCAN_CMD=(rg -n -i --pcre2 "$PATTERN" "${TARGETS[@]}")
else
  SCAN_CMD=(grep -RInE "$PATTERN" "${TARGETS[@]}")
fi

set +e
"${SCAN_CMD[@]}"
RG_EXIT=$?
set -e

if [ "$RG_EXIT" -eq 0 ]; then
  echo ""
  echo "Sensitive logging patterns found. Please redact or remove them."
  exit 1
fi

echo "No sensitive logging patterns found."
