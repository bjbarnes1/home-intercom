import { describe, it, expect } from "vitest";
import { resolveTargets, type DeviceSnapshot } from "./resolve";

const devices: DeviceSnapshot[] = [
  { id: "ada", online: true, doNotDisturb: false },
  { id: "ben", online: false, doNotDisturb: false },
  { id: "lounge", online: true, doNotDisturb: true },
  { id: "rumpus", online: true, doNotDisturb: false },
];

const zones: Record<string, string[]> = {
  kids: ["ada", "ben"],
  downstairs: ["lounge", "rumpus"],
  all: ["ada", "ben", "lounge", "rumpus"],
  dupe: ["ada", "ada", "rumpus"],
};

describe("resolveTargets", () => {
  it("resolves a single device target", () => {
    const r = resolveTargets({ deviceId: "ada" }, devices, zones);
    expect(r.targets).toEqual(["ada"]);
  });

  it("resolves a zone to its members", () => {
    const r = resolveTargets({ zoneId: "kids" }, devices, zones);
    expect(r.targets.sort()).toEqual(["ada", "ben"]);
  });

  it("suppresses Do-Not-Disturb devices by default", () => {
    const r = resolveTargets({ zoneId: "downstairs" }, devices, zones);
    expect(r.targets).toEqual(["rumpus"]);
    expect(r.suppressedByDnd).toEqual(["lounge"]);
  });

  it("can include DND devices when told to", () => {
    const r = resolveTargets({ zoneId: "downstairs" }, devices, zones, {
      respectDoNotDisturb: false,
    });
    expect(r.targets.sort()).toEqual(["lounge", "rumpus"]);
  });

  it("separates offline devices when onlineOnly is set", () => {
    const r = resolveTargets({ zoneId: "kids" }, devices, zones, { onlineOnly: true });
    expect(r.targets).toEqual(["ada"]);
    expect(r.offline).toEqual(["ben"]);
  });

  it("dedupes repeated members", () => {
    const r = resolveTargets({ zoneId: "dupe" }, devices, zones);
    expect(r.targets.sort()).toEqual(["ada", "rumpus"]);
  });

  it("excludes the initiator device", () => {
    const r = resolveTargets({ zoneId: "all" }, devices, zones, {
      excludeDeviceId: "ada",
      respectDoNotDisturb: false,
    });
    expect(r.targets).not.toContain("ada");
    expect(r.targets.sort()).toEqual(["ben", "lounge", "rumpus"]);
  });

  it("ignores unknown device ids in a zone", () => {
    const r = resolveTargets({ zoneId: "ghosts" }, devices, { ghosts: ["nope"] });
    expect(r.targets).toEqual([]);
  });

  it("throws when neither or both target fields are set", () => {
    expect(() => resolveTargets({}, devices, zones)).toThrow();
    expect(() =>
      resolveTargets({ deviceId: "ada", zoneId: "kids" }, devices, zones),
    ).toThrow();
  });
});
