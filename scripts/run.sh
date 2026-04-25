#!/usr/bin/env bash
# Start backend with dev profile (Postgres: restaurant_db_dev). Loads .env when merged by Gradle.
set -euo pipefail
cd "$(dirname "$0")/.."
exec ./gradlew devBootRun
