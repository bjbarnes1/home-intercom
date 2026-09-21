import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearResume, queueDescriptor, readResume, saveResume } from "./resume";

const t = (id: string, type = "songs") => ({ id, type });

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
    saveResume({ tracks: [t("a"), t("b"), t("c")], index: 1, time: 42 });
    expect(readResume(NOW + 1000)).toMatchObject({ index: 1, time: 42 });
    expect(readResume(NOW + 1000)?.tracks.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("has nothing to say before anything has played", () => {
    expect(readResume()).toBeNull();
  });

  it("refuses to save an empty queue", () => {
    saveResume({ tracks: [], index: 0, time: 0 });
    expect(readResume()).toBeNull();
  });

  it("forgets a point from yesterday, where picking up mid-song would be odd", () => {
    saveResume({ tracks: [t("a")], index: 0, time: 10 });
    expect(readResume(Date.now() + 13 * 60 * 60 * 1000)).toBeNull();
  });

  it("rejects an index that is not in the queue it saved", () => {
    window.localStorage.setItem(
      "famos.applemusic.resume",
      JSON.stringify({ tracks: [{ id: "a", type: "songs" }], index: 5, time: 0, at: Date.now() }),
    );
    expect(readResume()).toBeNull();
  });

  it("survives a corrupted entry without throwing", () => {
    window.localStorage.setItem("famos.applemusic.resume", "not json");
    expect(readResume()).toBeNull();
  });
});

describe("queueDescriptor", () => {
  it("asks for catalog songs as songs", () => {
    expect(queueDescriptor([t("1440"), t("1441")])).toEqual({ songs: ["1440", "1441"] });
  });

  it("asks for library tracks the library way", () => {
    // Handing a library id back as a catalog song fails outright, which is how
    // a saved queue came back empty.
    expect(queueDescriptor([t("i.abc", "library-songs")])).toEqual({ "library-songs": ["i.abc"] });
  });

  it("lets the library ones decide a mixed queue", () => {
    const d = queueDescriptor([t("1440"), t("i.abc", "library-songs")]);
    expect(Object.keys(d)).toEqual(["library-songs"]);
  });
});

describe("older saved points", () => {
  it("still reads one written before types were kept", () => {
    window.localStorage.setItem(
      "famos.applemusic.resume",
      JSON.stringify({ trackIds: ["a", "b"], index: 1, time: 5, at: Date.now() }),
    );
    const point = readResume();
    expect(point?.tracks).toEqual([{ id: "a", type: "songs" }, { id: "b", type: "songs" }]);
    expect(point?.index).toBe(1);
  });
});
