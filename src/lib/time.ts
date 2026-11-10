/**
 * Time-zone helpers. The form collects a wall-clock time in Central European
 * time; the database and the cron job work in UTC.
 *
 * We use the IANA zone "Europe/Brussels" rather than a fixed +01:00 offset so
 * that summer time (CEST, +02:00) is handled correctly.
 */
export const SCHEDULE_TZ = process.env.NEXT_PUBLIC_SCHEDULE_TZ || "Europe/Brussels";

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Convert a `<input type="datetime-local">` value ("2026-11-10T18:30"),
 * interpreted as wall-clock time in `timeZone`, to a UTC Date.
 */
export function zonedLocalToUtc(local: string, timeZone = SCHEDULE_TZ): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error(`Invalid date/time: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);

  // Guess with the offset at that instant, then correct once in case the
  // guess landed on the other side of a daylight-saving change.
  let utc = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  utc = wallAsUtc - zoneOffsetMs(utc, timeZone);
  return new Date(utc);
}

/** Human-readable time in the scheduling zone, e.g. "Tue 10 Nov 2026, 18:30". */
export function formatInZone(date: Date | string, timeZone = SCHEDULE_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
