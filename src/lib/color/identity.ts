/**
 * Home Intercom — identity colour map.
 * Mirrors docs/handoff/colours/identity.css. Do not fork.
 */

import type { CSSProperties } from "react";

export type Person = "Gus" | "Georgette" | "Willoughby" | "Raff" | "Mum" | "Dad";
export type Room = "Kitchen" | "Rumpus" | "Lounge";
export type Zone = "Everyone" | "Kids" | "Downstairs";
export type Identity = Person | Room | Zone;

export const IDENT: Record<Identity, string> = {
  Gus: "oklch(0.75 0.115 205)",
  Georgette: "oklch(0.74 0.125 350)",
  Willoughby: "oklch(0.80 0.125 72)",
  Raff: "oklch(0.77 0.125 148)",
  Mum: "oklch(0.74 0.125 350)",
  Dad: "oklch(0.75 0.115 205)",
  Kitchen: "oklch(0.71 0.125 289)",
  Rumpus: "oklch(0.73 0.12 262)",
  Lounge: "oklch(0.75 0.13 28)",
  Kids: "oklch(0.75 0.12 320)",
  Downstairs: "oklch(0.74 0.11 240)",
  Everyone: "oklch(0.72 0.125 289)",
};

/** Plain-English colour name, for labels and accessibility copy. */
export const COLOR_NAME: Record<Identity, string> = {
  Gus: "teal",
  Georgette: "rose",
  Willoughby: "amber",
  Raff: "green",
  Mum: "rose",
  Dad: "teal",
  Kitchen: "blurple",
  Rumpus: "indigo",
  Lounge: "coral",
  Kids: "pink",
  Downstairs: "blue",
  Everyone: "blurple",
};

export const ZONE_MEMBERS: Record<Zone, Identity[]> = {
  Everyone: ["Gus", "Georgette", "Willoughby", "Raff", "Kitchen", "Rumpus", "Lounge"],
  Kids: ["Gus", "Georgette", "Willoughby", "Raff"],
  Downstairs: ["Kitchen", "Rumpus", "Lounge"],
};

export const ACCENT_FALLBACK = "var(--color-accent)";
const GROUND = "var(--hi-bg)";

/** Map display names / aliases ("Gus's room", "Soph", "BJ") onto identity keys. */
export function resolveIdentity(name?: string | null): Identity | undefined {
  if (!name) return undefined;
  const trimmed = name.trim();
  if (IDENT[trimmed as Identity]) return trimmed as Identity;

  const lower = trimmed.toLowerCase();
  if (lower.includes("willoughby")) return "Willoughby";
  if (lower.includes("georgette")) return "Georgette";
  if (lower.includes("gus")) return "Gus";
  if (lower.includes("raff")) return "Raff";
  if (lower.includes("kitchen")) return "Kitchen";
  if (lower.includes("rumpus")) return "Rumpus";
  if (lower.includes("lounge")) return "Lounge";
  if (lower === "kids" || lower.includes("kid")) return "Kids";
  if (lower.includes("downstairs")) return "Downstairs";
  if (lower.includes("everyone") || lower === "all") return "Everyone";
  if (lower === "soph" || lower === "mum" || lower === "mom") return "Mum";
  if (lower === "bj" || lower === "dad") return "Dad";
  return undefined;
}

export const ident = (name?: string | null): string => {
  const key = resolveIdentity(name);
  return (key && IDENT[key]) || ACCENT_FALLBACK;
};

/** All blends run in oklab — hue-interpolating spaces skew warm tints magenta. */
export const tint = (name: string | undefined, pct: number, base = GROUND): string =>
  `color-mix(in oklab, ${ident(name)} ${pct}%, ${base})`;

export const mix = (color: string, pct: number, base = GROUND): string =>
  `color-mix(in oklab, ${color} ${pct}%, ${base})`;

export const fade = (color: string, pct: number): string =>
  `color-mix(in oklab, ${color} ${pct}%, transparent)`;

/** Inline style object that arms the .hi-tinted derived steps for a subtree. */
export const identStyle = (name?: string | null): CSSProperties =>
  ({ ["--hi-ident" as string]: ident(name) }) as CSSProperties;

/** Does a page/broadcast addressed to `target` reach `room`? */
export const reaches = (target: string | undefined, room: Room): boolean => {
  if (!target) return false;
  if (target === room) return true;
  return (ZONE_MEMBERS[target as Zone] ?? []).includes(room);
};
