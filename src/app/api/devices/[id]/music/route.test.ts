import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Clean only" is a parent's rule for a panel a child uses, so the whole value
 * of it rests on who may change it. These drive the real handler: a member who
 * is not an admin is turned away, a panel in someone else's household does not
 * exist as far as this caller is concerned, and a change that does land reaches
 * the panel on its next heartbeat rather than a minute later.
 */

const HOUSEHOLD_A = "hh_a";

const admin = { id: "usr_a", householdId: HOUSEHOLD_A, role: "ADMIN" as const };

const devices: Record<string, { id: string; householdId: string; deviceSecret: string; musicCleanOnly: boolean }> = {
  dev_a: { id: "dev_a", householdId: HOUSEHOLD_A, deviceSecret: "secret_a", musicCleanOnly: false },
  dev_b: { id: "dev_b", householdId: "hh_b", deviceSecret: "secret_b", musicCleanOnly: false },
};

const requireAdmin = vi.fn();
const findUnique = vi.fn(async ({ where }: { where: { id: string } }) => devices[where.id] ?? null);
const update = vi.fn(async ({ where, data }: { where: { id: string }; data: { musicCleanOnly: boolean } }) => ({
  id: where.id,
  musicCleanOnly: data.musicCleanOnly,
}));
const forgetSecret = vi.fn(async (_secret: string) => {});

vi.mock("@/lib/auth/context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/context")>("@/lib/auth/context");
  return { ...actual, requireAdmin: () => requireAdmin() };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    device: {
      findUnique: (a: { where: { id: string } }) => findUnique(a),
      update: (a: { where: { id: string }; data: { musicCleanOnly: boolean } }) => update(a),
    },
  },
}));
vi.mock("@/lib/devices/cache", () => ({ forgetSecret: (s: string) => forgetSecret(s) }));

function patch(id: string, body: unknown) {
  const req = new Request(`http://localhost/api/devices/${id}/music`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return import("./route").then(({ PATCH }) => PATCH(req, { params: Promise.resolve({ id }) }));
}

beforeEach(() => {
  requireAdmin.mockResolvedValue(admin);
});

afterEach(() => vi.clearAllMocks());

describe("PATCH /api/devices/:id/music", () => {
  it("refuses anyone who is not a household admin", async () => {
    const { UnauthorizedError } = await import("@/lib/auth/context");
    requireAdmin.mockRejectedValue(new UnauthorizedError("Admin required"));

    const res = await patch("dev_a", { musicCleanOnly: false });

    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
    expect(forgetSecret).not.toHaveBeenCalled();
  });

  it("answers 404 for a panel in another household, and changes nothing", async () => {
    const res = await patch("dev_b", { musicCleanOnly: true });

    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
    expect(forgetSecret).not.toHaveBeenCalled();
  });

  it("rejects a body that is not a boolean", async () => {
    const res = await patch("dev_a", { musicCleanOnly: "yes" });

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("sets the flag and drops the panel's cached row so the next beat carries it", async () => {
    const res = await patch("dev_a", { musicCleanOnly: true });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "dev_a", musicCleanOnly: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dev_a" }, data: { musicCleanOnly: true } }),
    );
    expect(forgetSecret).toHaveBeenCalledWith("secret_a");
  });
});
