import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/errors/report";
import { computeNextRun } from "./schedule";
import { parseRecurrence } from "./recurrence";
import { ALERT_TTL_MS, planSeriesFire } from "./policy";
import { seriesStatusAfter, type ReminderStatus } from "./lifecycle";
import { notifyHousehold } from "./bus";
import {
  DELIVERABLE_SELECT,
  HouseholdContext,
  deliverOccurrence,
  type DeliverableReminder,
} from "./deliver";

/**
 * One pass of the reminder scheduler. Idempotent and safe to run concurrently
 * with itself: Vercel Cron and an in-process scheduler can both call this on
 * the same database and nothing fires twice. Three guards make that true:
 *
 *  1. **Optimistic claim on the series.** `nextRunAt` only advances where it
 *     still equals the value this pass read. The loser of a race gets count 0
 *     and moves on.
 *  2. **One occurrence per slot.** `@@unique([reminderId, scheduledFor])`: even
 *     a claim that somehow succeeded twice cannot create a second occurrence.
 *  3. **Optimistic claim on snoozes.** A snoozed occurrence re-fires only where
 *     its `snoozedUntil` is still the value read, so a user re-snoozing at the
 *     same moment wins cleanly.
 *
 * Work is partitioned by household and households run with bounded
 * concurrency, so one house with a slow TTS call does not hold up every other
 * house's reminders behind it (the old loop was serial across all tenants).
 */

export interface TickResult {
  /** Series slots found due. */
  due: number;
  /** Occurrences surfaced on at least one panel. */
  delivered: number;
  /** Fired, but no panel was connected to hear it. */
  missed: number;
  /** Too late to announce; recorded as missed without speaking. */
  skipped: number;
  /** Snoozed occurrences brought back. */
  refired: number;
  /** Unanswered alerts closed for age. */
  expired: number;
}

const BATCH = 200;
const HOUSEHOLD_CONCURRENCY = 4;

type SeriesRow = DeliverableReminder & {
  kind: "ONE_OFF" | "RECURRING";
  cron: string | null;
  recurrence: Prisma.JsonValue;
  runAt: Date | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: Date | null;
};

export async function runReminderTick(now: Date = new Date()): Promise<TickResult> {
  const result: TickResult = { due: 0, delivered: 0, missed: 0, skipped: 0, refired: 0, expired: 0 };
  const ctx = new HouseholdContext(now);

  result.expired = await expireStaleAlerts(now);
  await refireSnoozed(now, ctx, result);

  const due = (await prisma.reminder.findMany({
    where: { enabled: true, nextRunAt: { not: null, lte: now } },
    select: DELIVERABLE_SELECT,
    orderBy: { nextRunAt: "asc" },
    take: BATCH,
  })) as SeriesRow[];
  result.due = due.length;

  const byHousehold = new Map<string, SeriesRow[]>();
  for (const r of due) {
    const list = byHousehold.get(r.householdId) ?? [];
    list.push(r);
    byHousehold.set(r.householdId, list);
  }

  await runPool([...byHousehold.values()], HOUSEHOLD_CONCURRENCY, async (rows) => {
    // Within a household, in slot order: the house hears them in the order
    // they were meant for.
    for (const r of rows) {
      try {
        await fireSeriesSlot(r, now, ctx, result);
      } catch (e) {
        reportError(e, { code: "reminders.tick.slot", route: "runReminderTick", reminderId: r.id });
      }
    }
  });

  return result;
}

