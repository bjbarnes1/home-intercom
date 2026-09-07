"use client";

import { identStyle, tint } from "@/lib/color/identity";
import type { Incoming } from "../types";

interface Props {
  room: string;
  incoming: Incoming;
  onDismiss: () => void;
}

export default function IncomingOverlay({ room, incoming, onDismiss }: Props) {
  const who = incoming.title;
  return (
    <div
      className="hi-tinted absolute inset-0 z-40 flex flex-col items-center justify-center gap-7 p-10"
      style={{
        ...identStyle(who),
        background: `linear-gradient(160deg, ${tint(who, 22)}, var(--color-bg) 62%)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="dot dot-ident animate-breathe" />
        <span
          className="text-xs uppercase tracking-[0.16em]"
          style={{ color: "var(--hi-ident)" }}
        >
          On air · {room}
        </span>
      </div>
      <div className="text-center font-heading text-5xl font-medium">
        {incoming.title}
      </div>
      <div className="levels h-14">
        {[0.62, 0.48, 0.74, 0.55, 0.68].map((d, i) => (
          <span key={i} style={{ width: 7, height: 54, animationDuration: `${d}s` }} />
        ))}
      </div>
      <button onClick={onDismiss} className="btn btn-secondary min-h-14 px-7 text-base">
        <i className="ph ph-x text-lg" />
        Dismiss
      </button>
    </div>
  );
}
