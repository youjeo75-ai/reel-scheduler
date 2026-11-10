/**
 * Per-platform publishing options.
 *
 * The browser sends these as plain JSON; `sanitizeSettings` keeps only known
 * keys with valid values, so nothing unexpected reaches a platform API. Every field
 * is optional: a missing value means "use the platform default".
 */
export type InstagramSettings = {
  caption?: string; // overrides the shared caption
  shareToFeed?: boolean; // also show the Reel on the profile grid (default true)
  thumbOffsetMs?: number; // pick a video frame as cover (only used when no custom thumbnail)
  collaborators?: string[]; // usernames to invite as collaborators (max 3)
  locationId?: string; // Facebook Places id to tag
};

export type YouTubeSettings = {
  title?: string; // overrides the shared title
  caption?: string; // description override
  privacy?: "public" | "unlisted" | "private";
  categoryId?: string;
  tags?: string[];
  madeForKids?: boolean;
  notifySubscribers?: boolean; // push notification to subscribers (default true)
  embeddable?: boolean; // allow embedding on other sites (default true)
  publicStatsViewable?: boolean; // show view/like counts (default true)
  containsSyntheticMedia?: boolean; // "altered or synthetic content" disclosure
  defaultLanguage?: string; // BCP-47 code, e.g. "en", "nl"
};

export type TikTokSettings = {
  caption?: string;
  privacy?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY"; // TikTok may restrict this per account
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  coverTimestampMs?: number; // cover = this frame of the video (TikTok's API has no cover upload)
  isAigc?: boolean; // AI-generated content label
  brandContentToggle?: boolean; // "paid partnership" (third-party brand)
  brandOrganicToggle?: boolean; // "promotional content" (your own brand)
};

export type AllSettings = {
  INSTAGRAM?: InstagramSettings;
  YOUTUBE?: YouTubeSettings;
  TIKTOK?: TikTokSettings;
};

/** YouTube's category ids for the dropdown. */
export const YOUTUBE_CATEGORIES: Record<string, string> = {
  "22": "People & Blogs",
  "1": "Film & Animation",
  "2": "Autos & Vehicles",
  "10": "Music",
  "15": "Pets & Animals",
  "17": "Sports",
  "19": "Travel & Events",
  "20": "Gaming",
  "23": "Comedy",
  "24": "Entertainment",
  "25": "News & Politics",
  "26": "Howto & Style",
  "27": "Education",
  "28": "Science & Technology",
};

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);
const list = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v)
    ? v.map((x) => str(x, maxLen)).filter((x): x is string => !!x).slice(0, maxItems)
    : undefined;

/** Drop undefined keys so the stored JSON stays small. */
const compact = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function sanitizeSettings(platform: string, raw: any): Record<string, unknown> {
  const r = raw && typeof raw === "object" ? raw : {};
  switch (platform) {
    case "INSTAGRAM":
      return compact<InstagramSettings>({
        caption: str(r.caption, 2200),
        shareToFeed: bool(r.shareToFeed),
        thumbOffsetMs: int(r.thumbOffsetMs, 0, 600_000),
        collaborators: list(r.collaborators, 3, 30)?.map((u) => u.replace(/^@/, "")),
        locationId: typeof r.locationId === "string" && /^\d{1,20}$/.test(r.locationId.trim()) ? r.locationId.trim() : undefined,
      });
    case "YOUTUBE":
      return compact<YouTubeSettings>({
        title: str(r.title, 100),
        caption: str(r.caption, 5000),
        privacy: oneOf(r.privacy, ["public", "unlisted", "private"] as const),
        categoryId: oneOf(r.categoryId, Object.keys(YOUTUBE_CATEGORIES)),
        tags: list(r.tags, 30, 60),
        madeForKids: bool(r.madeForKids),
        notifySubscribers: bool(r.notifySubscribers),
        embeddable: bool(r.embeddable),
        publicStatsViewable: bool(r.publicStatsViewable),
        containsSyntheticMedia: bool(r.containsSyntheticMedia),
        defaultLanguage: typeof r.defaultLanguage === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(r.defaultLanguage.trim()) ? r.defaultLanguage.trim() : undefined,
      });
    case "TIKTOK":
      return compact<TikTokSettings>({
        caption: str(r.caption, 2200),
        privacy: oneOf(r.privacy, ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"] as const),
        disableComment: bool(r.disableComment),
        disableDuet: bool(r.disableDuet),
        disableStitch: bool(r.disableStitch),
        coverTimestampMs: int(r.coverTimestampMs, 0, 600_000),
        isAigc: bool(r.isAigc),
        brandContentToggle: bool(r.brandContentToggle),
        brandOrganicToggle: bool(r.brandOrganicToggle),
      });
    default:
      return {};
  }
}
