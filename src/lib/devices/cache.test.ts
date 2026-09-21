import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Device } from "@prisma/client";

/**
 * The device-auth cache.
 *
 * The behaviour worth pinning is not the speed-up — it is that a bearer
 * credential with no expiry never becomes a Redis key, and that revoking one
 * takes effect immediately rather than whenever the entry happens to expire.
 */

const store = { get: vi.fn(), set: vi.fn(), del: vi.fn() };

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(_opts: unknown) {}
    get = (...a: unknown[]) => store.get(...a);
    set = (...a: unknown[]) => store.set(...a);
    del = (...a: unknown[]) => store.del(...a);
  },
}));

vi.mock("@/lib/errors/report", () => ({
  reportWarning: vi.fn(),
  reportError: vi.fn(),
}));

const SECRET = "dev_0123456789abcdef";
const EXPECTED_KEY = `devauth:${createHash("sha256").update(SECRET).digest("hex")}`;

const device = {
  id: "dev_kitchen",
  householdId: "hh_a",
  displayName: "Kitchen",
  room: "Kitchen",
  deviceSecret: SECRET,
  pairing: "ACTIVE",
  doNotDisturb: false,
  lastSeenAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  nowPlayingAt: new Date(),
  musicLinkedAt: new Date(),
} as unknown as Device;

async function fresh() {
  vi.resetModules();
  return import("./cache");
}

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
  store.get.mockResolvedValue(null);
  store.set.mockResolvedValue("OK");
  store.del.mockResolvedValue(1);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("the key", () => {
  it("is a hash of the secret, never the secret", async () => {
    const { rememberSecret } = await fresh();
    await rememberSecret(SECRET, device);

    const [key] = store.set.mock.calls[0] as [string];
    expect(key).toBe(EXPECTED_KEY);
    expect(key).not.toContain(SECRET);
  });
});

describe("what is stored", () => {
  it("keeps the whole row, settings included", async () => {
    const { rememberSecret } = await fresh();
    await rememberSecret(SECRET, device);

    const [, value] = store.set.mock.calls[0] as [string, Record<string, unknown>];
    // Caching the row rather than just the id is what removes the heartbeat's
    // separate settings read.
    expect(value).toMatchObject({ id: "dev_kitchen", room: "Kitchen", pairing: "ACTIVE" });
  });

  it("revives dates, so a cached row is a faithful Device", async () => {
    const { cachedBySecret } = await fresh();
    // What Redis actually hands back: JSON, so every Date is now a string.
    store.get.mockResolvedValue({
      ...device,
      lastSeenAt: device.lastSeenAt?.toISOString(),
      musicLinkedAt: device.musicLinkedAt?.toISOString(),
      nowPlayingAt: null,
    });

    const revived = await cachedBySecret(SECRET);

    // /api/music/fetch reads musicLinkedAt straight off the authenticated
    // device. Dropping it made that route tell every panel to sign in to Apple
    // Music, forever — types could not see it, so this test has to.
    expect(revived?.musicLinkedAt).toBeInstanceOf(Date);
    expect(revived?.lastSeenAt).toBeInstanceOf(Date);
    expect(revived?.nowPlayingAt).toBeNull();
    expect(revived?.musicLinkedAt?.getTime()).toBe(device.musicLinkedAt?.getTime());
  });

  it("expires, so a secret nobody explicitly revoked does not live forever", async () => {
    const { rememberSecret } = await fresh();
    await rememberSecret(SECRET, device);

    const [, , opts] = store.set.mock.calls[0] as [string, unknown, { px: number }];
    expect(opts.px).toBeGreaterThan(0);
    expect(opts.px).toBeLessThanOrEqual(60_000);
  });
});

describe("reads", () => {
  it("returns null on a miss, so the caller falls through to Postgres", async () => {
    const { cachedBySecret } = await fresh();
    await expect(cachedBySecret(SECRET)).resolves.toBeNull();
  });

  it("returns null when Redis is unreachable rather than failing the request", async () => {
    const { cachedBySecret } = await fresh();
    store.get.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(cachedBySecret(SECRET)).resolves.toBeNull();
  });

  it("does not touch Redis when it is not configured", async () => {
    vi.unstubAllEnvs();
    const { cachedBySecret } = await fresh();
    await expect(cachedBySecret(SECRET)).resolves.toBeNull();
    expect(store.get).not.toHaveBeenCalled();
  });
});

describe("revocation", () => {
  it("deletes the entry for the exact secret being revoked", async () => {
    const { forgetSecret } = await fresh();
    await forgetSecret(SECRET);
    expect(store.del).toHaveBeenCalledWith(EXPECTED_KEY);
  });

  it("is the same operation as invalidating changed settings", async () => {
    const { forgetSecret, invalidateSecret } = await fresh();
    expect(invalidateSecret).toBe(forgetSecret);
  });
});
