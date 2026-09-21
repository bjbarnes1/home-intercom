# AOSP or a lean custom Linux? (D1)

The hardware is being specced to meet the software's needs rather than the
other way round, so this is the right order to ask it in: what does each OS
*demand* of us, and what does each *foreclose*?

**Recommendation: AOSP.** Not because Android is better, but because two of
this product's committed features are things a browser on a minimal Linux
cannot do at all, and on custom Linux you end up shipping a browser anyway — so
you pay the browser's weight without the platform's compensations.

The honest counter-case, and what would flip it, is at the end.

---

## 1. The deflating fact: it's a browser either way

The panel is a web app today. `/hub` is React in a browser, and the things it
leans on are browser things:

| What the panel uses | Where |
| --- | --- |
| WebRTC (LiveKit) for all audio | the entire intercom |
| `speechSynthesis` | `src/lib/client/speak.ts` — the TTS fallback |
| MediaSession | `_runtime/useMediaSession.ts` |
| Service worker, `localStorage` | offline shell, device secret |
| MusicKit JS | Apple Music playback |

A "lean custom Linux" that runs this still needs Chromium or WPE WebKit, a
compositor, a full audio stack, and a graphics driver. That is not a lean
system — it is Android's surface area, hand-assembled, without Android's
testing.

So the question is **not** "browser or native". It is "who maintains the
browser, the audio stack and the update path — us, or the platform".

## 2. Where they actually differ

Five things. The first two are the decision; the rest are cost and effort.

### 2.1 BLE — already established, already blocking

`docs/handoff/ble-follow-me.md` records the finding:

> Web Bluetooth only talks to a device the user has picked out of a chooser
> dialog: no passive scanning, nothing in the background. **A panel running in
> a browser cannot hear anything at all.**

That forced the inversion where the *phone* listens and every room needs a
beacon. The same document notes the way out:

> an Android panel could be its own room beacon and save buying hardware

This matters twice over:

- **BOM.** A beacon per room disappears. At three or four rooms per house, that
  is real money per unit and real support burden (batteries, placement,
  pairing).
- **Dependency.** Follow-Me currently requires everyone to carry an iPhone with
  the app installed and location permission granted. A panel that scans *and*
  advertises makes room presence work for a child with no phone — which is most
  of the people this product is for.

On custom Linux you would also get BlueZ and full BLE control. But you would
have to drive it from outside the browser and bridge into the page, which is
the same native-shell work AOSP needs — except you also own the stack.

### 2.2 DRM for Apple Music — verify this before it decides anything

MusicKit JS plays protected content through EME. Reading the shipped bundle
earlier in this project showed it requesting `com.apple.fps` and
`com.widevine.alpha` key systems.

If that holds on the target device, it is close to decisive: Widevine on
Android is present and provisioned by the platform, whereas on a custom Linux
image it is a binary blob you must obtain under licence from Google, per
device, with provisioning at manufacture. That is a commercial relationship and
a manufacturing step, not an `apt install`.

**Flagged rather than asserted**: this came from reading the MusicKit bundle,
not from a test on real hardware, and a hardware decision should not rest on
it unverified. It is the single highest-value thing to check first — see §6.

### 2.3 Audio: capture, echo cancellation, routing

Full-duplex calls in a room, hands-free, with music ducking underneath, is a
hard audio problem: acoustic echo cancellation, noise suppression, and a
sensible route when a page arrives mid-song.

Android ships AEC/NS as platform effects with a hardware abstraction vendors
implement and test, and `AudioManager` focus is a real model for "music ducks
under an announcement" — which this app currently does in JavaScript by
changing a volume property.

On Linux it is PipeWire plus WebRTC's software AEC, which works, and which you
tune yourself per enclosure and per microphone. That tuning is not a weekend.

### 2.4 The control plane on-device

The spike (`services/control-plane/`) is a Node process with no external state,
built so the same binary can run on a Hub. Both platforms can run it —
Android via a foreground service with a bundled Node runtime, Linux natively
and more comfortably.

**Linux is genuinely easier here.** It is the clearest point in its favour: a
systemd unit versus an Android foreground service fighting Doze and background
execution limits. Worth weighing honestly, because LAN-first is the reason the
spike exists.

