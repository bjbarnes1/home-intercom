import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the heartbeat costs.
 *
 * This is the assertion the whole change exists for, and it is the one that
 * will quietly stop being true: someone adds a `select` to the presence route,
 * or a helper it calls grows a lookup, and the database is back in the hot
 * path at six requests a minute per panel without anything looking wrong.
 *
 * So the query count is pinned, not just the response.
 */

const deviceFindUnique = vi.fn();
const deviceUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    device: {
      findUnique: (a: unknown) => deviceFindUnique(a),
      update: (a: unknown) => deviceUpdate(a),
    },
  },
}));

const cachedBySecret = vi.fn();
const rememberSecret = vi.fn();
vi.mock("@/lib/devices/cache", () => ({
  cachedBySecret: (...a: unknown[]) => cachedBySecret(...a),
  rememberSecret: (...a: unknown[]) => rememberSecret(...a),
}));

const touch = vi.fn();
const shouldPersistLastSeen = vi.fn();
vi.mock("@/lib/presence/store", () => ({
  touch: (...a: unknown[]) => touch(...a),
  shouldPersistLastSeen: (...a: unknown[]) => shouldPersistLastSeen(...a),
}));

vi.mock("@/lib/livekit/token", () => ({
  mintToken: vi.fn(async () => "fake.jwt"),
}));

const SECRET = "dev_secret";
const device = {
  id: "dev_kitchen",
  householdId: "hh_a",
  displayName: "Kitchen",
  room: "Kitchen",
  pairing: "ACTIVE",
  doNotDisturb: false,
  autoAnswer: true,
  chimeEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  hasLeds: false,
  announceDwellSec: 8,
};

const beat = () =>
  new Request("http://localhost/api/presence", {
    method: "POST",
    headers: { "x-device-secret": SECRET },
  });

beforeEach(() => {
  cachedBySecret.mockResolvedValue(device);
  deviceFindUnique.mockResolvedValue(device);
  deviceUpdate.mockResolvedValue(device);
  touch.mockResolvedValue(undefined);
  shouldPersistLastSeen.mockResolvedValue(false);
});

afterEach(() => vi.clearAllMocks());

describe("POST /api/presence", () => {
  it("costs no Postgres queries on a warm cache", async () => {
    const { POST } = await import("./presence/route");
    const res = await POST(beat());

    expect(res.status).toBe(200);
    // Three queries used to run here: the auth lookup by device secret, the
    // lastSeenAt write, and a re-read for the settings.
    expect(deviceFindUnique).not.toHaveBeenCalled();
    expect(deviceUpdate).not.toHaveBeenCalled();
    expect(touch).toHaveBeenCalledWith(device.id);
  });

  it("names the lobby room, so a panel can notice it moved", async () => {
    const { POST } = await import("./presence/route");
    const body = await (await POST(beat())).json();

    // Without this the panel cannot tell that the room it is connected to is
    // no longer the one the server addresses — which is exactly what stranded
    // every live panel when the lobby was namespaced per household.
    expect(body.lobbyRoomName).toBe(`lobby:${device.householdId}`);
  });

  it("still tells the panel its room and settings", async () => {
    const { POST } = await import("./presence/route");
    const body = await (await POST(beat())).json();

    // The room in particular: a panel only learned this at pairing once, so a
    // reload left it calling itself whatever the last screen had hardcoded.
    expect(body).toMatchObject({
      room: "Kitchen",
      autoAnswer: true,
      chimeEnabled: true,
      announceDwellSec: 8,
      doNotDisturb: false,
    });
  });

  it("falls through to Postgres on a cold cache, and populates it", async () => {
    cachedBySecret.mockResolvedValue(null);
    const { POST } = await import("./presence/route");
    const res = await POST(beat());

    expect(res.status).toBe(200);
    expect(deviceFindUnique).toHaveBeenCalledTimes(1);
    expect(rememberSecret).toHaveBeenCalledWith(SECRET, device);
  });

  it("writes the durable lastSeenAt only when the store says the slot is free", async () => {
    shouldPersistLastSeen.mockResolvedValue(true);
    const { POST } = await import("./presence/route");
    await POST(beat());

    expect(deviceUpdate).toHaveBeenCalledTimes(1);
    const [args] = deviceUpdate.mock.calls[0] as [{ where: { id: string }; data: { lastSeenAt: Date } }];
    expect(args.where.id).toBe(device.id);
    expect(args.data.lastSeenAt).toBeInstanceOf(Date);
  });

  it("rejects an unpaired device without recording it as alive", async () => {
    cachedBySecret.mockResolvedValue({ ...device, pairing: "PENDING" });
    const { POST } = await import("./presence/route");
    const res = await POST(beat());

    expect(res.status).toBe(401);
    expect(touch).not.toHaveBeenCalled();
  });

  it("rejects a request with no device secret", async () => {
    const { POST } = await import("./presence/route");
    const res = await POST(new Request("http://localhost/api/presence", { method: "POST" }));

    expect(res.status).toBe(401);
    expect(cachedBySecret).not.toHaveBeenCalled();
  });
});
