import { z } from "zod";
import { RecurrenceRuleSchema } from "./recurrence";
import { SnoozeRequestSchema } from "./snooze";

/**
 * Shapes shared by the server, the panel and the AI parser. Zod-only, so this
 * file is safe to import from client components.
 */

export const MemberRefSchema = z.object({
  kind: z.enum(["user", "kid"]),
  id: z.string().min(1).max(64),
});
export type MemberRef = z.infer<typeof MemberRefSchema>;

/** A household member a reminder can be for. */
export interface Member extends MemberRef {
  name: string;
}

export const WhenSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), at: z.string().datetime({ offset: true }) }),
  z.object({ kind: z.literal("recurring"), rule: RecurrenceRuleSchema }),
]);
export type When = z.infer<typeof WhenSchema>;

/**
 * A reminder as a person describes it, before anything is stored: what the
 * Creation Modal edits, what the AI parser proposes, and what the create
 * endpoints accept. The parser only ever produces one of these; it never
 * writes a row. A person confirms it first.
 */
export const ReminderDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().max(1000).nullish(),
  assignee: MemberRefSchema.nullish(),
  when: WhenSchema,
});
export type ReminderDraft = z.infer<typeof ReminderDraftSchema>;

export const CreateReminderSchema = ReminderDraftSchema.extend({
  /** Where it rings. Omitted: resolved from the assignee and the panel it was made on. */
  target: z
    .union([z.object({ deviceId: z.string().min(1) }), z.object({ zoneId: z.string().min(1) })])
    .optional(),
});
export type CreateReminderInput = z.infer<typeof CreateReminderSchema>;

export type AgendaStatus = "upcoming" | "due" | "snoozed" | "done" | "dismissed" | "missed";

/** One line on the Daily Agenda. */
export interface AgendaItem {
  /** Stable React key: reminder + slot. */
  key: string;
  reminderId: string;
  /** Present once the slot has fired. Needed to Complete / Snooze. */
  occurrenceId: string | null;
  title: string;
  details: string | null;
  /** ISO instant of the slot. */
  dueAt: string;
  status: AgendaStatus;
  snoozedUntil: string | null;
  assignee: Member | null;
  /** "Every Tuesday at 7:30 pm", or null for a one-off. */
  repeat: string | null;
}

/** An alert that is ringing right now on a panel and wants an answer. */
export interface ActiveAlert {
  occurrenceId: string;
  reminderId: string;
  title: string;
  details: string | null;
  dueAt: string;
  firedAt: string;
  assignee: string | null;
  late: boolean;
  /** The spoken line and its audio, when the alert arrived live. */
  spoken?: string;
  audioUrl?: string;
}

/** Everything a panel needs to render reminders, in one read. */
export interface PanelReminderSnapshot {
  timezone: string;
  /** Local date of the agenda, YYYY-MM-DD. */
  date: string;
  agenda: AgendaItem[];
  alerts: ActiveAlert[];
  members: Member[];
  /** Server clock, so a panel with a drifting RTC can correct "in 5 min". */
  serverNow: string;
}

export const OccurrenceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("dismiss") }),
  z.object({
    action: z.literal("snooze"),
    snooze: SnoozeRequestSchema,
  }),
]);
export type OccurrenceActionInput = z.infer<typeof OccurrenceActionSchema>;
