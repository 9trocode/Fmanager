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
 *
 * GET is also accepted — some users land here by pasting the URL
 * directly into the address bar. Without a GET handler the default
 * is 405 Method Not Allowed, which a few hosting layers convert to
 * 500. POST stays the canonical path used by the sidebar form +
 * panic mode.
 */
async function handle(req: Request) {
  try {
    await destroySession();
  } catch (err) {
    // Even if the cookie clear fails (rare; only on extreme storage
    // weirdness), still send the user to /login. Their next request
    // will revalidate against the stale cookie and either accept it
    // (signed in again) or bounce them back to login.
    console.error("[logout] destroySession failed:", err);
  }
  // Defensive: if req.url is somehow a relative or malformed value
  // in some hosting layer, fall back to the host header. Last resort
  // is a relative redirect, which most clients honor as same-origin.
  let target: string | URL = "/login";
  try {
    target = new URL("/login", req.url);
  } catch {
    try {
      const host = req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      if (host) target = new URL("/login", `${proto}://${host}`);
    } catch {
      // keep target = "/login" relative
    }
  }
  return NextResponse.redirect(target);
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
