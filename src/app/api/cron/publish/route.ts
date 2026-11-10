import { Post, PostTarget } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { sleep } from "@/lib/http";
import { publishers, type StepResult } from "@/lib/platforms";
import { prisma } from "@/lib/prisma";
import { removeFiles } from "@/lib/storage";
import { getValidAccessToken, refreshExpiringTokens } from "@/lib/tokens";

/**
 * The publishing engine. Triggered every 15 minutes (see README: Supabase
 * pg_cron on the free plan, Vercel Cron on Pro), authenticated with CRON_SECRET.
 *
 * One run:
 *   0. Refresh OAuth tokens that are close to expiring (keeps logins alive).
 *   1. Atomically claim due posts:        PENDING → PROCESSING.
 *   2. Advance every target of every PROCESSING post by one step
 *      (start the upload, or poll the platform's job), repeating while time allows.
 *   3. Close posts whose targets are all done: PUBLISHED or FAILED.
 *
 * Why duplicates can't happen:
 *   - Claims use `updateMany … where status = PENDING`, a single SQL UPDATE, so
 *     two overlapping runs can never both win the same post or target.
 *   - A target that was started is never started again automatically. If a run
 *     dies before saving the platform's job id, the target is marked FAILED and
 *     waits for a manual retry (so a half-uploaded video can't be posted twice).
 *   - Work that outlives a run (platform processing) is resumed by polling the
 *     saved remoteId.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds; the Hobby plan's ceiling

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const RUN_BUDGET = 240 * SECOND; // stop polling here, leaving headroom before maxDuration
const START_CUTOFF = 150 * SECOND; // don't begin new uploads after this point
const POLL_INTERVAL = 10 * SECOND;
const ORPHAN_AFTER = 15 * MINUTE; // started, no remote id, and the run that started it is long dead
const GIVE_UP_AFTER = 2 * 60 * MINUTE; // remote processing that never finishes

type PostWithTargets = Post & { targets: PostTarget[] };

export async function GET(req: NextRequest) {
  // Vercel Cron (and our pg_cron job) send: Authorization: Bearer <CRON_SECRET>
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runStart = Date.now();
  const elapsed = () => Date.now() - runStart;

  // 0. Keep tokens alive (Instagram's 60-day token, TikTok's rotating refresh token…)
  const tokenErrors = await refreshExpiringTokens();

  // 1. Claim due posts
  const claimed = await prisma.post.updateMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() } },
    data: { status: "PROCESSING" },
  });

  // 2 + 3. Work until everything is settled or the time budget is spent
  for (;;) {
    const posts = await prisma.post.findMany({
      where: { status: "PROCESSING" },
      include: { targets: true },
      orderBy: { scheduledAt: "asc" },
    });
    if (posts.length === 0) break;

    for (const post of posts) {
      for (const target of post.targets) {
        await advanceTarget(post, target, elapsed() < START_CUTOFF);
      }
      await finalizePost(post.id);
    }

    if (elapsed() + POLL_INTERVAL > RUN_BUDGET) break; // the next run picks up the rest
    await sleep(POLL_INTERVAL);
  }

  const stillProcessing = await prisma.post.count({ where: { status: "PROCESSING" } });
  return NextResponse.json({
    ok: true,
    claimed: claimed.count,
    stillProcessing,
    tokenErrors,
    tookMs: elapsed(),
  });
}

/** Move one target forward by a single step. Never throws. */
async function advanceTarget(post: PostWithTargets, target: PostTarget, mayStart: boolean) {
  if (target.status === "PUBLISHED" || target.status === "FAILED") return;

  const isStart = target.status === "PENDING";

  if (isStart) {
    if (!mayStart) return; // too late in this run; stays PENDING for the next one
    // Atomic claim of the target itself: only one run can win this UPDATE.
    const won = await prisma.postTarget.updateMany({
      where: { id: target.id, status: "PENDING" },
      data: { status: "PROCESSING", startedAt: new Date(), detail: null },
    });
    if (won.count === 0) return;
  } else {
    const age = Date.now() - (target.startedAt?.getTime() ?? 0);
    if (!target.remoteId) {
      // Either another run is uploading right now, or the run that started this died.
      if (age > ORPHAN_AFTER) {
        await save(target.id, {
          state: "failed",
          error: "The upload was interrupted. Check the platform for a partial post before retrying.",
        });
      }
      return;
    }
    if (age > GIVE_UP_AFTER) {
      await save(target.id, { state: "failed", error: "Timed out waiting for the platform to finish processing." });
      return;
    }
  }

  try {
    // Refreshes the token first if it is about to expire.
    const { accessToken, externalId } = await getValidAccessToken(target.platform);
    const ctx = {
      accessToken,
      externalId,
      title: post.title,
      caption: post.caption,
      videoUrl: post.videoUrl,
      thumbnailUrl: post.thumbnailUrl,
      settings: (target.settings ?? {}) as Record<string, any>,
    };
    const publisher = publishers[target.platform];
    const result = isStart ? await publisher.start(ctx) : await publisher.poll(ctx, target.remoteId!);
    await save(target.id, result);
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error(`[cron] ${target.platform} ${isStart ? "start" : "poll"} failed for post ${post.id}:`, message);
    if (isStart) {
      await save(target.id, { state: "failed", error: message });
    }
    // A failed poll is usually a network blip: leave the target PROCESSING and
    // try again on the next pass. GIVE_UP_AFTER bounds how long that goes on.
  }
}

/** Persist the outcome of a step. */
async function save(targetId: string, result: StepResult) {
  switch (result.state) {
    case "in_progress":
      return prisma.postTarget.update({
        where: { id: targetId },
        // `note` is only set on the first step (e.g. "TikTok forced this post to private")
        data: { remoteId: result.remoteId, ...(result.note ? { detail: result.note } : {}) },
      });
    case "published":
      return prisma.postTarget.update({
        where: { id: targetId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          remoteId: result.remoteId,
          publishedUrl: result.url,
          // keep an earlier note (e.g. the TikTok privacy fallback) if this step has none
          ...(result.note !== undefined ? { detail: result.note } : {}),
        },
      });
    case "failed":
      return prisma.postTarget.update({
        where: { id: targetId },
        data: { status: "FAILED", detail: result.error.slice(0, 1000) },
      });
  }
}

/** Once every target is settled, set the post's final status and clean up storage. */
async function finalizePost(postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId }, include: { targets: true } });
  if (!post || post.status !== "PROCESSING") return;

  const settled = post.targets.every((t) => t.status === "PUBLISHED" || t.status === "FAILED");
  if (!settled) return;

  const allPublished = post.targets.every((t) => t.status === "PUBLISHED");
  await prisma.post.update({
    where: { id: postId },
    data: { status: allPublished ? "PUBLISHED" : "FAILED" },
  });

  // Files are only needed until the platforms have fetched them. On failure
  // they are kept so that "Retry" works.
  if (allPublished) await removeFiles([post.videoPath, post.thumbnailPath]);
}
