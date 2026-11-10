import { Platform } from "@prisma/client";
import { encrypt } from "./crypto";
import { env } from "./env";
import { postForm, requestJson } from "./http";
import { prisma } from "./prisma";

/**
 * OAuth 2.0 "connect account" flows for the three platforms: the "Accept"
 * screen you know from Buffer.
 *
 *   /api/oauth/<slug>/start     → redirect to the platform's consent screen
 *   /api/oauth/<slug>/callback  → exchange the code, store encrypted tokens
 *
 * Register `${APP_URL}/api/oauth/<slug>/callback` as the redirect URI in each
 * platform's developer console (see SETUP.md).
 */
export const SLUGS = { instagram: Platform.INSTAGRAM, youtube: Platform.YOUTUBE, tiktok: Platform.TIKTOK } as const;
export type Slug = keyof typeof SLUGS;
export const isSlug = (s: string): s is Slug => s in SLUGS;

const redirectUri = (slug: Slug) => `${env("APP_URL")}/api/oauth/${slug}/callback`;
const inSeconds = (s?: number) => (s ? new Date(Date.now() + s * 1000) : null);

/** Step 1: where to send the user to grant access. */
export function buildAuthUrl(slug: Slug, state: string): string {
  switch (slug) {
    case "instagram":
      return (
        "https://www.instagram.com/oauth/authorize?" +
        new URLSearchParams({
          client_id: env("INSTAGRAM_APP_ID"),
          redirect_uri: redirectUri(slug),
          response_type: "code",
          scope: "instagram_business_basic,instagram_business_content_publish",
          state,
        })
      );
    case "youtube":
      return (
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: env("GOOGLE_CLIENT_ID"),
          redirect_uri: redirectUri(slug),
          response_type: "code",
          scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
          access_type: "offline", // ask for a refresh token…
          prompt: "consent", // …and make sure Google actually returns one every time
          state,
        })
      );
    case "tiktok":
      return (
        "https://www.tiktok.com/v2/auth/authorize/?" +
        new URLSearchParams({
          client_key: env("TIKTOK_CLIENT_KEY"),
          redirect_uri: redirectUri(slug),
          response_type: "code",
          scope: "user.info.basic,video.publish",
          state,
        })
      );
  }
}

type NewAccount = {
  externalId: string;
  displayName: string | null;
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
};

/** Step 2: exchange the authorisation code and upsert the account row. */
export async function exchangeCodeAndSave(slug: Slug, code: string): Promise<void> {
  const account = await exchangers[slug](code);
  const data = {
    externalId: account.externalId,
    displayName: account.displayName,
    accessToken: encrypt(account.accessToken),
    refreshToken: account.refreshToken ? encrypt(account.refreshToken) : null,
    accessTokenExpiresAt: account.accessTokenExpiresAt,
    refreshTokenExpiresAt: account.refreshTokenExpiresAt,
    scope: account.scope,
  };
  await prisma.socialAccount.upsert({
    where: { platform: SLUGS[slug] },
    create: { platform: SLUGS[slug], ...data },
    update: data,
  });
}

const exchangers: Record<Slug, (code: string) => Promise<NewAccount>> = {
  /**
   * Instagram API with Instagram Login.
   * code → short-lived token (1 h) → long-lived token (60 days).
   * There is no separate refresh token: the long-lived token is itself refreshed.
   */
  async instagram(code) {
    const short = await postForm("https://api.instagram.com/oauth/access_token", {
      client_id: env("INSTAGRAM_APP_ID"),
      client_secret: env("INSTAGRAM_APP_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: redirectUri("instagram"),
      code: code.replace(/#_$/, ""), // Instagram appends "#_" to the code
    });
    // The response is either flat or wrapped in { data: [ … ] } depending on API vintage.
    const shortToken: string = short.access_token ?? short.data?.[0]?.access_token;

    const long = await requestJson(
      "https://graph.instagram.com/access_token?" +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: env("INSTAGRAM_APP_SECRET"),
          access_token: shortToken,
        }),
    );
    const me = await requestJson(
      `https://graph.instagram.com/me?fields=user_id,username&access_token=${long.access_token}`,
    );
    return {
      externalId: String(me.user_id ?? me.id),
      displayName: me.username ? `@${me.username}` : null,
      accessToken: long.access_token,
      refreshToken: null,
      accessTokenExpiresAt: inSeconds(long.expires_in),
      refreshTokenExpiresAt: null,
      scope: "instagram_business_basic,instagram_business_content_publish",
    };
  },

  /** Google: access token (1 h) + refresh token (long-lived). */
  async youtube(code) {
    const tok = await postForm("https://oauth2.googleapis.com/token", {
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: redirectUri("youtube"),
      code,
    });
    if (!tok.refresh_token) {
      throw new Error("Google returned no refresh token. Remove the app at myaccount.google.com/permissions and reconnect.");
    }
    const ch = await requestJson("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const channel = ch.items?.[0];
    if (!channel) throw new Error("This Google account has no YouTube channel.");
    return {
      externalId: channel.id,
      displayName: channel.snippet?.title ?? null,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      accessTokenExpiresAt: inSeconds(tok.expires_in),
      refreshTokenExpiresAt: null,
      scope: tok.scope ?? null,
    };
  },

  /** TikTok: access token (24 h) + refresh token (365 days). */
  async tiktok(code) {
    const tok = await postForm("https://open.tiktokapis.com/v2/oauth/token/", {
      client_key: env("TIKTOK_CLIENT_KEY"),
      client_secret: env("TIKTOK_CLIENT_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: redirectUri("tiktok"),
      code,
    });
    if (!tok.access_token) throw new Error(`TikTok token exchange failed: ${tok.error_description ?? tok.error}`);

    let displayName: string | null = null;
    try {
      const info = await requestJson("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      displayName = info.data?.user?.display_name ?? null;
    } catch {
      /* the name is cosmetic */
    }
    return {
      externalId: tok.open_id,
      displayName,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      accessTokenExpiresAt: inSeconds(tok.expires_in),
      refreshTokenExpiresAt: inSeconds(tok.refresh_expires_in),
      scope: tok.scope ?? null,
    };
  },
};
