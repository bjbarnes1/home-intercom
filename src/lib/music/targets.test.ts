import { describe, expect, it } from "vitest";
import { toGroups, toTargets, type TargetRow } from "@/lib/music/targets";

const NOW = new Date("2026-09-21T10:00:00Z").getTime();
// Still used for nowPlayingAt, which has its own, longer staleness clock.
const seen = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000);

const row = (over: Partial<TargetRow> & { id: string }): TargetRow => ({
  displayName: over.id,
  room: null,
  hasSpeaker: true,
  musicLinkedAt: new Date(NOW),
  nowPlayingTitle: null,
  nowPlayingArtist: null,
  nowPlayingAt: null,
  ...over,
});

/*
 * Liveness is an argument now rather than a timestamp on the row: it comes
 * from the presence store, which knows a key either exists or has expired.
 * `live(...)` says who is up; anything not named is offline.
 */
const live = (...ids: string[]) => new Set(ids);
const NOBODY: ReadonlySet<string> = new Set();

describe("toTargets", () => {
  it("offers a paired panel that has been seen just now", () => {
    expect(toTargets([row({ id: "kitchen", room: "Kitchen" })], null, live("kitchen"), NOW)).toHaveLength(1);
  });

  it("hides a panel that has gone quiet", () => {
    // Its presence key has expired, so the store does not report it.
    expect(toTargets([row({ id: "lounge" })], null, NOBODY, NOW)).toEqual([]);
  });

  it("hides a panel that has never checked in", () => {
    expect(toTargets([row({ id: "new" })], null, NOBODY, NOW)).toEqual([]);
  });

  it("hides a device with no speaker", () => {
    expect(toTargets([row({ id: "display", hasSpeaker: false })], null, live("display"), NOW)).toEqual([]);
  });

  it("puts the device doing the asking first", () => {
    const targets = toTargets(
      [row({ id: "a", room: "Attic" }), row({ id: "z", room: "Zebra room" })],
      "z",
      live("a", "z"),
      NOW,
    );
    expect(targets.map((t) => t.id)).toEqual(["z", "a"]);
    expect(targets[0].isSelf).toBe(true);
  });

  it("orders the rest by room so the list does not reshuffle", () => {
    const targets = toTargets(
      [row({ id: "3", room: "Rumpus" }), row({ id: "1", room: "Kitchen" }), row({ id: "2", room: "Lounge" })],
      null,
      live("1", "2", "3"),
      NOW,
    );
    expect(targets.map((t) => t.where)).toEqual(["Kitchen", "Lounge", "Rumpus"]);
  });

  it("says whether music can land on a panel", () => {
    const [linked, bare] = [
      toTargets([row({ id: "a" })], null, live("a"), NOW)[0],
      toTargets([row({ id: "b", musicLinkedAt: null })], null, live("b"), NOW)[0],
    ];
    expect(linked.canPlay).toBe(true);
    // Awake and audible, but nobody has signed in to Apple Music on it, so a
    // handoff has nowhere to go — it is still listed, because it takes calls.
    expect(bare.canPlay).toBe(false);
    expect(bare.online).toBe(true);
  });

  it("says what a panel is playing", () => {
    const t = toTargets(
      [row({ id: "a", nowPlayingTitle: "Golden Hour", nowPlayingArtist: "JVKE", nowPlayingAt: seen(5) })],
      null,
      live("a"),
      NOW,
    )[0];
    expect(t.playing).toEqual({ title: "Golden Hour", artist: "JVKE" });
  });

  it("forgets a song nobody has confirmed lately", () => {
    // The panel is still awake — presence and playback go stale on different
    // clocks, and last night's song on screen is worse than saying nothing.
    const t = toTargets(
      [row({ id: "a", nowPlayingTitle: "Golden Hour", nowPlayingAt: seen(600) })],
      null,
      live("a"),
      NOW,
    )[0];
    expect(t.online).toBe(true);
    expect(t.playing).toBeNull();
  });

  it("says nothing when a panel has never reported", () => {
    expect(toTargets([row({ id: "a" })], null, live("a"), NOW)[0].playing).toBeNull();
  });

  it("falls back to the panel's own name when it has no room", () => {
    expect(toTargets([row({ id: "x", displayName: "Hub", room: null })], null, live("x"), NOW)[0].where).toBe("Hub");
  });
});

describe("toGroups", () => {
  const online = new Set(["a", "b"]);

  it("narrows a group to the members that are online", () => {
    const groups = toGroups([{ id: "z", name: "Whole house", deviceIds: ["a", "b", "offline"] }], online);
    expect(groups[0].deviceIds).toEqual(["a", "b"]);
  });

  it("drops a group whose speakers are all asleep", () => {
    expect(toGroups([{ id: "z", name: "Upstairs", deviceIds: ["offline"] }], online)).toEqual([]);
  });

  it("drops a group that is down to one speaker, which is just that speaker", () => {
    expect(toGroups([{ id: "z", name: "Downstairs", deviceIds: ["a", "gone"] }], online)).toEqual([]);
  });

  it("sorts groups by name", () => {
    const groups = toGroups(
      [
        { id: "1", name: "Upstairs", deviceIds: ["a", "b"] },
        { id: "2", name: "Downstairs", deviceIds: ["a", "b"] },
      ],
      online,
    );
    expect(groups.map((g) => g.name)).toEqual(["Downstairs", "Upstairs"]);
  });
});
