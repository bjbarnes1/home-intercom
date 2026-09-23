import type { Identity } from "@/lib/color/identity";
import type { ReactNode } from "react";
import NavDock from "./NavDock";
import MiniPlayer from "../music/MiniPlayer";
import UtilityStrip from "./UtilityStrip";

/**
 * Hub prototype — the Base Layer shell.
 *
 * Every non-Overlay screen is this: the universal utility strip, the dock flush
 * to the left edge, and the section's own content between them. Content is inset
 * past the collapsed dock (84px) plus a gutter; the dock overlays when expanded
 * rather than pushing this, so nothing reflows on a menu tap.
 *
 * What is playing sits at the foot of the content, in the flow rather than
 * floating over it, so it never covers the thing the screen is for.
 */
export default function BaseLayer({
  people,
  active,
  weatherActive,
  children,
}: {
  people?: Identity[];
  active?: { who: Identity; name: string };
  weatherActive?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <UtilityStrip people={people} active={active} weatherActive={weatherActive} />
      <div className="flex min-h-0 flex-grow flex-col gap-5 pb-8 pl-[116px] pr-8">
        {children}
        <MiniPlayer />
      </div>
      <NavDock />
    </>
  );
}

/** Section title band — the same space the ambient home gives its clock. */
export function Hero({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-none items-end justify-between gap-6">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-heading text-[32px] font-bold leading-10 tracking-tight text-text">{title}</span>
        {eyebrow ? <span className="uplabel text-[11px]">{eyebrow}</span> : null}
      </span>
      {children}
    </div>
  );
}

/** Small uppercase section label. Darker than ink-muted so it clears 4.5:1 on the page ground. */
export function Eyebrow({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "muted" | "ink" }) {
  const color = tone === "accent" ? "text-accent" : tone === "ink" ? "text-text" : "text-neutral-400";
  return (
    <span className={`text-[11px] font-bold uppercase leading-4 tracking-[0.08em] ${color}`}>{children}</span>
  );
}
