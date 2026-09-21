"use client";

import Link from "next/link";
import { PEOPLE } from "../data";
import Avatar from "../_components/Avatar";
import Icon from "../_components/Icon";
import OverlayCard, { BackdropSketch } from "../_components/OverlayCard";
import { useNow } from "../_components/Clock";
import { BRAND } from "@/lib/brand";

/**
 * Who's using the Hub? — the profile switcher.
 *
 * One Overlay Card holding the grid, not a split layout of an instruction card
 * beside a loose grid of tiles. Cancel is the explicit exit; tapping the backdrop
 * is never the only way out.
 */
export default function ProfileSwitch() {
  const now = useNow();

  return (
    <OverlayCard width={860} backdrop={<BackdropSketch hero={now?.time ?? ""} rows={3} />}>
      <span className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
        <span className="text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-muted">{BRAND.panel}</span>
      </span>

      <h1 className="mt-2.5 font-heading text-[32px] font-bold leading-10 tracking-tight text-text">
        Who&rsquo;s using the Hub?
      </h1>
      <span className="mt-1 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-muted">
        Tap your profile to continue
      </span>

      <div className="mt-7 grid w-full grid-cols-4 gap-4 overflow-y-auto">
        {PEOPLE.map((p) => {
          const admin = p.key === "Dad" || p.key === "Mum";
          return (
            <Link
              key={p.key}
              href={admin ? "/hub/pin" : "/hub/me"}
              className="flex flex-col items-center gap-3 rounded-[20px] bg-surface px-3 py-5 shadow-card transition-transform active:scale-[0.97]"
            >
              <span className="relative flex">
                <Avatar who={p.key} size={84} />
                {admin ? (
                  <span
                    className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full shadow-card"
                    style={{ background: "var(--color-surface-2)" }}
                  >
                    <Icon name="shield" size={14} className="text-accent" />
                  </span>
                ) : null}
              </span>
              <span className="flex flex-col items-center gap-0.5">
                <span className="text-base font-semibold leading-6 text-text">{p.name}</span>
                <span className="text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-muted">
                  {admin ? "Admin" : "Family"}
                </span>
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          className="flex cursor-pointer flex-col items-center gap-3 rounded-[20px] border-2 border-dashed bg-transparent px-3 py-5 transition-transform active:scale-[0.97]"
          style={{ borderColor: "rgba(15,23,42,0.18)" }}
        >
          <span
            className="flex h-[84px] w-[84px] items-center justify-center rounded-full"
            style={{ boxShadow: "inset 0 0 0 2px rgba(15,23,42,0.14)" }}
          >
            <Icon name="plus" size={28} className="text-ink-muted" />
          </span>
          <span className="flex flex-col items-center gap-0.5">
            <span className="text-base font-semibold leading-6 text-text">Add profile</span>
            <span className="text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-muted">
              Next colour reserved
            </span>
          </span>
        </button>
      </div>

      <Link
        href="/hub"
        className="mt-7 flex h-12 flex-none items-center gap-2.5 rounded-full bg-surface px-8 text-sm font-bold text-text transition-transform active:scale-[0.97]"
        style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
      >
        <Icon name="arrowLeft" size={17} />
        Cancel
      </Link>
    </OverlayCard>
  );
}
