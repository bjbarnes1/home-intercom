import { describe, expect, it } from "vitest";
import {
  DEFAULT_TUNING,
  median,
  resolveRoom,
  shouldFollow,
  strengths,
  type Sighting,
} from "@/lib/ble/room";

const NOW = 1_700_000_000_000;

/** n samples of a beacon at a given strength, all just heard. */
const seen = (beaconId: string, rssi: number, count = 3, ageMs = 0): Sighting[] =>
  Array.from({ length: count }, () => ({ beaconId, rssi, at: NOW - ageMs }));

describe("median", () => {
  it("ignores a single wild sample", () => {
    expect(median([-70, -71, -20, -69, -70])).toBe(-70);
  });

  it("averages the middle pair when there is no middle", () => {
    expect(median([-70, -60])).toBe(-65);
  });

  it("is negative infinity with nothing to go on", () => {
    expect(median([])).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("strengths", () => {
  it("drops sightings that have gone stale", () => {
    const old = seen("kitchen", -60, 3, DEFAULT_TUNING.freshMs + 1);
    expect(strengths(old, NOW).size).toBe(0);
  });

  it("drops a signal too weak to mean a room", () => {
    expect(strengths(seen("kitchen", -99), NOW).size).toBe(0);
  });

  it("keeps one median per beacon", () => {
    const s = [...seen("kitchen", -60), ...seen("lounge", -80)];
    const out = strengths(s, NOW);
    expect(out.get("kitchen")).toBe(-60);
    expect(out.get("lounge")).toBe(-80);
  });
});

describe("resolveRoom", () => {
  it("says nothing when nothing is audible", () => {
    expect(resolveRoom([], null, NOW)).toBeNull();
    expect(resolveRoom([], "kitchen", NOW)).toBeNull();
  });

  it("takes the only room it can hear", () => {
    expect(resolveRoom(seen("kitchen", -62), null, NOW)).toBe("kitchen");
  });

  it("picks the nearer of two when it has no opinion yet", () => {
    const s = [...seen("kitchen", -55), ...seen("lounge", -78)];
    expect(resolveRoom(s, null, NOW)).toBe("kitchen");
  });

  it("stays put in a doorway, where neither room is clearly nearer", () => {
    // Lounge is 3 dB stronger — inside the noise floor of standing still.
    const s = [...seen("kitchen", -70), ...seen("lounge", -67)];
    expect(resolveRoom(s, "kitchen", NOW)).toBe("kitchen");
  });

  it("follows once somewhere else is clearly nearer", () => {
    const s = [...seen("kitchen", -78), ...seen("lounge", -60)];
    expect(resolveRoom(s, "kitchen", NOW)).toBe("lounge");
  });

  it("moves exactly at the margin, not a decibel before", () => {
    const below = [...seen("kitchen", -70), ...seen("lounge", -70 + DEFAULT_TUNING.marginDb - 1)];
    const at = [...seen("kitchen", -70), ...seen("lounge", -70 + DEFAULT_TUNING.marginDb)];
    expect(resolveRoom(below, "kitchen", NOW)).toBe("kitchen");
    expect(resolveRoom(at, "kitchen", NOW)).toBe("lounge");
  });

  it("moves when the room they were in has gone silent", () => {
    expect(resolveRoom(seen("lounge", -80), "kitchen", NOW)).toBe("lounge");
  });

  it("does not flap while the reading wobbles around the margin", () => {
    // Five passes walking the hallway, lounge creeping up but never clearly.
    let room: string | null = "kitchen";
    for (const loungeRssi of [-74, -71, -73, -70, -72]) {
      room = resolveRoom([...seen("kitchen", -70), ...seen("lounge", loungeRssi)], room, NOW);
      expect(room).toBe("kitchen");
    }
  });

  it("is not fooled by one spike from the next room", () => {
    const s = [
      ...seen("kitchen", -70),
      { beaconId: "lounge", rssi: -40, at: NOW },
      { beaconId: "lounge", rssi: -85, at: NOW },
      { beaconId: "lounge", rssi: -84, at: NOW },
    ];
    expect(resolveRoom(s, "kitchen", NOW)).toBe("kitchen");
  });

  it("keeps the current room on an exact tie", () => {
    const s = [...seen("kitchen", -70), ...seen("lounge", -70)];
    expect(resolveRoom(s, "lounge", NOW)).toBe("lounge");
  });
});

describe("shouldFollow", () => {
  it("follows a real move", () => {
    expect(shouldFollow("kitchen", "lounge")).toBe(true);
  });

  it("does nothing when they have not moved", () => {
    expect(shouldFollow("kitchen", "kitchen")).toBe(false);
  });

  it("follows the first fix of the day", () => {
    expect(shouldFollow(null, "kitchen")).toBe(true);
  });

  it("never treats a lost signal as a move", () => {
    // A phone face-down on a sofa stops being heard. Stopping the music for
    // that would be the worst thing this feature could do.
    expect(shouldFollow("kitchen", null)).toBe(false);
  });
});
