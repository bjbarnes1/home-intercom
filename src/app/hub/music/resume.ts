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

/**
 * One queue entry, with enough to ask for it again.
 *
 * The id alone is not enough. A track out of somebody's library has a library
 * id, and handing those back as `songs` — which means catalog songs — fails,
 * which is how a saved queue came back empty. Library items usually carry the
 * catalog id of the same recording in their playParams, so that is preferred,
 * and the type is kept for the ones that do not.
 */
export interface ResumeTrack {
  id: string;
  /** "songs", "library-songs", and so on, as MusicKit reports it. */
  type: string;
}

export interface ResumePoint {
  tracks: ResumeTrack[];
  index: number;
  /** Seconds into that track. */
  time: number;
  /** When it was saved. */
  at: number;
}

export function saveResume(point: Omit<ResumePoint, "at">): void {
  if (!point.tracks.length) return;
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

    const parsed = JSON.parse(raw) as Partial<ResumePoint> & { trackIds?: unknown };
    if (
      typeof parsed.index !== "number" ||
      typeof parsed.time !== "number" ||
      typeof parsed.at !== "number"
    ) {
      return null;
    }

    // Points written before types were kept are catalog ids or nothing useful;
    // reading them as catalog songs is the best guess available.
    const tracks: ResumeTrack[] = Array.isArray(parsed.tracks)
      ? parsed.tracks.filter(isTrack)
      : Array.isArray(parsed.trackIds)
        ? parsed.trackIds.filter((id): id is string => typeof id === "string").map((id) => ({ id, type: "songs" }))
        : [];

    if (!tracks.length) return null;
    if (now - parsed.at > STALE_MS) return null;
    if (parsed.index < 0 || parsed.index >= tracks.length) return null;

    return { tracks, index: parsed.index, time: parsed.time, at: parsed.at };
  } catch {
    return null;
  }
}

function isTrack(v: unknown): v is ResumeTrack {
  const t = v as ResumeTrack;
  return !!t && typeof t.id === "string" && t.id.length > 0 && typeof t.type === "string";
}

/**
 * The descriptor MusicKit wants for these tracks.
 *
 * Catalog and library items take different keys, and a queue can hold both —
 * when it does, the library ones decide, because asking for a library id as a
 * catalog song fails outright while the reverse usually resolves.
 */
export function queueDescriptor(tracks: ResumeTrack[]): Record<string, string[]> {
  const library = tracks.some((t) => t.type.startsWith("library-"));
  return { [library ? "library-songs" : "songs"]: tracks.map((t) => t.id) };
}

export function clearResume(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
