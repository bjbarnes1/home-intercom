# Colour handoff — identity & LED

Drop-in code for the colour system shown in **Home Intercom v2.dc.html**. Three files,
no dependencies beyond the Nocturne stylesheet already in the app.

| File | Goes in | Role |
| --- | --- | --- |
| `identity.css` | `src/styles/` (import after the theme sheet) | Tokens + the `.hi-tinted` / `.hi-chip` / `.hi-hold` / `.hi-led-bar` contracts |
| `identity.ts` | `src/lib/colour/` | The identity map, `ident()`, `tint()`, `mix()`, `fade()`, `reaches()` |
| `led-state.ts` | `src/lib/colour/` | LED palette + `frontLed()` / `rearLed()` / `SCENES` |

## The three rules

1. **One hue per identity.** Every person, room and zone owns a hue. It follows them
   through cards, call overlays, schedule rows, jobs, reminders and LED state — so a
   glance at a colour answers "who is this?" before any text is read.
2. **Blend in `oklab`, always.** The default mixing space interpolates hue, which turned
   Willoughby's amber pink and Raff's green teal against the indigo ground. Every tint,
   glow and overlay goes through the helpers; never write a bare `color-mix()`.
3. **The LED bar is derived, never stored.** `frontLed()` resolves it from the room's
   settings plus live panel activity, in a fixed precedence: on-air identity → reminder
   amber → DND red → the user's chosen mode. Store settings; compute colour.

## Usage

```tsx
import { ident, identStyle, tint } from '@/lib/colour/identity';
import { frontLed, rearLed, ledStyle } from '@/lib/colour/led-state';

<article className="hi-tinted" style={identStyle('Gus')}>
  <h3 style={{ color: 'var(--hi-ident)' }}>Gus</h3>
  <div style={{ background: 'var(--hi-tint-14)' }}>…</div>
</article>

const front = frontLed(lights.Rumpus, { overlay, who, dnd }, 'Rumpus');
<div className="hi-led-bar" data-live={front.live} style={ledStyle(front)} />
<p>{front.why}</p>
```

`why` is written to be shown, not just logged — the panel prints it under the bar so the
LED is never an unexplained colour.

## Accessibility

Colour is a second channel, never the only one: every identity-coloured element also
carries its name or icon. Identity hues sit at OKLCH lightness 0.71–0.80 against the
`#161826` ground, which clears 4.5:1 for text; the 8–22% tints are backgrounds only —
put full-opacity ink on them, not muted type. `.hi-led-bar` pulses only when
`data-live`, and the pulse is dropped under `prefers-reduced-motion`.
