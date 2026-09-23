/**
 * The documented Apple Music REST API, for the things MusicKit's own helpers do
 * not cover.
 *
 * Playback goes through MusicKit, because that is the only way to play. Almost
 * everything else — search, the library, recommendations, charts, loving a
 * song — goes here, straight to the documented endpoints, rather than through
 * MusicKit's `api.music()` passthrough or the undocumented internals of a
 * minified bundle that Apple can change without warning. Plain `fetch` is also
 * something a test can stand in for, which MusicKit is not.
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


// MARK: items

/** Explicit is Apple's own marker. "clean" means an edited version exists; absent means not rated. */
export type ContentRating = "explicit" | "clean" | undefined;

/**
 * One thing the listener can see and play, whatever Apple called it.
 *
 * Apple returns a different resource type for every corner of the catalogue
 * and library — `songs`, `library-songs`, `albums`, `stations` and so on — each
 * with its own handful of attributes. The Hub only ever shows a row: a title, a
 * line under it, a picture and something to press. So everything is flattened
 * into this one shape at the edge, and nothing past this file has to know that
 * a library album and a catalogue album are different things to Apple.
 */
export interface MusicItem {
  kind: "song" | "album" | "artist" | "playlist" | "station";
  id: string;
  /** Song/album/playlist/station name, or the artist's name. */
  title: string;
  /** Artist for songs/albums; curator for playlists; "" otherwise. */
  subtitle: string;
  /** Artwork URL template with {w}/{h} already filled at 120, or null. */
  artwork: string | null;
  /** Milliseconds, songs only (0 otherwise). */
  durationMs: number;
  contentRating: ContentRating;
  /** attributes.url — the item's page on Apple Music, for "Open on Apple Music". null if absent. */
  url: string | null;
  /** True for library resources (ids like "l.xxx", "i.xxx", "p.xxx"; types library-*). */
  library: boolean;
  /** For library songs/albums: attributes.playParams.catalogId when present. */
  catalogId: string | null;
  /** Stations only: attributes.isLive. */
  live?: boolean;
}

/** The parts of an Apple resource this file reads. Everything is optional because Apple omits freely. */
interface RawResource {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    curatorName?: string;
    durationInMillis?: number;
    artwork?: { url?: string };
    contentRating?: string;
    url?: string;
    isLive?: boolean;
    playParams?: { catalogId?: string };
  };
}

const KINDS: Record<string, MusicItem["kind"]> = {
  songs: "song",
  "library-songs": "song",
  albums: "album",
  "library-albums": "album",
  artists: "artist",
  "library-artists": "artist",
  playlists: "playlist",
  "library-playlists": "playlist",
  stations: "station",
};

/**
 * What to call a thing Apple sent without a name. It happens — library items
 * the listener imported themselves often have almost nothing — and an empty
 * row is harder to understand than a plain word.
 */
const UNTITLED: Record<MusicItem["kind"], string> = {
  song: "Unknown track",
  album: "Album",
  artist: "Artist",
  playlist: "Playlist",
  station: "Station",
};

/**
 * Apple's artwork URL is a template with `{w}` and `{h}` left for the caller.
 * 120 is twice the largest thumbnail the Hub draws, so it stays sharp on a
 * high-density screen without pulling a poster for a list row.
 */
const ARTWORK_SIZE = "120";

/**
 * Flatten one Apple resource into a MusicItem, or null when it is a type the
 * Hub does not show (music videos, curators, record labels…). Pure, so every
 * list in this file goes through the same door and it can be tested without
 * a network.
 */
