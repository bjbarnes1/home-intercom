# Home Intercom System — Implementation Plan

> **Status (living):** this is the original plan. For the current feature list
> and the up-to-date outstanding-tasks list, see [`../README.md`](../README.md).
> Progress against the phases below:
>
> - **Phase 0 — Foundations:** ✅ done (auth, household model, pairing, PWA shell,
>   LiveKit token service).
> - **Phase 1 — Core intercom:** ✅ done — presence lobby, page one device,
>   two-way call with real audio (verified iOS ↔ desktop).
> - **Phase 2 — Zones & broadcast:** ✅ done — zones, live broadcast, plus async
>   **text announcements** (TTS) that don't wait for connections.
> - **Phase 3 — Reminders:** 🟡 mostly done — reminders (manual + **AI natural
>   language**) auto-fire on schedule via a **Vercel Cron** scheduler
>   (`/api/cron/tick`) and speak on the endpoints; **local Piper TTS** (render
>   the voice at home instead of the browser) is the remaining piece.
> - **Phase 4 — Remote reach:** 🟡 partial — runs on **LiveKit Cloud** today
>   (works off-LAN); self-hosted home SFU + tunnel/TURN + web-push wake are TODO.
> - **Phase 5 — Hardening:** ⬜ TODO (kiosk provisioning, DND persistence, code
>   expiry, soak).
> - **Phase 6 — Custom device:** ⬜ TODO (native Android + smart display; the
>   smart-display surfaces — Schedule/Jobs/Music — already exist in the PWA).
>
> Beyond the original plan, also built: a **Nocturne** design system from the
> Barnes/Wilkes canvas, a **device pairing UI** (codes + QR), and a
> **smart-display** wall panel (clock, Schedule, Jobs, Music, Sound).
>
> **Correction (hosting/privacy):** the plan below justifies the home server by
> keeping audio in-house for privacy. That is **no longer a requirement** — cloud
> hosting is acceptable. Any local media node is now an **optional latency**
> optimisation, not a privacy one. See the README "Future ideas → Local
> fast-path". Backlog additions: **Follow-me** (BLE presence so music/screen
> follow people around the house) and a **custom LED device** (front-facing LED
> for lighting/notifications + rear-facing ambient LED bar) — both detailed in
> the README "Future ideas".

## Context

We want a household intercom + announcement system for the Barnes/Wilkes home.
Goals in the user's words: **page the children** (a device in each child's room),
**broadcast to everyone**, **set reminders that play on one or all devices on a
schedule**, and have **endpoints in public spaces** (lounge, rumpus) so people hear
throughout the house. Parents (Soph and I) both use **iOS** and need to *start*
conversations from an iPhone. Endpoints initially run on **old Android phones**;
later we move to a **custom Android touchscreen device** that doubles as a smart
display (calendar, music, etc.).

Decisions made up front (asked and answered):

- **Reach:** must work **from outside the home too**, not just on home Wi-Fi.
- **MVP endpoints:** a **PWA loaded in a kiosk browser** on the old Android phones
  (fastest to ship; one codebase shared with the iOS web app).
- **Hosting:** **hybrid** — a local, always-on home server carries the audio; a small
  cloud component only handles remote wake/push and NAT relay so audio stays in-house
  whenever possible.
- **Home:** a **new, separate git repository** (working name `home-intercom`).

## Architecture overview

Two planes, kept deliberately separate:

1. **Media plane (live human voice):** WebRTC via a **self-hosted LiveKit SFU** on the
   home server. Paging, two-way calls, and broadcast are all just LiveKit *rooms*.
   Media is DTLS-SRTP encrypted between endpoints and the SFU and, on the home LAN,
   never leaves the house.
2. **Control plane (commands, presence, scheduling):** every endpoint holds a
   persistent connection to the control backend to report presence and receive
   commands. Simplest implementation: every device permanently joins a LiveKit
   **"lobby" room** and we use LiveKit **data messages** + participant presence for
   the control channel — one transport for both planes.

### Conversation types → LiveKit mapping

