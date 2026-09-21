import { describe, expect, it } from "vitest";
import { indexAfterMove, reorder } from "@/lib/music/reorder";

const Q = ["a", "b", "c", "d"];

describe("reorder", () => {
  it("moves a track down the queue", () => {
    expect(reorder(Q, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a track up the queue", () => {
    expect(reorder(Q, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("does nothing when it lands where it started", () => {
    expect(reorder(Q, 2, 2)).toEqual(Q);
  });

  it("drops past the end at the end, rather than losing the track", () => {
    expect(reorder(Q, 0, 99)).toEqual(["b", "c", "d", "a"]);
  });

  it("ignores a move from outside the queue", () => {
    expect(reorder(Q, 9, 0)).toEqual(Q);
    expect(reorder(Q, -1, 0)).toEqual(Q);
  });

  it("never loses or duplicates a track", () => {
    for (let from = 0; from < Q.length; from++) {
      for (let to = 0; to < Q.length; to++) {
        expect([...reorder(Q, from, to)].sort()).toEqual([...Q].sort());
      }
    }
  });

  it("leaves the original alone", () => {
    const original = [...Q];
    reorder(Q, 0, 3);
    expect(Q).toEqual(original);
  });
});

describe("indexAfterMove", () => {
  /**
   * The property that matters: whatever was playing must still be playing.
   * Checked against the arrays themselves for every possible move.
   */
  it("always still points at the track that was playing", () => {
    for (let current = 0; current < Q.length; current++) {
      for (let from = 0; from < Q.length; from++) {
        for (let to = 0; to < Q.length; to++) {
          const moved = reorder(Q, from, to);
          expect(moved[indexAfterMove(current, from, to)]).toBe(Q[current]);
        }
      }
    }
  });

  it("follows the playing track when it is the one dragged", () => {
    expect(indexAfterMove(1, 1, 3)).toBe(3);
  });

  it("shifts up when something above it moves below", () => {
    expect(indexAfterMove(2, 0, 3)).toBe(1);
  });

  it("shifts down when something below it moves above", () => {
    expect(indexAfterMove(1, 3, 0)).toBe(2);
  });

  it("stays put when the move happens entirely elsewhere", () => {
    expect(indexAfterMove(0, 2, 3)).toBe(0);
    expect(indexAfterMove(3, 0, 1)).toBe(3);
  });

  it("resumes the copy that was playing when the queue holds a song twice", () => {
    const dupes = ["a", "b", "a", "c"];
    // Playing the SECOND "a" at index 2; drag "c" to the front.
    const after = reorder(dupes, 3, 0);
    const at = indexAfterMove(2, 3, 0);
    expect(after).toEqual(["c", "a", "b", "a"]);
    // Index 3, the second "a" — not index 1, which an id lookup would have found.
    expect(at).toBe(3);
  });
});
