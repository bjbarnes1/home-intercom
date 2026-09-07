# Colour handoff — identity & LED

Drop-in code for the colour system shown in **Home Intercom v2.dc.html**. Three files,
no dependencies beyond the Nocturne stylesheet already in the app. Both grounds — dark
and light — ship in the same sheet.

| File | Goes in | Role |
| --- | --- | --- |
| `identity.css` | `src/styles/` (import after the theme sheet) | Tokens for both themes + the `.hi-tinted` / `.hi-chip` / `.hi-hold` / `.hi-led-fixture` / `.hi-led-bar` contracts |
| `identity.ts` | `src/lib/colour/` | The identity map, `ident()`, `tint()`, `mix()`, `fade()`, `reaches()`, `resolveTheme()` |
| `led-state.ts` | `src/lib/colour/` | LED palette + `frontLed()` / `rearLed()` / `SCENES` |

`Colour System.dc.html` at the project root renders the whole palette on both grounds — open it to
check a hue before shipping it.

## The four rules

1. **One hue per identity.** Every person, room and zone owns a hue. It follows them
   through cards, call overlays, schedule rows, jobs, reminders and LED state — so a
   glance at a colour answers "who is this?" before any text is read.
2. **Blend in `oklab`, always.** The default mixing space interpolates hue, which turned
   Willoughby's amber pink and Raff's green teal against the indigo ground. Every tint,
   glow and overlay goes through the helpers; never write a bare `color-mix()`.
3. **The LED bar is derived, never stored.** `frontLed()` resolves it from the room's
   settings plus live panel activity, in a fixed precedence: on-air identity → reminder
   amber → DND red → the user's chosen mode. Store settings; compute colour.
4. **Identity is a token, not a literal.** `ident()` returns `var(--hi-ident-gus)`, so
   switching ground is one attribute and no component needs to know the theme.

## Light mode

Set `data-theme="light"` on the panel root (or `<html>`). What changes and what doesn't:

- **Hues don't move.** Each identity keeps its hue angle; light mode drops lightness from
  ~0.75 to ~0.52 and lifts chroma slightly, so identity-coloured *text* clears 4.5:1 on
  the light ground and Willoughby still reads as amber, not brown.
- **Tints halve.** `--hi-t-1…4` go 8/14/22/55% → 5/9/15/45%. On a light ground a 14%
  wash is already a strong colour, and the card tints are meant to whisper.
- **Light sources don't follow the screen.** Identity has two forms: `ident()`
  (`--hi-ident-*`, themed, for anything drawn on screen) and `litIdent()`
  (`--hi-lit-*`, constant, for the LED bar). Gus's on-air teal is a physical light —
  it must look the same at noon as at midnight, so it never takes the light-mode ramp.
- **LED values are untouched.** They're emitted light, so the firmware payload
  (`LED_EMITTED`) is theme-independent — and the bar is always drawn inside
  `.hi-led-fixture`, a dark housing, so a light page shows the colour as light rather
  than as paint.

Theme is a property of the *room*, not the OS: a kitchen panel wants light at breakfast
and dark after dinner. `resolveTheme(pref, lux, current)` handles `'auto'` off the panel's
ambient sensor with a 60–120 lux dead band so cloud cover can't flicker it.

## Usage

```tsx
import { ident, identStyle, resolveTheme } from '@/lib/colour/identity';
import { frontLed, ledStyle } from '@/lib/colour/led-state';

<div data-theme={resolveTheme(room.themePref, lux, theme)}>
  <article className="hi-tinted" style={identStyle('Gus')}>
    <h3 style={{ color: 'var(--hi-ident)' }}>Gus</h3>
    <div style={{ background: 'var(--hi-tint-2)' }}>…</div>
  </article>

  <div className="hi-led-fixture">
    <div className="hi-led-bar" data-live={front.live} style={ledStyle(front)} />
  </div>
  <p>{front.why}</p>
</div>
```

`why` is written to be shown, not just logged — the panel prints it under the bar so the
LED is never an unexplained colour.

## Accessibility

Colour is a second channel, never the only one: every identity-coloured element also
carries its name or icon. Identity hues clear 4.5:1 for text on their own ground in both
themes; the 5–22% tints are backgrounds only — put full-opacity ink on them, not muted
type. `.hi-led-bar` pulses only when `data-live`, and the pulse is dropped under
`prefers-reduced-motion`.

## Note on tint variable names

The dark-only first cut named the steps after their percentages (`--hi-tint-8`,
`--hi-tint-14`…). Those numbers stop being true in light mode, so the steps are now
`--hi-tint-1…4`. If you already pulled the earlier files, rename on the way in.
