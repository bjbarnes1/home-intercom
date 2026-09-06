"use client";

import type { RingOffer } from "../types";

interface Props {
  room: string;
  ringing: RingOffer;
  onAnswer: () => void;
  onDecline: () => void;
}

export default function RingOverlay({ room, ringing, onAnswer, onDecline }: Props) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 p-10"
      style={{
        background:
          "linear-gradient(160deg, var(--color-accent-900), var(--color-bg) 62%)",
      }}
    >
      <div className="text-xs uppercase tracking-[0.16em] text-accent-200">
        Calling {room}
      </div>
      <div
        className="grid h-28 w-28 place-items-center rounded-full bg-surface"
        style={{ animation: "halo 1.6s ease-out infinite" }}
      >
        <i className="ph-fill ph-phone text-4xl text-accent" />
      </div>
      <div className="font-heading text-4xl font-medium">{ringing.title}</div>
      <div className="text-sm text-neutral-400">Two-way — they&apos;ll hear the room</div>
      <div className="mt-2 flex gap-4">
        <button onClick={onAnswer} className="btn btn-outline min-h-16 px-9 text-lg">
          <i className="ph-fill ph-phone text-xl" />
          Answer
        </button>
        <button onClick={onDecline} className="btn btn-secondary min-h-16 px-7 text-lg">
          <i className="ph ph-phone-x text-xl" />
          Not now
        </button>
      </div>
    </div>
  );
}
