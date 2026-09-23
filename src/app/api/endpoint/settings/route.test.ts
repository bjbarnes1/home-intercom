import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * This route is authenticated by the panel's own device secret, so whatever it
 * accepts can be changed by whoever is standing at the panel. "Clean only" is
 * a parent's rule for exactly that person, which is why it is set through the
 * admin route at /api/devices/:id/music instead. These pin that down: a panel
 * asking to lift it here gets its other settings saved and that one ignored.
 */

const device = {
  id: "dev_kitchen",
  deviceSecret: "secret",
  pairing: "ACTIVE",
  musicCleanOnly: true,
};

const settingsRow = {
  doNotDisturb: false,
  autoAnswer: true,
  chimeEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  hasLeds: false,
  announceDwellSec: 30,
};

const deviceFromRequest = vi.fn();
const update = vi.fn();
const invalidateSecret = vi.fn();

vi.mock("@/lib/auth/context", () => ({ deviceFromRequest: (r: Request) => deviceFromRequest(r) }));
vi.mock("@/lib/prisma", () => ({ prisma: { device: { update: (a: unknown) => update(a) } } }));
vi.mock("@/lib/devices/cache", () => ({ invalidateSecret: (s: string) => invalidateSecret(s) }));

function patch(body: unknown): Request {
  return new Request("http://localhost/api/endpoint/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-device-secret": device.deviceSecret },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  deviceFromRequest.mockResolvedValue(device);
  update.mockImplementation(async ({ data }: { data: object }) => ({ ...settingsRow, ...data }));
});

afterEach(() => vi.clearAllMocks());

describe("PATCH /api/endpoint/settings", () => {
  it("does not let a panel lift its own clean-only setting", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ musicCleanOnly: false, chimeEnabled: false }));

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    const { data } = update.mock.calls[0][0] as { data: Record<string, unknown> };
    // The legitimate part of the request still lands…
    expect(data).toEqual({ chimeEnabled: false });
    // …and the other part never reaches the database.
    expect(data).not.toHaveProperty("musicCleanOnly");
    expect(await res.json()).not.toHaveProperty("musicCleanOnly");
  });

  it("writes nothing clean-only related when that is all the panel asked for", async () => {
    const { PATCH } = await import("./route");
    await PATCH(patch({ musicCleanOnly: false }));

    const { data } = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toEqual({});
  });
});
