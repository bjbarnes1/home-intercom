import { describe, expect, it } from "vitest";
import {
  ANNOUNCE_DWELL_DEFAULT,
  clampAnnounceDwellSec,
} from "./announceDwell";

describe("clampAnnounceDwellSec", () => {
  it("defaults invalid values", () => {
    expect(clampAnnounceDwellSec(NaN)).toBe(ANNOUNCE_DWELL_DEFAULT);
  });
  it("clamps to range", () => {
    expect(clampAnnounceDwellSec(1)).toBe(5);
    expect(clampAnnounceDwellSec(200)).toBe(120);
    expect(clampAnnounceDwellSec(30)).toBe(30);
    expect(clampAnnounceDwellSec(45.6)).toBe(46);
  });
});
