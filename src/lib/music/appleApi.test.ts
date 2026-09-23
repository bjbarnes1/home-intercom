import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_RESULTS,
  artistTopSongs,
  charts,
  cleanOnly,
  filterResults,
  heavyRotation,
  libraryPage,
  love,
  lovedIds,
  recommendations,
  searchCatalog,
  searchLibrary,
  searchSuggestions,
  stations,
  storefront,
  toMusicItem,
  unlove,
  type CatalogResults,
  type MusicItem,
} from "@/lib/music/appleApi";

const auth = { developerToken: "dev", musicUserToken: "user" };

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const spy = vi.fn((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init)),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("love", () => {
  it("sends both tokens, because one identifies the app and the other the listener", async () => {
    const spy = mockFetch(() => new Response("{}", { status: 200 }));
    await love(auth, "songs", "1440857781");

    const [, init] = spy.mock.calls[0];
    const h = init?.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer dev");
    expect(h["Music-User-Token"]).toBe("user");
  });

  it("rates it loved rather than anything else", async () => {
    const spy = mockFetch(() => new Response("{}", { status: 200 }));
    await love(auth, "songs", "1");
    expect(JSON.parse(String(spy.mock.calls[0][1]?.body))).toEqual({
      type: "rating",
      attributes: { value: 1 },
    });
  });

  it("escapes an id rather than pasting it into a URL", async () => {
    const spy = mockFetch(() => new Response("{}", { status: 200 }));
    await love(auth, "playlists", "p l/1");
    expect(String(spy.mock.calls[0][0])).toContain("p%20l%2F1");
  });

  it("says so when Apple refuses", async () => {
    mockFetch(() => new Response("", { status: 403 }));
    await expect(love(auth, "songs", "1")).rejects.toThrow(/403/);
  });
});

describe("unlove", () => {
  it("treats a rating that was never there as the state we wanted", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    await expect(unlove(auth, "songs", "1")).resolves.toBeUndefined();
  });

  it("still reports a real failure", async () => {
    mockFetch(() => new Response("", { status: 500 }));
    await expect(unlove(auth, "songs", "1")).rejects.toThrow(/500/);
  });
});

