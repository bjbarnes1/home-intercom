import Link from "next/link";
import { ident } from "@/lib/color/identity";
import { CALL } from "../data";
import Avatar from "../_components/Avatar";
import Icon from "../_components/Icon";
import OverlayCard, { BackdropSketch } from "../_components/OverlayCard";

/**
 * Intercom call.
 *
 * Converted from its original full-bleed treatment into the shared Overlay Card,
 * so it keeps a visible link back to whatever it interrupted. Hang-up is the one
 * control in the whole product allowed to use the danger colour.
 */
const LEVELS = [12, 24, 36, 18, 30, 40, 26, 14, 32, 20, 28, 10];

export default function Call() {
  return (
    <OverlayCard width={560} backdrop={<BackdropSketch rows={4} />}>
      <span className="flex gap-2 rounded-full bg-bg p-1">
        <span className="flex h-10 items-center rounded-full bg-accent px-5 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-white">
          {CALL.mode}
        </span>
        <button
          type="button"
          className="flex h-10 cursor-pointer items-center rounded-full border-none bg-transparent px-5 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-text"
        >
          Broadcast
        </button>
      </span>

      <span className="mt-6">
        <Avatar who={CALL.who} size={104} />
      </span>
      <span className="mt-3.5 font-heading text-[32px] font-bold leading-10 tracking-tight text-text">{CALL.who}</span>
      <span className="text-base font-semibold leading-6 text-ink-muted tabular-nums">{CALL.elapsed}</span>

      <span role="img" aria-label="Live audio waveform" className="mt-4 flex h-10 items-center justify-center gap-1.5">
        {LEVELS.map((h, i) => (
          <span key={i} className="w-[5px] rounded-full" style={{ height: h, background: ident(CALL.who) }} />
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

        <Link
          href="/hub/open-line"
          aria-label="Hang up"
          className="flex h-[68px] w-[68px] items-center justify-center rounded-full text-white transition-transform active:scale-[0.97]"
          style={{ background: "var(--color-danger)" }}
        >
          <Icon name="intercom" size={26} style={{ transform: "rotate(135deg)" }} />
        </Link>

        <button
          type="button"
          aria-label="Speaker"
          className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-none bg-surface text-text transition-transform active:scale-[0.97]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
        >
          <Icon name="speaker" size={22} />
        </button>
      </span>

      <span className="mt-4.5 text-xs font-medium leading-4 text-ink-muted">
        Hanging up returns you to Open Line, right where you left it
      </span>
    </OverlayCard>
  );
}
