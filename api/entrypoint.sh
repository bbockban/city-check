#!/usr/bin/env bash
set -e

echo "==> Running database migrations"
alembic upgrade head

echo "==> Seeding reference zoning data (idempotent, safe to re-run)"
printf 'y\n' | python seed.py || echo "==> Seed step failed, continuing boot anyway"

echo "==> Starting API"
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
