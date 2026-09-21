"use client";

import { useEffect, useState } from "react";
import { ident } from "@/lib/color/identity";
import type { Identity } from "@/lib/color/identity";
import Avatar from "./Avatar";
import Icon from "./Icon";
import OverlayCard, { BackdropSketch } from "./OverlayCard";

/**
 * A live intercom call, in the Overlay Card's clothes so it keeps a visible
 * link back to whatever it interrupted. Hang-up is the one control in the whole
 * product allowed to use the danger colour.
 *
 * Presentational: the runtime passes real LiveKit state, the design route
 * passes fixtures, and both get the same thing on screen.
 */
const LEVELS = [12, 24, 36, 18, 30, 40, 26, 14, 32, 20, 28, 10];

export default function CallCard({
  who,
  mode,
  startedAt,
  elapsed,
  footnote,
  onHangUp,
}: {
  who: Identity | string;
  /** "Two-way call" / "Listening" — what this connection actually is. */
  mode: string;
  /** Epoch ms the call connected; drives the running timer. */
  startedAt?: number;
  /** Static timer for the design route, used when startedAt is absent. */
  elapsed?: string;
  footnote?: string;
  onHangUp?: () => void;
}) {
  const running = useElapsed(startedAt);

  return (
    <OverlayCard width={560} backdrop={<BackdropSketch rows={4} />}>
      <span className="flex gap-2 rounded-full bg-bg p-1">
        <span className="flex h-10 items-center rounded-full bg-accent px-5 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-white">
          {mode}
        </span>
      </span>

      <span className="mt-6">
        <Avatar who={who} size={104} />
      </span>
      <span className="mt-3.5 font-heading text-[32px] font-bold leading-10 tracking-tight text-text">{who}</span>
      <span className="text-base font-semibold leading-6 text-ink-muted tabular-nums">
        {startedAt ? running : (elapsed ?? "")}
      </span>

      <span role="img" aria-label="Live audio" className="mt-4 flex h-10 items-center justify-center gap-1.5">
        {LEVELS.map((h, i) => (
          <span key={i} className="w-[5px] rounded-full" style={{ height: h, background: ident(who) }} />
        ))}
      </span>

      <span className="mt-6 flex items-center gap-5">
        <button
          type="button"
          aria-label="Mute microphone"
          className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-none bg-surface text-text transition-transform active:scale-[0.97]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
        >
          <Icon name="mic" size={22} />
        </button>

        <button
          type="button"
          onClick={onHangUp}
          aria-label="Hang up"
          className="flex h-[68px] w-[68px] cursor-pointer items-center justify-center rounded-full border-none text-white transition-transform active:scale-[0.97]"
          style={{ background: "var(--color-danger)" }}
        >
          <Icon name="intercom" size={26} style={{ transform: "rotate(135deg)" }} />
        </button>

        <button
          type="button"
          aria-label="Speaker"
          className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-none bg-surface text-text transition-transform active:scale-[0.97]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
        >
          <Icon name="speaker" size={22} />
        </button>
      </span>

      {footnote ? (
        <span className="mt-4.5 text-xs font-medium leading-4 text-ink-muted">{footnote}</span>
      ) : null}
    </OverlayCard>
  );
}

/** mm:ss since the call connected. Ticks on the second, not on every frame. */
function useElapsed(startedAt: number | undefined): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return "";
  const total = Math.max(0, Math.round((now - startedAt) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
