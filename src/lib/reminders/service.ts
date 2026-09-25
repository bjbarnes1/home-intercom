import { DateTime } from "luxon";
import type { Device, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextOccurrence, parseRecurrence } from "./recurrence";
import { buildAgenda, dayWindow, type AgendaReminderRow } from "./agenda";
import { allowedFrom, seriesStatusAfter, transition, type ReminderStatus } from "./lifecycle";
import { resolveSnooze, SnoozeError } from "./snooze";
import { notifyHousehold, reminderEvents, remindersChanged } from "./bus";
import { spokenLine } from "./deliver";
import type {
  ActiveAlert,
  CreateReminderInput,
  Member,
  MemberRef,
  OccurrenceActionInput,
  PanelReminderSnapshot,
} from "./types";

/**
 * The reminders domain service: every write and every panel read goes through
 * here, and every function takes the caller's householdId from the caller's
 * authenticated identity (a session user or a device secret). Routes stay thin
 * and cannot forget the tenant filter, because there is no signature that
 * lets them skip it.
 */

export class ReminderError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/** A one-off must be at least this far ahead, or it is a mistake, not a plan. */
const MIN_LEAD_MS = 30_000;

export interface Actor {
  userId?: string;
  deviceId?: string;
  /** Who to credit on other panels: a room name or a person's name. */
  label?: string;
}

// ─── Members ────────────────────────────────────────────────────────────────

