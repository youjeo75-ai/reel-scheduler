import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl, isSlug } from "@/lib/oauth";

/** GET /api/oauth/<instagram|youtube|tiktok>/start → redirect to the consent screen. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isSlug(platform)) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });

  // CSRF protection: the same random value must come back on the callback.
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(platform, state));
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/oauth",
  });
  return res;
}
