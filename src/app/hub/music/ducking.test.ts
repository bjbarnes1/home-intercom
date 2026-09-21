import { describe, expect, it } from "vitest";
import { duckedLevel } from "./useAppleMusic";

/**
 * A broadcast over music you can still hear reads as the house talking. Silence
 * reads as a fault, and people reach for the volume instead of listening — so
 * "down, never off" is the property worth pinning down.
 */
describe("duckedLevel", () => {
  it("pulls the music well down", () => {
    expect(duckedLevel(0.8)).toBeCloseTo(0.2, 5);
  });

  it("never reaches silence, however quiet it already was", () => {
    for (const base of [0, 0.01, 0.05, 0.1, 0.5, 1]) {
      expect(duckedLevel(base)).toBeGreaterThan(0);
    }
  });

  it("never turns quiet music up", () => {
    for (const base of [0.05, 0.2, 0.6, 1]) {
      expect(duckedLevel(base)).toBeLessThanOrEqual(base);
    }
  });

  it("is proportional, so a quiet room stays quieter than a loud one", () => {
    expect(duckedLevel(1)).toBeGreaterThan(duckedLevel(0.5));
  });

  it("stays inside what a volume control accepts", () => {
    for (const base of [0, 0.5, 1]) {
      const v = duckedLevel(base);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
