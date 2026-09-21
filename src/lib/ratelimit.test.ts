import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The throttle's two behaviours that matter operationally: it refuses when the
 * allowance is spent, and it lets everyone through when the store is down.
 *
 * The second is the one worth pinning. Failing closed here would mean an
 * Upstash outage locks every household out of their own house, which is a far
 * worse day than the password guessing this slows down.
 */

const limit = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(_opts: unknown) {}
  },
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    constructor(_opts: unknown) {}
    limit(key: string) {
      return limit(key);
    }
    static slidingWindow(_n: number, _w: string) {
      return {};
    }
  }
  return { Ratelimit };
});

const reportWarning = vi.fn();
vi.mock("@/lib/errors/report", () => ({
  reportWarning: (...a: unknown[]) => reportWarning(...a),
  reportError: vi.fn(),
}));

async function fresh() {
  vi.resetModules();
  return import("./ratelimit");
}

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
  limit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for, which is the client", async () => {
    const { clientIp } = await fresh();
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" },
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to a constant", async () => {
    const { clientIp } = await fresh();
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "198.51.100.4" } }))).toBe(
      "198.51.100.4",
    );
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("throttleLogin", () => {
  it("checks the IP and the account separately", async () => {
    const { throttleLogin } = await fresh();
    await throttleLogin("203.0.113.7", "Dad@Example.com");

    const keys = limit.mock.calls.map(([k]) => k);
    expect(keys).toContain("203.0.113.7");
    // Lower-cased, or the same account under a different capitalisation would
    // get a fresh bucket for free.
    expect(keys).toContain("dad@example.com");
  });

  it("refuses when either bucket is spent, and reports the longer wait", async () => {
    const { throttleLogin } = await fresh();
    const now = Date.now();
    limit
      .mockResolvedValueOnce({ success: true, reset: now + 1_000 })
      .mockResolvedValueOnce({ success: false, reset: now + 30_000 });

    const verdict = await throttleLogin("203.0.113.7", "dad@example.com");
    expect(verdict.ok).toBe(false);
    expect(verdict.retryAfterSec).toBeGreaterThanOrEqual(29);
    expect(verdict.retryAfterSec).toBeLessThanOrEqual(31);
  });

  it("never reports a retry-after below one second", async () => {
    const { throttleLogin } = await fresh();
    limit.mockResolvedValue({ success: false, reset: Date.now() - 5_000 });
    const verdict = await throttleLogin("203.0.113.7", "dad@example.com");
    expect(verdict.retryAfterSec).toBe(1);
  });
});

describe("when the store is unavailable", () => {
  it("allows the request through and says so", async () => {
    const { throttleLogin } = await fresh();
    limit.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(throttleLogin("203.0.113.7", "dad@example.com")).resolves.toEqual({
      ok: true,
      retryAfterSec: 0,
    });
    expect(reportWarning).toHaveBeenCalled();
  });

  it("allows the request through when Upstash was never configured", async () => {
    vi.unstubAllEnvs();
    const { throttleClaim } = await fresh();

    await expect(throttleClaim("203.0.113.7")).resolves.toEqual({
      ok: true,
      retryAfterSec: 0,
    });
    expect(limit).not.toHaveBeenCalled();
  });

  it("accepts Vercel's KV_REST_API_* names as well as Upstash's own", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    const { throttleClaim } = await fresh();

    await throttleClaim("203.0.113.7");
    expect(limit).toHaveBeenCalledWith("203.0.113.7");
  });
});

describe("tooManyRequests", () => {
  it("is a 429 carrying Retry-After", async () => {
    const { tooManyRequests } = await fresh();
    const res = tooManyRequests({ ok: false, retryAfterSec: 42 }, "Slow down");

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    await expect(res.json()).resolves.toEqual({ error: "Slow down" });
  });
});
