import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removeFiles } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/posts/:id → remove a post and its stored files (not allowed mid-publish). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.status === "PROCESSING") {
    return NextResponse.json({ error: "This post is being published right now" }, { status: 409 });
  }
  await prisma.post.delete({ where: { id } });
  if (post.status !== "PUBLISHED") await removeFiles([post.videoPath, post.thumbnailPath]); // already cleaned up otherwise
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/posts/:id → retry a FAILED post.
 * Only the failed platforms are re-queued; published ones are left alone,
 * so a retry can never double-post.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.status !== "FAILED") return NextResponse.json({ error: "Only failed posts can be retried" }, { status: 409 });

  await prisma.$transaction([
    prisma.postTarget.updateMany({
      where: { postId: id, status: "FAILED" },
      data: { status: "PENDING", remoteId: null, detail: null, startedAt: null },
    }),
    prisma.post.update({ where: { id }, data: { status: "PENDING" } }),
  ]);
  return NextResponse.json({ ok: true });
}
