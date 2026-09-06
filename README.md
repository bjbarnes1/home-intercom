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

**Phase 0 (foundations) — complete — plus the Phase 1 vertical slice
(page one device):**

- Next.js App Router app (TypeScript, Tailwind, Prisma).
- Prisma schema: `Household`, `User`, `Device`, `Zone`/`ZoneMembership`,
  `Reminder`, `IntercomEvent` (audit log — metadata only, no audio), `Session`.
- **User auth** — email + password login with database-backed sessions:
  - Passwords hashed with Node's built-in **scrypt** (no third-party crypto dep).
  - Opaque session token in an **HttpOnly** cookie; only its SHA-256 hash is
    stored, so a DB dump can't forge sessions. Sliding 30-day expiry.
  - `ADMIN` (parents) vs `MEMBER` (children) roles; device registration is
    admin-only. Endpoints keep their separate device-secret auth.
  - Single auth choke point (`src/lib/auth/context.ts`) — swap in OAuth later
    without touching route logic.
- LiveKit **token service** with least-privilege, role-scoped grants
  (`lobby` / `listen` / `talk` / `duplex`).
- Domain logic with unit tests (51 tests):
  - `reminders/schedule.ts` — cron + one-off next-run math, timezones, snooze.
  - `zones/resolve.ts` — target → device-set resolution, DND + online filters.
  - `devices/pairing.ts` — pairing codes + device secrets.
  - `livekit/token.ts` — grant scoping + JWT signing.
  - `auth/password.ts`, `auth/session.ts` — hashing + token handling.
- API routes: auth (`/api/auth/login|logout|me`), device registration/pairing
  (`/api/devices`, `/api/devices/claim`), presence heartbeat (`/api/presence`),
  initiate page/call/broadcast (`/api/page`), reminders CRUD (`/api/reminders`).
- Control-plane command types + a **mockable** control sender
  (`MOCK_LOCAL_SERVICES` fakes LiveKit/TTS so the app runs on a laptop).
- PWA shell: manifest, service worker (offline shell + push-wake scaffold),
  Login, Controller (hold-to-talk paging, auth-gated) and Endpoint
  (pair → lobby → auto-answer) UIs.
- `docker-compose.yml` (LiveKit + Postgres) and `livekit.yaml`.

**Still to come** (see the plan): zones/broadcast UI (Phase 2), the reminder
scheduler + Piper TTS (Phase 3), remote reach via tunnel + coturn + web push
(Phase 4), kiosk hardening (Phase 5), and the native Android device (Phase 6).

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

Requirements on the Vercel project:

- `DATABASE_URL` — Neon **pooled** URL (`pgbouncer=true`) for the app runtime.
- `DIRECT_URL` — Neon **direct** URL; `migrate deploy` uses it (via the schema's
  `directUrl`) because migrations must not run over the PgBouncer pool.
- `MOCK_LOCAL_SERVICES=true` until the home-server LiveKit SFU is reachable.

`prisma generate` runs in `postinstall`, so the client is always fresh.

> Note: previews and production share one Neon database today, so a preview
> deploy will apply new migrations to that database. Add a separate Neon branch
> per environment before that becomes a problem.

To add a schema change: edit `prisma/schema.prisma`, create a migration
(`prisma migrate dev --name <x>` against a dev DB, or hand-author the SQL under
`prisma/migrations/`), commit it, and push — the deploy applies it.

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
