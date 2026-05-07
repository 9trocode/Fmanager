#!/bin/sh
# Container entrypoint: apply migrations, then start Next's standalone server.
# Migrations are idempotent (drizzle tracks applied versions in the DB) so
# this is safe to run on every boot.
set -e

echo "[entrypoint] running migrations…"
node /app/scripts/migrate.mjs

echo "[entrypoint] starting next server…"
exec node /app/server.js
