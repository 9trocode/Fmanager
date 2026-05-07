#!/bin/sh
# Container entrypoint:
#   1. As root, ensure /data exists and is writable by `nextjs` (UID 1001).
#      Persistent-volume mounts often land on /data after the Dockerfile's
#      original chown, leaving it owned by root and unwritable to nextjs —
#      which surfaces as `SqliteError: unable to open database file`.
#   2. Drop privileges via su-exec.
#   3. Apply migrations (idempotent — drizzle tracks applied versions).
#   4. exec the Next standalone server.
#
# Safe under non-root start too: if we're already nextjs (e.g. host runs
# the image with --user 1001), the chown is skipped and we proceed.
set -e

DATA_DIR=$(dirname "${DATABASE_URL:-/data/app.db}")

if [ "$(id -u)" = "0" ]; then
  echo "[entrypoint] ensuring ${DATA_DIR} is writable by nextjs…"
  mkdir -p "$DATA_DIR"
  chown -R nextjs:nodejs "$DATA_DIR"

  echo "[entrypoint] running migrations as nextjs…"
  su-exec nextjs:nodejs node /app/scripts/migrate.mjs

  echo "[entrypoint] starting next server as nextjs…"
  exec su-exec nextjs:nodejs node /app/server.js
fi

# Already non-root (platform set --user). Trust that /data is writable.
echo "[entrypoint] running migrations…"
node /app/scripts/migrate.mjs

echo "[entrypoint] starting next server…"
exec node /app/server.js
