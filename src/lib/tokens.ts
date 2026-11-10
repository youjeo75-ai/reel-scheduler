import { Platform, SocialAccount } from "@prisma/client";
import { decrypt, encrypt } from "./crypto";
import { env } from "./env";
import { postForm, requestJson } from "./http";
import { prisma } from "./prisma";

/**
 * Automatic token refresh, so the cron job never fails on an expired login.
 *
 *   Instagram  long-lived token, 60 days. Refreshed by calling
 *              /refresh_access_token with the token ITSELF. If it ever expires
 *              it cannot be refreshed, so we renew 10 days ahead.
 *   YouTube    access token ~1 h, refresh token long-lived.
 *   TikTok     access token 24 h, refresh token 365 days. The refresh call may
 *              return a NEW refresh token, which must be saved.
 *
 * The cron job calls refreshExpiringTokens() on every run, so tokens stay
 * alive even in weeks where nothing is scheduled.
 */
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const REFRESH_MARGIN: Record<Platform, number> = {
  INSTAGRAM: 10 * DAY,
  YOUTUBE: 10 * MINUTE, // must outlive one whole cron run (max 5 min)
  TIKTOK: 10 * MINUTE,
};

const inSeconds = (s: number) => new Date(Date.now() + s * 1000);

function needsRefresh(a: SocialAccount): boolean {
  if (!a.accessTokenExpiresAt) return false;
  return a.accessTokenExpiresAt.getTime() - Date.now() < REFRESH_MARGIN[a.platform];
}

/** Call the platform's refresh endpoint and persist the new tokens. */
async function refreshAccount(a: SocialAccount): Promise<SocialAccount> {
  switch (a.platform) {
    case "INSTAGRAM": {
      const r = await requestJson(
        "https://graph.instagram.com/refresh_access_token?" +
          new URLSearchParams({ grant_type: "ig_refresh_token", access_token: decrypt(a.accessToken) }),
      );
      return prisma.socialAccount.update({
        where: { id: a.id },
        data: { accessToken: encrypt(r.access_token), accessTokenExpiresAt: inSeconds(r.expires_in) },
      });
    }

    case "YOUTUBE": {
      if (!a.refreshToken) throw new Error("No refresh token stored");
      const r = await postForm("https://oauth2.googleapis.com/token", {
        client_id: env("GOOGLE_CLIENT_ID"),
        client_secret: env("GOOGLE_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: decrypt(a.refreshToken),
      });
      return prisma.socialAccount.update({
        where: { id: a.id },
        data: { accessToken: encrypt(r.access_token), accessTokenExpiresAt: inSeconds(r.expires_in) },
      });
    }

    case "TIKTOK": {
      if (!a.refreshToken) throw new Error("No refresh token stored");
      const r = await postForm("https://open.tiktokapis.com/v2/oauth/token/", {
        client_key: env("TIKTOK_CLIENT_KEY"),
        client_secret: env("TIKTOK_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: decrypt(a.refreshToken),
      });
      // TikTok reports OAuth errors with HTTP 200 and an `error` field.
      if (!r.access_token) throw new Error(r.error_description ?? r.error ?? "TikTok refresh failed");
      return prisma.socialAccount.update({
        where: { id: a.id },
        data: {
          accessToken: encrypt(r.access_token),
          accessTokenExpiresAt: inSeconds(r.expires_in),
          // Rotated refresh token: always store what TikTok sends back.
          refreshToken: r.refresh_token ? encrypt(r.refresh_token) : a.refreshToken,
          refreshTokenExpiresAt: r.refresh_expires_in ? inSeconds(r.refresh_expires_in) : a.refreshTokenExpiresAt,
        },
      });
    }
  }
}

/**
 * Return a usable access token for a platform, refreshing first if needed.
 * This is the only function the publishers use to obtain credentials.
 */
export async function getValidAccessToken(platform: Platform) {
  let account = await prisma.socialAccount.findUnique({ where: { platform } });
  if (!account) throw new Error(`No ${platform} account connected`);

  if (needsRefresh(account)) {
    try {
      account = await refreshAccount(account);
    } catch (err) {
      const expired = account.accessTokenExpiresAt!.getTime() <= Date.now();
      // Still inside the margin? The old token works, so carry on and retry next run.
      if (expired) {
        throw new Error(`${platform} login expired and refresh failed (${(err as Error).message}). Reconnect the account.`);
      }
      console.warn(`[tokens] ${platform} refresh failed, using current token:`, (err as Error).message);
    }
  }
  return { accessToken: decrypt(account.accessToken), externalId: account.externalId };
}

/** Keep-alive pass over every connected account. Never throws. */
export async function refreshExpiringTokens(): Promise<string[]> {
  const errors: string[] = [];
  for (const account of await prisma.socialAccount.findMany()) {
    if (!needsRefresh(account)) continue;
    try {
      await refreshAccount(account);
    } catch (err) {
      errors.push(`${account.platform}: ${(err as Error).message}`);
    }
  }
  return errors;
}
