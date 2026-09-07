"use client";

import { identStyle, tint } from "@/lib/color/identity";
import type { RingOffer } from "../types";

interface Props {
  room: string;
  ringing: RingOffer;
  onAnswer: () => void;
  onDecline: () => void;
}

export default function RingOverlay({ room, ringing, onAnswer, onDecline }: Props) {
  const who = ringing.title;
  return (
    <div
      className="hi-tinted absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 p-10"
      style={{
        ...identStyle(who),
        background: `linear-gradient(160deg, ${tint(who, 22)}, var(--color-bg) 62%)`,
      }}
    >
      <div
        className="text-xs uppercase tracking-[0.16em]"
        style={{ color: "var(--hi-ident)" }}
      >
        Calling {room}
      </div>
      <div
        className="grid h-28 w-28 place-items-center rounded-full bg-surface"
        style={{ animation: "halo 1.6s ease-out infinite" }}
      >
        <i className="ph-fill ph-phone text-4xl" style={{ color: "var(--hi-ident)" }} />
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
