import { prisma } from "@/lib/prisma";
import { controlSender } from "@/lib/livekit/control";
import { resolveTargets } from "@/lib/zones/resolve";
import {
  loadHouseholdSnapshot,
  type HouseholdPresenceSnapshot,
} from "@/lib/presence/snapshot";
import { reportError, reportWarning, errorMessage } from "@/lib/errors/report";
import { synthesizeAnnounce, openaiTtsConfigured } from "@/lib/tts/openai";
import { storeAnnounceAudio, blobStoreConfigured } from "@/lib/tts/store";
import { isInQuietHours, localMinutesOfDay } from "@/lib/etiquette/quietHours";

/**
 * Getting one occurrence in front of people: resolve the target to panels,
 * synthesise the voice once, and send each connected panel a `reminder`
 * command with its own quiet-hours decision.
 *
 * Lifted from the old fireDueReminders loop unchanged in behaviour — the
 * voice, whisper and chime rules are the ones the household already lives
 * with. What is new is that the command carries the occurrence, so the panel
 * can show Complete / Snooze instead of a card that disappears on its own.
 */

export interface DeliverableReminder {
  id: string;
  householdId: string;
  text: string;
  details: string | null;
  sound: string | null;
  targetDeviceId: string | null;
  targetZoneId: string | null;
  assigneeUser: { name: string } | null;
  assigneeKid: { name: string } | null;
}

export const DELIVERABLE_SELECT = {
  id: true,
  householdId: true,
  kind: true,
  text: true,
  details: true,
  sound: true,
  cron: true,
  recurrence: true,
  runAt: true,
  timezone: true,
  enabled: true,
  nextRunAt: true,
  targetDeviceId: true,
  targetZoneId: true,
  assigneeUser: { select: { name: true } },
  assigneeKid: { select: { name: true } },
} as const;

export function assigneeName(r: Pick<DeliverableReminder, "assigneeUser" | "assigneeKid">): string | undefined {
  return r.assigneeKid?.name ?? r.assigneeUser?.name ?? undefined;
}

/**
 * Per-tick cache of what every delivery in a household needs, so a tick that
 * fires ten reminders for one house reads its roster once.
 */
export class HouseholdContext {
  private snapshots = new Map<string, Promise<HouseholdPresenceSnapshot>>();
  private zones = new Map<string, Promise<string>>();
  constructor(private readonly now: Date) {}

  snapshot(householdId: string) {
    let s = this.snapshots.get(householdId);
    if (!s) {
      s = loadHouseholdSnapshot(householdId, this.now);
      this.snapshots.set(householdId, s);
    }
    return s;
  }

  timezone(householdId: string) {
    let t = this.zones.get(householdId);
    if (!t) {
      t = prisma.household
        .findUnique({ where: { id: householdId }, select: { timezone: true } })
        .then((h) => h?.timezone ?? "UTC");
      this.zones.set(householdId, t);
    }
    return t;
  }
}

export type DeliveryOutcome = "DELIVERED" | "MISSED";

