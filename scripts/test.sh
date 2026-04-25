#!/usr/bin/env bash
# Run the standard unit/integration test task (H2 + Testcontainers where applicable).
set -euo pipefail
cd "$(dirname "$0")/.."
exec ./gradlew test --no-daemon
