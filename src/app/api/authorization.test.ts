import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cross-household authorization, at the route boundary.
 *
 * Every finding in report #1 §1 was this shape: the domain logic was fine and
 * the route handed it something the caller chose. Unit tests over src/lib/**
 * cannot see that — the bug lives in what the route passes down, not in what
 * the function does with it. So these drive the real exported handlers.
 *
 * The fake Prisma below honours `where` rather than ignoring it. That is the
 * whole point: a route that forgets its householdId filter reads another
 * household's row here exactly as it did in production, and the test fails.
 */

const HOUSEHOLD_A = "hh_a";
const HOUSEHOLD_B = "hh_b";

const userA = {
  id: "usr_a",
  name: "Dad",
  householdId: HOUSEHOLD_A,
  role: "ADMIN" as const,
};

const deviceA = { id: "dev_a", householdId: HOUSEHOLD_A, pairing: "ACTIVE", lastSeenAt: new Date(), doNotDisturb: false };
const deviceB = { id: "dev_b", householdId: HOUSEHOLD_B, pairing: "ACTIVE", lastSeenAt: new Date(), doNotDisturb: false };

/** A live call in household B. Its id is the thing an attacker would post. */
const eventB = {
  id: "evt_b",
  householdId: HOUSEHOLD_B,
  roomName: "call:dev_b",
  targetDeviceId: deviceB.id,
  targetZoneId: null,
};

const zoneB = { id: "zone_b", householdId: HOUSEHOLD_B, name: "Downstairs" };
const placeB = { id: "place_b", householdId: HOUSEHOLD_B, name: "School", lat: 1, lng: 2, radiusM: 150, icon: null, createdAt: new Date() };

/** Does a row satisfy a (shallow) Prisma `where`? Unknown keys never match. */
function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, want]) => {
    if (want && typeof want === "object" && "not" in (want as object)) {
      return row[key] !== (want as { not: unknown }).not;
    }
    // Relation filters such as { zone: { householdId } } — one level is enough
    // for these tables.
    if (want && typeof want === "object" && !(want instanceof Date)) {
      return false;
    }
    return row[key] === want;
  });
}

const findMany = (rows: Record<string, unknown>[]) => (args?: { where?: Record<string, unknown> }) =>
  Promise.resolve(rows.filter((r) => matches(r, args?.where)));
const findFirst = (rows: Record<string, unknown>[]) => (args?: { where?: Record<string, unknown> }) =>
  Promise.resolve(rows.find((r) => matches(r, args?.where)) ?? null);

type MintArgs = { identity: string; room: string; role: string };

const mintToken = vi.fn(async (_req: MintArgs) => "fake.jwt.token");
const send = vi.fn(async (_hh: string, _ids: string[], _cmd: unknown) => {});
const connected = vi.fn(async (_hh: string, ids: string[]) => ids);
const eventCreate = vi.fn(async (_args: unknown) => ({ id: "evt_new" }));
const eventUpdate = vi.fn(async (_args: unknown) => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    device: { findMany: findMany([deviceA, deviceB]), findFirst: findFirst([deviceA, deviceB]) },
    zone: { findFirst: findFirst([zoneB]), findMany: findMany([zoneB]) },
    zoneMembership: { findMany: findMany([]) },
    place: { findMany: findMany([placeB]), findFirst: findFirst([placeB]) },
    placeRule: { findMany: findMany([]), findFirst: findFirst([]) },
    intercomEvent: {
      findFirst: findFirst([eventB]),
      findUnique: findFirst([eventB]),
      create: (args: unknown) => eventCreate(args),
      update: (args: unknown) => eventUpdate(args),
    },
  },
}));

vi.mock("@/lib/livekit/token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/livekit/token")>(
    "@/lib/livekit/token",
  );
  return { ...actual, mintToken: (req: MintArgs) => mintToken(req) };
});

vi.mock("@/lib/livekit/control", () => ({
  controlSender: () => ({ send, connected }),
}));

vi.mock("@/lib/auth/context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/context")>(
    "@/lib/auth/context",
  );
  return {
    ...actual,
    requireUser: async () => userA,
    requireAdmin: async () => userA,
    getSessionUser: async () => userA,
    currentHouseholdId: async () => HOUSEHOLD_A,
  };
});

function post(body: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("MOCK_LOCAL_SERVICES", "true");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/page — a caller cannot reach another household", () => {
  it("refuses a device id it does not own, and mints nothing", async () => {
    const { POST } = await import("./page/route");
    const res = await POST(post({ kind: "call", targetDeviceId: deviceB.id }));

    expect(res.status).toBe(404);
    // The real damage was not the 200 — it was the duplex token for
    // `call:dev_b` that came back with it.
    expect(mintToken).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a zone id it does not own", async () => {
    const { POST } = await import("./page/route");
    const res = await POST(post({ kind: "broadcast", targetZoneId: zoneB.id }));

    expect(res.status).toBe(404);
    expect(mintToken).not.toHaveBeenCalled();
  });

  it("allows its own device, and never takes an identity from the body", async () => {
    const { POST } = await import("./page/route");
    const res = await POST(
      post({ kind: "call", targetDeviceId: deviceA.id, initiatorIdentity: deviceA.id }),
    );

    expect(res.status).toBe(200);
    // initiatorIdentity in the body used to become the LiveKit participant
    // identity: sending a device's own id evicted that device from the room.
    const identities = mintToken.mock.calls.map(([req]) => req.identity);
    expect(identities).toContain(`user:${userA.id}`);
    expect(identities.filter((i) => i === deviceA.id)).toHaveLength(1); // the panel's own, not the caller's
  });
});

describe("POST /api/page/hangup — a caller cannot end another household's call", () => {
  it("refuses an event id it does not own", async () => {
    const { POST } = await import("./page/hangup/route");
    const res = await POST(post({ eventId: eventB.id }));

    expect(res.status).toBe(404);
    expect(send).not.toHaveBeenCalled();
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("ignores a device list in the body", async () => {
    const { POST } = await import("./page/hangup/route");
    const res = await POST(
      post({ eventId: eventB.id, deviceIds: [deviceB.id, deviceA.id] }),
    );

    expect(res.status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("GET /api/location/places — reads are scoped", () => {
  it("does not return another household's places", async () => {
    const { GET } = await import("./location/places/route");
    const res = await GET();
    const body = (await res.json()) as { places: { id: string }[] };

    expect(res.status).toBe(200);
    expect(body.places).toEqual([]);
  });
});

describe("GET /api/cron/tick — the schedule endpoint is not open", () => {
  const get = (headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/cron/tick", { headers });

  it("rejects a missing bearer when a secret is set", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const { GET } = await import("./cron/tick/route");
    expect((await GET(get())).status).toBe(401);
  });

  it("rejects a wrong bearer", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const { GET } = await import("./cron/tick/route");
    expect((await GET(get({ authorization: "Bearer nope" }))).status).toBe(401);
  });

  it("refuses to run at all in production with no secret configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("./cron/tick/route");
    // Fails closed: an unset secret used to mean "open", and Vercel stores
    // empty strings.
    expect((await GET(get())).status).toBe(503);
  });
});
