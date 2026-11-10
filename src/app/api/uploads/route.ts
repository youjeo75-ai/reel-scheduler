import { NextRequest, NextResponse } from "next/server";
import { createSignedUpload } from "@/lib/storage";

const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const IMAGE_TYPES = ["image/jpeg", "image/png"];

/**
 * POST /api/uploads  { kind: "video" | "thumbnail", fileName, contentType }
 * → { bucket, path, token } for a direct browser → Supabase Storage upload.
 */
export async function POST(req: NextRequest) {
  const { kind, fileName, contentType } = await req.json();

  if (kind === "video" && !VIDEO_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Video must be MP4 or MOV" }, { status: 400 });
  }
  if (kind === "thumbnail" && !IMAGE_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Thumbnail must be JPG or PNG" }, { status: 400 });
  }
  if (kind !== "video" && kind !== "thumbnail") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  try {
    const slot = await createSignedUpload(kind === "video" ? "videos" : "thumbnails", String(fileName));
    return NextResponse.json(slot);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
