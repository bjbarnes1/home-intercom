import { describe, expect, it } from "vitest";
import {
  effectiveVolume,
  fadeFactor,
  inQuietHours,
  nextRepeat,
  portableQueue,
  previousRestarts,
  QUIET_HOURS_MAX_VOLUME,
  repeatFromKit,
  repeatToKit,
  sleepDeadline,
  withoutIndex,
} from "./player";

describe("repeat", () => {
  it("cycles off → all → one → off, the order every player uses", () => {
    expect(nextRepeat("none")).toBe("all");
    expect(nextRepeat("all")).toBe("one");
    expect(nextRepeat("one")).toBe("none");
  });

  it("round-trips through MusicKit's numbers", () => {
    const modes = { none: 0, one: 1, all: 2 };
    for (const m of ["none", "all", "one"] as const) {
      expect(repeatFromKit(repeatToKit(m, modes), modes)).toBe(m);
    }
    // And without the global, on v3's shipped values.
    expect(repeatToKit("all")).toBe(2);
    expect(repeatFromKit(1)).toBe("one");
  });
});

describe("previous", () => {
  it("restarts the song once it is more than three seconds in", () => {
    expect(previousRestarts(3.5)).toBe(true);
    expect(previousRestarts(3)).toBe(false);
    expect(previousRestarts(0.4)).toBe(false);
  });
});

describe("removing from the queue", () => {
  const ids = ["a", "b", "c", "d"];

  it("keeps the same song playing when an earlier one goes", () => {
    expect(withoutIndex(ids, 0, 2)).toEqual({ ids: ["b", "c", "d"], startWith: 1, removedCurrent: false });
  });

  it("leaves the playhead alone when a later one goes", () => {
    expect(withoutIndex(ids, 3, 1)).toEqual({ ids: ["a", "b", "c"], startWith: 1, removedCurrent: false });
  });

  it("moves on to the next song when the one playing goes", () => {
    expect(withoutIndex(ids, 1, 1)).toEqual({ ids: ["a", "c", "d"], startWith: 1, removedCurrent: true });
  });

  it("lands on the new last song when the last one playing goes", () => {
    expect(withoutIndex(ids, 3, 3)).toEqual({ ids: ["a", "b", "c"], startWith: 2, removedCurrent: true });
  });

  it("says there is nothing left rather than setting an empty queue", () => {
    expect(withoutIndex(["a"], 0, 0)).toBeNull();
  });
});

describe("what can travel in a handoff", () => {
  it("sends catalog ids, and drops library-only tracks with a count", () => {
    const out = portableQueue(
      [
        { id: "i.1", catalogId: "100", isLibrary: true },
        { id: "i.2", isLibrary: true },
        { id: "300" },
      ],
      0,
    );
    expect(out).toEqual({ ids: ["100", "300"], startIndex: 0, dropped: 1, currentDropped: false });
  });

  it("starts on the next track that can go when the one playing cannot", () => {
    const out = portableQueue(
      [{ id: "100" }, { id: "i.2", isLibrary: true }, { id: "300" }, { id: "400" }],
      1,
    );
    expect(out.ids).toEqual(["100", "300", "400"]);
    expect(out.startIndex).toBe(1);
    expect(out.currentDropped).toBe(true);
  });

  it("keeps the position when everything can go", () => {
    expect(portableQueue([{ id: "1" }, { id: "2" }, { id: "3" }], 2).startIndex).toBe(2);
  });
});

describe("sleep timer", () => {
  it("has no clock deadline for end-of-song", () => {
    expect(sleepDeadline("end", 1000)).toBeNull();
    expect(sleepDeadline(15, 0)).toBe(15 * 60_000);
  });

  it("fades in a straight line over the last seconds", () => {
    expect(fadeFactor(100_000, 0)).toBe(1);
    expect(fadeFactor(12_000, 6_000, 12)).toBeCloseTo(0.5);
    expect(fadeFactor(10_000, 10_000)).toBe(0);
    expect(fadeFactor(10_000, 20_000)).toBe(0);
  });
});

describe("quiet hours", () => {
  it("handles a window that wraps past midnight", () => {
    // 22:00 → 07:00
    expect(inQuietHours(true, 1320, 420, 23 * 60)).toBe(true);
    expect(inQuietHours(true, 1320, 420, 6 * 60)).toBe(true);
    expect(inQuietHours(true, 1320, 420, 12 * 60)).toBe(false);
  });

  it("is off when disabled or unset", () => {
    expect(inQuietHours(false, 1320, 420, 23 * 60)).toBe(false);
    expect(inQuietHours(true, null, 420, 23 * 60)).toBe(false);
  });

  it("caps the volume rather than stopping the music", () => {
    expect(effectiveVolume(0.9, true)).toBe(QUIET_HOURS_MAX_VOLUME);
    expect(effectiveVolume(0.1, true)).toBe(0.1);
    expect(effectiveVolume(0.9, false)).toBe(0.9);
  });
});
