import { postJson, requestJson } from "../http";
import type { InstagramSettings } from "../settings";
import type { Publisher } from "./types";

/**
 * Instagram Reels via the Content Publishing API (Instagram Login flavour,
 * host graph.instagram.com). Three calls:
 *
 *   1. POST /{ig-user-id}/media          create a REELS container. Instagram
 *                                        downloads video_url and cover_url itself.
 *   2. GET  /{container-id}?fields=…     poll until status_code = FINISHED
 *   3. POST /{ig-user-id}/media_publish  publish the finished container
 *
 * NOTE: `cover_url` (the custom thumbnail) is a parameter of step 1, the
 * container. /media_publish only accepts `creation_id`.
 *
 * Media requirements: MP4/MOV, H.264 or HEVC, AAC audio, 9:16, 3 s to 15 min.
 * Cover: JPEG is the safe choice.
 */
const GRAPH = "https://graph.instagram.com/v25.0";

export const instagram: Publisher = {
  async start(ctx) {
    const s = ctx.settings as InstagramSettings;
    const container = await postJson(`${GRAPH}/${ctx.externalId}/media`, ctx.accessToken, {
      media_type: "REELS",
      video_url: ctx.videoUrl,
      caption: s.caption || ctx.caption || ctx.title,
      share_to_feed: s.shareToFeed ?? true, // also show on the profile grid, where the cover is used
      // Custom cover wins; otherwise optionally pick a frame of the video.
      ...(ctx.thumbnailUrl
        ? { cover_url: ctx.thumbnailUrl }
        : s.thumbOffsetMs !== undefined
          ? { thumb_offset: s.thumbOffsetMs }
          : {}),
      ...(s.collaborators?.length ? { collaborators: s.collaborators } : {}),
      ...(s.locationId ? { location_id: s.locationId } : {}),
    });
    return { state: "in_progress", remoteId: container.id };
  },

  async poll(ctx, containerId) {
    const c = await requestJson(`${GRAPH}/${containerId}?fields=status_code,status`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    });

    switch (c.status_code) {
      case "IN_PROGRESS":
        return { state: "in_progress", remoteId: containerId };

      case "FINISHED": {
        const published = await postJson(`${GRAPH}/${ctx.externalId}/media_publish`, ctx.accessToken, {
          creation_id: containerId,
        });
        let url: string | undefined;
        try {
          const media = await requestJson(`${GRAPH}/${published.id}?fields=permalink`, {
            headers: { Authorization: `Bearer ${ctx.accessToken}` },
          });
          url = media.permalink;
        } catch {
          /* permalink is nice-to-have */
        }
        return { state: "published", remoteId: published.id, url };
      }

      // A previous run published the container but died before saving the result.
      case "PUBLISHED":
        return { state: "published", remoteId: containerId };

      default: // ERROR | EXPIRED
        return { state: "failed", error: `Instagram container ${c.status_code}: ${c.status ?? "no details"}` };
    }
  },
};
