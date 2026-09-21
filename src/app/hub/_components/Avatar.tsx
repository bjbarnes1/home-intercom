/**
 * Hub prototype — Person Avatar.
 *
 * A solid colour circle with a single initial, identical at every size. Colour is
 * fixed per person and comes from `ident()`, so the same hue follows them onto
 * their LED bar and their timeline rows.
 */

import { ident, type Identity } from "@/lib/color/identity";

const INITIALS: Partial<Record<Identity, string>> = {
  Dad: "D",
  Mum: "M",
  Gus: "G",
  Georgette: "Ge",
  Willoughby: "W",
  Raff: "R",
};

/**
 * Known household members get the initial the family would write; anyone else —
 * a device name, a guest, a room the panel has never seen — gets their first
 * letter. A live house has more names in it than a fixture list.
 */
export function initialFor(who: string): string {
  return INITIALS[who as Identity] ?? who.trim().slice(0, 1).toUpperCase();
}

export default function Avatar({
  who,
  size = 44,
  ring,
  className = "",
}: {
  who: string;
  size?: number;
  /** Colour of a separating ring, for overlapping stacks. */
  ring?: string;
  className?: string;
}) {
  const initial = initialFor(who);
  return (
    <span
      className={`inline-flex flex-none items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        background: ident(who),
        fontSize: Math.round(size * 0.38),
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
