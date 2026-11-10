import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Supabase Storage helpers (server side, service-role key).
 *
 * Files never pass through a Vercel function (request bodies are capped at
 * 4.5 MB there). Instead the server hands the browser a one-off signed upload
 * URL and the browser uploads straight to the bucket.
 *
 * The bucket must be PUBLIC: Instagram downloads the video and cover image
 * from their public URLs. Object names are random UUIDs, and files are
 * deleted once a post has been published everywhere.
 */
const bucket = () => process.env.SUPABASE_BUCKET || "media";

function client() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export type UploadKind = "videos" | "thumbnails";

/** Create a signed upload slot for the browser. */
export async function createSignedUpload(kind: UploadKind, fileName: string) {
  const ext = (fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${kind}/${randomUUID()}.${ext}`;
  const { data, error } = await client().storage.from(bucket()).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not create upload URL: ${error?.message}`);
  return { bucket: bucket(), path, token: data.token };
}

/** Public download URL for an object in the bucket. */
export function publicUrl(path: string): string {
  return client().storage.from(bucket()).getPublicUrl(path).data.publicUrl;
}

/** Delete objects; failures are logged, never thrown (cleanup must not break publishing). */
export async function removeFiles(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  const { error } = await client().storage.from(bucket()).remove(list);
  if (error) console.error("[storage] cleanup failed:", error.message);
}