describe("lovedIds", () => {
  it("returns only the ones actually loved", async () => {
    mockFetch(() => new Response(JSON.stringify({ data: [
      { id: "a", attributes: { value: 1 } },
      { id: "b", attributes: { value: -1 } },
    ] }), { status: 200 }));

    const loved = await lovedIds(auth, "songs", ["a", "b", "c"]);
    expect([...loved]).toEqual(["a"]);
  });

  it("asks nothing when there is nothing to ask about", async () => {
    const spy = mockFetch(() => new Response("{}", { status: 200 }));
    expect((await lovedIds(auth, "songs", [])).size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("treats a listener with no ratings as nothing loved, not an error", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    await expect(lovedIds(auth, "songs", ["a"])).resolves.toEqual(new Set());
  });

  it("does not exceed what the endpoint accepts in one go", async () => {
    const spy = mockFetch(() => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await lovedIds(auth, "songs", Array.from({ length: 150 }, (_, i) => `id${i}`));
    const ids = new URL(String(spy.mock.calls[0][0])).searchParams.get("ids") ?? "";
    expect(ids.split(",")).toHaveLength(100);
  });
});

describe("storefront", () => {
  it("asks Apple which storefront this listener is in", async () => {
    const spy = mockFetch(() => new Response(JSON.stringify({ data: [{ id: "au" }] }), { status: 200 }));
    expect(await storefront(auth)).toBe("au");
    expect(String(spy.mock.calls[0][0])).toContain("/v1/me/storefront");
  });

  it("says it does not know rather than guessing", async () => {
    mockFetch(() => new Response("", { status: 401 }));
    expect(await storefront(auth)).toBeNull();
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function urlOf(spy: ReturnType<typeof mockFetch>, call = 0) {
  return new URL(String(spy.mock.calls[call][0]));
}

const song = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "songs",
  attributes: { name: `Song ${id}`, artistName: "Someone", durationInMillis: 1000, ...extra },
});

describe("toMusicItem", () => {
  it("flattens a catalogue song, filling the artwork size", () => {
    expect(
      toMusicItem({
        id: "1",
        type: "songs",
        attributes: {
          name: "Levitating",
          artistName: "Dua Lipa",
          durationInMillis: 203000,
          artwork: { url: "https://a/{w}x{h}bb.jpg" },
          contentRating: "explicit",
          url: "https://music.apple.com/au/song/1",
        },
      }),
    ).toEqual({
      kind: "song",
      id: "1",
      title: "Levitating",
      subtitle: "Dua Lipa",
      artwork: "https://a/120x120bb.jpg",
      durationMs: 203000,
      contentRating: "explicit",
      url: "https://music.apple.com/au/song/1",
      library: false,
      catalogId: null,
    });
  });

  it("knows a library item and remembers where it came from in the catalogue", () => {
    const item = toMusicItem({
      id: "i.abc",
      type: "library-songs",
      attributes: { name: "Mine", playParams: { catalogId: "123" } },
    });
    expect(item).toMatchObject({ kind: "song", library: true, catalogId: "123" });
  });

  it("recognises a library id even when the type says otherwise", () => {
    expect(toMusicItem({ id: "p.xyz", type: "playlists" })?.library).toBe(true);
    expect(toMusicItem({ id: "pl.xyz", type: "playlists" })?.library).toBe(false);
  });

  it("ignores a catalogue id on something that is already from the catalogue", () => {
    expect(
      toMusicItem({ id: "1", type: "albums", attributes: { playParams: { catalogId: "1" } } })?.catalogId,
    ).toBeNull();
  });

  it("uses the curator under a playlist and nothing under an artist", () => {
    expect(toMusicItem({ id: "pl.1", type: "playlists", attributes: { name: "P", curatorName: "Apple Music" } })?.subtitle).toBe("Apple Music");
    expect(toMusicItem({ id: "pl.1", type: "playlists", attributes: { name: "P" } })?.subtitle).toBe("");
    expect(toMusicItem({ id: "9", type: "artists", attributes: { name: "Dua Lipa", artistName: "x" } })).toMatchObject({ title: "Dua Lipa", subtitle: "" });
  });

  it("maps every type the Hub shows", () => {
    const kinds = [
      ["songs", "song"], ["library-songs", "song"],
      ["albums", "album"], ["library-albums", "album"],
      ["artists", "artist"], ["library-artists", "artist"],
      ["playlists", "playlist"], ["library-playlists", "playlist"],
      ["stations", "station"],
    ];
    for (const [type, kind] of kinds) expect(toMusicItem({ id: "x", type })?.kind).toBe(kind);
  });

  it("marks live stations, and only stations", () => {
    expect(toMusicItem({ id: "ra.1", type: "stations", attributes: { name: "Apple Music 1", isLive: true } })?.live).toBe(true);
    expect(toMusicItem({ id: "ra.2", type: "stations", attributes: {} })?.live).toBe(false);
    expect(toMusicItem({ id: "1", type: "songs" })).not.toHaveProperty("live");
  });

  it("gives duration to songs only", () => {
    expect(toMusicItem({ id: "1", type: "albums", attributes: { durationInMillis: 5 } })?.durationMs).toBe(0);
  });

  it("treats an unknown rating as unrated", () => {
    expect(toMusicItem({ id: "1", type: "songs", attributes: { contentRating: "weird" } })?.contentRating).toBeUndefined();
    expect(toMusicItem({ id: "1", type: "songs", attributes: { contentRating: "clean" } })?.contentRating).toBe("clean");
  });

  it("survives a resource with no attributes at all", () => {
    expect(toMusicItem({ id: "1", type: "songs" })).toMatchObject({
      title: "Unknown track", subtitle: "", artwork: null, url: null, durationMs: 0,
    });
  });

  it("returns null for types it does not show and for junk", () => {
    expect(toMusicItem({ id: "1", type: "music-videos" })).toBeNull();
    expect(toMusicItem({ type: "songs" })).toBeNull();
    expect(toMusicItem(null)).toBeNull();
    expect(toMusicItem("songs")).toBeNull();
  });
});

describe("cleanOnly and filterResults", () => {
  const e = { contentRating: "explicit" as const, id: "e" };
  const c = { contentRating: "clean" as const, id: "c" };
  const u = { contentRating: undefined, id: "u" };

  it("drops explicit and keeps clean and unrated", () => {
    expect(cleanOnly([e, c, u]).map((i) => i.id)).toEqual(["c", "u"]);
  });

  it("filters every list when clean is on", () => {
    const item = (r: MusicItem["contentRating"]) => toMusicItem(song("1", { contentRating: r })) as MusicItem;
    const all: CatalogResults = {
      top: [item("explicit")], songs: [item("explicit"), item(undefined)], albums: [item("explicit")],
      artists: [item(undefined)], playlists: [item("explicit")], stations: [item("clean")],
    };
    const out = filterResults(all, true);
    expect(out.top).toEqual([]);
    expect(out.songs).toHaveLength(1);
    expect(out.albums).toEqual([]);
    expect(out.artists).toHaveLength(1);
    expect(out.playlists).toEqual([]);
    expect(out.stations).toHaveLength(1);
  });

  it("leaves results alone when clean is off", () => {
    const all = { ...EMPTY_RESULTS, songs: [toMusicItem(song("1", { contentRating: "explicit" })) as MusicItem] };
    expect(filterResults(all, false)).toBe(all);
  });
});

describe("searchCatalog", () => {
  const body = JSON.stringify({
    results: {
      top: { data: [song("1"), { id: "a", type: "artists", attributes: { name: "Dua Lipa" } }, song("2"), song("3"), song("4")] },
      songs: { data: [{ id: "1", type: "songs", attributes: { name: "Levitating", artistName: "Dua Lipa", durationInMillis: 203000 } }] },
      albums: { data: [{ id: "al", type: "albums", attributes: { name: "Future Nostalgia", artistName: "Dua Lipa" } }] },
      artists: { data: [{ id: "a", type: "artists", attributes: { name: "Dua Lipa" } }] },
      playlists: { data: [{ id: "pl.1", type: "playlists", attributes: { name: "Party Mix" } }] },
      stations: { data: [{ id: "ra.1", type: "stations", attributes: { name: "Dua Lipa Station" } }] },
    },
  });

  it("returns every type, flattened", async () => {
    mockFetch(() => new Response(body, { status: 200 }));
    const found = await searchCatalog(auth, "au", "levitating");
    expect(found.songs[0]).toMatchObject({ kind: "song", id: "1", title: "Levitating", subtitle: "Dua Lipa" });
    expect(found.albums[0]).toMatchObject({ kind: "album", title: "Future Nostalgia" });
    expect(found.artists[0]).toMatchObject({ kind: "artist", title: "Dua Lipa" });
    expect(found.playlists[0]).toMatchObject({ kind: "playlist", id: "pl.1", title: "Party Mix" });
    expect(found.stations[0]).toMatchObject({ kind: "station", id: "ra.1" });
  });

  it("keeps Apple's top results, but only the first four", async () => {
    mockFetch(() => new Response(body, { status: 200 }));
    const found = await searchCatalog(auth, "au", "dua");
    expect(found.top.map((i) => i.id)).toEqual(["1", "a", "2", "3"]);
  });

  it("puts the storefront in the path, which is what was broken", async () => {
    const spy = mockFetch(() => new Response(body, { status: 200 }));
    await searchCatalog(auth, "au", "levitating");
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("/v1/catalog/au/search");
    expect(url).not.toContain("undefined");
  });

  it("asks for every type and for top results", async () => {
    const spy = mockFetch(() => new Response(body, { status: 200 }));
    await searchCatalog(auth, "au", "x");
    const url = urlOf(spy);
    expect(url.searchParams.get("types")).toBe("songs,albums,artists,playlists,stations");
    expect(url.searchParams.get("with")).toBe("topResults");
    expect(url.searchParams.get("term")).toBe("x");
    expect(url.searchParams.get("limit")).toBe("10");
  });

  it("reports the status, because that is the whole diagnosis", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    // A 404 means the storefront; a 401 means the token. "Nothing found" says
    // neither, which is how this bug survived two attempts at fixing it.
    await expect(searchCatalog(auth, "au", "x")).rejects.toThrow(/404/);
  });

  it("asks nothing without a storefront or a term", async () => {
    const spy = mockFetch(() => new Response(body, { status: 200 }));
    expect(await searchCatalog(auth, "", "x")).toEqual(EMPTY_RESULTS);
    expect(await searchCatalog(auth, "au", "   ")).toEqual(EMPTY_RESULTS);
    expect(spy).not.toHaveBeenCalled();
  });

  it("stays inside the limit Apple accepts", async () => {
    const spy = mockFetch(() => new Response(body, { status: 200 }));
    await searchCatalog(auth, "au", "x", 500);
    expect(urlOf(spy).searchParams.get("limit")).toBe("25");
  });

  it("survives a result with no attributes and missing types", async () => {
    mockFetch(() => json({ results: { songs: { data: [{ id: "1", type: "songs" }] } } }));
    const found = await searchCatalog(auth, "au", "x");
    expect(found.songs[0].title).toBe("Unknown track");
    expect(found.playlists).toEqual([]);
    expect(found.top).toEqual([]);
  });
});

describe("searchLibrary", () => {
  it("reads the library-typed results and leaves top and stations empty", async () => {
    const spy = mockFetch(() => json({
      results: {
        "library-songs": { data: [{ id: "i.1", type: "library-songs", attributes: { name: "Mine" } }] },
        "library-playlists": { data: [{ id: "p.1", type: "library-playlists", attributes: { name: "Road trip" } }] },
      },
    }));
    const found = await searchLibrary(auth, "mine");
    expect(found.songs[0]).toMatchObject({ id: "i.1", library: true });
    expect(found.playlists[0]).toMatchObject({ id: "p.1", title: "Road trip" });
    expect(found.top).toEqual([]);
    expect(found.stations).toEqual([]);

    const url = urlOf(spy);
    expect(url.pathname).toBe("/v1/me/library/search");
    expect(url.searchParams.get("types")).toBe("library-songs,library-albums,library-artists,library-playlists");
  });

  it("asks nothing for an empty term", async () => {
    const spy = mockFetch(() => json({}));
    expect(await searchLibrary(auth, " ")).toEqual(EMPTY_RESULTS);
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports the status", async () => {
    mockFetch(() => new Response("", { status: 403 }));
    await expect(searchLibrary(auth, "x")).rejects.toThrow(/403/);
  });
});

describe("searchSuggestions", () => {
  it("returns the suggested terms, once each", async () => {
    const spy = mockFetch(() => json({
      results: {
        suggestions: [
          { kind: "terms", searchTerm: "taylor swift" },
          { kind: "topResults", content: {} },
          { kind: "terms", searchTerm: "taylor swift" },
          { kind: "terms", searchTerm: "taylor swift love story" },
        ],
      },
    }));
    expect(await searchSuggestions(auth, "au", "tay")).toEqual(["taylor swift", "taylor swift love story"]);
    const url = urlOf(spy);
    expect(url.pathname).toBe("/v1/catalog/au/search/suggestions");
    expect(url.searchParams.get("kinds")).toBe("terms");
    expect(url.searchParams.get("limit")).toBe("6");
  });

  it("waits for two letters", async () => {
    const spy = mockFetch(() => json({}));
    expect(await searchSuggestions(auth, "au", "t")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("is never an error", async () => {
    mockFetch(() => new Response("", { status: 500 }));
    expect(await searchSuggestions(auth, "au", "tay")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(await searchSuggestions(auth, "au", "tay")).toEqual([]);
  });
});

describe("libraryPage", () => {
  it("pages through the library and says where the next page starts", async () => {
    const spy = mockFetch(() => json({
      data: [{ id: "p.1", type: "library-playlists", attributes: { name: "Mine" } }],
      next: "/v1/me/library/playlists?offset=50",
    }));
    const page = await libraryPage(auth, "playlists", 25, 25);
    expect(page.items[0]).toMatchObject({ kind: "playlist", library: true });
    expect(page.next).toBe(50);

    const url = urlOf(spy);
    expect(url.pathname).toBe("/v1/me/library/playlists");
    expect(url.searchParams.get("offset")).toBe("25");
    expect(url.searchParams.get("limit")).toBe("25");
  });

  it("stops when Apple says there is no more", async () => {
    mockFetch(() => json({ data: [] }));
    expect(await libraryPage(auth, "songs")).toEqual({ items: [], next: null });
  });

  it("reports the status", async () => {
    mockFetch(() => new Response("", { status: 401 }));
    await expect(libraryPage(auth, "albums")).rejects.toThrow(/401/);
  });
});

describe("recommendations", () => {
  it("keeps each shelf's title and skips empty ones", async () => {
    const spy = mockFetch(() => json({
      data: [
        {
          attributes: { title: { stringForDisplay: "Made for You" } },
          relationships: { contents: { data: [{ id: "pl.1", type: "playlists", attributes: { name: "Favourites Mix" } }] } },
        },
        { attributes: { title: { stringForDisplay: "Empty" } }, relationships: { contents: { data: [] } } },
        { attributes: { title: { stringForDisplay: "Videos" } }, relationships: { contents: { data: [{ id: "v", type: "music-videos" }] } } },
      ],
    }));
    const shelves = await recommendations(auth);
    expect(shelves).toHaveLength(1);
    expect(shelves[0].title).toBe("Made for You");
    expect(shelves[0].items[0]).toMatchObject({ id: "pl.1", title: "Favourites Mix" });
    expect(urlOf(spy).pathname).toBe("/v1/me/recommendations");
    expect(urlOf(spy).searchParams.get("limit")).toBe("6");
  });

  it("reports the status", async () => {
    mockFetch(() => new Response("", { status: 500 }));
    await expect(recommendations(auth)).rejects.toThrow(/500/);
  });
});

describe("heavyRotation", () => {
  it("returns what has been playing most", async () => {
    const spy = mockFetch(() => json({ data: [{ id: "1", type: "albums", attributes: { name: "A" } }] }));
    expect((await heavyRotation(auth))[0]).toMatchObject({ kind: "album", id: "1" });
    expect(urlOf(spy).pathname).toBe("/v1/me/history/heavy-rotation");
    expect(urlOf(spy).searchParams.get("limit")).toBe("10");
  });

  it("reports the status", async () => {
    mockFetch(() => new Response("", { status: 403 }));
    await expect(heavyRotation(auth)).rejects.toThrow(/403/);
  });
});

describe("stations", () => {
  const personal = { id: "ra.u-1", type: "stations", attributes: { name: "My Station" } };
  const live = { id: "ra.978194965", type: "stations", attributes: { name: "Apple Music 1", isLive: true } };

  it("asks for both halves together", async () => {
    const spy = mockFetch((url) =>
      json({ data: new URL(url).searchParams.get("filter[identity]") ? [personal] : [live] }),
    );
    const found = await stations(auth, "au");
    expect(found.personal).toMatchObject({ id: "ra.u-1", kind: "station" });
    expect(found.live[0]).toMatchObject({ id: "ra.978194965", live: true });
    expect(spy).toHaveBeenCalledTimes(2);

    const params = spy.mock.calls.map(([u]) => new URL(String(u)));
    expect(params.every((u) => u.pathname === "/v1/catalog/au/stations")).toBe(true);
    expect(params.map((u) => u.searchParams.get("filter[identity]"))).toContain("personal");
    expect(params.map((u) => u.searchParams.get("filter[featured]"))).toContain("apple-music-live-radio");
  });

  it("lets either half fail on its own", async () => {
    mockFetch((url) =>
      new URL(url).searchParams.get("filter[identity]")
        ? new Response("", { status: 404 })
        : json({ data: [live] }),
    );
    const found = await stations(auth, "au");
    expect(found.personal).toBeNull();
    expect(found.live).toHaveLength(1);

    mockFetch((url) =>
      new URL(url).searchParams.get("filter[identity]") ? json({ data: [personal] }) : new Response("", { status: 500 }),
    );
    expect(await stations(auth, "au")).toMatchObject({ personal: { id: "ra.u-1" }, live: [] });
  });

  it("never throws, even offline", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect(await stations(auth, "au")).toEqual({ personal: null, live: [] });
  });
});

describe("charts", () => {
  it("takes the first chart of each type", async () => {
    const spy = mockFetch(() => json({
      results: {
        songs: [{ data: [song("1")] }, { data: [song("2")] }],
        albums: [{ data: [{ id: "al", type: "albums" }] }],
        playlists: [],
      },
    }));
    const c = await charts(auth, "au");
    expect(c.songs.map((i) => i.id)).toEqual(["1"]);
    expect(c.albums[0].kind).toBe("album");
    expect(c.playlists).toEqual([]);

    const url = urlOf(spy);
    expect(url.pathname).toBe("/v1/catalog/au/charts");
    expect(url.searchParams.get("types")).toBe("songs,albums,playlists");
    expect(url.searchParams.get("limit")).toBe("10");
  });

  it("reports the status", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    await expect(charts(auth, "zz")).rejects.toThrow(/404/);
  });
});

describe("artistTopSongs", () => {
  it("reads the artist's top-songs view", async () => {
    const spy = mockFetch(() => json({ data: [song("1"), song("2")] }));
    expect((await artistTopSongs(auth, "au", "159260351")).map((i) => i.id)).toEqual(["1", "2"]);
    const url = urlOf(spy);
    expect(url.pathname).toBe("/v1/catalog/au/artists/159260351/view/top-songs");
    expect(url.searchParams.get("limit")).toBe("20");
  });

  it("reports the status", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    await expect(artistTopSongs(auth, "au", "1")).rejects.toThrow(/404/);
  });
});
