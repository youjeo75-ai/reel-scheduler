import { Platform } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeSettings } from "@/lib/settings";
import { publicUrl } from "@/lib/storage";
import { zonedLocalToUtc } from "@/lib/time";

const PLATFORMS = Object.values(Platform) as string[];

/**
 * POST /api/posts
 * { title, caption, videoPath, thumbnailPath?, scheduledLocal, platforms[],
 *   settings?: { INSTAGRAM?: {…}, YOUTUBE?: {…}, TIKTOK?: {…} } }
 *
 * `scheduledLocal` is the raw datetime-local value ("2026-11-10T18:30"),
 * interpreted as Central European wall-clock time and stored as UTC.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = String(body.title ?? "").trim();
  const caption = String(body.caption ?? "").trim();
  const videoPath = String(body.videoPath ?? "");
  const thumbnailPath = body.thumbnailPath ? String(body.thumbnailPath) : null;
  const platforms: string[] = Array.isArray(body.platforms) ? [...new Set<string>(body.platforms)] : [];

  if (!title) return bad("A title is required");
  if (!videoPath.startsWith("videos/")) return bad("Upload a video first");
  if (thumbnailPath && !thumbnailPath.startsWith("thumbnails/")) return bad("Invalid thumbnail");
  if (!platforms.length || platforms.some((p) => !PLATFORMS.includes(p))) return bad("Choose at least one platform");

  let scheduledAt: Date;
  try {
    scheduledAt = zonedLocalToUtc(String(body.scheduledLocal));
  } catch {
    return bad("Invalid date/time");
  }

  const post = await prisma.post.create({
    data: {
      title,
      caption,
      videoPath,
      thumbnailPath,
      // URLs are derived server-side from the storage paths; nothing client-supplied is trusted.
      videoUrl: publicUrl(videoPath),
      thumbnailUrl: thumbnailPath ? publicUrl(thumbnailPath) : null,
      scheduledAt,
      targets: {
        create: platforms.map((p) => ({
          platform: p as Platform,
          settings: sanitizeSettings(p, body.settings?.[p]) as object,
        })),
      },
    },
  });
  return NextResponse.json({ id: post.id }, { status: 201 });
}

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
