import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The panel that was handed the music reports back, and the answer goes to
 * the panel that sent it — and only within the household.
 */

const deviceFromRequest = vi.fn();
const findFirst = vi.fn();
const send = vi.fn();

vi.mock("@/lib/auth/context", () => ({ deviceFromRequest: (r: Request) => deviceFromRequest(r) }));
vi.mock("@/lib/prisma", () => ({ prisma: { device: { findFirst: (a: unknown) => findFirst(a) } } }));
vi.mock("@/lib/livekit/control", () => ({
  controlSender: () => ({ send: (...a: unknown[]) => send(...a) }),
}));

const me = { id: "kitchen", householdId: "h1", pairing: "ACTIVE", room: "Kitchen", displayName: "Panel" };
const body = { handoffId: "3f2b9c1e-aaaa", fromDeviceId: "lounge", ok: true };

function post(b: unknown): Request {
  return new Request("http://localhost/api/music/handoff/ack", {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-secret": "s" },
    body: JSON.stringify(b),
  });
}

async function ack(b: unknown) {
  const { POST } = await import("./route");
  return POST(post(b));
}

beforeEach(() => {
  deviceFromRequest.mockResolvedValue(me);
  findFirst.mockResolvedValue({ id: "lounge", pairing: "ACTIVE" });
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/music/handoff/ack", () => {
  it("relays the answer to the panel that sent the handoff", async () => {
    const res = await ack({ ...body, ok: false, error: "Nobody is signed in" });
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledWith("h1", ["lounge"], {
      type: "musicHandoffResult",
      handoffId: body.handoffId,
      ok: false,
      error: "Nobody is signed in",
      to: "Kitchen",
    });
  });

  it("looks the sender up inside this household only", async () => {
    await ack(body);
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "lounge", householdId: "h1" });
  });

  it("refuses a sender that is not a panel here", async () => {
    findFirst.mockResolvedValue(null);
    const res = await ack(body);
    expect(res.status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses an unpaired caller", async () => {
    deviceFromRequest.mockResolvedValue(null);
    const res = await ack(body);
    expect(res.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
});
