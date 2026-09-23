import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every panel with MusicKit reports here every 30 seconds for as long as it
 * is on. It used to write the Device row and drop the auth cache on every one
 * of those, which undid most of what the heartbeat's cache was for.
 */

const NOW = new Date("2026-09-23T10:00:00Z");

const device = {
  id: "d1",
  deviceSecret: "s",
  pairing: "ACTIVE",
  musicLinkedAt: new Date("2026-09-01T00:00:00Z") as Date | null,
  nowPlayingTitle: null as string | null,
  nowPlayingArtist: null as string | null,
  nowPlayingAt: null as Date | null,
};

const deviceFromRequest = vi.fn();
const update = vi.fn();
const rememberSecret = vi.fn();

vi.mock("@/lib/auth/context", () => ({ deviceFromRequest: (r: Request) => deviceFromRequest(r) }));
vi.mock("@/lib/prisma", () => ({ prisma: { device: { update: (a: unknown) => update(a) } } }));
vi.mock("@/lib/devices/cache", () => ({
  rememberSecret: (s: string, d: unknown) => rememberSecret(s, d),
}));

function post(body: unknown): Request {
  return new Request("http://localhost/api/music/linked", {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-secret": "s" },
    body: JSON.stringify(body),
  });
}

async function report(body: unknown, row: Partial<typeof device> = {}) {
  deviceFromRequest.mockResolvedValue({ ...device, ...row });
  const { POST } = await import("./route");
  return POST(post(body));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  update.mockImplementation(async ({ data }: { data: object }) => ({ ...device, ...data }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const SONG = { title: "Golden Hour", artist: "JVKE" };

describe("POST /api/music/linked", () => {
  it("writes nothing when an idle, linked panel reports the same again", async () => {
    const res = await report({ linked: true, nowPlaying: null });
    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(rememberSecret).not.toHaveBeenCalled();
  });

  it("writes nothing while the same song is fresh", async () => {
    await report(
      { linked: true, nowPlaying: SONG },
      { nowPlayingTitle: SONG.title, nowPlayingArtist: SONG.artist, nowPlayingAt: new Date(NOW.getTime() - 30_000) },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes the same song before other panels would call it stale", async () => {
    await report(
      { linked: true, nowPlaying: SONG },
      { nowPlayingTitle: SONG.title, nowPlayingArtist: SONG.artist, nowPlayingAt: new Date(NOW.getTime() - 50_000) },
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.nowPlayingAt).toEqual(NOW);
    // Still linked, so the link stamp is left alone.
    expect(update.mock.calls[0][0].data).not.toHaveProperty("musicLinkedAt");
  });

  it("writes a new song and puts the new row in the cache rather than dropping it", async () => {
    await report({ linked: true, nowPlaying: SONG });
    expect(update).toHaveBeenCalledTimes(1);
    expect(rememberSecret).toHaveBeenCalledWith("s", expect.objectContaining({ nowPlayingTitle: SONG.title }));
  });

  it("writes an unlink, since /api/music/fetch reads it off the cached row", async () => {
    await report({ linked: false, nowPlaying: null });
    expect(update.mock.calls[0][0].data.musicLinkedAt).toBeNull();
    expect(rememberSecret).toHaveBeenCalledWith("s", expect.objectContaining({ musicLinkedAt: null }));
  });

  it("clears a song that stopped", async () => {
    await report(
      { linked: true, nowPlaying: null },
      { nowPlayingTitle: SONG.title, nowPlayingArtist: SONG.artist, nowPlayingAt: new Date(NOW.getTime() - 10_000) },
    );
    expect(update.mock.calls[0][0].data).toMatchObject({ nowPlayingTitle: null, nowPlayingAt: null });
  });
});
