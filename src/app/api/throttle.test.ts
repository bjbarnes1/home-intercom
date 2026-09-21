import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * That the throttle is actually wired into the two unauthenticated doors, and
 * wired in BEFORE the work it is meant to protect.
 *
 * Placement is the part that goes quietly wrong: a limiter checked after the
 * user lookup and the scrypt still returns 429, but it has already spent the
 * database round trip and ~70ms of KDF on every request in the flood, which is
 * most of what the attacker wanted.
 */

const throttleLogin = vi.fn();
const throttleClaim = vi.fn();

vi.mock("@/lib/ratelimit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ratelimit")>(
    "@/lib/ratelimit",
  );
  return {
    ...actual,
    throttleLogin: (...a: unknown[]) => throttleLogin(...a),
    throttleClaim: (...a: unknown[]) => throttleClaim(...a),
  };
});

const userFindUnique = vi.fn();
const deviceFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    device: { findUnique: (a: unknown) => deviceFindUnique(a), update: vi.fn() },
  },
}));

const verifyPassword = vi.fn();
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (...a: unknown[]) => verifyPassword(...a),
}));

function post(body: unknown, ip = "203.0.113.7"): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const BLOCKED = { ok: false, retryAfterSec: 42 };
const ALLOWED = { ok: true, retryAfterSec: 0 };

beforeEach(() => {
  throttleLogin.mockResolvedValue(ALLOWED);
  throttleClaim.mockResolvedValue(ALLOWED);
  userFindUnique.mockResolvedValue(null);
  deviceFindUnique.mockResolvedValue(null);
  verifyPassword.mockResolvedValue(false);
});

afterEach(() => vi.clearAllMocks());

describe("POST /api/auth/login", () => {
  it("answers 429 with Retry-After once the allowance is spent", async () => {
    throttleLogin.mockResolvedValue(BLOCKED);
    const { POST } = await import("./auth/login/route");
    const res = await POST(post({ email: "dad@example.com", password: "hunter22" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
  });

  it("does not touch the database or the KDF once blocked", async () => {
    throttleLogin.mockResolvedValue(BLOCKED);
    const { POST } = await import("./auth/login/route");
    await POST(post({ email: "dad@example.com", password: "hunter22" }));

    expect(userFindUnique).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("throttles on the client IP and the target account", async () => {
    const { POST } = await import("./auth/login/route");
    await POST(post({ email: "dad@example.com", password: "hunter22" }, "198.51.100.9"));

    expect(throttleLogin).toHaveBeenCalledWith("198.51.100.9", "dad@example.com");
  });

  it("still reaches the credential check when allowed", async () => {
    const { POST } = await import("./auth/login/route");
    const res = await POST(post({ email: "dad@example.com", password: "hunter22" }));

    expect(userFindUnique).toHaveBeenCalled();
    expect(res.status).toBe(401); // no such user, generic failure
  });
});

describe("POST /api/devices/claim", () => {
  it("answers 429 once the allowance is spent, without a lookup", async () => {
    throttleClaim.mockResolvedValue(BLOCKED);
    const { POST } = await import("./devices/claim/route");
    const res = await POST(post({ code: "H7K2M9" }));

    expect(res.status).toBe(429);
    expect(deviceFindUnique).not.toHaveBeenCalled();
  });

  it("does not spend the allowance on a malformed code", async () => {
    const { POST } = await import("./devices/claim/route");
    // Rejected by shape before the throttle, so typing rubbish into the pairing
    // box cannot lock a household out of pairing its own panel.
    const res = await POST(post({ code: "nope" }));

    expect(res.status).toBe(400);
    expect(throttleClaim).not.toHaveBeenCalled();
  });
});
