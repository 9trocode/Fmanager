import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

/**
 * POST /api/auth/logout — destroy the session cookie + redirect to /login.
 *
 * The redirect URL is derived from the request URL rather than
 * `process.env.APP_URL`. The env-based version 500'd in production
 * when APP_URL was set without a scheme (e.g. `fmanager.pipeops.app`
 * instead of `https://fmanager.pipeops.app`) — `new URL("/login",
 * "fmanager.pipeops.app")` throws `TypeError: Invalid URL`, which
 * surfaces as a generic 500 to the user. Using `req.url` always
 * yields a valid same-origin URL regardless of env config.
 */
export async function POST(req: Request) {
  try {
    await destroySession();
  } catch (err) {
    // Even if the cookie clear fails (rare; only on extreme storage
    // weirdness), still send the user to /login. Their next request
    // will revalidate against the stale cookie and either accept it
    // (signed in again) or bounce them back to login.
    console.error("[logout] destroySession failed:", err);
  }
  return NextResponse.redirect(new URL("/login", req.url));
}
