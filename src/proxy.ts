import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ff_session";

// Always-public paths. The /welcome flow handles its own auth + setup logic
// internally so unauthenticated first-time users can land there to create
// their admin account.
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/welcome",
  "/register",
  "/api/auth/login",
  // Logout must always be reachable, even with a bad/stale session
  // cookie. Otherwise the proxy redirects /api/auth/logout to
  // /login?next=/api/auth/logout and the user can't clear the bad
  // cookie without manually deleting it in DevTools.
  "/api/auth/logout",
  "/api/health",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/health")
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Legacy: when env ADMIN_PASSWORD is unset AND no DB admin has been
  // configured, server-side checks treat the user as admin (dev mode).
  // We can't read the DB from a Routing Middleware context; the layout-level
  // auth check (`isAuthenticated`) handles this case correctly.
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
