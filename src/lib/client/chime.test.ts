import { describe, expect, it } from "vitest";
import { CHIME, chimeDuration } from "@/lib/client/chime";

/**
 * The sound itself cannot be asserted, but the things that would make it wrong
 * on a kitchen wall can be.
 */
describe("the announcement chime", () => {
  it("rises, which is what makes it read as upbeat", () => {
    for (let i = 1; i < CHIME.length; i++) {
      expect(CHIME[i].freq).toBeGreaterThan(CHIME[i - 1].freq);
    }
  });

  it("starts each note after the one before it", () => {
    for (let i = 1; i < CHIME.length; i++) {
      expect(CHIME[i].at).toBeGreaterThan(CHIME[i - 1].at);
    }
  });

  it("overlaps its notes, so it rings rather than clicks along", () => {
    for (let i = 1; i < CHIME.length; i++) {
      const previousEnds = CHIME[i - 1].at + CHIME[i - 1].decay;
      expect(CHIME[i].at).toBeLessThan(previousEnds);
    }
  });

  it("finishes on the octave of the note it started on", () => {
    expect(CHIME[CHIME.length - 1].freq / CHIME[0].freq).toBeCloseTo(2, 1);
  });

  it("stays out of the range that is shrill on a small speaker", () => {
    for (const n of CHIME) {
      expect(n.freq).toBeGreaterThan(400);
      expect(n.freq).toBeLessThan(1400);
    }
  });

  it("is a throat-clear, not a ringtone", () => {
    // Long enough to be heard as a phrase, short enough that the voice is not
    // kept waiting behind it.
    expect(chimeDuration()).toBeGreaterThan(0.5);
    expect(chimeDuration()).toBeLessThan(1);
  });

  it("keeps every note inside a usable level", () => {
    for (const n of CHIME) {
      expect(n.level).toBeGreaterThan(0);
      expect(n.level).toBeLessThanOrEqual(1);
    }
  });
});
