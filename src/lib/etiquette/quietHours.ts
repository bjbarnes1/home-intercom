/**
 * Quiet-hours window helpers. Times are minutes from local midnight (0–1439).
 * A window may wrap past midnight (e.g. 22:00–07:00).
 */

export function parseHmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

export function minutesToHm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Local minutes-from-midnight in an IANA timezone. */
export function localMinutesOfDay(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function isInQuietHours(opts: {
  enabled: boolean;
  startMinutes: number | null | undefined;
  endMinutes: number | null | undefined;
  nowMinutes: number;
}): boolean {
  if (!opts.enabled) return false;
  if (opts.startMinutes == null || opts.endMinutes == null) return false;
  const { startMinutes: start, endMinutes: end, nowMinutes: now } = opts;
  if (start === end) return true; // full day
  if (start < end) return now >= start && now < end;
  // wraps midnight
  return now >= start || now < end;
}
