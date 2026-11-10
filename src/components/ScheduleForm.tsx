"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { InstagramPanel, SettingsState, TikTokPanel, toApiSettings, YouTubePanel } from "./PlatformSettings";

const PLATFORMS = [
  { id: "INSTAGRAM", label: "Instagram Reels", Panel: InstagramPanel },
  { id: "YOUTUBE", label: "YouTube Shorts", Panel: YouTubePanel },
  { id: "TIKTOK", label: "TikTok", Panel: TikTokPanel },
] as const;

const MB = 1024 * 1024;
const MAX_VIDEO_MB = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_MB || 50);
const MAX_THUMB_MB = 2; // YouTube's limit for custom thumbnails

// Browser-side client with the public anon key. It can only upload using the
// one-off signed token issued by /api/uploads.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/** Ask the server for an upload slot, then send the file straight to storage. */
async function uploadFile(kind: "video" | "thumbnail", file: File): Promise<string> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, fileName: file.name, contentType: file.type }),
  });
  const slot = await res.json();
  if (!res.ok) throw new Error(slot.error ?? "Could not start the upload");

  const { error } = await supabase.storage
    .from(slot.bucket)
    .uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return slot.path as string;
}

export function ScheduleForm({ connected }: { connected: string[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [selected, setSelected] = useState<string[]>(connected);
  const [settings, setSettings] = useState<Record<string, SettingsState>>({});

  const patch = (platform: string, p: SettingsState) =>
    setSettings((s) => ({ ...s, [platform]: { ...s[platform], ...p } }));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(false);

    const form = new FormData(e.currentTarget);
    const video = form.get("video") as File;
    const thumbnail = form.get("thumbnail") as File;

    if (!selected.length) return setError("Choose at least one platform.");
    if (video.size > MAX_VIDEO_MB * MB) return setError(`The video is larger than ${MAX_VIDEO_MB} MB.`);
    if (thumbnail?.size > MAX_THUMB_MB * MB) return setError(`The thumbnail is larger than ${MAX_THUMB_MB} MB.`);

    try {
      setBusy("Uploading video…");
      const videoPath = await uploadFile("video", video);

      let thumbnailPath: string | null = null;
      if (thumbnail?.size) {
        setBusy("Uploading thumbnail…");
        thumbnailPath = await uploadFile("thumbnail", thumbnail);
      }

      setBusy("Scheduling…");
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          caption: form.get("caption"),
          scheduledLocal: form.get("scheduledLocal"), // wall-clock CET; converted to UTC on the server
          platforms: selected,
          settings: Object.fromEntries(selected.map((p) => [p, toApiSettings(p, settings[p] ?? {})])),
          videoPath,
          thumbnailPath,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not schedule the post");

      formRef.current?.reset();
      setSettings({});
      setDone(true);
      router.refresh(); // reload the queue
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={100} className="field" />
        <p className="hint">Used as the YouTube title.</p>
      </div>

      <div>
        <label className="label" htmlFor="caption">Caption</label>
        <textarea id="caption" name="caption" rows={3} maxLength={2200} className="field" />
        <p className="hint">Shared caption. Each platform can override it below.</p>
      </div>

      <div>
        <label className="label" htmlFor="video">Video</label>
        <input id="video" name="video" type="file" required accept="video/mp4,video/quicktime" className="field" />
        <p className="hint">Vertical 9:16 MP4 (H.264 + AAC), up to {MAX_VIDEO_MB} MB.</p>
      </div>

      <div>
        <label className="label" htmlFor="thumbnail">Custom thumbnail</label>
        <input id="thumbnail" name="thumbnail" type="file" accept="image/jpeg,image/png" className="field" />
        <p className="hint">
          Optional. Applied to Instagram and YouTube. TikTok's API has no cover upload, so there you pick a video frame
          instead. JPG recommended, up to {MAX_THUMB_MB} MB.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="scheduledLocal">Publish at (CET)</label>
        <input id="scheduledLocal" name="scheduledLocal" type="datetime-local" required className="field" />
      </div>

      <fieldset className="space-y-2">
        <legend className="label">Platforms &amp; settings</legend>
        {PLATFORMS.map(({ id, label, Panel }) => {
          const isConnected = connected.includes(id);
          const isOn = selected.includes(id);
          return (
            <div key={id} className="rounded-lg border border-stone-200">
              <label className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium ${isConnected ? "" : "text-stone-400"}`}>
                <input
                  type="checkbox"
                  checked={isOn}
                  disabled={!isConnected}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? [...s, id] : s.filter((x) => x !== id)))
                  }
                  className="size-4 accent-stone-900"
                />
                {label}
                {!isConnected && <span className="text-xs font-normal">(connect the account first)</span>}
              </label>
              {isOn && (
                <details className="border-t border-stone-100 px-3 py-2.5">
                  <summary className="cursor-pointer text-sm text-stone-600">Settings for {label}</summary>
                  <div className="mt-3">
                    <Panel value={settings[id] ?? {}} onChange={(p) => patch(id, p)} />
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </fieldset>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Scheduled.</p>}

      <button
        type="submit"
        disabled={!!busy}
        className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-60"
      >
        {busy ?? "Schedule"}
      </button>
    </form>
  );
}
