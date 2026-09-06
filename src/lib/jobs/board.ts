/**
 * Pure helpers for the jobs / chore board.
 */

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

/** The last `n` local-day strings, most recent (today) first. */
export function recentDays(now: Date, timeZone: string, n: number): string[] {
  const days: string[] = [];
  for (let k = 0; k < n; k++) {
    days.push(localDay(new Date(now.getTime() - k * 86_400_000), timeZone));
  }
  return days;
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
