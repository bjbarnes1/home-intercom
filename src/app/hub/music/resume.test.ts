import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearResume, readResume, saveResume } from "./resume";

const NOW = 1_700_000_000_000;

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    },
  });
});
afterEach(() => clearResume());

describe("resume point", () => {
  it("comes back with what was playing and where", () => {
    saveResume({ trackIds: ["a", "b", "c"], index: 1, time: 42 });
    expect(readResume(NOW + 1000)).toMatchObject({ trackIds: ["a", "b", "c"], index: 1, time: 42 });
  });

  it("has nothing to say before anything has played", () => {
    expect(readResume()).toBeNull();
  });

  it("refuses to save an empty queue", () => {
    saveResume({ trackIds: [], index: 0, time: 0 });
    expect(readResume()).toBeNull();
  });

  it("forgets a point from yesterday, where picking up mid-song would be odd", () => {
    saveResume({ trackIds: ["a"], index: 0, time: 10 });
    expect(readResume(Date.now() + 13 * 60 * 60 * 1000)).toBeNull();
  });

  it("rejects an index that is not in the queue it saved", () => {
    window.localStorage.setItem(
      "famos.applemusic.resume",
      JSON.stringify({ trackIds: ["a"], index: 5, time: 0, at: Date.now() }),
    );
    expect(readResume()).toBeNull();
  });

  it("survives a corrupted entry without throwing", () => {
    window.localStorage.setItem("famos.applemusic.resume", "not json");
    expect(readResume()).toBeNull();
  });
});
