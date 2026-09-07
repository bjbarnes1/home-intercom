"use client";

/**
 * Speak text on this device. Prefers a pre-rendered audioUrl (OpenAI Ash)
 * when provided; falls back to browser SpeechSynthesis.
 */

import { reportClientError } from "@/lib/client/reportError";

let currentAudio: HTMLAudioElement | null = null;

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

export function speak(text: string, audioUrl?: string | null): void {
  if (typeof window === "undefined") return;
  stopSpeaking();

  if (audioUrl) {
    const el = new Audio(audioUrl);
    currentAudio = el;
    el.play().catch((e) => {
      reportClientError(e, {
        code: "speak.audio_play",
        route: "speak",
        audioUrlHost: (() => {
          try {
            return new URL(audioUrl).host;
          } catch {
            return "invalid";
          }
        })(),
      });
      speakWithSynthesis(text);
    });
    return;
  }

  speakWithSynthesis(text);
}

function speakWithSynthesis(text: string): void {
  if (!("speechSynthesis" in window)) {
    reportClientError(new Error("speechSynthesis unavailable"), {
      code: "speak.synthesis_unavailable",
      route: "speak",
    });
    return;
  }
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch (e) {
    reportClientError(e, { code: "speak.synthesis", route: "speak" });
  }
}

/** Format a reminder's next spoken time as HH:MM for display. */
export function reminderTime(r: {
  runAt?: string | null;
  cron?: string | null;
  nextRunAt?: string | null;
}): string {
  const iso = r.nextRunAt ?? r.runAt;
  if (iso) {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (r.cron) {
    const p = r.cron.split(" ");
    if (p.length >= 2 && /^\d+$/.test(p[0]) && /^\d+$/.test(p[1])) {
      return `${p[1].padStart(2, "0")}:${p[0].padStart(2, "0")}`;
    }
  }
  return "—";
}
