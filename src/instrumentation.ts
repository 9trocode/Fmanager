/**
 * Next.js instrumentation hook — runs once when the Node server boots,
 * before any request is served.
 *
 * We use it to warm the DB: open the SQLite file, apply pending
 * migrations, and prime the connection. Without this, the first
 * request to hit the server pays the full cold-start cost:
 *
 *   • better-sqlite3 native module load (~80ms)
 *   • DB file open + WAL pragmas (~30ms)
 *   • drizzle-orm migrate() check (~30-50ms even when nothing's pending)
 *   • the request's actual queries
 *
 * Combined that's ~150ms tacked onto whoever first lands on /dashboard
 * after a deploy. Moving it to instrumentation means the user always
 * gets warm-path latency instead.
 *
 * Skipped on the edge runtime (instrumentation runs in nodejs only;
 * we don't deploy to edge anyway because of better-sqlite3).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Touch the adapter — its module-load opens the DB, applies
  // migrations, and caches the drizzle handle. The Proxy in
  // src/lib/db/index.ts then reuses the same handle on every
  // request, so per-request latency is just the SQL itself.
  try {
    const { getAdapter } = await import("./lib/db/adapter");
    getAdapter();
  } catch (err) {
    // Don't crash the server on warmup failure — a bad DB will surface
    // on the first request anyway, and crashing instrumentation can
    // wedge the whole process.
    console.error("[instrumentation] DB warmup failed:", err);
  }
}
