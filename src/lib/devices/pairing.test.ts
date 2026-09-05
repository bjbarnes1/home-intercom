import { describe, it, expect } from "vitest";
import {
  generatePairingCode,
  generateDeviceSecret,
  isWellFormedPairingCode,
  isPairingCodeExpired,
  PAIRING_CODE_TTL_MS,
} from "./pairing";

describe("generatePairingCode", () => {
  it("is 6 chars from the unambiguous alphabet (no 0/O/1/I/L)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairingCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]+$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it("is well-formed by its own validator", () => {
    expect(isWellFormedPairingCode(generatePairingCode())).toBe(true);
  });
});

describe("generateDeviceSecret", () => {
  it("is prefixed and long enough to be unguessable", () => {
    const s = generateDeviceSecret();
    expect(s.startsWith("dev_")).toBe(true);
    expect(s.length).toBeGreaterThanOrEqual(40);
  });

  it("is unique across calls", () => {
    const set = new Set(Array.from({ length: 500 }, () => generateDeviceSecret()));
    expect(set.size).toBe(500);
  });
});

describe("isWellFormedPairingCode", () => {
  it("accepts a valid code ignoring surrounding spaces", () => {
    expect(isWellFormedPairingCode("  ABC234 ")).toBe(true);
  });
  it("rejects wrong length", () => {
    expect(isWellFormedPairingCode("ABC23")).toBe(false);
  });
  it("rejects excluded characters", () => {
    expect(isWellFormedPairingCode("ABC01L")).toBe(false);
  });
});

describe("isPairingCodeExpired", () => {
  const issued = new Date("2026-01-01T00:00:00Z");
  it("false within the TTL", () => {
    expect(
      isPairingCodeExpired(issued, new Date(issued.getTime() + PAIRING_CODE_TTL_MS - 1)),
    ).toBe(false);
  });
  it("true past the TTL", () => {
    expect(
      isPairingCodeExpired(issued, new Date(issued.getTime() + PAIRING_CODE_TTL_MS + 1)),
    ).toBe(true);
  });
});
