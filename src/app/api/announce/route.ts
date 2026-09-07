import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { controlSender } from "@/lib/livekit/control";
import { resolveTargets } from "@/lib/zones/resolve";
import { loadHouseholdSnapshot } from "@/lib/presence/snapshot";
import { synthesizeAnnounce, openaiTtsConfigured } from "@/lib/tts/openai";
import { storeAnnounceAudio, blobStoreConfigured } from "@/lib/tts/store";
import { reportError, reportWarning, errorMessage } from "@/lib/errors/report";
import { nanoid } from "nanoid";

export const dynamic = "force-dynamic";

const Announce = z
  .object({
    text: z.string().min(1).max(500),
    from: z.string().max(40).optional(),
    targetDeviceId: z.string().optional(),
    targetZoneId: z.string().optional(),
  })
  .refine((v) => !!v.targetDeviceId !== !!v.targetZoneId, {
    message: "Provide exactly one of targetDeviceId or targetZoneId",
  });

/**
 * POST /api/announce — async announcement. Prefers OpenAI Ash TTS + Blob audioUrl;
 * falls back to text-only (endpoint SpeechSynthesis) if TTS is unavailable.
 * Respects DND (reminders/announces wait; pages/calls do not).
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const parsed = Announce.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { text, from, targetDeviceId, targetZoneId } = parsed.data;

    const { devices, zoneMembership } = await loadHouseholdSnapshot(user.householdId);
    const resolved = resolveTargets(
      { deviceId: targetDeviceId, zoneId: targetZoneId },
      devices,
      zoneMembership,
      { onlineOnly: true, respectDoNotDisturb: true },
    );

    const sender = controlSender();
    const reached = await sender.connected(resolved.targets);
    const announcementId = nanoid(12);

    let audioUrl: string | undefined;
    let voice: "ash" | "browser-fallback" = "browser-fallback";
    let voiceError: string | null = null;

    const openaiOk = openaiTtsConfigured();
    const blobOk = blobStoreConfigured();
    if (!openaiOk || !blobOk) {
      voiceError = !openaiOk
        ? "OPENAI_API_KEY is not set"
        : "BLOB_READ_WRITE_TOKEN is not set";
      reportWarning(new Error(voiceError), {
        code: "announce.tts.not_configured",
        route: "/api/announce",
        openaiConfigured: openaiOk,
        blobConfigured: blobOk,
      });
    } else {
      try {
        const mp3 = await synthesizeAnnounce(text);
        audioUrl = await storeAnnounceAudio(announcementId, mp3);
        voice = "ash";
      } catch (e) {
        voiceError = errorMessage(e);
        reportError(e, {
          code: "announce.tts",
          route: "/api/announce",
          announcementId,
        });
      }
    }

    await Promise.all(
      reached.map(async (deviceId) => {
        try {
          await sender.send([deviceId], {
            type: "announce",
            text,
            from: from ?? user.name,
            announcementId,
            ...(audioUrl ? { audioUrl } : {}),
          });
        } catch (e) {
          reportError(e, {
            code: "announce.send",
            route: "/api/announce",
            deviceId,
            announcementId,
          });
        }
      }),
    );

    await prisma.intercomEvent.create({
      data: {
        householdId: user.householdId,
        type: "ANNOUNCE",
        outcome: reached.length > 0 ? "DELIVERED" : "MISSED",
        initiatorUserId: user.id,
        targetDeviceId,
        targetZoneId,
        summary: text.slice(0, 500),
      },
    });

    return NextResponse.json({
      reached,
      notConnected: resolved.targets.filter((id) => !reached.includes(id)),
      suppressedByDnd: resolved.suppressedByDnd,
      offline: resolved.offline,
      voice,
      voiceError,
      audioUrl: audioUrl ?? null,
    });
  }, { route: "/api/announce" });
}
