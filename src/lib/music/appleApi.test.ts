import { afterEach, describe, expect, it, vi } from "vitest";
import { love, lovedIds, searchCatalog, storefront, unlove } from "@/lib/music/appleApi";

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

describe("searchCatalog", () => {
  const body = JSON.stringify({
    results: {
      songs: { data: [{ id: "1", attributes: { name: "Levitating", artistName: "Dua Lipa", durationInMillis: 203000 } }] },
      playlists: { data: [{ id: "pl.1", attributes: { name: "Party Mix" } }] },
    },
  });

  it("returns songs and playlists", async () => {
    mockFetch(() => new Response(body, { status: 200 }));
    const found = await searchCatalog(auth, "au", "levitating");
    expect(found.songs[0]).toMatchObject({ id: "1", title: "Levitating", artist: "Dua Lipa" });
    expect(found.playlists[0]).toMatchObject({ id: "pl.1", name: "Party Mix" });
  });

  it("puts the storefront in the path, which is what was broken", async () => {
    const spy = mockFetch(() => new Response(body, { status: 200 }));
    await searchCatalog(auth, "au", "levitating");
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("/v1/catalog/au/search");
    expect(url).not.toContain("undefined");
  });

  it("asks for both types, or playlists never come back", async () => {
    const spy = mockFetch(() => new Response(body, { status: 200 }));
    await searchCatalog(auth, "au", "x");
    const url = new URL(String(spy.mock.calls[0][0]));
    expect(url.searchParams.get("types")).toBe("songs,playlists");
    expect(url.searchParams.get("term")).toBe("x");
  });

  it("reports the status, because that is the whole diagnosis", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    // A 404 means the storefront; a 401 means the token. "Nothing found" says
    // neither, which is how this bug survived two attempts at fixing it.
    await expect(searchCatalog(auth, "au", "x")).rejects.toThrow(/404/);
  });

  it("asks nothing without a storefront or a term", async () => {
    const spy = mockFetch(() => new Response(body, { status: 200 }));
    expect(await searchCatalog(auth, "", "x")).toEqual({ songs: [], playlists: [] });
    expect(await searchCatalog(auth, "au", "   ")).toEqual({ songs: [], playlists: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it("stays inside the limit Apple accepts", async () => {
    const spy = mockFetch(() => new Response(body, { status: 200 }));
    await searchCatalog(auth, "au", "x", 500);
    expect(new URL(String(spy.mock.calls[0][0])).searchParams.get("limit")).toBe("25");
  });

  it("survives a result with no attributes at all", async () => {
    mockFetch(() => new Response(JSON.stringify({ results: { songs: { data: [{ id: "1" }] } } }), { status: 200 }));
    const found = await searchCatalog(auth, "au", "x");
    expect(found.songs[0].title).toBe("Unknown track");
    expect(found.playlists).toEqual([]);
  });
});
