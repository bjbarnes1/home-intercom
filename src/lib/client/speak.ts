"use client";

/**
 * Speak text on this device using the browser's SpeechSynthesis — the
 * zero-dependency fallback for reminder playback before local Piper TTS is
 * wired in. Plays a short chime first when available.
 */
export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {
    /* speech is best-effort */
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
