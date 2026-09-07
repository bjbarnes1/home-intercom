"use client";

import { useEffect, useState } from "react";
import { speak } from "@/lib/client/speak";
import { identStyle, tint } from "@/lib/color/identity";
import type { Speaking } from "../types";

interface Props {
  room: string;
  speaking: Speaking;
  /** Seconds before auto-dismiss (from Sound settings). */
  dwellSec: number;
  /** Remaining fraction 1 → 0 for the LED countdown bar. */
  onCountdown: (remaining: number) => void;
  onDismiss: () => void;
}

export default function SpeakingOverlay({
  room,
  speaking,
  dwellSec,
  onCountdown,
  onDismiss,
}: Props) {
  const who = speaking.label === "Reminder" ? undefined : speaking.label;
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const totalMs = Math.max(1, dwellSec) * 1000;
    const started = Date.now();
    onCountdown(1);

    const id = window.setInterval(() => {
      const remaining = Math.max(0, 1 - (Date.now() - started) / totalMs);
      onCountdown(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        onDismiss();
      }
    }, 50);

    return () => {
      window.clearInterval(id);
    };
  }, [speaking.text, speaking.label, speaking.audioUrl, dwellSec, epoch, onCountdown, onDismiss]);

  return (
    <div
      className="hi-tinted absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 p-14 text-center"
      style={{
        ...identStyle(who ?? room),
        background: `linear-gradient(160deg, ${tint(who ?? room, 14)}, var(--color-bg) 60%)`,
      }}
    >
      <div
        className="flex items-center gap-2 text-xs uppercase tracking-[0.16em]"
        style={{ color: "var(--hi-ident)" }}
      >
        <i className="ph-fill ph-megaphone-simple text-lg" />
        {speaking.label} · {room}
      </div>
      <div className="max-w-3xl font-heading text-5xl font-medium leading-tight">
        {speaking.text}
      </div>
      <div className="mt-2 flex gap-3.5">
        <button onClick={onDismiss} className="btn btn-outline min-h-14 px-8 text-base">
          <i className="ph ph-check text-lg" />
          Got it
        </button>
        <button
          onClick={() => {
            void speak(speaking.text, speaking.audioUrl);
            setEpoch((n) => n + 1);
          }}
          className="btn btn-secondary min-h-14 px-7 text-base"
        >
          <i className="ph ph-repeat text-lg" />
          Again
        </button>
      </div>
    </div>
  );
}
