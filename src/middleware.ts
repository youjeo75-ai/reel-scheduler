import { NextRequest, NextResponse } from "next/server";

/**
 * Password-protects the whole app with HTTP Basic auth (any username,
 * password = APP_PASSWORD). Without this, anyone who finds the URL could
 * post to your accounts.
 *
 * Excluded on purpose:
 *   /api/cron/*      protected by CRON_SECRET instead.
 *   /privacy, /terms public pages that Google, TikTok and Meta check when you register an app.
 *   /tiktok*.txt     TikTok's URL-ownership verification files (placed in /public).
 */
export function middleware(req: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  const header = req.headers.get("authorization");

  if (expected && header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === expected) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Reel Scheduler"' },
  });
}

export const config = {
  matcher: ["/((?!api/cron|privacy|terms|tiktok.*\\.txt|_next/static|_next/image|favicon.ico).*)"],
};
