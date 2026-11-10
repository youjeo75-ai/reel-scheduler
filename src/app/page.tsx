import { Platform } from "@prisma/client";
import { PostList, type PostView } from "@/components/PostList";
import { ScheduleForm } from "@/components/ScheduleForm";
import { prisma } from "@/lib/prisma";
import { formatInZone, SCHEDULE_TZ } from "@/lib/time";

export const dynamic = "force-dynamic";

const PLATFORM_META: Record<Platform, { label: string; slug: string }> = {
  INSTAGRAM: { label: "Instagram Reels", slug: "instagram" },
  YOUTUBE: { label: "YouTube Shorts", slug: "youtube" },
  TIKTOK: { label: "TikTok", slug: "tiktok" },
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;

  const [accounts, posts] = await Promise.all([
    prisma.socialAccount.findMany({ select: { platform: true, displayName: true } }),
    prisma.post.findMany({ include: { targets: true }, orderBy: { scheduledAt: "desc" }, take: 50 }),
  ]);
  const connectedPlatforms = accounts.map((a) => a.platform);

  const postViews: PostView[] = posts.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    when: formatInZone(p.scheduledAt),
    targets: p.targets.map((t) => ({
      platform: PLATFORM_META[t.platform].label,
      status: t.status,
      url: t.publishedUrl,
      detail: t.detail,
    })),
  }));

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reel Scheduler</h1>
        <p className="mt-1 text-sm text-stone-500">
          Times are in {SCHEDULE_TZ.replace("_", " ")} (CET/CEST). The publisher runs every 15 minutes.
        </p>
      </header>

      {connected && (
        <p className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Connected {connected}.
        </p>
      )}
      {error && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {/* Connected accounts */}
      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        {(Object.keys(PLATFORM_META) as Platform[]).map((platform) => {
          const account = accounts.find((a) => a.platform === platform);
          const { label, slug } = PLATFORM_META[platform];
          return (
            <div key={platform} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-sm font-medium">{label}</p>
              <p className="mt-0.5 truncate text-sm text-stone-500">
                {account ? (account.displayName ?? "Connected") : "Not connected"}
              </p>
              {/* Plain link on purpose: this is a full-page redirect to the platform's Accept screen. */}
              <a
                href={`/api/oauth/${slug}/start`}
                className="mt-3 inline-block text-sm font-medium text-stone-900 underline underline-offset-4"
              >
                {account ? "Reconnect" : "Connect"}
              </a>
            </div>
          );
        })}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Schedule a video</h2>
          <ScheduleForm connected={connectedPlatforms} />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Queue &amp; history</h2>
          <PostList posts={postViews} />
        </section>
      </div>
    </main>
  );
}
