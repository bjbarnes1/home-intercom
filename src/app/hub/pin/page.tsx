"use client";

import Link from "next/link";
import { ME } from "../data";
import Avatar from "../_components/Avatar";
import Icon from "../_components/Icon";
import { useNow } from "../_components/Clock";
import OverlayCard, { BackdropSketch } from "../_components/OverlayCard";

/** PIN entry — the identity check, in the same shell as every other interruption. */
export default function PinEntry() {
  const now = useNow();

  return (
    <OverlayCard backdrop={<BackdropSketch hero={now?.time ?? ""} rows={3} />}>
      <Avatar who={ME.key} size={72} />
      <span className="mt-3 font-heading text-xl font-bold leading-7 text-text">Hi, {ME.name}</span>
      <span className="mt-1 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-muted">
        Enter your PIN
      </span>

      <span className="mt-5 flex gap-3.5">
        {[true, true, false, false].map((filled, i) => (
          <span
            key={i}
            className="h-3.5 w-3.5 rounded-full"
            style={{ background: filled ? "var(--color-accent)" : "rgba(15,23,42,0.14)" }}
          />
        ))}
      </span>

      <div className="mt-6 grid w-full grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d}>{d}</Key>
        ))}
        <span />
        <Key>0</Key>
        <button
          type="button"
          aria-label="Delete last digit"
          className="flex h-[60px] cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-ink-muted transition-transform active:scale-[0.97]"
        >
          <Icon name="backspace" size={22} />
        </button>
      </div>

      <Link
        href="/hub/profile"
        className="mt-6 flex h-12 items-center gap-2.5 rounded-full bg-surface px-8 text-sm font-bold text-text transition-transform active:scale-[0.97]"
        style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
      >
        <Icon name="arrowLeft" size={17} />
        Cancel
      </Link>
    </OverlayCard>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="h-[60px] cursor-pointer rounded-full border-none bg-surface text-xl font-semibold text-text tabular-nums transition-transform active:scale-[0.97]"
      style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
    >
      {children}
    </button>
  );
}
