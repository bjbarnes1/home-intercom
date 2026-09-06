import { describe, expect, it } from "vitest";
import { PRESENCE_WINDOW_MS, isOnline } from "./snapshot";

describe("isOnline", () => {
  const now = new Date("2026-09-06T05:00:00.000Z");

  it("is false when lastSeenAt is missing", () => {
    expect(isOnline(null, now)).toBe(false);
    expect(isOnline(undefined, now)).toBe(false);
  });

  it("is true inside the presence window", () => {
    const seen = new Date(now.getTime() - PRESENCE_WINDOW_MS + 1);
    expect(isOnline(seen, now)).toBe(true);
  });

  it("is false outside the presence window", () => {
    const seen = new Date(now.getTime() - PRESENCE_WINDOW_MS - 1);
    expect(isOnline(seen, now)).toBe(false);
  });

  it("accepts a numeric now", () => {
    const seen = new Date(now.getTime() - 1_000);
    expect(isOnline(seen, now.getTime())).toBe(true);
  });
});
