import { prisma } from "@/lib/prisma";
import { computeNextRun } from "@/lib/reminders/schedule";
import { controlSender } from "@/lib/livekit/control";
import { resolveTargets } from "@/lib/zones/resolve";
import {
  loadHouseholdSnapshot,
  type HouseholdPresenceSnapshot,
} from "@/lib/presence/snapshot";
import { reportError, reportWarning, errorMessage } from "@/lib/errors/report";
import { synthesizeAnnounce, openaiTtsConfigured } from "@/lib/tts/openai";
import { storeAnnounceAudio, blobStoreConfigured } from "@/lib/tts/store";
import {
  isInQuietHours,
  localMinutesOfDay,
} from "@/lib/etiquette/quietHours";

/**
 * Fire every reminder due at `now`. Same core for Vercel Cron or a home interval.
 * Prefers OpenAI Ash + Blob when configured; endpoints fall back to SpeechSynthesis.
 */

export interface FireResult {
  due: number;
  fired: number;
  delivered: number;
  missed: number;
}

export async function fireDueReminders(now: Date): Promise<FireResult> {
  const due = await prisma.reminder.findMany({
    where: { enabled: true, nextRunAt: { not: null, lte: now } },
  });

  const result: FireResult = { due: due.length, fired: 0, delivered: 0, missed: 0 };
  const snapshots = new Map<string, HouseholdPresenceSnapshot>();
  const householdTz = new Map<string, string>();
  const sender = controlSender();

  for (const r of due) {
    const next = computeNextRun(
      {
        kind: r.kind,
        enabled: r.enabled,
        cron: r.cron,
        runAt: r.runAt,
        timezone: r.timezone,
        snoozedUntil: null,
        lastRunAt: now,
      },
      now,
    );
    const claim = await prisma.reminder.updateMany({
      where: { id: r.id, nextRunAt: r.nextRunAt },
      data: { nextRunAt: next, lastRunAt: now, snoozedUntil: null },
    });
    if (claim.count !== 1) continue;
    result.fired++;

    let snap = snapshots.get(r.householdId);
    if (!snap) {
      snap = await loadHouseholdSnapshot(r.householdId, now);
      snapshots.set(r.householdId, snap);
    }
    if (!householdTz.has(r.householdId)) {
      const hh = await prisma.household.findUnique({
        where: { id: r.householdId },
        select: { timezone: true },
      });
      householdTz.set(r.householdId, hh?.timezone ?? "UTC");
    }
    const tz = householdTz.get(r.householdId) ?? "UTC";

    const resolved = resolveTargets(
      { deviceId: r.targetDeviceId ?? undefined, zoneId: r.targetZoneId ?? undefined },
      snap.devices,
      snap.zoneMembership,
      { onlineOnly: true },
    );
    const connected = await sender.connected(resolved.targets);

    if (connected.length === 0) {
      result.missed++;
      await logEvent(r, "MISSED", now);
      continue;
    }

    const audioUrl = await synthesizeReminderAudio(r.id, r.text);

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
        const doChime = !whisper && (d?.chimeEnabled ?? true);
        return sender
          .send([deviceId], {
            type: "reminder",
            text: r.text,
            sound: r.sound ?? undefined,
            reminderId: r.id,
            ...(audioUrl ? { audioUrl } : {}),
            whisper,
            chime: doChime,
          })
          .catch((e) =>
            reportError(e, {
              code: "reminder.send",
              route: "fireDueReminders",
              reminderId: r.id,
              deviceId,
            }),
          );
      }),
    );
    result.delivered++;
    await logEvent(r, "DELIVERED", now);
  }

  return result;
}

async function synthesizeReminderAudio(
  reminderId: string,
  text: string,
): Promise<string | undefined> {
  const openaiOk = openaiTtsConfigured();
  const blobOk = blobStoreConfigured();
  if (!openaiOk || !blobOk) {
    reportWarning(new Error(!openaiOk ? "OPENAI_API_KEY is not set" : "BLOB_READ_WRITE_TOKEN is not set"), {
      code: "reminder.tts.not_configured",
      route: "fireDueReminders",
      openaiConfigured: openaiOk,
      blobConfigured: blobOk,
    });
    return undefined;
  }
  try {
    const mp3 = await synthesizeAnnounce(text);
    return await storeAnnounceAudio(`reminder-${reminderId}`, mp3);
  } catch (e) {
    reportError(e, {
      code: "reminder.tts",
      route: "fireDueReminders",
      reminderId,
      message: errorMessage(e),
    });
    return undefined;
  }
}

async function logEvent(
  r: {
    householdId: string;
    targetDeviceId: string | null;
    targetZoneId: string | null;
    text: string;
  },
  outcome: "DELIVERED" | "MISSED",
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
    .catch((e) =>
      reportError(e, {
        code: "reminder.log_event",
        route: "fireDueReminders",
        outcome,
      }),
    );
}
