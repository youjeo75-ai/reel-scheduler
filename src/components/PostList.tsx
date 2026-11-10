"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED";

export type PostView = {
  id: string;
  title: string;
  status: Status;
  when: string; // already formatted in CET on the server
  targets: { platform: string; status: Status; url: string | null; detail: string | null }[];
};

const BADGE: Record<Status, string> = {
  PENDING: "bg-stone-100 text-stone-700",
  PROCESSING: "bg-amber-100 text-amber-800",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
};

const LABEL: Record<Status, string> = {
  PENDING: "Scheduled",
  PROCESSING: "Publishing",
  PUBLISHED: "Published",
  FAILED: "Failed",
};

function Badge({ status }: { status: Status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status]}`}>{LABEL[status]}</span>
  );
}

export function PostList({ posts }: { posts: PostView[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, method: "DELETE" | "POST") {
    setBusyId(id);
    const res = await fetch(`/api/posts/${id}`, { method });
    if (!res.ok) window.console.error((await res.json()).error);
    setBusyId(null);
    router.refresh();
  }

  if (!posts.length) {
    return (
      <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
        Nothing scheduled yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {posts.map((post) => (
        <li key={post.id} className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{post.title}</p>
              <p className="text-sm text-stone-500">{post.when}</p>
            </div>
            <Badge status={post.status} />
          </div>

          <ul className="mt-3 space-y-1.5 border-t border-stone-100 pt-3">
            {post.targets.map((t) => (
              <li key={t.platform} className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>
                    {t.url ? (
                      <a href={t.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                        {t.platform}
                      </a>
                    ) : (
                      t.platform
                    )}
                  </span>
                  <Badge status={t.status} />
                </div>
                {t.detail && <p className="mt-1 break-words text-xs text-stone-500">{t.detail}</p>}
              </li>
            ))}
          </ul>

          {post.status !== "PROCESSING" && (
            <div className="mt-3 flex gap-4 text-sm">
              {post.status === "FAILED" && (
                <button
                  onClick={() => act(post.id, "POST")}
                  disabled={busyId === post.id}
                  className="font-medium underline underline-offset-4 disabled:opacity-50"
                >
                  Retry failed platforms
                </button>
              )}
              <button
                onClick={() => act(post.id, "DELETE")}
                disabled={busyId === post.id}
                className="text-stone-500 underline underline-offset-4 hover:text-red-700 disabled:opacity-50"
              >
                {post.status === "PENDING" ? "Cancel" : "Remove from list"}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
