import { describe, expect, it } from "vitest";
import {
  isInQuietHours,
  minutesToHm,
  parseHmToMinutes,
} from "./quietHours";

describe("parseHmToMinutes", () => {
  it("parses HH:MM", () => {
    expect(parseHmToMinutes("22:00")).toBe(1320);
    expect(parseHmToMinutes("7:30")).toBe(450);
    expect(parseHmToMinutes("00:00")).toBe(0);
  });
  it("rejects invalid", () => {
    expect(parseHmToMinutes("25:00")).toBeNull();
    expect(parseHmToMinutes("ab:cd")).toBeNull();
  });
});

describe("minutesToHm", () => {
  it("formats", () => {
    expect(minutesToHm(1320)).toBe("22:00");
    expect(minutesToHm(450)).toBe("07:30");
  });
});

describe("isInQuietHours", () => {
  it("respects disabled", () => {
    expect(
      isInQuietHours({
        enabled: false,
        startMinutes: 1320,
        endMinutes: 420,
        nowMinutes: 60,
      }),
    ).toBe(false);
  });

  it("handles same-day window", () => {
    expect(
      isInQuietHours({
        enabled: true,
        startMinutes: 540,
        endMinutes: 1020,
        nowMinutes: 600,
      }),
    ).toBe(true);
    expect(
      isInQuietHours({
        enabled: true,
        startMinutes: 540,
        endMinutes: 1020,
        nowMinutes: 500,
      }),
    ).toBe(false);
  });

  it("handles wrap past midnight", () => {
    expect(
      isInQuietHours({
        enabled: true,
        startMinutes: 1320,
        endMinutes: 420,
        nowMinutes: 60,
      }),
    ).toBe(true);
    expect(
      isInQuietHours({
        enabled: true,
        startMinutes: 1320,
        endMinutes: 420,
        nowMinutes: 800,
      }),
    ).toBe(false);
  });
});