async function fireSeriesSlot(r: SeriesRow, now: Date, ctx: HouseholdContext, result: TickResult) {
  const scheduledFor = r.nextRunAt!;
  const next = computeNextRun(
    {
      kind: r.kind,
      enabled: r.enabled,
      cron: r.cron,
      recurrence: parseRecurrence(r.recurrence),
      runAt: r.runAt,
      timezone: r.timezone,
      snoozedUntil: null,
      lastRunAt: now,
    },
    // From now, not from the slot: after an outage the series resumes at its
    // next future slot instead of replaying every one it slept through.
    now,
  );

  const claim = await prisma.reminder.updateMany({
    where: { id: r.id, nextRunAt: scheduledFor },
    data: { nextRunAt: next, lastRunAt: now },
  });
  if (claim.count !== 1) return;

  const plan = planSeriesFire(r.kind, scheduledFor, now);

  // A new slot supersedes an old one nobody answered. Leaving last week's
  // bins up beside this week's would be two cards for one chore.
  await supersedeOpen(r.id, r.householdId, now);

  const status: ReminderStatus = plan.action === "fire" ? "PENDING" : "DISMISSED";
  let occurrence: { id: string; scheduledFor: Date };
  try {
    occurrence = await prisma.reminderOccurrence.create({
      data: {
        reminderId: r.id,
        householdId: r.householdId,
        scheduledFor,
        status,
        firedAt: plan.action === "fire" ? now : null,
        fireCount: plan.action === "fire" ? 1 : 0,
        ...(plan.action === "skip" ? { resolution: plan.reason, resolvedAt: now } : {}),
      },
      select: { id: true, scheduledFor: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return; // already fired
    throw e;
  }

  await prisma.reminder.update({
    where: { id: r.id },
    data: { status: seriesStatusAfter(r.kind, status) },
  });

  if (plan.action === "skip") {
    result.skipped++;
    return;
  }
  const outcome = await deliverOccurrence(r, occurrence, { now, late: plan.late, ctx });
  if (outcome === "DELIVERED") result.delivered++;
  else result.missed++;
}

async function refireSnoozed(now: Date, ctx: HouseholdContext, result: TickResult) {
  const rows = await prisma.reminderOccurrence.findMany({
    where: { status: "SNOOZED", snoozedUntil: { not: null, lte: now } },
    select: {
      id: true,
      scheduledFor: true,
      snoozedUntil: true,
      reminder: { select: DELIVERABLE_SELECT },
    },
    take: BATCH,
  });

  for (const occ of rows) {
    try {
      const claim = await prisma.reminderOccurrence.updateMany({
        where: { id: occ.id, status: "SNOOZED", snoozedUntil: occ.snoozedUntil },
        data: {
          status: "PENDING",
          snoozedUntil: null,
          firedAt: now,
          fireCount: { increment: 1 },
        },
      });
      if (claim.count !== 1) continue;
      const r = occ.reminder as SeriesRow;
      await prisma.reminder.update({
        where: { id: r.id },
        data: { status: seriesStatusAfter(r.kind, "PENDING") },
      });
      result.refired++;
      await deliverOccurrence(r, occ, { now, late: false, ctx });
    } catch (e) {
      reportError(e, { code: "reminders.tick.refire", route: "runReminderTick", occurrenceId: occ.id });
    }
  }
}

async function supersedeOpen(reminderId: string, householdId: string, now: Date) {
  const open = await prisma.reminderOccurrence.findMany({
    where: { reminderId, status: { in: ["PENDING", "SNOOZED"] } },
    select: { id: true },
  });
  if (open.length === 0) return;
  await prisma.reminderOccurrence.updateMany({
    where: { id: { in: open.map((o) => o.id) }, status: { in: ["PENDING", "SNOOZED"] } },
    data: { status: "DISMISSED", resolution: "superseded", resolvedAt: now, snoozedUntil: null },
  });
  await Promise.all(
    open.map((o) =>
      notifyHousehold(householdId, {
        type: "reminderState",
        occurrenceId: o.id,
        reminderId,
        status: "DISMISSED",
      }),
    ),
  );
}

async function expireStaleAlerts(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - ALERT_TTL_MS);
  const stale = await prisma.reminderOccurrence.findMany({
    where: { status: "PENDING", firedAt: { not: null, lt: cutoff } },
    select: { id: true, reminderId: true, householdId: true, reminder: { select: { kind: true } } },
    take: BATCH,
  });
  if (stale.length === 0) return 0;

  const { count } = await prisma.reminderOccurrence.updateMany({
    where: { id: { in: stale.map((s) => s.id) }, status: "PENDING" },
    data: { status: "DISMISSED", resolution: "expired", resolvedAt: now },
  });
  const oneOffs = stale.filter((s) => s.reminder.kind === "ONE_OFF").map((s) => s.reminderId);
  if (oneOffs.length) {
    await prisma.reminder.updateMany({ where: { id: { in: oneOffs } }, data: { status: "DISMISSED" } });
  }
  await Promise.all(
    stale.map((s) =>
      notifyHousehold(s.householdId, {
        type: "reminderState",
        occurrenceId: s.id,
        reminderId: s.reminderId,
        status: "DISMISSED",
      }),
    ),
  );
  return count;
}

/**
 * The earliest instant anything will need this scheduler: a series slot, a
 * snooze ending, or an alert ageing out. The in-process timer sleeps until
 * then (bounded by its max poll) instead of waking every second to ask.
 */
export async function nextDueAt(): Promise<Date | null> {
  const [series, snooze, oldestOpen] = await Promise.all([
    prisma.reminder.findFirst({
      where: { enabled: true, nextRunAt: { not: null } },
      orderBy: { nextRunAt: "asc" },
      select: { nextRunAt: true },
    }),
    prisma.reminderOccurrence.findFirst({
      where: { status: "SNOOZED", snoozedUntil: { not: null } },
      orderBy: { snoozedUntil: "asc" },
      select: { snoozedUntil: true },
    }),
    prisma.reminderOccurrence.findFirst({
      where: { status: "PENDING", firedAt: { not: null } },
      orderBy: { firedAt: "asc" },
      select: { firedAt: true },
    }),
  ]);
  const candidates = [
    series?.nextRunAt,
    snooze?.snoozedUntil,
    oldestOpen?.firedAt ? new Date(oldestOpen.firedAt.getTime() + ALERT_TTL_MS + 1000) : null,
  ].filter((d): d is Date => d instanceof Date);
  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
