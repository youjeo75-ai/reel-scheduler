"use client";

import { YOUTUBE_CATEGORIES } from "@/lib/settings";

/**
 * Per-platform option panels. Values live in a flat `Record<string, any>` per
 * platform held by ScheduleForm; list fields (tags, collaborators) are kept as
 * comma-separated text here and split on submit.
 */
export type SettingsState = Record<string, any>;
type Props = { value: SettingsState; onChange: (patch: SettingsState) => void };

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-stone-900"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function YouTubePanel({ value: v, onChange }: Props) {
  return (
    <div className="space-y-3">
      <Field label="Title override" hint="Leave empty to use the main title.">
        <input className="field" maxLength={100} value={v.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <Field label="Description override" hint="Leave empty to use the main caption.">
        <textarea className="field" rows={3} maxLength={5000} value={v.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Visibility">
          <select className="field" value={v.privacy ?? "public"} onChange={(e) => onChange({ privacy: e.target.value })}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </Field>
        <Field label="Category">
          <select className="field" value={v.categoryId ?? "22"} onChange={(e) => onChange({ categoryId: e.target.value })}>
            {Object.entries(YOUTUBE_CATEGORIES).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Tags" hint="Comma-separated.">
        <input className="field" value={v.tags ?? ""} onChange={(e) => onChange({ tags: e.target.value })} />
      </Field>
      <Field label="Language" hint="Optional language code of the video, e.g. en or nl.">
        <input className="field" maxLength={12} value={v.defaultLanguage ?? ""} onChange={(e) => onChange({ defaultLanguage: e.target.value })} />
      </Field>
      <div className="space-y-2">
        <Toggle label="Made for kids" checked={!!v.madeForKids} onChange={(x) => onChange({ madeForKids: x })} />
        <Toggle label="Notify subscribers" checked={v.notifySubscribers ?? true} onChange={(x) => onChange({ notifySubscribers: x })} />
        <Toggle label="Allow embedding" checked={v.embeddable ?? true} onChange={(x) => onChange({ embeddable: x })} />
        <Toggle label="Show view and like counts" checked={v.publicStatsViewable ?? true} onChange={(x) => onChange({ publicStatsViewable: x })} />
        <Toggle label="Altered or synthetic content" hint="Disclose realistic AI-generated or altered media." checked={!!v.containsSyntheticMedia} onChange={(x) => onChange({ containsSyntheticMedia: x })} />
      </div>
    </div>
  );
}

export function TikTokPanel({ value: v, onChange }: Props) {
  return (
    <div className="space-y-3">
      <Field label="Caption override" hint="Leave empty to use the main caption. Max 2200 characters.">
        <textarea className="field" rows={3} maxLength={2200} value={v.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} />
      </Field>
      <Field label="Who can view" hint="If TikTok doesn't offer this option for your account (always the case until your app is audited), the post is made private instead.">
        <select className="field" value={v.privacy ?? "PUBLIC_TO_EVERYONE"} onChange={(e) => onChange({ privacy: e.target.value })}>
          <option value="PUBLIC_TO_EVERYONE">Everyone</option>
          <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
          <option value="SELF_ONLY">Only me</option>
        </select>
      </Field>
      <Field label="Cover frame (seconds)" hint="TikTok's API can't take an uploaded cover image, so the cover is this frame of the video.">
        <input
          type="number"
          min={0}
          step={0.1}
          className="field"
          value={v.coverSeconds ?? 1}
          onChange={(e) => onChange({ coverSeconds: e.target.value })}
        />
      </Field>
      <div className="space-y-2">
        <Toggle label="Allow comments" checked={!v.disableComment} onChange={(x) => onChange({ disableComment: !x })} />
        <Toggle label="Allow Duet" checked={!v.disableDuet} onChange={(x) => onChange({ disableDuet: !x })} />
        <Toggle label="Allow Stitch" checked={!v.disableStitch} onChange={(x) => onChange({ disableStitch: !x })} />
        <Toggle label="AI-generated content" hint="Adds TikTok's AI label." checked={!!v.isAigc} onChange={(x) => onChange({ isAigc: x })} />
        <Toggle label="Promotional content (your own brand)" checked={!!v.brandOrganicToggle} onChange={(x) => onChange({ brandOrganicToggle: x })} />
        <Toggle label="Paid partnership (another brand)" checked={!!v.brandContentToggle} onChange={(x) => onChange({ brandContentToggle: x })} />
      </div>
    </div>
  );
}

export function InstagramPanel({ value: v, onChange }: Props) {
  return (
    <div className="space-y-3">
      <Field label="Caption override" hint="Leave empty to use the main caption. Max 2200 characters.">
        <textarea className="field" rows={3} maxLength={2200} value={v.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} />
      </Field>
      <Field label="Collaborators" hint="Instagram usernames, comma-separated (max 3). They get an invite.">
        <input className="field" value={v.collaborators ?? ""} onChange={(e) => onChange({ collaborators: e.target.value })} />
      </Field>
      <Field label="Cover frame (seconds)" hint="Only used when you don't upload a custom thumbnail.">
        <input
          type="number"
          min={0}
          step={0.1}
          className="field"
          value={v.thumbSeconds ?? ""}
          onChange={(e) => onChange({ thumbSeconds: e.target.value })}
        />
      </Field>
      <Field label="Location id" hint="Optional Facebook Places id (digits only) to tag a location.">
        <input className="field" inputMode="numeric" value={v.locationId ?? ""} onChange={(e) => onChange({ locationId: e.target.value })} />
      </Field>
      <Toggle label="Also show on the profile grid" checked={v.shareToFeed ?? true} onChange={(x) => onChange({ shareToFeed: x })} />
    </div>
  );
}

/** Turn the form state into the clean object the API expects. */
export function toApiSettings(platform: string, v: SettingsState) {
  const csv = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);
  const ms = (s?: string | number) => (s === "" || s === undefined ? undefined : Math.round(Number(s) * 1000));
  switch (platform) {
    case "YOUTUBE":
      return { ...v, tags: csv(v.tags) };
    case "TIKTOK": {
      const { coverSeconds, ...rest } = v;
      return { ...rest, coverTimestampMs: ms(coverSeconds) };
    }
    case "INSTAGRAM": {
      const { thumbSeconds, ...rest } = v;
      return { ...rest, collaborators: csv(v.collaborators), thumbOffsetMs: ms(thumbSeconds) };
    }
    default:
      return {};
  }
}