export async function deliverOccurrence(
  r: DeliverableReminder,
  occurrence: { id: string; scheduledFor: Date },
  opts: { now: Date; late: boolean; ctx: HouseholdContext },
): Promise<DeliveryOutcome> {
  const { now, late, ctx } = opts;
  const sender = controlSender();
  const [snap, tz] = await Promise.all([ctx.snapshot(r.householdId), ctx.timezone(r.householdId)]);

  // A reminder whose target was deleted still has a household to tell.
  if (!r.targetDeviceId && !r.targetZoneId) {
    await logEvent(r, "MISSED", now);
    return "MISSED";
  }

  const resolved = resolveTargets(
    { deviceId: r.targetDeviceId ?? undefined, zoneId: r.targetZoneId ?? undefined },
    snap.devices,
    snap.zoneMembership,
    { onlineOnly: true },
  );
  const connected = await sender.connected(r.householdId, resolved.targets);
  if (connected.length === 0) {
    await logEvent(r, "MISSED", now);
    return "MISSED";
  }

  const spoken = spokenLine(r);
  const audioUrl = await synthesizeReminderAudio(`${r.id}-${occurrence.id}`, spoken);

  const deviceRows = await prisma.device.findMany({
    where: { id: { in: connected } },
    select: {
      id: true,
      chimeEnabled: true,
      quietHoursEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
    },
  });
  const byId = new Map(deviceRows.map((d) => [d.id, d]));
  const nowMinutes = localMinutesOfDay(now, tz);
  const assignee = assigneeName(r);

  await Promise.all(
    connected.map((deviceId) => {
      const d = byId.get(deviceId);
      const whisper = d
        ? isInQuietHours({
            enabled: d.quietHoursEnabled,
            startMinutes: d.quietHoursStart,
            endMinutes: d.quietHoursEnd,
            nowMinutes,
          })
        : false;
      return sender
        .send(r.householdId, [deviceId], {
          type: "reminder",
          text: spoken,
          sound: r.sound ?? undefined,
          reminderId: r.id,
          ...(audioUrl ? { audioUrl } : {}),
          whisper,
          chime: !whisper && (d?.chimeEnabled ?? true),
          occurrenceId: occurrence.id,
          title: r.text,
          ...(r.details ? { details: r.details.slice(0, 2000) } : {}),
          ...(assignee ? { assignee } : {}),
          dueAt: occurrence.scheduledFor.toISOString(),
          late,
        })
        .catch((e) =>
          reportError(e, {
            code: "reminder.send",
            route: "deliverOccurrence",
            reminderId: r.id,
            deviceId,
          }),
        );
    }),
  );

  await logEvent(r, "DELIVERED", now);
  return "DELIVERED";
}

/**
 * What the house hears. The title is written for a screen ("Take out the
 * bins"); addressed to a person it becomes something you would say across a
 * kitchen ("Gus, take out the bins"). Deterministic — no model in the loop at
 * fire time, so what was confirmed at creation is exactly what is spoken.
 */
export function spokenLine(r: Pick<DeliverableReminder, "text" | "assigneeUser" | "assigneeKid">): string {
  const who = assigneeName(r);
  const text = r.text.trim();
  if (!who) return text;
  if (text.toLowerCase().startsWith(who.toLowerCase())) return text;
  const lowered = /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
  return `${who}, ${lowered}`;
}

async function synthesizeReminderAudio(key: string, text: string): Promise<string | undefined> {
  const openaiOk = openaiTtsConfigured();
  const blobOk = blobStoreConfigured();
  if (!openaiOk || !blobOk) {
    reportWarning(new Error(!openaiOk ? "OPENAI_API_KEY is not set" : "BLOB_READ_WRITE_TOKEN is not set"), {
      code: "reminder.tts.not_configured",
      route: "deliverOccurrence",
      openaiConfigured: openaiOk,
      blobConfigured: blobOk,
    });
    return undefined;
  }
  try {
    const mp3 = await synthesizeAnnounce(text);
    return await storeAnnounceAudio(`reminder-${key}`, mp3);
  } catch (e) {
    reportError(e, { code: "reminder.tts", route: "deliverOccurrence", key, message: errorMessage(e) });
    return undefined;
  }
}

async function logEvent(
  r: Pick<DeliverableReminder, "householdId" | "targetDeviceId" | "targetZoneId" | "text">,
  outcome: DeliveryOutcome,
  at: Date,
) {
  await prisma.intercomEvent
    .create({
      data: {
        householdId: r.householdId,
        type: "REMINDER",
        outcome,
        targetDeviceId: r.targetDeviceId,
        targetZoneId: r.targetZoneId,
        startedAt: at,
        summary: r.text.slice(0, 500),
      },
    })
    .catch((e) => reportError(e, { code: "reminder.log_event", route: "deliverOccurrence", outcome }));
}
