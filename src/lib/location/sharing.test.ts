import { describe, it, expect } from "vitest";
import { resolveSharing, allowsFullPrecision } from "./sharing";

const now = new Date("2026-09-14T12:00:00.000Z");

describe("resolveSharing", () => {
  it("treats a missing row as off", () => {
    expect(resolveSharing(null, now)).toEqual({
      mode: "OFF",
      liveUntil: null,
      reporting: false,
    });
  });

  it("does not report when sharing is off", () => {
    const state = resolveSharing({ mode: "OFF", liveUntil: null }, now);
    expect(state.reporting).toBe(false);
  });

  it("reports places when sharing places", () => {
    const state = resolveSharing({ mode: "PLACES", liveUntil: null }, now);
    expect(state).toEqual({ mode: "PLACES", liveUntil: null, reporting: true });
  });

  it("keeps a live share live until its expiry", () => {
    const liveUntil = new Date("2026-09-14T12:30:00.000Z");
    expect(resolveSharing({ mode: "LIVE", liveUntil }, now).mode).toBe("LIVE");
  });

  /**
   * The point of server-side expiry: a phone that went offline mid-share and
   * never saw the clock run out must not keep broadcasting precise positions.
   */
  it("demotes an expired live share to places", () => {
    const liveUntil = new Date("2026-09-14T11:59:59.000Z");
    const state = resolveSharing({ mode: "LIVE", liveUntil }, now);
    expect(state.mode).toBe("PLACES");
    expect(state.liveUntil).toBeNull();
    // Still sharing — only the precision was temporary.
    expect(state.reporting).toBe(true);
  });

  it("demotes a live share with no expiry set at all", () => {
    expect(resolveSharing({ mode: "LIVE", liveUntil: null }, now).mode).toBe("PLACES");
  });

  it("expires exactly on the boundary rather than a moment after", () => {
    const state = resolveSharing({ mode: "LIVE", liveUntil: new Date(now) }, now);
    expect(state.mode).toBe("PLACES");
  });
});

describe("allowsFullPrecision", () => {
  it("only a running live share keeps full precision", () => {
    const live = resolveSharing(
      { mode: "LIVE", liveUntil: new Date("2026-09-14T12:30:00.000Z") },
      now,
    );
    expect(allowsFullPrecision(live)).toBe(true);
  });

  it("places sharing does not", () => {
    expect(allowsFullPrecision(resolveSharing({ mode: "PLACES", liveUntil: null }, now))).toBe(
      false,
    );
  });

  it("an expired live share does not", () => {
    const expired = resolveSharing(
      { mode: "LIVE", liveUntil: new Date("2026-09-14T11:00:00.000Z") },
      now,
    );
    expect(allowsFullPrecision(expired)).toBe(false);
  });
});
