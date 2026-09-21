import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Presence, which is the change that took the heartbeat off Postgres.
 *
 * Two behaviours are load-bearing and both are easy to get backwards:
 * expiry is the TTL rather than a clock comparison on read, and an
 * unreachable Redis reports everyone ONLINE rather than everyone offline.
 */

const store = {
  set: vi.fn(),
  mget: vi.fn(),
  del: vi.fn(),
};

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(_opts: unknown) {}
    set = (...a: unknown[]) => store.set(...a);
    mget = (...a: unknown[]) => store.mget(...a);
    del = (...a: unknown[]) => store.del(...a);
  },
}));

const reportWarning = vi.fn();
vi.mock("@/lib/errors/report", () => ({
  reportWarning: (...a: unknown[]) => reportWarning(...a),
  reportError: vi.fn(),
}));

async function fresh() {
  vi.resetModules();
  return import("./store");
}

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
  store.set.mockResolvedValue("OK");
  store.mget.mockResolvedValue([]);
  store.del.mockResolvedValue(1);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("touch", () => {
  it("writes a key whose TTL is the presence window", async () => {
    const { touch, PRESENCE_WINDOW_MS } = await fresh();
    await touch("dev_kitchen", 1_700_000_000_000);

    expect(store.set).toHaveBeenCalledWith("presence:dev_kitchen", 1_700_000_000_000, {
      px: PRESENCE_WINDOW_MS,
    });
  });

  it("does not throw when Redis is unreachable", async () => {
    const { touch } = await fresh();
    store.set.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(touch("dev_kitchen")).resolves.toBeUndefined();
    expect(reportWarning).toHaveBeenCalled();
  });
});

describe("onlineAmong", () => {
  it("asks for every id in one round trip", async () => {
    const { onlineAmong } = await fresh();
    store.mget.mockResolvedValue([1, null, 3]);

    const online = await onlineAmong(["a", "b", "c"]);

    expect(store.mget).toHaveBeenCalledTimes(1);
    expect(store.mget).toHaveBeenCalledWith("presence:a", "presence:b", "presence:c");
    // Presence is existence: a key that is gone has expired, and there is no
    // timestamp arithmetic on the read path at all.
    expect([...online].sort()).toEqual(["a", "c"]);
  });

  it("does not call Redis at all for an empty roster", async () => {
    const { onlineAmong } = await fresh();
    await expect(onlineAmong([])).resolves.toEqual(new Set());
    expect(store.mget).not.toHaveBeenCalled();
  });

  it("reports everyone online when Redis is unreachable", async () => {
    const { onlineAmong } = await fresh();
    store.mget.mockRejectedValue(new Error("ECONNREFUSED"));

    // Fails OPEN. LiveKit's participant list is the authority on whether a
    // page can actually land; reporting everyone offline here would silently
    // stop every page, announcement and reminder in the house.
    const online = await onlineAmong(["a", "b"]);
    expect([...online].sort()).toEqual(["a", "b"]);
    expect(reportWarning).toHaveBeenCalled();
  });
});

describe("the durable lastSeenAt writeback", () => {
  it("claims the slot, so concurrent heartbeats do not both write", async () => {
    const { shouldPersistLastSeen, WRITEBACK_MS } = await fresh();
    store.set.mockResolvedValue("OK");

    await expect(shouldPersistLastSeen("dev_kitchen")).resolves.toBe(true);
    expect(store.set).toHaveBeenCalledWith("presence:wb:dev_kitchen", 1, {
      px: WRITEBACK_MS,
      nx: true,
    });
  });

  it("declines when another beat already holds the slot", async () => {
    const { shouldPersistLastSeen } = await fresh();
    store.set.mockResolvedValue(null); // NX lost

    await expect(shouldPersistLastSeen("dev_kitchen")).resolves.toBe(false);
  });

  it("declines during a Redis outage rather than writing every beat", async () => {
    const { shouldPersistLastSeen } = await fresh();
    store.set.mockRejectedValue(new Error("ECONNREFUSED"));

    // Fails CLOSED, the opposite way from the read path and for the opposite
    // reason: skipping a durable write costs nothing, and doing one per
    // heartbeat during an outage is exactly the load being removed.
    await expect(shouldPersistLastSeen("dev_kitchen")).resolves.toBe(false);
  });
});

describe("without Redis configured", () => {
  it("keeps liveness in process, so next dev still works", async () => {
    vi.unstubAllEnvs();
    const { touch, onlineAmong, PRESENCE_WINDOW_MS } = await fresh();
    const now = 1_700_000_000_000;

    await touch("dev_kitchen", now);
    expect([...(await onlineAmong(["dev_kitchen"], now))]).toEqual(["dev_kitchen"]);

    // And the window still applies to the fallback.
    const later = now + PRESENCE_WINDOW_MS + 1;
    expect([...(await onlineAmong(["dev_kitchen"], later))]).toEqual([]);
    expect(store.set).not.toHaveBeenCalled();
  });
});

describe("forget", () => {
  it("drops the key when a panel is recoded", async () => {
    const { forget } = await fresh();
    await forget("dev_kitchen");
    expect(store.del).toHaveBeenCalledWith("presence:dev_kitchen");
  });
});
