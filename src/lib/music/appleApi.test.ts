import { afterEach, describe, expect, it, vi } from "vitest";
import { love, lovedIds, unlove } from "@/lib/music/appleApi";

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
