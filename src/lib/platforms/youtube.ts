import { Readable } from "node:stream";
import { google } from "googleapis";
import type { YouTubeSettings } from "../settings";
import type { Publisher } from "./types";

/**
 * YouTube Shorts via the official googleapis client.
 *
 *   1. youtube.videos.insert   resumable upload, streamed from storage
 *   2. youtube.thumbnails.set  attach the custom thumbnail
 *
 * There is no "Shorts" flag in the API: YouTube classifies a video as a Short
 * when it is vertical/square and short enough.
 *
 * thumbnails.set needs a phone-verified channel and an image of 2 MB or less.
 * If it fails, the video stays published and the failure is reported as a note.
 */
async function openStream(url: string, what: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Could not download ${what} from storage (${res.status})`);
  return {
    body: Readable.fromWeb(res.body as any),
    mimeType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

export const youtube: Publisher = {
  async start(ctx) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: ctx.accessToken }); // already refreshed by lib/tokens.ts
    const yt = google.youtube({ version: "v3", auth });

    const s = ctx.settings as YouTubeSettings;
    const clean = (t: string, max: number) => t.replace(/[<>]/g, "").slice(0, max); // API forbids < and >

    // 1. Upload the video
    const video = await openStream(ctx.videoUrl, "video");
    const inserted = await yt.videos.insert({
      part: ["snippet", "status"],
      notifySubscribers: s.notifySubscribers ?? true,
      requestBody: {
        snippet: {
          title: clean(s.title || ctx.title, 100),
          description: clean(s.caption || ctx.caption, 5000),
          categoryId: s.categoryId || "22", // People & Blogs
          tags: s.tags,
          defaultLanguage: s.defaultLanguage,
          defaultAudioLanguage: s.defaultLanguage,
        },
        status: {
          privacyStatus: s.privacy || "public",
          selfDeclaredMadeForKids: s.madeForKids ?? false,
          embeddable: s.embeddable ?? true,
          publicStatsViewable: s.publicStatsViewable ?? true,
          ...({ containsSyntheticMedia: s.containsSyntheticMedia ?? false } as object),
        },
      },
      media: { mimeType: video.mimeType, body: video.body },
    });
    const videoId = inserted.data.id;
    if (!videoId) return { state: "failed", error: "YouTube returned no video id" };

    // 2. Attach the custom thumbnail (non-fatal)
    let note: string | undefined;
    if (ctx.thumbnailUrl) {
      try {
        const thumb = await openStream(ctx.thumbnailUrl, "thumbnail");
        await yt.thumbnails.set({ videoId, media: { mimeType: thumb.mimeType, body: thumb.body } });
      } catch (err) {
        note = `Video published, but the thumbnail was rejected: ${(err as Error).message}`;
      }
    }

    return { state: "published", remoteId: videoId, url: `https://www.youtube.com/shorts/${videoId}`, note };
  },

  // The upload is synchronous, so there is never anything to poll.
  async poll(_ctx, videoId) {
    return { state: "published", remoteId: videoId, url: `https://www.youtube.com/shorts/${videoId}` };
  },
};
