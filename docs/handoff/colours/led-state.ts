/* Home Intercom — LED bar state.
 * One pure function resolves what each bar shows, so the panel, the phone and
 * the firmware can never disagree about it.
 */

import { ident, IDENT } from './identity';
import type { Identity, Room } from './identity';

export type LedColorKey = 'warm' | 'amber' | 'rose' | 'teal' | 'indigo' | 'green';

export const LED: Record<LedColorKey, { name: string; c: string }> = {
  warm:   { name: 'Warm',   c: 'oklch(0.80 0.11 68)' },
  amber:  { name: 'Amber',  c: 'oklch(0.77 0.14 48)' },
  rose:   { name: 'Rose',   c: 'oklch(0.72 0.14 350)' },
  teal:   { name: 'Teal',   c: 'oklch(0.76 0.12 197)' },
  indigo: { name: 'Indigo', c: 'oklch(0.68 0.14 275)' },
  green:  { name: 'Green',  c: 'oklch(0.77 0.13 148)' },
};

export const LED_KEYS: LedColorKey[] = ['warm', 'amber', 'rose', 'teal', 'indigo', 'green'];

export const LED_DND = 'oklch(0.52 0.09 25)';
export const LED_OFF = 'var(--hi-led-off)';

export type FrontMode = 'status' | 'night' | 'solid' | 'off';

export interface RoomLights {
  front: FrontMode;
  frontColor: LedColorKey;
  rear: boolean;
  rearColor: LedColorKey;
  /** 0–100, stepped in eights in the UI. */
  bright: number;
}

export interface PanelActivity {
  /** 'page' | 'call' | 'ring' while the panel is on air, 'reminder' while one speaks. */
  overlay?: 'page' | 'call' | 'ring' | 'reminder' | null;
  /** Who the audio belongs to — drives the on-air colour. */
  who?: Identity;
  dnd?: boolean;
}

export interface LedState {
  /** Resolved CSS colour for the bar. */
  color: string;
  /** True while the bar should pulse rather than sit steady. */
  live: boolean;
  /** 0–1 opacity for the rear wash; the front bar is always 1. */
  alpha: number;
  /** Human-readable reason — used in the UI caption and in diagnostics. */
  why: string;
}

/** Front bar: identity beats reminder beats DND beats the user's chosen mode. */
export function frontLed(lights: RoomLights, activity: PanelActivity, room: Room): LedState {
  const o = activity.overlay;
  if (o === 'page' || o === 'call' || o === 'ring') {
    return { color: ident(activity.who), live: true, alpha: 1, why: `On air — ${activity.who}` };
  }
  if (o === 'reminder') {
    return { color: LED.amber.c, live: true, alpha: 1, why: 'Reminder speaking' };
  }
  if (activity.dnd) {
    return { color: LED_DND, live: false, alpha: 1, why: 'Do not disturb — dim red' };
  }
  switch (lights.front) {
    case 'off':   return { color: LED_OFF, live: false, alpha: 1, why: 'Front bar off' };
    case 'night': return { color: LED.warm.c, live: false, alpha: 1, why: 'Nightlight — low warm' };
    case 'solid': return {
      color: LED[lights.frontColor].c, live: false, alpha: 1,
      why: `Solid ${LED[lights.frontColor].name.toLowerCase()}`,
    };
    default: return { color: IDENT[room], live: false, alpha: 1, why: 'Status — idle' };
  }
}

/** Rear wash: colour and brightness only, with a floor so "on" is always visible. */
export function rearLed(lights: RoomLights): LedState {
  const color = LED[lights.rearColor].c;
  if (!lights.rear) return { color, live: false, alpha: 0, why: 'Rear wash off' };
  return {
    color, live: false,
    alpha: Math.max(0.12, lights.bright / 100),
    why: `${LED[lights.rearColor].name} at ${lights.bright}%`,
  };
}

export interface Scene { name: string; sub: string; patch: Partial<RoomLights>; color: string }

export const SCENES: Scene[] = [
  { name: 'Homework', sub: 'Teal, front on status', color: LED.teal.c,
    patch: { front: 'status', rear: true, rearColor: 'teal', bright: 55 } },
  { name: 'Dinner', sub: 'Warm wash, bright', color: LED.warm.c,
    patch: { front: 'status', rear: true, rearColor: 'warm', bright: 80 } },
  { name: 'Movie', sub: 'Indigo, front dark', color: LED.indigo.c,
    patch: { front: 'off', rear: true, rearColor: 'indigo', bright: 22 } },
  { name: 'Bedtime', sub: 'Nightlight only', color: LED.warm.c,
    patch: { front: 'night', rear: true, rearColor: 'warm', bright: 12 } },
];

/** Bind an LedState to the .hi-led-bar CSS contract. */
export const ledStyle = (s: LedState) =>
  ({ '--hi-led': s.color, '--hi-led-alpha': s.alpha } as React.CSSProperties);
