"use client";

import { useEffect, useState } from "react";
import { ident } from "@/lib/color/identity";
import Avatar from "./Avatar";
import OverlayCard, { BackdropSketch } from "./OverlayCard";

/**
 * An announcement or a reminder being spoken into the room.
 *
 * A broadcast is addressed to the room, so it is Public and shows in full. The
 * waveform is the shape of a voice rather than a speaker icon — it keeps this
 * reading as a person reaching the house rather than a device making noise, and
 * it is motion that encodes live state rather than decoration.
 *
 * The countdown is this card's stated exit: it says how long it will be here,
 * so nobody has to guess whether to dismiss it.
 */
const LEVELS = [14, 26, 40, 22, 34, 48, 30, 18, 36, 44, 24, 32, 16, 28, 38, 20, 30, 12];

export default function SpeakingCard({
  from,
  label,
  text,
  dwellSec,
  onDismiss,
}: {
  /** Who it came from; a reminder has no author. */
  from?: string;
  label: string;
  text: string;
  dwellSec: number;
  onDismiss: () => void;
}) {
  const left = useCountdown(dwellSec, onDismiss);

  return (
    <OverlayCard width={560} backdrop={<BackdropSketch rows={4} />}>
      <span className="text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-accent">{label}</span>

      {from ? (
        <>
          <span className="mt-4">
            <Avatar who={from} size={80} />
          </span>
          <span className="mt-2.5 text-[13px] leading-[18px] text-ink-muted">
            {from} is speaking to the house
          </span>
        </>
      ) : null}

      <span role="img" aria-label="Live audio" className="mt-4 flex h-12 items-center justify-center gap-1.5">
        {LEVELS.map((h, i) => (
          <span key={i} className="w-[5px] rounded-full" style={{ height: h, background: ident(from) }} />
        ))}
      </span>

      <span className="mt-4 w-full rounded-xl bg-bg px-5 py-4 text-center text-base leading-6 text-text">
        &ldquo;{text}&rdquo;
      </span>

      <button
        type="button"
        onClick={onDismiss}
        className="mt-5 flex h-13 w-full cursor-pointer items-center justify-center rounded-full border-none text-sm font-bold text-white transition-transform active:scale-[0.97]"
        style={{ background: "#0F172A" }}
      >
        Got it
      </button>

      <span className="mt-3.5 text-xs font-medium leading-4 text-ink-muted tabular-nums">
        Disappearing in {left}s
      </span>
    </OverlayCard>
  );
}

/** Counts down whole seconds and fires once at zero. */
function useCountdown(dwellSec: number, onDone: () => void): number {
  const [left, setLeft] = useState(() => Math.max(1, Math.round(dwellSec)));

  useEffect(() => {
    const total = Math.max(1, Math.round(dwellSec));
    setLeft(total);
    const started = Date.now();

    const id = window.setInterval(() => {
      const remaining = Math.max(0, total - Math.round((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        onDone();
      }
    }, 250);

    return () => window.clearInterval(id);
  }, [dwellSec, onDone]);

  return left;
}
