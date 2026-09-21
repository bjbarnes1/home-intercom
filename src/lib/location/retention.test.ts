import { describe, it, expect } from "vitest";
import {
  coarsenCoordinate,
  retentionCutoffs,
  COARSEN_AFTER_HOURS,
  DELETE_AFTER_DAYS,
} from "./retention";

describe("coarsenCoordinate", () => {
  it("rounds to three decimal places", () => {
    expect(coarsenCoordinate(-33.8688197)).toBe(-33.869);
    expect(coarsenCoordinate(151.2092955)).toBe(151.209);
  });

  it("rounds rather than truncates, in both hemispheres", () => {
    expect(coarsenCoordinate(-33.8695)).toBe(-33.869);
    expect(coarsenCoordinate(33.8696)).toBe(33.87);
  });

  it("is idempotent — re-coarsening an already coarse value changes nothing", () => {
    const once = coarsenCoordinate(-33.8688197);
    expect(coarsenCoordinate(once)).toBe(once);
  });

  /**
   * The whole point of coarsening: the result must not identify a house. Three
   * decimal places of latitude is ~110m, so a rounded fix can be a street but
   * never a doorstep.
   */
  it("moves a coordinate by no more than about 110m of latitude", () => {
    const exact = -33.8688197;
    const metresPerDegreeLat = 111_320;
    const shift = Math.abs(coarsenCoordinate(exact) - exact) * metresPerDegreeLat;
    expect(shift).toBeLessThan(60); // half a grid cell, worst case
  });

  it("loses precision — a coarsened fix cannot round-trip to the original", () => {
    expect(coarsenCoordinate(-33.8688197)).not.toBe(-33.8688197);
  });
});

describe("retentionCutoffs", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("coarsens anything older than a day", () => {
    expect(retentionCutoffs(now).coarsenBefore.toISOString()).toBe(
      "2026-09-13T12:00:00.000Z",
    );
  });

  it("deletes anything older than a week", () => {
    expect(retentionCutoffs(now).deleteBefore.toISOString()).toBe(
      "2026-09-07T12:00:00.000Z",
    );
  });

  it("always deletes strictly older data than it coarsens", () => {
    const { coarsenBefore, deleteBefore } = retentionCutoffs(now);
    expect(deleteBefore.getTime()).toBeLessThan(coarsenBefore.getTime());
  });

  it("keeps the agreed retention window", () => {
    expect(COARSEN_AFTER_HOURS).toBe(24);
    expect(DELETE_AFTER_DAYS).toBe(7);
  });
});
