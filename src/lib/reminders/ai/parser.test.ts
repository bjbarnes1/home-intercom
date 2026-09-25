import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { ReminderParser } from "./parser";
import { parseFallback } from "./fallback";
import { matchMember, resolveSlots } from "./resolve";
import { emptySlots, type Slots } from "./slots";
import type { Member } from "../types";

vi.mock("@/lib/errors/report", () => ({ reportError: vi.fn(), reportWarning: vi.fn() }));

const TZ = "Australia/Melbourne";
// Friday 25 September 2026, 6 pm.
const NOW = DateTime.fromISO("2026-09-25T18:00", { zone: TZ }).toJSDate();
const members: Member[] = [
  { kind: "user", id: "usr_soph", name: "Soph" },
  { kind: "user", id: "usr_bj", name: "BJ" },
  { kind: "kid", id: "kid_gus", name: "Gus" },
  { kind: "kid", id: "kid_georgette", name: "Georgette" },
  { kind: "kid", id: "kid_willoughby", name: "Willoughby" },
  { kind: "kid", id: "kid_raff", name: "Raff" },
];
const ctx = { now: NOW, timezone: TZ, members };
const local = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toFormat("ccc yyyy-MM-dd HH:mm");

describe("matchMember", () => {
  it("matches nicknames and full names either way round", () => {
    expect(matchMember("Sophia", members).map((m) => m.id)).toEqual(["usr_soph"]);
    expect(matchMember("Rafferty", members).map((m) => m.id)).toEqual(["kid_raff"]);
    expect(matchMember("gus's", members).map((m) => m.id)).toEqual(["kid_gus"]);
    expect(matchMember("Georgete", members).map((m) => m.id)).toEqual(["kid_georgette"]);
    expect(matchMember("Tommy", members)).toEqual([]);
  });
});

describe("resolveSlots — the brief's example", () => {
  it("“Remind Sophia to take out the bins every Tuesday night”", () => {
    const slots: Slots = {
      ...emptySlots("take out the bins"),
      assignee: "Sophia",
      time_kind: "part_of_day",
      part_of_day: "night",
      repeat_kind: "weekly",
      repeat_weekdays: ["tue"],
    };
    const { draft, issues, summary } = resolveSlots(slots, ctx);
    expect(draft).toEqual({
      title: "Take out the bins",
      details: null,
      assignee: { kind: "user", id: "usr_soph", name: "Soph" },
      when: {
        kind: "recurring",
        rule: { freq: "weekly", interval: 1, weekdays: [2], time: "19:30", start: "2026-09-25" },
      },
    });
    expect(issues).toEqual([]);
    expect(summary).toBe("Soph · Every Tuesday at 7:30 pm");
  });
});

describe("resolveSlots — time judgement", () => {
  const once = (s: Partial<Slots>) => resolveSlots({ ...emptySlots("x"), ...s }, ctx);

  it("“at 7” said at 6 pm with no day means 7 pm today", () => {
    const r = once({ time_kind: "clock", hour: 7, minute: 0, hour_ambiguous: true });
    expect(r.draft.when?.kind === "once" && local(r.draft.when.at)).toBe("Fri 2026-09-25 19:00");
  });

  it("“at 4” said at 6 pm with no day rolls to tomorrow morning, not a past time", () => {
    const r = once({ time_kind: "clock", hour: 4, minute: 0, hour_ambiguous: true });
    expect(r.draft.when?.kind === "once" && local(r.draft.when.at)).toBe("Sat 2026-09-26 04:00");
  });

  it("“4pm” said at 6 pm with no day means tomorrow at 4 pm (the old bug fired it at once)", () => {
    const r = once({ time_kind: "clock", hour: 16, minute: 0 });
    expect(r.draft.when?.kind === "once" && local(r.draft.when.at)).toBe("Sat 2026-09-26 16:00");
  });

  it("“tomorrow at 7” means 7 am; “tomorrow at 3” means 3 pm", () => {
    const seven = once({ date_kind: "tomorrow", time_kind: "clock", hour: 7, minute: 0, hour_ambiguous: true });
    const three = once({ date_kind: "tomorrow", time_kind: "clock", hour: 3, minute: 0, hour_ambiguous: true });
    expect(seven.draft.when?.kind === "once" && local(seven.draft.when.at)).toBe("Sat 2026-09-26 07:00");
    expect(three.draft.when?.kind === "once" && local(three.draft.when.at)).toBe("Sat 2026-09-26 15:00");
  });

  it("a named day but no time gets 9 am, and says so", () => {
    const r = once({ date_kind: "weekday", weekday: "mon", weekday_which: "this" });
    expect(r.draft.when?.kind === "once" && local(r.draft.when.at)).toBe("Mon 2026-09-28 09:00");
    expect(r.issues).toContain("No time given, so it's set for 9 am.");
  });

  it("“Friday at 5” said on Friday at 6 pm means next Friday", () => {
    const r = once({ date_kind: "weekday", weekday: "fri", weekday_which: "this", time_kind: "clock", hour: 17, minute: 0 });
    expect(r.draft.when?.kind === "once" && local(r.draft.when.at)).toBe("Fri 2026-10-02 17:00");
  });

  it("no time and no day asks rather than guessing", () => {
    const r = once({});
    expect(r.draft.when).toBeNull();
    expect(r.issues).toContain("When should it go off?");
  });

  it("an unknown person is flagged, not invented", () => {
    const r = once({ assignee: "Tommy", time_kind: "relative", relative_minutes: 20 });
    expect(r.draft.assignee).toBeNull();
    expect(r.issues[0]).toMatch(/Tommy/);
  });

  it("“me” resolves to the signed-in speaker", () => {
    const r = resolveSlots({ ...emptySlots("x"), assignee: "me", time_kind: "relative", relative_minutes: 5 }, { ...ctx, speaker: members[1] });
    expect(r.draft.assignee?.name).toBe("BJ");
  });
});