export function toMusicItem(raw: unknown): MusicItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawResource;
  const kind = r.type ? KINDS[r.type] : undefined;
  if (!kind || !r.id) return null;

  const a = r.attributes ?? {};
  // Library ids are prefixed ("i." songs, "l." albums and artists, "p."
  // playlists); catalogue ids are numbers or "pl."/"ra.". The type says it too,
  // but either on its own is enough to know it belongs to this listener.
  const library = (r.type ?? "").startsWith("library-") || /^[lip]\./.test(r.id);
  const rating = a.contentRating === "explicit" || a.contentRating === "clean" ? a.contentRating : undefined;

  const item: MusicItem = {
    kind,
    id: r.id,
    title: a.name || UNTITLED[kind],
    subtitle:
      kind === "song" || kind === "album"
        ? (a.artistName ?? "")
        : kind === "playlist"
          ? (a.curatorName ?? "")
          : "",
    artwork: a.artwork?.url
      ? a.artwork.url.replace("{w}", ARTWORK_SIZE).replace("{h}", ARTWORK_SIZE)
      : null,
    durationMs: kind === "song" ? (a.durationInMillis ?? 0) : 0,
    contentRating: rating,
    url: a.url ?? null,
    library,
    // A library copy of something from the catalogue remembers where it came
    // from. That catalogue id is what ratings, "Open on Apple Music" and the
    // clean-version lookup all need; a library id means nothing to them.
    catalogId: library ? (a.playParams?.catalogId ?? null) : null,
  };
  if (kind === "station") item.live = a.isLive === true;
  return item;
}

function toItems(data: unknown): MusicItem[] {
  if (!Array.isArray(data)) return [];
  return data.map(toMusicItem).filter((i): i is MusicItem => i !== null);
}

/** Drop explicit items. Unrated items stay: Apple marks explicit content, so absence is not a claim. */
export function cleanOnly<T extends { contentRating?: ContentRating }>(items: T[]): T[] {
  return items.filter((i) => i.contentRating !== "explicit");
}

// MARK: requests

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number.isFinite(n) ? n : min)));
}

/**
 * GET a documented endpoint and hand back its JSON, or throw with the status.
 *
 * The status is the whole diagnosis: 401 is a token, 403 is a subscription or
 * a refused permission, 404 is the storefront, 429 is us asking too often. An
 * empty list says none of that — which is how a broken storefront once looked
 * exactly like "nothing found" through two attempts at fixing it.
 */
async function getJson<T>(auth: AppleAuth, path: string, what: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(auth) });
  if (!res.ok) throw new Error(`Apple Music ${what} returned ${res.status}`);
  return (await res.json()) as T;
}

// MARK: search

export interface CatalogResults {
  top: MusicItem[];
  songs: MusicItem[];
  albums: MusicItem[];
  artists: MusicItem[];
  playlists: MusicItem[];
  stations: MusicItem[];
}

/**
 * Nothing found, or nothing asked. Frozen so a caller that uses it as a
 * starting state cannot push into the one shared copy by accident.
 */
export const EMPTY_RESULTS: CatalogResults = Object.freeze({
  top: Object.freeze([]) as unknown as MusicItem[],
  songs: Object.freeze([]) as unknown as MusicItem[],
  albums: Object.freeze([]) as unknown as MusicItem[],
  artists: Object.freeze([]) as unknown as MusicItem[],
  playlists: Object.freeze([]) as unknown as MusicItem[],
  stations: Object.freeze([]) as unknown as MusicItem[],
}) as CatalogResults;

/**
 * Apply the family's clean-only setting to a whole set of results at once.
 * When it is off this returns the same object, so a caller comparing results
 * does not see a change that did not happen.
 */
