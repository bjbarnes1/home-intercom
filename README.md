# home-intercom

A household intercom + announcement system for the Barnes / Wilkes home:
**page the kids**, **broadcast to everyone**, **start two-way calls**, and set
**spoken reminders** that play on one device or a zone — from inside the house or
away from it.

This repo holds the implementation. The full rationale lives in
[`docs/PLAN.md`](docs/PLAN.md).

## Architecture at a glance

Two planes, deliberately separate:

- **Media plane** — live human voice over WebRTC via a self-hosted **LiveKit**
  SFU on the home server. Paging, calls and broadcasts are all LiveKit *rooms*.
  On the LAN, audio never leaves the house.
- **Control plane** — every endpoint permanently joins a LiveKit **`lobby`**
  room. Presence and control commands (`join`, `ring`, `reminder`, `hangup`)
  ride as LiveKit **data messages** — one transport for both planes.

| Feature | Room | Endpoint role |
|---|---|---|
| Page one device | `page:<deviceId>` | listen (auto-answer) |
| Two-way call | `call:<deviceId>` | duplex (ring first) |
| Broadcast to a zone | `broadcast:<zoneId>` | listen |
| Reminder | *(no room)* | play chime + speak |

The same PWA serves both a **Controller** role (a parent's iPhone) and an
**Endpoint** role (a kiosk phone in a room, later a custom touchscreen).

## What's built so far

**Phase 0 (foundations) + the Phase 1 vertical slice (page one device):**

- Next.js App Router app (TypeScript, Tailwind, Prisma).
- Prisma schema: `Household`, `User`, `Device`, `Zone`/`ZoneMembership`,
  `Reminder`, `IntercomEvent` (audit log — metadata only, no audio).
- LiveKit **token service** with least-privilege, role-scoped grants
  (`lobby` / `listen` / `talk` / `duplex`).
- Domain logic with unit tests (41 tests):
  - `reminders/schedule.ts` — cron + one-off next-run math, timezones, snooze.
  - `zones/resolve.ts` — target → device-set resolution, DND + online filters.
  - `devices/pairing.ts` — pairing codes + device secrets.
  - `livekit/token.ts` — grant scoping + JWT signing.
- API routes: device registration/pairing (`/api/devices`, `/api/devices/claim`),
  presence heartbeat (`/api/presence`), initiate page/call/broadcast
  (`/api/page`), reminders CRUD (`/api/reminders`).
- Control-plane command types + a **mockable** control sender
  (`MOCK_LOCAL_SERVICES` fakes LiveKit/TTS so the app runs on a laptop).
- PWA shell: manifest, service worker (offline shell + push-wake scaffold),
  Controller (hold-to-talk paging) and Endpoint (pair → lobby → auto-answer) UIs.
- `docker-compose.yml` (LiveKit + Postgres) and `livekit.yaml`.

**Still to come** (see the plan): real user auth (the last Phase 0 item),
zones/broadcast UI (Phase 2), the reminder scheduler + Piper TTS (Phase 3),
remote reach via tunnel + coturn + web push (Phase 4), kiosk hardening
(Phase 5), and the native Android device (Phase 6).

> **Note on Next.js version:** the plan calls for Next 16; at scaffold time the
> registry resolved to Next 15.5. The App Router conventions are identical, so
> this is a drop-in bump when 16 is available.

## Getting started

```bash
# 1. install deps
npm install

# 2. configure environment
cp .env.example .env        # MOCK_LOCAL_SERVICES=true works with no home server

# 3. bring up LiveKit + Postgres (needs Docker)
docker compose up -d

# 4. set up the database
npm run prisma:migrate      # or: npx prisma db push
npm run prisma:seed         # seeds the household, devices and zones

# 5. run the app
npm run dev                 # http://localhost:3000
```

Open `/controller` on your phone and `/endpoint` on a room device (in
**Fully Kiosk Browser** for the real kiosks). Without Docker, set
`MOCK_LOCAL_SERVICES=true` to exercise the control flow without live media.

## Development

```bash
npm test            # vitest — domain logic (41 tests)
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

Conventions mirror the inChambers app: `src/app/**/route.ts` for the API,
`src/lib/<domain>/` with co-located `*.test.ts`, Prisma for data, and the
`MOCK_LOCAL_SERVICES` toggle for laptop-only dev.

## Privacy

No audio is recorded by default. Media stays on the home SFU whenever a client
is on the LAN. Every page / call / broadcast / reminder is written to the
`IntercomEvent` audit log (who, when, target — never the audio). The cloud
footprint is limited to remote wake/relay.
