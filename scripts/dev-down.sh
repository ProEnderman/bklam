#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
docker compose down
echo "Postgres and Redis stopped."
