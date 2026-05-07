#!/usr/bin/env node
/**
 * Runtime migration for the production container.
 *
 * Runs at container start (before `node server.js`) so the SQLite file at
 * $DATABASE_URL has the full schema. Drizzle's migrator tracks applied
 * migrations in a `__drizzle_migrations` table inside the same DB, so this
 * is idempotent — repeated boots only apply new migrations.
 *
 * Resolves `better-sqlite3` and `drizzle-orm` from the standalone Next.js
 * output's node_modules (this script lives at /app/scripts/migrate.mjs in
 * the runner image, and Node walks up to /app/node_modules).
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dbPath = process.env.DATABASE_URL ?? "/data/app.db";

// Make sure the parent dir exists (mounted volume may be empty on first run).
const dir = dirname(dbPath);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

// Resolve the migrations folder relative to this script, not CWD — the
// container's working directory is /app and the migrations are bundled at
// /app/drizzle.
const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "..", "drizzle");

if (!existsSync(migrationsFolder)) {
  console.error(`[migrate] migrations folder missing: ${migrationsFolder}`);
  process.exit(1);
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

const db = drizzle(sqlite);

try {
  console.log(`[migrate] applying migrations from ${migrationsFolder} to ${dbPath}`);
  migrate(db, { migrationsFolder });
  console.log("[migrate] done");
} catch (err) {
  console.error("[migrate] failed:", err);
  process.exit(1);
} finally {
  sqlite.close();
}