describe("parseFallback → resolve (offline path)", () => {
  const run = (text: string) => resolveSlots(parseFallback(text), { ...ctx, raw: text });

  it("the brief's example, with no model at all", () => {
    const r = run("Remind Sophia to take out the bins every Tuesday night");
    expect(r.draft.title).toBe("Take out the bins");
    expect(r.draft.assignee?.id).toBe("usr_soph");
    expect(r.draft.when).toEqual({
      kind: "recurring",
      rule: { freq: "weekly", interval: 1, weekdays: [2], time: "19:30", start: "2026-09-25" },
    });
  });

  it("“every 2nd Tuesday” is fortnightly and says so", () => {
    const r = run("remind Gus to put the recycling out every 2nd Tuesday at 7pm");
    expect(r.draft.when).toMatchObject({ kind: "recurring", rule: { freq: "weekly", interval: 2, weekdays: [2], time: "19:00" } });
    expect(r.issues.join(" ")).toMatch(/every other week/);
  });

  it("“the 2nd Tuesday of the month” is monthly", () => {
    const r = run("remind me to pay the swimming club on the 2nd Tuesday of the month at 9am");
    expect(r.draft.when).toMatchObject({ kind: "recurring", rule: { freq: "monthly_nth", nth: 2, weekday: 2, time: "09:00" } });
  });

  it("relative times", () => {
    const r = run("remind Raff to turn the oven off in 20 minutes");
    expect(r.draft.title).toBe("Turn the oven off");
    expect(r.draft.when?.kind === "once" && local(r.draft.when.at)).toBe("Fri 2026-09-25 18:20");
  });

  it("tomorrow + clock", () => {
    const r = run("remind Georgette to take her library book tomorrow at 8:15am");
    expect(r.draft.when?.kind === "once" && local(r.draft.when.at)).toBe("Sat 2026-09-26 08:15");
    expect(r.draft.title).toBe("Take her library book");
  });

  it("weekdays", () => {
    const r = run("remind Willoughby to pack his lunch every weekday at 7:45");
    expect(r.draft.when).toMatchObject({ kind: "recurring", rule: { freq: "weekly", weekdays: [1, 2, 3, 4, 5], time: "07:45" } });
  });

  it("tonight", () => {
    const r = run("remind me to lock the back door tonight");
    expect(r.draft.when?.kind === "once" && local(r.draft.when.at)).toBe("Fri 2026-09-25 19:30");
  });
});

describe("ReminderParser", () => {
  const fakeClient = (input: unknown) => ({
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: "tool_use", id: "t", name: "record_reminder", input }] }),
    },
  });

  it("uses the model's slots, validates them, and resolves in code", async () => {
    const slots: Slots = {
      ...emptySlots("take out the bins"),
      assignee: "Sophia",
      time_kind: "part_of_day",
      part_of_day: "night",
      repeat_kind: "weekly",
      repeat_weekdays: ["tue"],
    };
    const client = fakeClient(slots);
    const parser = new ReminderParser({ client: client as never });
    const out = await parser.parse("Remind Sophia to take out the bins every Tuesday night", ctx);
    expect(out.source).toBe("ai");
    expect(out.summary).toBe("Soph · Every Tuesday at 7:30 pm");

    // The prompt names household members but never carries an id.
    const call = client.messages.create.mock.calls[0][0];
    expect(call.system).toContain("Soph");
    expect(JSON.stringify(call)).not.toContain("usr_soph");
    expect(call.tool_choice).toEqual({ type: "tool", name: "record_reminder" });
  });

  it("falls back to the offline parser when the model returns junk", async () => {
    const parser = new ReminderParser({ client: fakeClient({ title: 42 }) as never });
    const out = await parser.parse("remind Gus to feed the dog at 5pm", ctx);
    expect(out.source).toBe("fallback");
    expect(out.draft.assignee?.name).toBe("Gus");
  });

  it("falls back when the model is unreachable", async () => {
    const client = { messages: { create: vi.fn().mockRejectedValue(new Error("timeout")) } };
    const out = await new ReminderParser({ client: client as never }).parse("remind Gus to feed the dog at 5pm", ctx);
    expect(out.source).toBe("fallback");
  });

  it("works with no model configured at all", async () => {
    const out = await new ReminderParser({ client: null }).parse("remind Gus to feed the dog at 5pm", ctx);
    expect(out.source).toBe("fallback");
    expect(out.draft.when?.kind).toBe("once");
  });
});