export async function loadMembers(householdId: string): Promise<Member[]> {
  const [users, kids] = await Promise.all([
    prisma.user.findMany({ where: { householdId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.kid.findMany({ where: { householdId }, select: { id: true, name: true }, orderBy: { order: "asc" } }),
  ]);
  return [
    ...users.map((u) => ({ kind: "user" as const, id: u.id, name: u.name })),
    ...kids.map((k) => ({ kind: "kid" as const, id: k.id, name: k.name })),
  ];
}

function memberFromRow(r: {
  assigneeUser: { id: string; name: string } | null;
  assigneeKid: { id: string; name: string } | null;
}): Member | null {
  if (r.assigneeKid) return { kind: "kid", ...r.assigneeKid };
  if (r.assigneeUser) return { kind: "user", ...r.assigneeUser };
  return null;
}

async function resolveAssignee(householdId: string, ref: MemberRef | null | undefined) {
  if (!ref) return { assigneeUserId: null, assigneeKidId: null, name: null as string | null };
  if (ref.kind === "user") {
    const u = await prisma.user.findFirst({ where: { id: ref.id, householdId }, select: { id: true, name: true } });
    if (!u) throw new ReminderError("That person isn't in this household");
    return { assigneeUserId: u.id, assigneeKidId: null, name: u.name };
  }
  const k = await prisma.kid.findFirst({ where: { id: ref.id, householdId }, select: { id: true, name: true } });
  if (!k) throw new ReminderError("That person isn't in this household");
  return { assigneeUserId: null, assigneeKidId: k.id, name: k.name };
}

// ─── Where it rings ────────────────────────────────────────────────────────

/**
 * When nobody says where a reminder should ring, pick the place a person would:
 *  1. the assignee's own panel ("Gus" → the panel in Gus's room),
 *  2. else the panel it was made on (said to the kitchen, rings in the kitchen),
 *  3. else the zone with the most panels (the whole house),
 *  4. else any active panel.
 */
export async function defaultTarget(
  householdId: string,
  assigneeName: string | null,
  originDeviceId: string | null,
): Promise<{ targetDeviceId: string | null; targetZoneId: string | null }> {
  const devices = await prisma.device.findMany({
    where: { householdId, pairing: "ACTIVE" },
    select: { id: true, displayName: true, room: true },
    orderBy: { createdAt: "asc" },
  });

  if (assigneeName) {
    const n = assigneeName.trim().toLowerCase();
    const own = devices.find((d) => {
      const name = d.displayName.trim().toLowerCase();
      const room = (d.room ?? "").trim().toLowerCase();
      return name === n || room === n || room.startsWith(`${n}'s`) || room.startsWith(`${n}’s`);
    });
    if (own) return { targetDeviceId: own.id, targetZoneId: null };
  }
  if (originDeviceId && devices.some((d) => d.id === originDeviceId)) {
    return { targetDeviceId: originDeviceId, targetZoneId: null };
  }
  const zones = await prisma.zone.findMany({
    where: { householdId },
    select: { id: true, _count: { select: { memberships: true } } },
  });
  const widest = zones.sort((a, b) => b._count.memberships - a._count.memberships)[0];
  if (widest && widest._count.memberships > 0) return { targetDeviceId: null, targetZoneId: widest.id };
  if (devices[0]) return { targetDeviceId: devices[0].id, targetZoneId: null };
  throw new ReminderError("There are no panels in this household to ring");
}

async function validateTarget(householdId: string, target: CreateReminderInput["target"]) {
  if (!target) return null;
  if ("deviceId" in target) {
    const d = await prisma.device.findFirst({ where: { id: target.deviceId, householdId }, select: { id: true } });
    if (!d) throw new ReminderError("That panel isn't in this household");
    return { targetDeviceId: d.id, targetZoneId: null };
  }
  const z = await prisma.zone.findFirst({ where: { id: target.zoneId, householdId }, select: { id: true } });
  if (!z) throw new ReminderError("That zone isn't in this household");
  return { targetDeviceId: null, targetZoneId: z.id };
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function householdTimezone(householdId: string): Promise<string> {
  const h = await prisma.household.findUnique({ where: { id: householdId }, select: { timezone: true } });
  return h?.timezone ?? "UTC";
}

export async function createReminder(
  householdId: string,
  input: CreateReminderInput,
  actor: Actor,
  now: Date = new Date(),
) {
  const timezone = await householdTimezone(householdId);
  const assignee = await resolveAssignee(householdId, input.assignee);
  const target =
    (await validateTarget(householdId, input.target)) ??
    (await defaultTarget(householdId, assignee.name, actor.deviceId ?? null));

  let kind: "ONE_OFF" | "RECURRING";
  let runAt: Date | null = null;
  let nextRunAt: Date | null;
  let recurrence: Prisma.InputJsonValue | undefined;

  if (input.when.kind === "once") {
    kind = "ONE_OFF";
    runAt = new Date(input.when.at);
    if (runAt.getTime() < now.getTime() + MIN_LEAD_MS) {
      throw new ReminderError("That time has already passed");
    }
    nextRunAt = runAt;
  } else {
    kind = "RECURRING";
    recurrence = input.when.rule;
    nextRunAt = nextOccurrence(input.when.rule, timezone, now);
    if (!nextRunAt) throw new ReminderError("That repeat never happens again — check the end date");
  }

  const reminder = await prisma.reminder.create({
    data: {
      householdId,
      text: input.title,
      details: input.details || null,
      kind,
      runAt,
      recurrence,
      timezone,
      nextRunAt,
      status: "PENDING",
      assigneeUserId: assignee.assigneeUserId,
      assigneeKidId: assignee.assigneeKidId,
      ...target,
      createdByUserId: actor.userId ?? null,
    },
  });
  void remindersChanged(householdId, "created");
  return reminder;
}

// ─── Act on an occurrence ──────────────────────────────────────────────────

export async function actOnOccurrence(
  householdId: string,
  occurrenceId: string,
  input: OccurrenceActionInput,
  actor: Actor,
  now: Date = new Date(),
): Promise<{ status: ReminderStatus; snoozedUntil: string | null; noop: boolean }> {
  const occ = await prisma.reminderOccurrence.findFirst({
    where: { id: occurrenceId, householdId },
    include: { reminder: { select: { id: true, kind: true, timezone: true } } },
  });
  if (!occ) throw new ReminderError("Not found", 404);

  const t = transition(occ.status, input.action);
  if (!t.ok) throw new ReminderError(t.reason, 409);
  if (t.noop) {
    return { status: occ.status, snoozedUntil: occ.snoozedUntil?.toISOString() ?? null, noop: true };
  }

  let snoozedUntil: Date | null = null;
  if (input.action === "snooze") {
    try {
      snoozedUntil = resolveSnooze(input.snooze, {
        now,
        timezone: occ.reminder.timezone,
        scheduledFor: occ.scheduledFor,
      });
    } catch (e) {
      if (e instanceof SnoozeError) throw new ReminderError(e.message);
      throw e;
    }
  }

  const data: Prisma.ReminderOccurrenceUpdateManyMutationInput =
    input.action === "snooze"
      ? { status: "SNOOZED", snoozedUntil, snoozeCount: { increment: 1 } }
      : {
          status: t.to,
          snoozedUntil: null,
          resolvedAt: now,
          resolution: "user",
          resolvedByDeviceId: actor.deviceId ?? null,
          resolvedByUserId: actor.userId ?? null,
        };

  const claim = await prisma.reminderOccurrence.updateMany({
    where: { id: occ.id, householdId, status: { in: allowedFrom(input.action) } },
    data,
  });
  if (claim.count !== 1) {
    // Someone else acted between our read and our write — typically a second
    // panel. If they did the same thing, that is success, not a conflict.
    const fresh = await prisma.reminderOccurrence.findUnique({ where: { id: occ.id } });
    if (fresh && fresh.status === t.to) {
      return { status: fresh.status, snoozedUntil: fresh.snoozedUntil?.toISOString() ?? null, noop: true };
    }
    throw new ReminderError("Someone else just changed this reminder", 409);
  }

  await prisma.reminder.update({
    where: { id: occ.reminder.id },
    data: { status: seriesStatusAfter(occ.reminder.kind, t.to) },
  });

  void notifyHousehold(householdId, {
    type: "reminderState",
    occurrenceId: occ.id,
    reminderId: occ.reminder.id,
    status: t.to,
    ...(snoozedUntil ? { snoozedUntil: snoozedUntil.toISOString() } : {}),
    ...(actor.label ? { by: actor.label.slice(0, 80) } : {}),
  });
  // A snooze sets a new due time; wake an in-process timer for it.
  if (snoozedUntil) reminderEvents.emit("changed", { householdId });

  return { status: t.to, snoozedUntil: snoozedUntil?.toISOString() ?? null, noop: false };
}

// ─── Panel read ────────────────────────────────────────────────────────────

const AGENDA_SELECT = {
  id: true,
  kind: true,
  text: true,
  details: true,
  enabled: true,
  timezone: true,
  runAt: true,
  nextRunAt: true,
  recurrence: true,
  cron: true,
  targetDeviceId: true,
  targetZoneId: true,
  assigneeUser: { select: { id: true, name: true } },
  assigneeKid: { select: { id: true, name: true } },
} as const;

/**
 * Today's agenda for the whole household, plus the alerts ringing on this
 * particular panel. The agenda is household-wide because the Hub is the
 * family's shared view; alerts are per-panel because they only rang where the
 * reminder was targeted.
 */
export async function panelSnapshot(
  device: Pick<Device, "id" | "householdId">,
  now: Date = new Date(),
): Promise<PanelReminderSnapshot> {
  const { householdId } = device;
  const timezone = await householdTimezone(householdId);
  const today = DateTime.fromJSDate(now, { zone: timezone });
  const window = dayWindow(today);

  const [rows, occurrences, open, zones, members] = await Promise.all([
    prisma.reminder.findMany({ where: { householdId }, select: AGENDA_SELECT }),
    prisma.reminderOccurrence.findMany({
      where: {
        householdId,
        OR: [
          { scheduledFor: { gte: window.start, lt: window.end } },
          { status: "SNOOZED", snoozedUntil: { gte: window.start, lt: window.end } },
        ],
      },
      select: {
        id: true,
        reminderId: true,
        scheduledFor: true,
        status: true,
        snoozedUntil: true,
        firedAt: true,
        resolution: true,
      },
    }),
    prisma.reminderOccurrence.findMany({
      where: { householdId, status: "PENDING", firedAt: { not: null } },
      select: {
        id: true,
        scheduledFor: true,
        firedAt: true,
        fireCount: true,
        reminder: { select: AGENDA_SELECT },
      },
      orderBy: { firedAt: "asc" },
      take: 20,
    }),
    prisma.zoneMembership.findMany({ where: { deviceId: device.id }, select: { zoneId: true } }),
    loadMembers(householdId),
  ]);

  const agendaRows: AgendaReminderRow[] = rows.map((r) => ({
    ...r,
    recurrence: parseRecurrence(r.recurrence),
    assignee: memberFromRow(r),
  }));

  const myZones = new Set(zones.map((z) => z.zoneId));
  const alerts: ActiveAlert[] = open
    .filter(
      (o) =>
        o.reminder.targetDeviceId === device.id ||
        (o.reminder.targetZoneId !== null && myZones.has(o.reminder.targetZoneId)),
    )
    .map((o) => {
      const who = memberFromRow(o.reminder);
      return {
        occurrenceId: o.id,
        reminderId: o.reminder.id,
        title: o.reminder.text,
        details: o.reminder.details,
        dueAt: o.scheduledFor.toISOString(),
        firedAt: o.firedAt!.toISOString(),
        assignee: who?.name ?? null,
        late: o.firedAt!.getTime() - o.scheduledFor.getTime() > 2 * 60_000,
        spoken: spokenLine({
          text: o.reminder.text,
          assigneeUser: o.reminder.assigneeUser,
          assigneeKid: o.reminder.assigneeKid,
        }),
      };
    });

  return {
    timezone,
    date: today.toISODate()!,
    agenda: buildAgenda(agendaRows, occurrences, window, now),
    alerts,
    members,
    serverNow: now.toISOString(),
  };
}
