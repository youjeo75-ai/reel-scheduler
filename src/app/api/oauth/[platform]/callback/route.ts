import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { exchangeCodeAndSave, isSlug } from "@/lib/oauth";

/** GET /api/oauth/<platform>/callback → store tokens, return to the dashboard. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const home = (query: string) => NextResponse.redirect(`${env("APP_URL")}/?${query}`);

  if (!isSlug(platform)) return home("error=" + encodeURIComponent("Unknown platform"));

  const q = req.nextUrl.searchParams;
  const code = q.get("code");
  const state = q.get("state");

  if (!code) {
    return home("error=" + encodeURIComponent(q.get("error_description") ?? q.get("error") ?? "Authorisation was cancelled"));
  }
  if (!state || state !== req.cookies.get("oauth_state")?.value) {
    return home("error=" + encodeURIComponent("OAuth state mismatch. Please try connecting again."));
  }

  try {
    await exchangeCodeAndSave(platform, code);
    return home(`connected=${platform}`);
  } catch (err) {
    console.error(`[oauth] ${platform} callback failed:`, err);
    return home("error=" + encodeURIComponent((err as Error).message.slice(0, 300)));
  }
}
