import Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { reportError, reportWarning } from "@/lib/errors/report";
import type { Member } from "../types";
import { SLOTS_JSON_SCHEMA, SlotsSchema, type Slots } from "./slots";
import { parseFallback } from "./fallback";
import { resolveSlots, type Resolution } from "./resolve";

/**
 * ReminderParser: natural language → a reminder draft.
 *
 *   "Remind Sophia to take out the bins every Tuesday night"
 *        │  1. extract   (Claude, forced tool call, strict schema)
 *        ▼
 *   slots { title: "Take out the bins", assignee: "Sophia",
 *           repeat_kind: "weekly", repeat_weekdays: ["tue"],
 *           time_kind: "part_of_day", part_of_day: "night" }
 *        │  2. validate  (zod — the model's output is untrusted input)
 *        │  3. resolve   (code: members, timezone, household defaults)
 *        ▼
 *   draft { title, assignee: {kind:"user", id, name:"Soph"},
 *           when: { recurring, weekly, [Tue], 19:30, start: today } }
 *        │  4. confirm   (a person, in the Creation Modal)
 *        ▼
 *   createReminder()
 *
 * The model never sees household ids and never produces a time. If it is
 * unconfigured, slow (8 s budget — someone is standing at the panel), down,
 * or returns something invalid, the offline parser fills the same slots and
 * the draft is still made; `source` says which path ran.
 */

export interface ParseContext {
  now: Date;
  timezone: string;
  members: Member[];
  speaker?: Member | null;
}

export interface ParseOutcome extends Resolution {
  source: "ai" | "fallback";
}

export interface ReminderParserOptions {
  /** Injected for tests. `null` forces the offline path. */
  client?: Pick<Anthropic, "messages"> | null;
  model?: string;
  timeoutMs?: number;
}

/**
 * The model the route has used since reminders shipped. Overridable because a
 * parse on a wall panel is latency-bound, and a smaller model is the obvious
 * tuning knob once there are measurements to choose with.
 */
export const DEFAULT_PARSE_MODEL = "claude-opus-5";
const TOOL_NAME = "record_reminder";

export class ReminderParser {
  private readonly client: Pick<Anthropic, "messages"> | null;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: ReminderParserOptions = {}) {
    this.client =
      opts.client !== undefined ? opts.client : process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
    this.model = opts.model ?? process.env.REMINDER_PARSE_MODEL?.trim() ?? DEFAULT_PARSE_MODEL;
    this.timeoutMs = opts.timeoutMs ?? 8_000;
  }

  async parse(text: string, ctx: ParseContext): Promise<ParseOutcome> {
    const input = text.trim().slice(0, 500);
    let slots: Slots | null = null;
    let source: ParseOutcome["source"] = "fallback";

    if (this.client) {
      try {
        slots = await this.extract(input, ctx);
        source = "ai";
      } catch (e) {
        reportError(e, { code: "reminders.parse.ai", route: "ReminderParser" });
      }
    }
    if (!slots) slots = parseFallback(input);

    const resolved = resolveSlots(slots, { ...ctx, raw: input });
    return { ...resolved, source };
  }

  /** Step 1–2: ask the model for slots, and refuse anything off-schema. */
  async extract(text: string, ctx: ParseContext): Promise<Slots> {
    if (!this.client) throw new Error("No model client configured");
    const now = DateTime.fromJSDate(ctx.now, { zone: ctx.timezone || "UTC" });

    const message = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: 1024,
        output_config: { effort: "low" },
        system: systemPrompt(now, ctx.members),
        tools: [
          {
            name: TOOL_NAME,
            description: "Record what the person asked for, as labelled slots.",
            strict: true,
            input_schema: SLOTS_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [{ role: "user", content: text }],
      },
      { timeout: this.timeoutMs },
    );

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("Model did not call the tool");
    const parsed = SlotsSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      reportWarning(new Error("Model slots failed validation"), {
        code: "reminders.parse.invalid_slots",
        route: "ReminderParser",
        issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      throw new Error("Model returned invalid slots");
    }
    return parsed.data;
  }
}

function systemPrompt(now: DateTime, members: Member[]): string {
  return [
    "You read one reminder request from a family's kitchen display and record it with the record_reminder tool.",
    "Record only what the person said. Do not calculate dates or times: say 'tomorrow', 'tue', 'night' as slots and the app works out when that is.",
    "",
    `For context only, it is now ${now.toFormat("cccc d LLLL yyyy, HH:mm")} (${now.zoneName}).`,
    `Household members: ${members.map((m) => m.name).join(", ") || "(none listed)"}. Spell a name as the person said it; the app matches it.`,
    "",
    "Rules:",
    "- title: the task as a short imperative for a screen ('Take out the bins', 'Read your novel'). No name, no time words.",
    "- 'tonight' → date_kind today, part_of_day night. 'this arvo' → afternoon.",
    "- 'at 7' with no am/pm or other clue → hour 7, hour_ambiguous true. 'at 7pm' → hour 19, hour_ambiguous false.",
    "- 'every other Tuesday', 'every second Tuesday', 'every 2nd Tuesday', 'fortnightly on Tuesday' → repeat_kind weekly, repeat_interval 2, repeat_weekdays [tue].",
    "- 'the 2nd Tuesday of the month' → repeat_kind monthly_nth, repeat_nth 2, repeat_weekdays [tue].",
    "- 'every Tuesday night' → repeat_kind weekly, repeat_weekdays [tue], part_of_day night.",
    "- 'on the 15th of every month' → repeat_kind monthly_day, repeat_month_day 15.",
    "- 'remind me' → assignee 'me'. 'remind everyone' → assignee 'everyone'.",
    "- If something truly cannot be settled, leave the slot null and add a short question to ambiguities.",
  ].join("\n");
}
