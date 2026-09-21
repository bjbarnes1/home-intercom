"use client";

/**
 * Where the music was when the browser last closed.
 *
 * A wall panel gets reloaded — a deploy, a crash, someone pulling the power —
 * and coming back to silence with an empty queue is the moment it stops feeling
 * like an appliance. So the queue and the position are kept on the device.
 *
 * Only ids and a number of seconds: no titles, no artwork, nothing that would
 * make this a listening history if somebody read it.
 */

const KEY = "famos.applemusic.resume";
/** Older than this and picking up mid-song is stranger than starting fresh. */
const STALE_MS = 12 * 60 * 60 * 1000;

export interface ResumePoint {
  trackIds: string[];
  index: number;
  /** Seconds into that track. */
  time: number;
  /** When it was saved. */
  at: number;
}

export function saveResume(point: Omit<ResumePoint, "at">): void {
  if (!point.trackIds.length) return;
  try {
    const stored: ResumePoint = { ...point, at: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* the music still plays; it just will not come back */
  }
}

export function readResume(now = Date.now()): ResumePoint | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ResumePoint>;
    if (
      !Array.isArray(parsed.trackIds) ||
      !parsed.trackIds.length ||
      typeof parsed.index !== "number" ||
      typeof parsed.time !== "number" ||
      typeof parsed.at !== "number"
    ) {
      return null;
    }
    if (now - parsed.at > STALE_MS) return null;
    if (parsed.index < 0 || parsed.index >= parsed.trackIds.length) return null;

    return parsed as ResumePoint;
  } catch {
    return null;
  }
}

export function clearResume(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
