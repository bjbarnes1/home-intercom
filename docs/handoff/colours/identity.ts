/* Home Intercom — identity colour map.
 * Mirrors handoff/colours/identity.css. Import from either side; do not fork.
 *
 * Identity is returned as a CSS custom property, never a literal, so the light
 * ground is a pure CSS swap — no theme argument threaded through the app, no
 * second map to keep in step.
 */

export type Person = 'Gus' | 'Georgette' | 'Willoughby' | 'Raff' | 'Mum' | 'Dad';
export type Room = 'Kitchen' | 'Rumpus' | 'Lounge';
export type Zone = 'Everyone' | 'Kids' | 'Downstairs';
export type Identity = Person | Room | Zone;

export type Theme = 'dark' | 'light';

const TOKEN: Record<Identity, string> = {
  Gus: 'gus', Georgette: 'georgette', Willoughby: 'willoughby', Raff: 'raff',
  Mum: 'mum', Dad: 'dad',
  Kitchen: 'kitchen', Rumpus: 'rumpus', Lounge: 'lounge',
  Kids: 'kids', Downstairs: 'downstairs', Everyone: 'everyone',
};

/** Plain-English colour name, for labels and accessibility copy. Theme-stable:
 *  the light ramp re-tunes lightness, not hue, so "amber" stays amber. */
export const COLOR_NAME: Record<Identity, string> = {
  Gus: 'teal', Georgette: 'rose', Willoughby: 'amber', Raff: 'green',
  Mum: 'rose', Dad: 'teal',
  Kitchen: 'blurple', Rumpus: 'indigo', Lounge: 'coral',
  Kids: 'pink', Downstairs: 'blue', Everyone: 'blurple',
};

export const ZONE_MEMBERS: Record<Zone, Identity[]> = {
  Everyone: ['Gus', 'Georgette', 'Willoughby', 'Raff', 'Kitchen', 'Rumpus', 'Lounge'],
  Kids: ['Gus', 'Georgette', 'Willoughby', 'Raff'],
  Downstairs: ['Kitchen', 'Rumpus', 'Lounge'],
};

export const ACCENT_FALLBACK = 'var(--color-accent)';
const GROUND = 'var(--hi-bg)';

export const ident = (name?: string): string => {
  const t = name && TOKEN[name as Identity];
  return t ? `var(--hi-ident-${t})` : ACCENT_FALLBACK;
};

/** Identity as emitted light — for LED bars only, never re-tuned by theme.
 *  A person's on-air colour is a physical light; it must read the same at noon
 *  as at midnight, so it does not follow the screen's ground. */
export const litIdent = (name?: string): string => {
  const t = name && TOKEN[name as Identity];
  return t ? `var(--hi-lit-${t})` : ACCENT_FALLBACK;
};

/** All blends run in oklab — hue-interpolating spaces skew warm tints magenta. */
export const tint = (name: string | undefined, pct: number, base = GROUND): string =>
  `color-mix(in oklab, ${ident(name)} ${pct}%, ${base})`;

export const mix = (color: string, pct: number, base = GROUND): string =>
  `color-mix(in oklab, ${color} ${pct}%, ${base})`;

export const fade = (color: string, pct: number): string =>
  `color-mix(in oklab, ${color} ${pct}%, transparent)`;

/** Inline style object that arms the .hi-tinted derived steps for a subtree. */
export const identStyle = (name?: string) =>
  ({ '--hi-ident': ident(name) } as React.CSSProperties);

/** Does a page/broadcast addressed to `target` reach `room`? */
export const reaches = (target: string | undefined, room: Room): boolean => {
  if (!target) return false;
  if (target === room) return true;
  return (ZONE_MEMBERS[target as Zone] ?? []).includes(room);
};

/* --- Theme -----------------------------------------------------------------
 * A panel's theme is a property of the room, not of the OS: the kitchen panel
 * wants light in daylight and dark after dinner, and `auto` follows the room's
 * own ambient-light sensor rather than a system setting. Apply the resolved
 * value as data-theme on the panel root.
 */

export type ThemePref = Theme | 'auto';

/** lux thresholds with a dead band, so a passing cloud can't flicker the panel. */
export const resolveTheme = (pref: ThemePref, lux: number, current: Theme = 'dark'): Theme => {
  if (pref !== 'auto') return pref;
  if (lux > 120) return 'light';
  if (lux < 60) return 'dark';
  return current;
};