### 2.5 Updates, kiosk and the long tail

Android has A/B seamless updates, verified boot, rollback, device owner mode
and lock task mode — a real kiosk story and a real OTA story, tested by people
who are not you.

On Linux you assemble this: Mender or RAUC or swupdate for A/B, dm-verity for
integrity, a compositor in kiosk mode, watchdogs. All of it exists, all of it
is well-trodden, and all of it is yours to keep working for the life of the
product.

## 3. What each forecloses

**Choosing AOSP forecloses:** very low-end SoCs (Android wants ~2 GB RAM to be
pleasant); sub-10-second boot without real work; and a small attack surface —
you are shipping a large OS. It also ties you to a vendor BSP and its kernel
support horizon, which is often shorter than the product's.

**Choosing custom Linux forecloses:** the Widevine path unless licensed; the
platform BLE stack tested against thousands of peripherals; platform AEC; and
the ability to hire someone who already knows the platform. It also makes every
"why does audio do that" a question only you can answer.

## 4. BOM implications

Since the BOM follows the software:

| | AOSP | Custom Linux |
| --- | --- | --- |
| RAM | 2 GB min, 4 GB comfortable | 1 GB workable, 2 GB comfortable |
| SoC | one with a maintained Android BSP — narrows the field and raises the floor | far wider choice, including cheaper parts |
| BLE | must be on the module; saves a beacon per room | same, but you own the stack |
| Mic array | vendor AEC usually assumes a specific geometry | free choice, but you tune it |
| Per-unit delta | higher silicon cost | lower silicon, higher engineering |

The trade is **silicon cost against engineering time**, and the crossover
depends entirely on volume — which I do not know. At hundreds of units,
engineering dominates and AOSP wins comfortably. At tens of thousands, the
per-unit delta starts to pay for a Linux team.

## 5. Recommendation

**AOSP**, for four reasons in order of weight:

1. BLE on the panel is already blocking a committed feature, and it removes a
   per-room BOM item.
2. If the Widevine finding holds, Apple Music on custom Linux is a licensing
   project.
3. You ship a browser either way, so "lean" is not on the table — only "whose
   browser, audio stack and OTA".
4. A small team's scarcest resource is attention, and AOSP spends less of it on
   problems that are not this product.

Accept the cost honestly: a bigger image, a slower boot, a vendor BSP
dependency, and a foreground service that has to survive Android's power
management.

### What would flip this

- **Widevine turns out not to be required** *and* BLE gets solved another way
  (a cheap always-powered beacon you were fitting anyway, e.g. an ESP32 already
  going in for other sensing). Then Linux's advantages on the control plane,
  boot time and BOM become the stronger case.
- **Volume is far higher than assumed.** At scale the per-unit silicon delta
  can fund the engineering.
- **The Hub becomes primarily a server that happens to have a screen.** If
  LAN-first dominates and the display is secondary, optimise for the daemon,
  not the browser — and that is Linux.

## 6. How to decide it cheaply, in about a week

Do not decide this on a document. Two dev boards, one of each, and run the real
thing:

1. **Load `/hub` in a kiosk browser on both** and play an Apple Music track.
   This answers the Widevine question, which is the highest-value unknown, in
   an afternoon.
2. **Join a LiveKit call on both**, hands-free, with music playing. Judge echo
   and ducking with your ears in a real room.
3. **Run the control-plane spike on both** and keep it alive across a reboot
   and an overnight idle. This is where Android's background limits show up.
4. **Scan for a BLE beacon from the panel**, and advertise as one.
5. **Time a cold boot to a usable screen**, and do one OTA.

Anything that fails on AOSP but passes on Linux — or the reverse — decides it
with evidence. Same argument as the control-plane spike: a week of measurement
beats a month of argument.

## What I do not know

Stated plainly, because these change the answer:

- **Volume and BOM target.** The whole AOSP-vs-Linux trade is silicon cost
  against engineering time, and the crossover is a volume question.
- **Whether there is a hardware partner**, and what BSPs they already support.
  This often decides it before anything above does.
- **How much of the Hub is screen versus server.** §5's third flip condition.
- **Whether Widevine is genuinely required** — §2.2, and step 1 of §6.