export function filterResults(results: CatalogResults, clean: boolean): CatalogResults {
  if (!clean) return results;
  return {
    top: cleanOnly(results.top),
    songs: cleanOnly(results.songs),
    albums: cleanOnly(results.albums),
    artists: cleanOnly(results.artists),
    playlists: cleanOnly(results.playlists),
    stations: cleanOnly(results.stations),
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

interface SearchResponse {
  results?: Record<string, { data?: unknown[] } | undefined>;
}

/**
 * Search Apple's catalogue for everything the Hub can play.
 *
 * `with=topResults` asks Apple for its own best guesses across every type,
 * which is what someone typing "taylor" actually wants first — the artist, not
 * the twelfth song with Taylor in the title. Four is as many as fit above the
 * fold before the per-type lists start.
 */
export async function searchCatalog(
  auth: AppleAuth,
  store: string,
  term: string,
  limit = 10,
): Promise<CatalogResults> {
  const query = term.trim();
  if (!query || !store) return EMPTY_RESULTS;

  const params = new URLSearchParams({
    term: query,
    types: "songs,albums,artists,playlists,stations",
    // Apple refuses anything over 25 for search rather than trimming it.
    limit: String(clamp(limit, 1, 25)),
    with: "topResults",
  });

  const json = await getJson<SearchResponse>(
    auth,
    `/v1/catalog/${encodeURIComponent(store)}/search?${params}`,
    "search",
  );
  const r = json.results ?? {};
  return {
    top: toItems(r.top?.data).slice(0, 4),
    songs: toItems(r.songs?.data),
    albums: toItems(r.albums?.data),
    artists: toItems(r.artists?.data),
    playlists: toItems(r.playlists?.data),
    stations: toItems(r.stations?.data),
  };
}

/**
 * Search only what this listener has added to their own library.
 *
 * Library search has no top results and no stations — stations are never in a
 * library — so those stay empty rather than being faked from the other lists.
 * No storefront is needed: the library belongs to the listener, not a country.
 */
export async function searchLibrary(
  auth: AppleAuth,
  term: string,
  limit = 10,
): Promise<CatalogResults> {
  const query = term.trim();
  if (!query) return EMPTY_RESULTS;

  const params = new URLSearchParams({
    term: query,
    types: "library-songs,library-albums,library-artists,library-playlists",
    limit: String(clamp(limit, 1, 25)),
  });

  const json = await getJson<SearchResponse>(auth, `/v1/me/library/search?${params}`, "library search");
  const r = json.results ?? {};
  return {
    top: [],
    songs: toItems(r["library-songs"]?.data),
    albums: toItems(r["library-albums"]?.data),
    artists: toItems(r["library-artists"]?.data),
    playlists: toItems(r["library-playlists"]?.data),
    stations: [],
  };
}

/**
 * Finish-the-word suggestions while someone is typing.
 *
 * These are a nicety on top of search, never a reason to show an error: if
 * Apple is slow or refuses, the box simply has no suggestions and search
 * itself still works. One letter matches half the catalogue, so nothing is
 * asked until there are two.
 */
export async function searchSuggestions(
  auth: AppleAuth,
  store: string,
  term: string,
): Promise<string[]> {
  const query = term.trim();
  if (query.length < 2 || !store) return [];

  const params = new URLSearchParams({ term: query, kinds: "terms", limit: "6" });
  try {
    const res = await fetch(
      `${BASE}/v1/catalog/${encodeURIComponent(store)}/search/suggestions?${params}`,
      { headers: headers(auth) },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: { suggestions?: { kind?: string; searchTerm?: string }[] };
    };
    const terms = (json.results?.suggestions ?? [])
      .filter((s) => s.kind === "terms" && typeof s.searchTerm === "string" && s.searchTerm.trim())
      .map((s) => s.searchTerm as string);
    return [...new Set(terms)];
  } catch {
    return [];
  }
}

// MARK: library and home

export type LibraryKind = "playlists" | "albums" | "artists" | "songs";

/**
 * One page of the listener's library, newest Apple ordering first.
 *
 * Libraries run to thousands of songs, so this is paged rather than fetched
 * whole. Apple signals "there is more" with a `next` link; the offset is
 * worked out here instead of following that link so the caller only ever
 * deals in numbers. Apple caps a library page at 100.
 */
export async function libraryPage(
  auth: AppleAuth,
  kind: LibraryKind,
  offset = 0,
  limit = 25,
): Promise<{ items: MusicItem[]; next: number | null }> {
  const size = clamp(limit, 1, 100);
  const from = clamp(offset, 0, Number.MAX_SAFE_INTEGER);
  const params = new URLSearchParams({ limit: String(size), offset: String(from) });

  const json = await getJson<{ data?: unknown[]; next?: string }>(
    auth,
    `/v1/me/library/${kind}?${params}`,
    "library",
  );
  return { items: toItems(json.data), next: json.next ? from + size : null };
}

/**
 * Apple's own "Made for you" shelves, each with the title Apple gave it.
 *
 * A shelf can come back empty — or full of types the Hub does not show — and
 * an empty heading is just noise on a wall display, so those are dropped.
 */
export async function recommendations(
  auth: AppleAuth,
  limit = 6,
): Promise<{ title: string; items: MusicItem[] }[]> {
  const params = new URLSearchParams({ limit: String(clamp(limit, 1, 30)) });
  const json = await getJson<{
    data?: {
      attributes?: { title?: { stringForDisplay?: string } };
      relationships?: { contents?: { data?: unknown[] } };
    }[];
  }>(auth, `/v1/me/recommendations?${params}`, "recommendations");

  return (json.data ?? [])
    .map((rec) => ({
      title: rec.attributes?.title?.stringForDisplay ?? "",
      items: toItems(rec.relationships?.contents?.data),
    }))
    .filter((g) => g.items.length > 0);
}

/** What this listener has been playing most lately — the quickest way back to it. */
export async function heavyRotation(auth: AppleAuth, limit = 10): Promise<MusicItem[]> {
  // Apple accepts at most 10 here and errors on more.
  const params = new URLSearchParams({ limit: String(clamp(limit, 1, 10)) });
  const json = await getJson<{ data?: unknown[] }>(
    auth,
    `/v1/me/history/heavy-rotation?${params}`,
    "heavy rotation",
  );
  return toItems(json.data);
}

/**
 * The listener's personal station and Apple's live radio.
 *
 * The two halves are independent, so they are asked for together and either
 * may fail on its own: a listener without a personal station yet still gets
 * the radio, and a storefront without live radio still gets their station.
 * This never throws — a missing shelf is not an error worth a banner.
 */
export async function stations(
  auth: AppleAuth,
  store: string,
): Promise<{ personal: MusicItem | null; live: MusicItem[] }> {
  if (!store) return { personal: null, live: [] };
  const base = `/v1/catalog/${encodeURIComponent(store)}/stations`;

  const [personal, live] = await Promise.all([
    getJson<{ data?: unknown[] }>(auth, `${base}?filter[identity]=personal`, "stations")
      .then((j) => toItems(j.data)[0] ?? null)
      .catch(() => null),
    getJson<{ data?: unknown[] }>(auth, `${base}?filter[featured]=apple-music-live-radio`, "stations")
      .then((j) => toItems(j.data))
      .catch(() => [] as MusicItem[]),
  ]);
  return { personal, live };
}

/** What is popular in this storefront right now: songs, albums and playlists. */
export async function charts(
  auth: AppleAuth,
  store: string,
  limit = 10,
): Promise<{ songs: MusicItem[]; albums: MusicItem[]; playlists: MusicItem[] }> {
  const params = new URLSearchParams({
    types: "songs,albums,playlists",
    limit: String(clamp(limit, 1, 50)),
  });
  const json = await getJson<{
    results?: Record<string, { data?: unknown[] }[] | undefined>;
  }>(auth, `/v1/catalog/${encodeURIComponent(store)}/charts?${params}`, "charts");

  // Each type comes back as a list of charts (most played, city charts…); the
  // first is Apple's main one, and one chart per type is all a shelf needs.
  const r = json.results ?? {};
  return {
    songs: toItems(r.songs?.[0]?.data),
    albums: toItems(r.albums?.[0]?.data),
    playlists: toItems(r.playlists?.[0]?.data),
  };
}

/**
 * An artist's most-played songs, which is what "play this artist" should mean.
 * Playing an artist page from the top would start with whatever Apple happens
 * to list first; top songs start with the ones people know.
 */
export async function artistTopSongs(
  auth: AppleAuth,
  store: string,
  artistId: string,
  limit = 20,
): Promise<MusicItem[]> {
  const params = new URLSearchParams({ limit: String(clamp(limit, 1, 20)) });
  const json = await getJson<{ data?: unknown[] }>(
    auth,
    `/v1/catalog/${encodeURIComponent(store)}/artists/${encodeURIComponent(artistId)}/view/top-songs?${params}`,
    "top songs",
  );
  return toItems(json.data);
}
