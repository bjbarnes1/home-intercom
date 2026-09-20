"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Icon, { type IconName } from "./Icon";

/**
 * Hub prototype — Nav Dock.
 *
 * Flush to the screen edge, full height, in ink, so it reads as part of the
 * chassis rather than as a panel drawn on the page. Icons only at rest to keep
 * the width for content; tap the chevron to bring the labels in, which overlays
 * rather than reflowing so expanding never moves the screen underneath.
 *
 * Same destinations, same order, same place on every screen — the whole point is
 * that it stops being read at all after the first week.
 */

interface Item {
  label: string;
  icon: IconName;
  href: string;
  /** Marks this item current when the path starts here. */
  match?: string;
}

const ITEMS: Item[] = [
  { label: "Home", icon: "home", href: "/hub", match: "/hub" },
  { label: "Intercom", icon: "intercom", href: "/hub/open-line", match: "/hub/open-line" },
  { label: "Messages", icon: "messages", href: "/hub/open-line" },
  { label: "Calendar", icon: "calendar", href: "/hub/me" },
  { label: "Tasks", icon: "tasks", href: "/hub/me", match: "/hub/me" },
  { label: "Reminders", icon: "reminders", href: "/hub/me" },
  { label: "Music", icon: "music", href: "/hub/music", match: "/hub/music" },
  { label: "More", icon: "more", href: "/hub" },
];

export default function NavDock() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setExpanded(false)}
        className={`absolute inset-0 z-20 border-none bg-neutral-900/35 transition-opacity duration-300 ${
          expanded ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ background: "rgba(15,23,42,0.35)" }}
        tabIndex={expanded ? 0 : -1}
      />

      <nav
        aria-label="Sections"
        className="absolute inset-y-0 left-0 z-30 flex flex-col bg-text transition-[width] duration-300 ease-out"
        style={{ width: expanded ? 180 : 84, background: "#0F172A" }}
      >
        <span
          className={`flex h-[72px] flex-none items-center ${expanded ? "gap-3 px-[22px]" : "justify-center"}`}
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] bg-accent font-heading text-[15px] font-extrabold text-white">
            f
          </span>
          <DockLabel expanded={expanded} className="font-heading text-base font-extrabold text-white">
            famOS
          </DockLabel>
        </span>

        <span className="flex flex-grow flex-col justify-center gap-1.5 px-3">
          {ITEMS.map((item, i) => {
            const on = item.match !== undefined && pathname === item.match;
            return (
              <Link
                key={`${item.label}-${i}`}
                href={item.href}
                title={item.label}
                aria-current={on ? "page" : undefined}
                className={`flex h-[52px] items-center rounded-full transition-colors ${
                  expanded ? "gap-3.5 px-[17px]" : "justify-center"
                } ${on ? "bg-accent text-white" : "text-neutral-700 hover:bg-white/10"}`}
                style={on ? undefined : { color: "#CBD5E1" }}
              >
                <Icon name={item.icon} size={22} className="flex-none" />
                <DockLabel expanded={expanded} className="text-sm font-semibold">
                  {item.label}
                </DockLabel>
              </Link>
            );
          })}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse menu" : "Expand menu"}
          aria-expanded={expanded}
          className={`mx-3 mb-4 flex h-[52px] cursor-pointer items-center rounded-full border-none bg-transparent transition-colors hover:bg-white/10 ${
            expanded ? "gap-3.5 px-[17px]" : "justify-center"
          }`}
          style={{ color: "#94A3B8" }}
        >
          <Icon name={expanded ? "chevronLeft" : "chevronRight"} size={22} className="flex-none" />
          <DockLabel expanded={expanded} className="text-[13px] font-semibold">
            Collapse
          </DockLabel>
        </button>
      </nav>
    </>
  );
}

/** Label that fades and unrolls rather than appearing, so it reads as belonging to its icon. */
function DockLabel({
  expanded,
  className = "",
  children,
}: {
  expanded: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${className}`}
      style={{ opacity: expanded ? 1 : 0, maxWidth: expanded ? 120 : 0 }}
    >
      {children}
    </span>
  );
}
