import { describe, it, expect } from "vitest";
import { renderTemplate, matchingRules, isCoolingDown, type RuleCandidate } from "./rules";

describe("renderTemplate", () => {
  const values = { name: "Willoughby", place: "Home" };

  it("substitutes both placeholders", () => {
    expect(renderTemplate("{name} is at {place}", values)).toBe("Willoughby is at Home");
  });

  it("substitutes a placeholder used more than once", () => {
    expect(renderTemplate("{name}, {name}!", values)).toBe("Willoughby, Willoughby!");
  });

  it("leaves a template with no placeholders alone", () => {
    expect(renderTemplate("Someone's home", values)).toBe("Someone's home");
  });

  /**
   * A typo should read visibly wrong rather than silently speaking half a
   * sentence — "{nmae} is home" spoken as "is home" would be baffling.
   */
  it("leaves an unknown placeholder in place", () => {
    expect(renderTemplate("{nmae} is home", values)).toBe("{nmae} is home");
  });

  it("handles an apostrophe in the surrounding copy", () => {
    expect(renderTemplate("{name}'s home", values)).toBe("Willoughby's home");
  });
});

describe("matchingRules", () => {
  const anyoneHome: RuleCandidate = {
    id: "r1", trigger: "ARRIVE", placeId: "home", subjectUserId: null, enabled: true,
  };
  const willoughbyHome: RuleCandidate = {
    id: "r2", trigger: "ARRIVE", placeId: "home", subjectUserId: "u-will", enabled: true,
  };
  const leftSchool: RuleCandidate = {
    id: "r3", trigger: "DEPART", placeId: "school", subjectUserId: null, enabled: true,
  };
  const disabled: RuleCandidate = {
    id: "r4", trigger: "ARRIVE", placeId: "home", subjectUserId: null, enabled: false,
  };
  const all = [anyoneHome, willoughbyHome, leftSchool, disabled];

  it("matches a rule for this exact person", () => {
    const matched = matchingRules(all, {
      placeId: "home", trigger: "ARRIVE", userId: "u-will",
    });
    expect(matched.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  /** A rule with no subject means anyone in the household. */
  it("matches a subjectless rule for somebody else", () => {
    const matched = matchingRules(all, {
      placeId: "home", trigger: "ARRIVE", userId: "u-raff",
    });
    expect(matched.map((r) => r.id)).toEqual(["r1"]);
  });

  it("ignores the other trigger direction", () => {
    const matched = matchingRules(all, {
      placeId: "home", trigger: "DEPART", userId: "u-will",
    });
    expect(matched).toEqual([]);
  });

  it("ignores another place", () => {
    const matched = matchingRules(all, {
      placeId: "school", trigger: "ARRIVE", userId: "u-will",
    });
    expect(matched).toEqual([]);
  });

  it("never matches a disabled rule", () => {
    const matched = matchingRules([disabled], {
      placeId: "home", trigger: "ARRIVE", userId: "u-will",
    });
    expect(matched).toEqual([]);
  });
});

describe("isCoolingDown", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("is not cooling down when it has never fired", () => {
    expect(isCoolingDown(null, 15, now)).toBe(false);
    expect(isCoolingDown(undefined, 15, now)).toBe(false);
  });

  /** The flapping case this exists for: crossing the boundary twice in a minute. */
  it("suppresses a second fire inside the window", () => {
    const justNow = new Date("2026-09-14T11:59:00.000Z");
    expect(isCoolingDown(justNow, 15, now)).toBe(true);
  });

  it("allows a fire once the window has passed", () => {
    const earlier = new Date("2026-09-14T11:40:00.000Z");
    expect(isCoolingDown(earlier, 15, now)).toBe(false);
  });

  it("allows a fire exactly on the boundary", () => {
    const exactly = new Date("2026-09-14T11:45:00.000Z");
    expect(isCoolingDown(exactly, 15, now)).toBe(false);
  });

  it("treats a zero cooldown as no cooldown at all", () => {
    expect(isCoolingDown(new Date(now), 0, now)).toBe(false);
  });

  /** A clock that jumped backwards must not silence the house indefinitely. */
  it("does not suppress when the last fire is somehow in the future", () => {
    const future = new Date("2026-09-14T13:00:00.000Z");
    expect(isCoolingDown(future, 15, now)).toBe(false);
  });
});
