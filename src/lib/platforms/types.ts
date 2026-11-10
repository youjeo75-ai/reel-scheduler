/**
 * Every platform is driven through the same two-step interface so the cron
 * job doesn't need to know platform details:
 *
 *   start(ctx)          kicks off publishing. Either finishes immediately
 *                       (YouTube) or returns a remote job id to poll.
 *   poll(ctx, remoteId) checks the remote job and, when ready, completes it.
 */
export type PublishContext<S = Record<string, any>> = {
  accessToken: string;
  /** Instagram user id / YouTube channel id / TikTok open_id */
  externalId: string;
  title: string;
  /** Shared caption; each publisher prefers settings.caption when set */
  caption: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  /** Sanitised per-platform options (see lib/settings.ts) */
  settings: S;
};

export type StepResult =
  | { state: "in_progress"; remoteId: string; note?: string }
  | { state: "published"; remoteId?: string; url?: string; note?: string }
  | { state: "failed"; error: string };

export interface Publisher {
  start(ctx: PublishContext): Promise<StepResult>;
  poll(ctx: PublishContext, remoteId: string): Promise<StepResult>;
}
