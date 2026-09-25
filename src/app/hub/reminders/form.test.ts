import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { applyDraft, blankForm, flipMeridiem, formProblem, formToWhen, stepTime } from "./form";

const TZ = "Australia/Melbourne";
const NOW = DateTime.fromISO("2026-09-25T18:10", { zone: TZ });

describe("reminder form", () => {
  it("starts at the next half hour today", () => {
    const f = blankForm(NOW);
    expect([f.day, f.time, f.mode]).toEqual(["2026-09-25", "18:30", "once"]);
  });

  it("round-trips an AI draft for the bins", () => {
    const draft = {
      title: "Take out the bins",
      details: null,
      assignee: { kind: "user" as const, id: "usr_soph", name: "Soph" },
      when: {
        kind: "recurring" as const,
        rule: { freq: "weekly" as const, interval: 1, weekdays: [2], time: "19:30", start: "2026-09-25" },
      },
    };
    const form = applyDraft(blankForm(NOW), draft, TZ);
    expect(form).toMatchObject({ mode: "repeat", freq: "weekly", weekdays: [2], time: "19:30", assignee: { id: "usr_soph" } });
    expect(formToWhen(form, TZ, NOW)).toEqual(draft.when);
  });

  it("fortnightly and nth-weekday map onto the right rules", () => {
    const base = { ...blankForm(NOW), mode: "repeat" as const, time: "19:00" };
    expect(formToWhen({ ...base, freq: "fortnightly", weekdays: [2] }, TZ, NOW)).toMatchObject({
      rule: { freq: "weekly", interval: 2, weekdays: [2] },
    });
    expect(formToWhen({ ...base, freq: "monthly", monthMode: "nth", nth: 2, nthWeekday: 2 }, TZ, NOW)).toMatchObject({
      rule: { freq: "monthly_nth", nth: 2, weekday: 2 },
    });
  });

  it("a one-off converts in the household timezone, not the panel's", () => {
    const when = formToWhen({ ...blankForm(NOW), day: "2026-09-26", time: "07:00" }, TZ, NOW);
    expect(when).toEqual({ kind: "once", at: "2026-09-26T07:00:00.000+10:00" });
  });

  it("names what blocks Save", () => {
    expect(formProblem(blankForm(NOW), TZ, NOW)).toBe("Give it a name");
    expect(formProblem({ ...blankForm(NOW), title: "x", time: "17:00" }, TZ, NOW)).toBe("That time has passed");
    expect(formProblem({ ...blankForm(NOW), title: "x", mode: "repeat", freq: "weekly", weekdays: [] }, TZ, NOW)).toBe(
      "Pick at least one day",
    );
    expect(formProblem({ ...blankForm(NOW), title: "x" }, TZ, NOW)).toBeNull();
  });

  it("time steppers wrap and flip", () => {
    expect(stepTime("23:45", 30)).toBe("00:15");
    expect(stepTime("00:00", -5)).toBe("23:55");
    expect(flipMeridiem("07:30")).toBe("19:30");
    expect(flipMeridiem("19:30")).toBe("07:30");
  });
});
