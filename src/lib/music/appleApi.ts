/**
 * The documented Apple Music REST API, for the things MusicKit's own helpers do
 * not cover.
 *
 * Reads go through MusicKit where it has a helper, because it already knows the
 * storefront and the tokens. Writes — loving a song, unloving it — do not have
 * one, so they go here rather than through undocumented internals of a minified
 * bundle that Apple can change without warning.
 *
 * Both tokens are the browser's to hold: the developer token identifies the app
 * and the music user token identifies the listener, and neither ever reaches
 * our server.
 */

const BASE = "https://api.music.apple.com";

export type LovableKind = "songs" | "playlists" | "albums";

export interface AppleAuth {
  developerToken: string;
  musicUserToken: string;
}

function headers(auth: AppleAuth): HeadersInit {
  return {
    Authorization: `Bearer ${auth.developerToken}`,
    "Music-User-Token": auth.musicUserToken,
    "content-type": "application/json",
  };
}

/**
 * Apple calls it a rating: 1 is loved, -1 is disliked, absent is neither. The
 * Hub only ever sets 1 or removes it — a family display is not the place to
 * teach the algorithm what you hate.
 */
export async function love(auth: AppleAuth, kind: LovableKind, id: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/me/ratings/${kind}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: headers(auth),
    body: JSON.stringify({ type: "rating", attributes: { value: 1 } }),
  });
  if (!res.ok) throw new Error(`Apple Music would not save that (${res.status})`);
}

export async function unlove(auth: AppleAuth, kind: LovableKind, id: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/me/ratings/${kind}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(auth),
  });
  // Removing a rating that was never there is the state we wanted anyway.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Apple Music would not remove that (${res.status})`);
  }
}

/** Which of these are loved. Ids Apple has no opinion on simply come back absent. */
export async function lovedIds(
  auth: AppleAuth,
  kind: LovableKind,
  ids: string[],
): Promise<Set<string>> {
  const wanted = ids.filter(Boolean).slice(0, 100);
  if (!wanted.length) return new Set();

  const res = await fetch(
    `${BASE}/v1/me/ratings/${kind}?ids=${wanted.map(encodeURIComponent).join(",")}`,
    { headers: headers(auth) },
  );
  // A listener with no ratings at all is a 404, not a failure.
  if (!res.ok) return new Set();

  const json = (await res.json()) as { data?: { id: string; attributes?: { value?: number } }[] };
  return new Set(
    (json.data ?? []).filter((r) => r.attributes?.value === 1).map((r) => r.id),
  );
}
