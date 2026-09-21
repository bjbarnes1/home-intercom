import Link from "next/link";
import { ident } from "@/lib/color/identity";
import { BROADCAST } from "../data";
import Avatar from "../_components/Avatar";
import OverlayCard, { BackdropSketch } from "../_components/OverlayCard";

/**
 * Broadcast received.
 *
 * A broadcast is addressed to the room, so it is Public and shows in full. The
 * waveform is the shape of a real voice rather than a speaker icon — it keeps
 * this reading as a person reaching the house rather than a device making an
 * announcement, and it is motion that encodes live state rather than decoration.
 *
 * The stated countdown is this card's explicit exit.
 */
const LEVELS = [14, 26, 40, 22, 34, 48, 30, 18, 36, 44, 24, 32, 16, 28, 38, 20, 30, 12];

export default function Broadcast() {
  return (
    <OverlayCard width={560} backdrop={<BackdropSketch rows={4} />}>
      <span className="text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-accent">
        Broadcast message
      </span>

      <span className="mt-4">
        <Avatar who={BROADCAST.from} size={80} />
      </span>
      <span className="mt-2.5 text-[13px] leading-[18px] text-ink-muted">
        {BROADCAST.from} is speaking to the house
      </span>

      <span role="img" aria-label="Live audio waveform" className="mt-4 flex h-12 items-center justify-center gap-1.5">
        {LEVELS.map((h, i) => (
          <span
            key={i}
            className="w-[5px] rounded-full"
            style={{ height: h, background: ident(BROADCAST.from) }}
          />
        ))}
      </span>

      <span className="mt-4 w-full rounded-xl bg-bg px-5 py-4 text-center text-base leading-6 text-text">
        &ldquo;{BROADCAST.text}&rdquo;
      </span>

      <span className="mt-5 flex w-full gap-3">
        <Link
          href="/hub"
          className="flex h-13 flex-grow items-center justify-center rounded-full text-sm font-bold text-white transition-transform active:scale-[0.97]"
          style={{ background: "#0F172A" }}
        >
          Got it
        </Link>
        <Link
          href="/hub/call"
          className="flex h-13 flex-grow items-center justify-center rounded-full bg-accent text-sm font-bold text-white transition-transform active:scale-[0.97]"
        >
          Reply
        </Link>
      </span>

      <span className="mt-3.5 text-xs font-medium leading-4 text-ink-muted tabular-nums">
        Disappearing in {BROADCAST.countdown}s
      </span>
    </OverlayCard>
  );
}
