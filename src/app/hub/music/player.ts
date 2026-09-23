/**
 * The player's rules, kept apart from React and MusicKit so they can be tested.
 *
 * Each of these is a convention people already carry from every other music
 * player — previous restarts the song, repeat cycles through three states, a
 * sleep timer can wait for the end of the track. Getting one wrong makes the
 * Hub feel broken even when nothing has failed, so they are pinned here rather
 * than left inline in a hook where nothing can check them.
 */

// MARK: repeat

/** The three repeat states, in the order one button cycles through them. */
export type RepeatMode = "none" | "all" | "one";

/**
 * off → all → one → off. The order Apple Music and Spotify both use: the first
 * press loops what you are listening to, the second narrows it to this song.
 */
export function nextRepeat(mode: RepeatMode): RepeatMode {
  return mode === "none" ? "all" : mode === "all" ? "one" : "none";
}

/**
 * MusicKit's PlayerRepeatMode numbers: 0 none, 1 one, 2 all. Read from the
 * global when it exists; the fallbacks are the values v3 ships with.
 */
export function repeatToKit(mode: RepeatMode, modes?: Record<string, number>): number {
  if (mode === "one") return modes?.one ?? 1;
  if (mode === "all") return modes?.all ?? 2;
  return modes?.none ?? 0;
}

export function repeatFromKit(value: number, modes?: Record<string, number>): RepeatMode {
  if (value === (modes?.one ?? 1)) return "one";
  if (value === (modes?.all ?? 2)) return "all";
  return "none";
}

// MARK: previous

/**
 * How far into a song "previous" means "start this again" rather than "go
 * back one". Three seconds is the convention everywhere; MusicKit's own
 * skipToPreviousItem does not implement it, so the Hub does.
 */
export const RESTART_AFTER_SECONDS = 3;

export function previousRestarts(elapsedSeconds: number): boolean {
  return elapsedSeconds > RESTART_AFTER_SECONDS;
}

// MARK: queue

/**
 * The queue without one entry, and where playback should carry on.
 *
 * MusicKit has no supported remove, so the queue is re-set. Removing the song
 * that is playing moves on to the one after it (or the new last one); removing
 * one before it shifts the playhead down by one so the same song keeps playing.
 * Returns null when nothing would be left — the caller stops instead.
 */
export function withoutIndex(
  ids: string[],
  remove: number,
  current: number,
): { ids: string[]; startWith: number; removedCurrent: boolean } | null {
  if (remove < 0 || remove >= ids.length) return { ids, startWith: current, removedCurrent: false };
  const next = ids.filter((_, i) => i !== remove);
  if (!next.length) return null;
  if (remove === current) {
    return { ids: next, startWith: Math.min(current, next.length - 1), removedCurrent: true };
  }
  return { ids: next, startWith: remove < current ? current - 1 : current, removedCurrent: false };
}

// MARK: handoff

export interface HandoffTrack {
  id: string;
  /** Catalog id of the same recording, when MusicKit knows it. */
  catalogId?: string;
  /** True for a library item, whose own id only resolves on its owner's account. */
  isLibrary?: boolean;
}

/**
 * The tracks that can travel to another panel, and where to start.
 *
 * The receiving panel plays under whoever is signed in there, which may be a
 * different Apple ID. A catalog id resolves on any account; a library-only id
 * resolves only on the account that owns it and would fail the whole queue, so
 * those are dropped and counted rather than sent. If the song playing is one
 * of them, the handoff starts on the next one that can go.
 */
export function portableQueue(
  tracks: HandoffTrack[],
  current: number,
): { ids: string[]; startIndex: number; dropped: number; currentDropped: boolean } {
  const ids: string[] = [];
  let startIndex = -1;
  let dropped = 0;
  let currentDropped = false;

  tracks.forEach((t, i) => {
    const id = t.catalogId ?? (t.isLibrary ? null : t.id);
    if (!id) {
      dropped++;
      if (i === current) currentDropped = true;
      return;
    }
    if (i >= current && startIndex === -1) startIndex = ids.length;
    ids.push(id);
  });

  return { ids, startIndex: startIndex === -1 ? 0 : startIndex, dropped, currentDropped };
}

// MARK: sleep timer

/** "end" waits for the song playing to finish; a number is minutes. */
export type SleepChoice = "end" | 15 | 30 | 60;

export const SLEEP_CHOICES: SleepChoice[] = ["end", 15, 30, 60];

/** How long the fade before a timed stop lasts. Long enough to notice, short enough to be done. */
export const FADE_SECONDS = 12;

/**
 * When the music should stop, as epoch milliseconds, or null for "at the end
 * of this track" (which is decided by the track changing, not by a clock).
 */
export function sleepDeadline(choice: SleepChoice, now: number): number | null {
  return choice === "end" ? null : now + choice * 60_000;
}

/**
 * The volume multiplier while fading towards a deadline: 1 until the fade
 * starts, then down to 0 in a straight line.
 */
export function fadeFactor(deadline: number, now: number, fadeSeconds = FADE_SECONDS): number {
  const left = (deadline - now) / 1000;
  if (left >= fadeSeconds) return 1;
  if (left <= 0) return 0;
  return left / fadeSeconds;
}

export function sleepLabel(choice: SleepChoice): string {
  return choice === "end" ? "End of this song" : `${choice} minutes`;
}

// MARK: quiet hours

/**
 * The loudest music may be during the panel's quiet hours. The household set
 * quiet hours to make reminders whisper; music playing at full volume through
 * the same window would undo the point of it. Capped rather than stopped —
 * quiet hours mean quieter, not silent, everywhere else in the product.
 */
export const QUIET_HOURS_MAX_VOLUME = 0.3;

/** Is `minute` (minutes from local midnight) inside a window that may wrap past midnight? */
export function inQuietHours(
  enabled: boolean,
  start: number | null | undefined,
  end: number | null | undefined,
  minute: number,
): boolean {
  if (!enabled || start == null || end == null || start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** The level actually applied: the chosen one, held under the cap during quiet hours. */
export function effectiveVolume(chosen: number, quiet: boolean): number {
  const v = Math.max(0, Math.min(1, chosen));
  return quiet ? Math.min(v, QUIET_HOURS_MAX_VOLUME) : v;
}
