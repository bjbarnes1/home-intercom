"use client";

import { speak } from "@/lib/client/speak";
import type { Speaking } from "../types";

interface Props {
  room: string;
  speaking: Speaking;
  onDismiss: () => void;
}

export default function SpeakingOverlay({ room, speaking, onDismiss }: Props) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 p-14 text-center"
      style={{
        background:
          "linear-gradient(160deg, var(--color-neutral-900), var(--color-bg) 60%)",
      }}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-accent">
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
          onClick={() => speak(speaking.text, speaking.audioUrl)}
          className="btn btn-secondary min-h-14 px-7 text-base"
        >
          <i className="ph ph-repeat text-lg" />
          Again
        </button>
      </div>
    </div>
  );
}
