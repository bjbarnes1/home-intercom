/**
 * Pure helpers for the jobs / chore board.
 */

import { DateTime } from "luxon";

/** Local calendar day `offset` days from `now`, as yyyy-mm-dd. */
function shiftedDay(now: Date, timeZone: string, offset: number): string {
  const base = DateTime.fromJSDate(now, { zone: timeZone });
  const dt = (base.isValid ? base : DateTime.fromJSDate(now, { zone: "UTC" })).plus({
    days: offset,
  });
  return dt.toISODate() as string;
}

/** yyyy-mm-dd for `date` in the given IANA timezone. */
export function localDay(date: Date, timeZone: string): string {
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/*
 * Both walks step the local CALENDAR, not 86,400,000 ms. A DST day is 23 or 25
 * hours long, so fixed-millisecond steps skip a date every spring and repeat
 * one every autumn: at the 5 Oct Sydney transition 4 October vanished from the
 * board and broke any running streak across it.
 */

/** The last `n` local-day strings, most recent (today) first. */
export function recentDays(now: Date, timeZone: string, n: number): string[] {
  return Array.from({ length: n }, (_, k) => shiftedDay(now, timeZone, -k));
}

/** The next `n` local-day strings, starting with today. */
export function upcomingDays(now: Date, timeZone: string, n: number): string[] {
  return Array.from({ length: n }, (_, k) => shiftedDay(now, timeZone, k));
}

/**
 * Consecutive fully-completed days, ignoring whether *today* is done yet:
 * counts from today if today is complete, otherwise from yesterday.
 *
 * @param allDoneMostRecentFirst  per-day "all chores done" flags, today first.
 */
export function streakFrom(allDoneMostRecentFirst: boolean[]): number {
  if (allDoneMostRecentFirst.length === 0) return 0;
  let start = 0;
  if (!allDoneMostRecentFirst[0]) start = 1; // today not done yet — don't break
  let streak = 0;
  for (let i = start; i < allDoneMostRecentFirst.length; i++) {
    if (allDoneMostRecentFirst[i]) streak++;
    else break;
  }
  return streak;
}
