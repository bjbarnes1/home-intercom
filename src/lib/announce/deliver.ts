/**
 * Speaking something aloud on the household's speakers.
 *
 * Extracted from `/api/announce` so anything that wants to announce — the
 * controller, a geofence rule, whatever comes next — goes through one path
 * rather than calling our own HTTP route from inside the server.
 *
 * Prefers OpenAI Ash and falls back to each endpoint's own speech synthesis,
 * and always reports which one actually spoke: a household notices when the
 * good voice silently degrades to the robot one.
 */

import { prisma } from "@/lib/prisma";
import { controlSender } from "@/lib/livekit/control";
import { resolveTargets } from "@/lib/zones/resolve";
import { loadHouseholdSnapshot } from "@/lib/presence/snapshot";
import { synthesizeAnnounce, openaiTtsConfigured } from "@/lib/tts/openai";
import { storeAnnounceAudio, blobStoreConfigured } from "@/lib/tts/store";
import { reportError, reportWarning, errorMessage } from "@/lib/errors/report";
import { isInQuietHours, localMinutesOfDay } from "@/lib/etiquette/quietHours";
import { nanoid } from "nanoid";

export interface AnnounceInput {
  householdId: string;
  text: string;
  /** Who it's from, for the panel's overlay. */
  from?: string;
  targetDeviceId?: string;
  targetZoneId?: string;
  /** Recorded on the audit event when a person triggered it. */
  initiatorUserId?: string;
  /** Audit summary; defaults to the spoken text. */
  summary?: string;
}

export interface AnnounceOutcome {
  announcementId: string;
  reached: string[];
  notConnected: string[];
  suppressedByDnd: string[];
  offline: string[];
  voice: "ash" | "browser-fallback";
  voiceError: string | null;
  audioUrl: string | null;
  /** Devices that spoke softly because they're inside their quiet hours. */
  whispered: string[];
}

export async function deliverAnnouncement(input: AnnounceInput): Promise<AnnounceOutcome> {
  const now = new Date();
  const { devices, zoneMembership } = await loadHouseholdSnapshot(input.householdId, now);

  const resolved = resolveTargets(
    { deviceId: input.targetDeviceId, zoneId: input.targetZoneId },
    devices,
    zoneMembership,
    { onlineOnly: true, respectDoNotDisturb: true },
  );

  const sender = controlSender();
  const reached = await sender.connected(input.householdId, resolved.targets);
  const announcementId = nanoid(12);

  const { audioUrl, voice, voiceError } = await synthesize(input.text, announcementId);

  // Quiet hours are per device, so "Dad's home" at 11pm murmurs in the bedroom
  // and still speaks up in the kitchen.
  const [household, deviceRows] = await Promise.all([
    prisma.household.findUnique({
      where: { id: input.householdId },
      select: { timezone: true },
    }),
    prisma.device.findMany({
      where: { id: { in: reached } },
      select: {
        id: true,
        chimeEnabled: true,
        quietHoursEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    }),
  ]);
  const byId = new Map(deviceRows.map((d) => [d.id, d]));
  const nowMinutes = localMinutesOfDay(now, household?.timezone ?? "UTC");
  const whispered: string[] = [];

  await Promise.all(
    reached.map(async (deviceId) => {
      const device = byId.get(deviceId);
      const whisper = device
        ? isInQuietHours({
            enabled: device.quietHoursEnabled,
            startMinutes: device.quietHoursStart,
            endMinutes: device.quietHoursEnd,
            nowMinutes,
          })
        : false;
      if (whisper) whispered.push(deviceId);

      try {
        await sender.send(input.householdId, [deviceId], {
          type: "announce",
          text: input.text,
          from: input.from,
          announcementId,
          ...(audioUrl ? { audioUrl } : {}),
          whisper,
          chime: !whisper && (device?.chimeEnabled ?? true),
        });
      } catch (e) {
        reportError(e, {
          code: "announce.send",
          route: "deliverAnnouncement",
          deviceId,
          announcementId,
        });
      }
    }),
  );

  await prisma.intercomEvent
    .create({
      data: {
        householdId: input.householdId,
        type: "ANNOUNCE",
        outcome: reached.length > 0 ? "DELIVERED" : "MISSED",
        initiatorUserId: input.initiatorUserId,
        targetDeviceId: input.targetDeviceId,
        targetZoneId: input.targetZoneId,
        summary: (input.summary ?? input.text).slice(0, 500),
      },
    })
    .catch((e) =>
      reportError(e, { code: "announce.log_event", route: "deliverAnnouncement" }),
    );

  return {
    announcementId,
    reached,
    notConnected: resolved.targets.filter((id) => !reached.includes(id)),
    suppressedByDnd: resolved.suppressedByDnd,
    offline: resolved.offline,
    voice,
    voiceError,
    audioUrl: audioUrl ?? null,
    whispered,
  };
}

async function synthesize(
  text: string,
  announcementId: string,
): Promise<{ audioUrl?: string; voice: "ash" | "browser-fallback"; voiceError: string | null }> {
  const openaiOk = openaiTtsConfigured();
  const blobOk = blobStoreConfigured();

  if (!openaiOk || !blobOk) {
    const voiceError = !openaiOk
      ? "OPENAI_API_KEY is not set"
      : "BLOB_READ_WRITE_TOKEN is not set";
    reportWarning(new Error(voiceError), {
      code: "announce.tts.not_configured",
      route: "deliverAnnouncement",
      openaiConfigured: openaiOk,
      blobConfigured: blobOk,
    });
    return { voice: "browser-fallback", voiceError };
  }

  try {
    const mp3 = await synthesizeAnnounce(text);
    return {
      audioUrl: await storeAnnounceAudio(announcementId, mp3),
      voice: "ash",
      voiceError: null,
    };
  } catch (e) {
    reportError(e, { code: "announce.tts", route: "deliverAnnouncement", announcementId });
    return { voice: "browser-fallback", voiceError: errorMessage(e) };
  }
}