| Feature | Mechanism |
|---|---|
| **Page one room** | Backend tells target device to join room `page:<id>`; parent publishes mic, child auto-subscribes & plays. |
| **Two-way call** | Same, but both sides publish mic; optional "ring" first. |
| **Broadcast** | Backend tells a group of devices to join room `broadcast:<id>`; initiator publishes, all subscribe one-way. |
| **Reminder** | Scheduler → control msg `{type:"reminder", audioUrl|text}` to target device(s); endpoint plays chime + speaks. No live room needed. |

## Components

1. **Control backend + web app** — Next.js App Router (TypeScript, Prisma). One app
   serves the API and the PWA (controller + endpoint roles).
2. **Data model** (Prisma, Postgres): `User`, `Device`, `Zone`/`Group`, `Reminder`,
   `CallSession`/`Announcement` audit log. No audio recorded by default.
3. **Reminder scheduler** — durable (jobs table poll or BullMQ+Redis); resolves
   targets, renders TTS, sends control messages; handles recurring/one-off/snooze.
4. **Local TTS** — Piper on the home server; browser `SpeechSynthesis` fallback.
5. **Endpoint PWA** (kiosk on old Androids via Fully Kiosk Browser).
6. **Parent controller PWA** (iOS): hold-to-talk page, two-way call, broadcast,
   reminder management.
7. **Remote reach** (thin cloud): Cloudflare Tunnel / Tailscale ingress, coturn TURN,
   web-push (VAPID) wake.
8. **Home server + deployment**: Docker Compose (livekit, postgres, redis, backend,
   piper-tts, coturn); `MOCK_LOCAL_SERVICES` dev toggle.

## Phased delivery

- **Phase 0 — Foundations.** Repo; Docker Compose (LiveKit + Postgres + backend);
  auth + household model; device pairing; PWA shell; LiveKit token endpoint.
- **Phase 1 — Core intercom (LAN).** Presence lobby; page one device; two-way call;
  controller UI; endpoint auto-answer.
- **Phase 2 — Zones & broadcast.** Zones/groups CRUD; broadcast to a group.
- **Phase 3 — Reminders.** Scheduler + Piper TTS; recurring/one-off; snooze; missed
  handling.
- **Phase 4 — Remote reach.** Tunnel ingress; coturn; web-push wake.
- **Phase 5 — Hardening.** Kiosk provisioning, reconnection, AEC, DND, audit UI,
  backups, security review.
- **Phase 6 — Future custom device.** Native Android app (foreground service) +
  smart-display surface.

## Key risks & mitigations

- **Remote/off-LAN media** → coturn TURN + tunnel ingress; keep in-house media direct.
- **Old Android reliability** → dedicated kiosk devices on power; Fully Kiosk; later a
  native foreground-service app.
- **iOS background limits** → parents initiate in foreground; receiving pages on a
  locked iPhone is best-effort via web push; native path is the long-term answer.
- **Privacy of always-on audio** → no recording by default; media on the home SFU;
  local TTS; cloud limited to wake/relay; everything audit-logged.
- **Echo/feedback in open rooms** → WebRTC AEC; push-to-talk for pages; per-device
  gain; half-duplex for public endpoints.
- **Consent/etiquette** → visible "on air" indicator; a chime before audio opens;
  per-device Do-Not-Disturb.

## Verification (per phase)

- **Phase 1:** From the iPhone PWA, hold-to-talk page the "child room" phone → heard
  within ~1s; two-way call audible both directions; presence flips offline within
  seconds on Wi-Fi drop.
- **Phase 2:** "Downstairs" zone broadcast plays on both; a device outside the zone
  stays silent.
- **Phase 3:** A reminder 2 min out for "Kids" chimes and speaks on time; snooze
  reschedules; an offline device shows a missed entry.
- **Phase 4:** iPhone on cellular pages/broadcasts/calls into the house; off-LAN media
  uses TURN while on-LAN is direct.
- **Automated:** Vitest for schedule math, token scoping, zone resolution; Playwright
  smoke for pairing, page, reminder — all under `MOCK_LOCAL_SERVICES` in CI.

## First concrete steps

1. Scaffold Next.js + TypeScript + Prisma + Tailwind.
2. `docker-compose.yml` with `livekit` + `postgres`; verify a demo room.
3. Prisma schema for `User`/`Device`/`Zone`/`Reminder`; migrate; seed a household.
4. LiveKit token endpoint + PWA shell (manifest + service worker) with two roles.
5. Implement the **lobby presence** join and the **page one device** flow.
