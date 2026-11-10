import { postJson } from "../http";
import type { TikTokSettings } from "../settings";
import type { Publisher } from "./types";

/**
 * TikTok via the Content Posting API (Direct Post, FILE_UPLOAD).
 *
 *   1. POST /v2/post/publish/creator_info/query/  which privacy levels are allowed
 *   2. POST /v2/post/publish/video/init/          declare the upload → publish_id + upload_url
 *   3. PUT  {upload_url}                          send the bytes, in chunks
 *   4. POST /v2/post/publish/status/fetch/        poll until PUBLISH_COMPLETE
 *
 * FILE_UPLOAD is used instead of PULL_FROM_URL because pulling requires
 * verifying ownership of the URL's domain, which you can't do for
 * *.supabase.co.
 *
 * TikTok has no custom-thumbnail upload through this API; the cover is a frame
 * of the video chosen with `video_cover_timestamp_ms`.
 *
 * Until TikTok audits your app, it forces every post to private (SELF_ONLY).
 */
const API = "https://open.tiktokapis.com/v2";
const MB = 1024 * 1024;
const CHUNK = 10 * MB;

/** TikTok wraps every response as { data, error: { code, message } } with code "ok" on success. */
async function call(path: string, accessToken: string, body: unknown) {
  const res = await postJson(`${API}${path}`, accessToken, body);
  if (res.error?.code && res.error.code !== "ok") {
    throw new Error(`TikTok ${res.error.code}: ${res.error.message}`);
  }
  return res.data;
}

/**
 * TikTok's chunk rules: every chunk is 5–64 MB, except that a file under
 * 5 MB goes up whole; total_chunk_count = floor(size / chunk_size); the
 * LAST chunk absorbs the remainder (so it may exceed chunk_size).
 */
function planChunks(size: number) {
  if (size < 2 * CHUNK) return { chunkSize: size, count: 1 }; // single request
  return { chunkSize: CHUNK, count: Math.floor(size / CHUNK) };
}

export const tiktok: Publisher = {
  async start(ctx) {
    const s = ctx.settings as TikTokSettings;

    // 1. Pick a privacy level this creator is actually allowed to use.
    const creator = await call("/post/publish/creator_info/query/", ctx.accessToken, {});
    const allowed: string[] = creator.privacy_level_options ?? [];
    const wanted = s.privacy || process.env.TIKTOK_PRIVACY || "PUBLIC_TO_EVERYONE";
    const privacy = allowed.includes(wanted) ? wanted : "SELF_ONLY";
    // Tell the user when TikTok forced the post to private (always the case for unaudited apps).
    const note =
      privacy !== wanted
        ? `Posted as ${privacy} because TikTok did not offer ${wanted} for this account (unaudited apps are private-only).`
        : undefined;
    // Settings the creator has switched off in the TikTok app can't be overridden.
    const forced = (flag: boolean | undefined, creatorOff: boolean | undefined) => !!creatorOff || !!flag;

    // Download the video into memory (fine for short-form files; Supabase free caps files at 50 MB).
    const res = await fetch(ctx.videoUrl);
    if (!res.ok) throw new Error(`Could not download video from storage (${res.status})`);
    const mimeType = res.headers.get("content-type") ?? "video/mp4";
    const video = Buffer.from(await res.arrayBuffer());
    const { chunkSize, count } = planChunks(video.length);

    // 2. Initialise the post
    const init = await call("/post/publish/video/init/", ctx.accessToken, {
      post_info: {
        title: (s.caption || ctx.caption || ctx.title).slice(0, 2200), // caption incl. #hashtags and @mentions
        privacy_level: privacy,
        disable_duet: forced(s.disableDuet, creator.duet_disabled),
        disable_comment: forced(s.disableComment, creator.comment_disabled),
        disable_stitch: forced(s.disableStitch, creator.stitch_disabled),
        video_cover_timestamp_ms: s.coverTimestampMs ?? 1000,
        is_aigc: s.isAigc ?? false,
        // Commercial-content disclosure. Branded content can't be private, so skip it for SELF_ONLY.
        brand_content_toggle: privacy !== "SELF_ONLY" && !!s.brandContentToggle,
        brand_organic_toggle: !!s.brandOrganicToggle,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: video.length,
        chunk_size: chunkSize,
        total_chunk_count: count,
      },
    });

    // 3. Upload the chunks sequentially
    for (let i = 0; i < count; i++) {
      const first = i * chunkSize;
      const last = i === count - 1 ? video.length - 1 : first + chunkSize - 1;
      const chunk = video.subarray(first, last + 1);
      const put = await fetch(init.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(chunk.length),
          "Content-Range": `bytes ${first}-${last}/${video.length}`,
        },
        body: chunk as unknown as BodyInit,
      });
      // 206 = chunk accepted, more expected; 201 = upload complete
      if (put.status !== 201 && put.status !== 206) {
        throw new Error(`TikTok upload chunk ${i + 1}/${count} failed: ${put.status} ${(await put.text()).slice(0, 300)}`);
      }
    }

    return { state: "in_progress", remoteId: init.publish_id, note };
  },

  async poll(ctx, publishId) {
    // 4. TikTok processes and moderates the video asynchronously.
    const s = await call("/post/publish/status/fetch/", ctx.accessToken, { publish_id: publishId });
    switch (s.status) {
      case "PUBLISH_COMPLETE": {
        const postId = s.publicaly_available_post_id?.[0]; // (sic) only present for public posts
        return { state: "published", remoteId: postId ? String(postId) : publishId };
      }
      case "FAILED":
        return { state: "failed", error: `TikTok rejected the post: ${s.fail_reason ?? "unknown reason"}` };
      default: // PROCESSING_UPLOAD | PROCESSING_DOWNLOAD | SEND_TO_USER_INBOX
        return { state: "in_progress", remoteId: publishId };
    }
  },
};
