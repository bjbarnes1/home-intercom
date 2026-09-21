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

// MARK: search

export interface CatalogSong {
  id: string;
  title: string;
  artist: string;
  /** Milliseconds. */
  durationMs: number;
}

export interface CatalogPlaylist {
  id: string;
  name: string;
  artworkUrl: string | null;
}

export interface CatalogResults {
  songs: CatalogSong[];
  playlists: CatalogPlaylist[];
}

interface SearchResponse {
  results?: {
    songs?: { data?: RawResource[] };
    playlists?: { data?: RawResource[] };
  };
}

interface RawResource {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    durationInMillis?: number;
    artwork?: { url?: string };
  };
}

/**
 * Which Apple Music storefront this listener is in.
 *
 * Catalog search is per-storefront and the path will not resolve without one,
 * so this is asked for rather than assumed. MusicKit knows it too, but only
 * once it has finished resolving — and a search typed before that would go to
 * `/v1/catalog/undefined/search`, which is a 404 that looks exactly like
 * "nothing found".
 */
export async function storefront(auth: AppleAuth): Promise<string | null> {
  const res = await fetch(`${BASE}/v1/me/storefront`, { headers: headers(auth) });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { id?: string }[] };
  return json.data?.[0]?.id ?? null;
}

/** Search Apple's catalogue for songs and playlists. */
export async function searchCatalog(
  auth: AppleAuth,
  store: string,
  term: string,
  limit = 12,
): Promise<CatalogResults> {
  const query = term.trim();
  if (!query || !store) return { songs: [], playlists: [] };

  const params = new URLSearchParams({
    term: query,
    types: "songs,playlists",
    limit: String(Math.min(25, Math.max(1, limit))),
  });

  const res = await fetch(`${BASE}/v1/catalog/${encodeURIComponent(store)}/search?${params}`, {
    headers: headers(auth),
  });
  if (!res.ok) {
    // The status is the whole diagnosis: 401 is a token, 404 is the storefront,
    // 429 is us asking too often. "Nothing found" says none of that.
    throw new Error(`Apple Music search returned ${res.status}`);
  }

  const json = (await res.json()) as SearchResponse;
  return {
    songs: (json.results?.songs?.data ?? []).map((r) => ({
      id: r.id,
      title: r.attributes?.name ?? "Unknown track",
      artist: r.attributes?.artistName ?? "",
      durationMs: r.attributes?.durationInMillis ?? 0,
    })),
    playlists: (json.results?.playlists?.data ?? []).map((r) => ({
      id: r.id,
      name: r.attributes?.name ?? "Playlist",
      artworkUrl: r.attributes?.artwork?.url ?? null,
    })),
  };
}
