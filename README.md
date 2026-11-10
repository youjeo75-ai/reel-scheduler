# Reel Scheduler

A private scheduler for vertical short-form video: upload once, publish to
Instagram Reels, YouTube Shorts and TikTok at a chosen Central European time,
with a custom thumbnail and per-platform settings. No posting service in the
middle and no queue limit: it talks to the three official APIs directly.

Next.js (App Router) · TypeScript · Tailwind · Prisma · Supabase (Postgres + Storage) · Vercel

**Start with [SETUP.md](SETUP.md).** Everything costs €0.

## How "Connect → Accept" works

Each platform gets a **Connect** button on the dashboard. It sends you to the
platform's own consent screen (`/api/oauth/<platform>/start`); after you press
Accept, `/api/oauth/<platform>/callback` stores the tokens encrypted
(AES-256-GCM) and the scheduler keeps them alive on its own:

| Platform | Login | Refresh |
| --- | --- | --- |
| Instagram | long-lived token, 60 days | renewed 10 days before expiry |
| YouTube | access token 1 h + refresh token | refreshed when it has under 10 min left |
| TikTok | access token 24 h + refresh token 365 days | refreshed like YouTube; the rotated refresh token is saved |

The one thing a hosted tool like Buffer does for you is own the developer
apps behind those Accept screens. Here you register your own, once per
platform, for yourself only. SETUP.md has the exact values to paste.

## Per-platform settings

Each platform you tick in the form has its own *Settings* panel:

- **YouTube:** title and description overrides, visibility, category, tags, language, made-for-kids, notify subscribers, allow embedding, show counts, altered/synthetic-content disclosure, custom thumbnail.
- **TikTok:** caption override, who can view, comments / Duet / Stitch on or off, cover frame, AI-generated label, promotional and paid-partnership disclosures.
- **Instagram:** caption override, collaborators, location id, show on profile grid, cover (your uploaded thumbnail, or a frame).

Values are whitelisted in `src/lib/settings.ts`, stored per platform in `PostTarget.settings`, and read by the publishers in `src/lib/platforms/`.

## How publishing works

1. The form uploads the video and thumbnail **directly from the browser** to a public Supabase bucket (Vercel functions reject bodies over 4.5 MB), then creates a `Post` with one `PostTarget` per platform. The CET time is converted to UTC using the `Europe/Brussels` zone, so summer time is handled.
2. Every 15 minutes `/api/cron/publish`:
   - renews tokens that are close to expiring;
   - claims due posts with one atomic `UPDATE … WHERE status = 'PENDING'` (`PENDING → PROCESSING`), so overlapping runs can't double-post;
   - starts each platform: Instagram creates a Reels container (with `cover_url`), YouTube uploads with `videos.insert` then `thumbnails.set`, TikTok uploads in chunks;
   - polls the platforms that process asynchronously (Instagram, TikTok) and publishes when they are ready;
   - marks the post `PUBLISHED` when all targets are done (and deletes the files), or `FAILED` if any failed (files kept for **Retry**).
3. A retry re-queues only the failed platforms. A target that was started is never started again automatically.

The 15-minute trigger is Supabase `pg_cron` (`supabase/cron.sql`) because Vercel's free plan only allows one cron run a day. `vercel.json` keeps a daily run as a safety net. On Vercel Pro you can use `{ "crons": [{ "path": "/api/cron/publish", "schedule": "*/15 * * * *" }] }` instead.

## Limits to know

- **TikTok posts are private until TikTok audits your app.** Unaudited apps can only post "Only me". Public posting needs app review plus a Content Posting API audit, which takes TikTok days to weeks and can be refused. The scheduler falls back to private on its own and says so on the post card.
- **YouTube may force uploads to private until Google audits the API project.** Projects created after July 2020 that haven't passed the YouTube API Services audit get their uploads locked to private. The audit is a form; for a personal tool it is usually granted but not guaranteed.
- TikTok's API cannot take a cover image; you choose a frame of the video. Instagram and YouTube use your thumbnail. Whether YouTube displays a custom thumbnail on a *Short* (rather than only on the channel page and in search) is up to YouTube.
- Platform daily limits still apply: Instagram about 50 to 100 API posts per rolling 24 hours, YouTube about 100 uploads per day per Google project, TikTok about 15 per account. Your own queue has no limit.
- YouTube thumbnails need a phone-verified channel and 2 MB or less.
- Supabase's free plan caps a single file at 50 MB and pauses projects after about a week of inactivity (the 15-minute job counts as activity).
- Vercel Hobby is for non-commercial use.
- This code has been type-checked only against the platforms' documentation. It has not been run against live accounts, so expect to fix small things on the first real post (errors appear on the post card).

## Layout

```
prisma/schema.prisma                     SocialAccount (encrypted tokens), Post, PostTarget
vercel.json                              daily safety-net cron
supabase/cron.sql                        the real 15-minute trigger
src/middleware.ts                        password protection (Basic auth)
src/app/page.tsx                         dashboard
src/app/privacy, terms                   public pages the platforms ask for
src/components/ScheduleForm.tsx          upload + schedule form
src/components/PlatformSettings.tsx      per-platform settings panels
src/components/PostList.tsx              queue, history, retry
src/app/api/uploads/route.ts             signed upload URLs
src/app/api/posts/…                      create / delete / retry
src/app/api/oauth/[platform]/…           Connect flow: start + callback
src/app/api/cron/publish/route.ts        the publishing engine
src/lib/oauth.ts                         consent URLs, code exchange
src/lib/tokens.ts                        automatic token refresh
src/lib/crypto.ts                        AES-256-GCM for stored tokens
src/lib/platforms/                       instagram.ts, youtube.ts, tiktok.ts
src/lib/settings.ts                      allowed per-platform options
src/lib/storage.ts, time.ts              storage, CET ↔ UTC
```
