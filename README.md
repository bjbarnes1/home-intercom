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
  room and reconnects automatically if the link drops. Presence and control
  commands (`join`, `announce`, `reminder`, `hangup`) ride as LiveKit **data
  messages** — one transport for both planes. The backend only delivers to
  endpoints actually present in the lobby, and reports online-but-not-connected.

| Feature | Room | Endpoint role |
|---|---|---|
| Page one device | `page:<deviceId>` | listen (auto-answer) |
| Two-way call | `call:<deviceId>` | duplex (ring first) |
| Live broadcast to a zone | `broadcast:<zoneId>` | listen |
| Text announcement (TTS) | *(no room)* | speak the text aloud |
| Reminder | *(no room)* | chime + speak |

The same PWA serves both a **Controller** role (a parent's iPhone) and an
**Endpoint** role (a kiosk phone in a room, later a custom touchscreen).

## What's built

The intercom core is working end-to-end, including **real two-way audio**
(verified iOS ↔ desktop over LiveKit Cloud), plus the smart-display surfaces.

### Platform & foundations
- Next.js App Router app (TypeScript, Tailwind v4, Prisma), 59 unit tests.
- **User auth** — email + password with database-backed sessions: scrypt hashing
  (no third-party crypto dep), opaque token in an **HttpOnly** cookie with only
  its SHA-256 hash stored, sliding 30-day expiry, `ADMIN`/`MEMBER` roles. Single
  choke point at `src/lib/auth/context.ts`.
- **Data model**: household (+timezone), users, sessions, devices, zones,
  reminders, `IntercomEvent` audit log (metadata only — no audio), kids, chores
  + completions, calendar events, music state. Four committed migrations.
- **Nocturne design system** (`globals.css` via Tailwind `@theme`) — dark
  lavender palette, cards, tags, buttons, toggle, hold-to-talk, level bars,
  overlays. Space Grotesk + Inter, Phosphor icons.

### Devices & control channel
- **Pairing**: admin registers a device → 6-char code **+ QR**; the room phone
  scans it (`/endpoint?code=…` auto-pairs) or types it. Re-pairing rotates the
  device secret (revokes the old phone). Endpoints authenticate by device secret.
- **Presence + control**: endpoints hold a lobby connection with **auto-reconnect**
  and a visible **"Ready to receive"** indicator; the backend delivers only to
  connected endpoints and reports the rest.

### Talk (media plane — LiveKit)
- **Two-way calls** with real audio (ring → answer). **Hold-to-talk paging**
  (one-way). **Live broadcast** hold-to-talk to a zone.
- Least-privilege, role-scoped tokens (`lobby`/`listen`/`talk`/`duplex`).

### Announcements & reminders
- **Text announcements (async broadcast)**: type a message → spoken aloud on a
  zone's connected speakers immediately, no waiting for connections.
- **Reminders**: manual create, plus **AI natural-language** ("remind Willoughby
  to read his novel at 4pm tomorrow") via Claude (`claude-opus-5`) with a strict
  tool + luxon timezone math. Spoken on the wall panel (SpeechSynthesis) with a
  "Play now" action.

### Controller (iPhone PWA)
- Home (zones + rooms with live presence), page / two-way call, Broadcast
  ("Say something" TTS + "Talk live"), Reminders (AI "ask in plain words" with
  optional speech input + manual form), and a **Devices** manager.

### Wall panel / endpoint (kiosk PWA)
- Pair → lobby → auto-answer; live-clock Home with summary cards; **Schedule**
  (calendar day view), **Jobs** (chore board, tap-to-tick + streaks),
  **Reminders**, **Music** (shared player state), **Sound** (DND / chime /
  half-duplex / quiet hours), and on-air / incoming-call / reminder /
  announcement overlays.

### Infra
- `MOCK_LOCAL_SERVICES` fakes LiveKit and simulates on-air state for laptop dev.
- `docker-compose.yml` (LiveKit + Postgres), `livekit.yaml`, `vercel.json`
  (migrate-on-deploy), Neon Postgres.

## Outstanding tasks

**Needs your action (config):**
- Set **`ANTHROPIC_API_KEY`** on Vercel to enable AI reminders (until then that
  one route returns a friendly "not configured"; everything else works).

**Next features:**
- **Recorded-voice broadcast** — record a clip on the controller, release →
  plays on the endpoints (needs audio capture + a small clip store).
- **Local Piper TTS** — reminders now **auto-fire** on schedule (Vercel Cron →
  `/api/cron/tick`) and speak via the browser's SpeechSynthesis; swap in
  home-server **Piper** so the voice is rendered locally (Phase 3 backend).
- Edit **Jobs / Schedule / Music** from the controller (currently seeded/managed
  on the panel); persist per-device **Sound/DND** settings.

**Hardening / platform:**
- Move media to a **self-hosted home LiveKit SFU** + tunnel/TURN for privacy and
  remote reach (currently LiveKit Cloud). Phase 4.
- **iOS audio unlock** (`room.startAudio()`) if inbound playback needs a tap.
- **Web-push wake** for backgrounded/remote devices (Phase 4).
- Enforce **pairing-code expiry** (TTL exists but isn't enforced yet).
- Kiosk provisioning/hardening (Phase 5); native **Android** device (Phase 6).
- Separate **Neon branch per environment** before previews share prod data.
- Open a PR / promote `claude/new-project-fx1pzn` to a `main` line when ready.

> **Note on Next.js version:** the plan calls for Next 16; the registry resolved
> to Next 15.5. App Router conventions are identical — a drop-in bump later.

## Getting started

```bash
# 1. install deps
npm install

# 2. configure environment
cp .env.example .env        # MOCK_LOCAL_SERVICES=true works with no home server

# 3. bring up LiveKit + Postgres (needs Docker)
docker compose up -d

# 4. set up the database
npm run prisma:migrate      # applies prisma/migrations/ (deploy on prod)
npm run prisma:seed         # seeds the household, devices and zones

# 5. run the app
npm run dev                 # http://localhost:3000
```

### Database: local Postgres or Neon

For local dev the `postgres` service in `docker-compose.yml` is enough. The
managed database is a **Neon** project (`home-intercom`) — set `DATABASE_URL`
to Neon's **pooled** connection (with `pgbouncer=true`) and `DIRECT_URL` to the
**direct** connection for migrations (see `.env.example`). The schema is
already applied to Neon and its migration is recorded in `_prisma_migrations`,
so `prisma migrate deploy` against it is a clean no-op; re-run it after adding
new migrations. Migrations live in `prisma/migrations/` and are committed.

Sign in at `/login` (the seed creates `soph@example.com` / `bj@example.com`
with password `changeme123` — override with `SEED_ADMIN_PASSWORD`, and change
it before any real deployment). Then open `/controller` on your phone and
`/endpoint` on a room device (in **Fully Kiosk Browser** for the real kiosks).
Without Docker, set `MOCK_LOCAL_SERVICES=true` to exercise the control flow
without live media.

## Deploying (Vercel)

`vercel.json` sets the build command to:

```
prisma migrate deploy && next build
```

so **every deploy applies any pending migrations before building**. Because
each migration is recorded in `_prisma_migrations` with a matching checksum,
already-applied migrations are skipped — only genuinely new ones run. If a
migration fails, the build fails (fail-fast, nothing half-deployed).

Environment variables on the Vercel project:

| Var | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon **pooled** URL (`pgbouncer=true`) for the app runtime. |
| `DIRECT_URL` | yes | Neon **direct** URL; `migrate deploy` uses it (migrations must not run over PgBouncer). |
| `LIVEKIT_URL` | for audio | LiveKit **wss://** URL (LiveKit Cloud today). The client normalizes http(s)→ws(s). |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | for audio | Sign tokens + call the LiveKit server API. |
| `MOCK_LOCAL_SERVICES` | optional | `true` fakes LiveKit (control UI works, no real audio). Set `false` for live audio. |
| `ANTHROPIC_API_KEY` | for AI reminders | Enables `/api/reminders/parse`. Absent → that route returns 503; the rest is unaffected. |
| `CRON_SECRET` | recommended | Guards the scheduler route; Vercel Cron sends it as a bearer token every minute. |
| `SEED_ADMIN_PASSWORD` | optional | Password for seeded parents (default `changeme123`). |

The **reminder scheduler** runs as a Vercel Cron (`vercel.json` → `/api/cron/tick`,
every minute): it fires reminders whose `nextRunAt` has passed, delivers the
`reminder` command to connected endpoints, and advances the schedule
(compare-and-swap so overlapping ticks can't double-fire). The same
`fireDueReminders()` core can run from a home-server interval later. Set
`CRON_SECRET` on Vercel so only Vercel can trigger it.

Env changes only take effect on a **new deployment** — add the var, then redeploy.
`NEXT_PUBLIC_LIVEKIT_URL` may be set to the same `wss://` value or left unset
(it falls back to `LIVEKIT_URL`; an empty string is treated as unset).
`prisma generate` runs in `postinstall`, so the client is always fresh.

> Note: previews and production share one Neon database today, so a preview
> deploy will apply new migrations to that database. Add a separate Neon branch
> per environment before that becomes a problem.

To add a schema change: edit `prisma/schema.prisma`, create a migration
(`prisma migrate dev --name <x>` against a dev DB, or hand-author the SQL under
`prisma/migrations/`), commit it, and push — the deploy applies it.

## Development

```bash
npm test            # vitest — domain logic (59 tests)
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
