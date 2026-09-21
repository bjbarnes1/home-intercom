# Architecture rules, and how we got them

This file exists because of a specific miss, described below. It is not process
for its own sake: every rule here is one we broke, with the consequence
attached, so the cost of ignoring it is on the page.

---

## The miss

Panel presence lived in Postgres. A wall panel heartbeats every ten seconds, and
the handler did three queries — authenticate by device secret, write
`lastSeenAt`, re-read the row for settings. Two panels in one house was
36 queries a minute, continuously, forever.

That kept a usage-billed database at a **96% duty cycle**. The gap between
queries never reached the minimum idle window, so the compute could never
suspend. Scale-to-zero is worth nothing against a workload that is always on by
construction.

The data itself had no business being there. Its lifetime is twenty seconds.
Nobody would notice if all of it vanished. It is written six times a minute per
panel and read once per page. Every property of it said "not a relational
table", and nothing in the process ever asked.

Moving it to Redis took the heartbeat to **zero** Postgres queries in the common
case and dropped `lastSeenAt` writes from ~720/hour to ~24/hour.

### How the miss survived so long

Four separate failures, and the last one is the important one:

1. **It was a default, not a decision.** Presence went into Postgres because
   Prisma was already wired up and `Device` was already a table. Nobody chose
   it; it was the path of least resistance, and a path of least resistance is
   not an architecture.

2. **Nothing counted the cost per unit of scale.** The heartbeat's price is
   "36 queries/min per household, growing with panels". Written down, that
   number argues with you. Never written down, it is invisible until the bill
   arrives.

3. **The symptom was diagnosed, then the wrong remedy was prescribed.** A
   platform review correctly identified the cost and latency shape. It
   prescribed enabling database autoscaling and moving the compute region.
   Both were real improvements and **neither touched the cause** — autoscaling
   cannot help something that is never idle. Acting on the prescription
   produced motion and no fix.

4. **The actual cause was found by a question, not by the process.** It surfaced
   because someone asked "is the heartbeat running to the database?" — not
   because any review, test or checklist would have caught it. That is the
   failure. A system that only finds its biggest cost driver when a human
   happens to ask the right question has no mechanism; it has luck.

   Two errors in that same conversation are worth recording, because they show
   how easily the wrong number survives: the query count was first stated as
   24/min when it was 36 (the auth lookup runs before the handler body and was
   not read), and the minute-by-minute cron was first named as the cost driver
   when it was 1 query/min against the heartbeat's 24. Both came from reasoning
   about the code instead of counting it.

---

## Rule 1 — Data placement is a decision with four questions

Before any new data gets a home, answer these **in writing**, in the PR:

| Question | Presence's answer |
| --- | --- |
| **Lifetime** — how long is it true? | 20 seconds |
| **Write rate** — per what unit of scale? | 6/min **per panel** |
| **Durability** — what breaks if it is all lost? | Nothing. It rebuilds in 10s |
| **Readers** — who asks, and how often? | The delivery path, on a page |

Then place it:

- **Short lifetime, high write rate, no durability requirement** → Redis, with a
  TTL that *is* the semantic window. Presence, rate limits, caches, locks,
  ephemeral session state.
- **Long lifetime, low write rate, loss is unacceptable** → Postgres. Households,
  people, devices, places, reminders, the audit log.
- **Long lifetime, high write rate** → stop and design. This is the case that
  needs partitioning, batching or a different store, and it is the one that
  quietly becomes a migration if you guess.

"It is already in Prisma" is not an answer to any of these.

## Rule 2 — Hot paths carry their cost in the PR

Anything invoked per-second, per-10-seconds, or per-request-from-every-device
states its cost in the description, as **operations per minute per unit of
scale**:

> `/api/presence`: 0 Postgres queries, 2 Redis ops per beat.
> 6 beats/min **per panel**. At 1,000 households × 3 panels: 300 req/s.

Per *panel* and per *household* are different denominators and the difference is
3× in this product. Say which one you mean.

If a change adds a query to a hot path, that is the change — not an incidental
detail of it.

## Rule 3 — Measure before you accept a remedy

A review that reports a symptom has done half the work. Before acting on what it
prescribes, trace the symptom to a mechanism and confirm the remedy touches it.

The test is one question: *if we do this, which number moves, and by how much?*
If that cannot be answered, the remedy is a guess wearing a recommendation's
clothes. "Enable autoscaling" could not have answered it — the workload was
never idle.

This applies to reviews from people, from tools, and from Claude.

## Rule 4 — Instrument the denominators, don't wait to be asked

The miss was found by a question. Questions are not a mechanism. What would have
caught it:

- A standing check on **queries per minute per household**, reviewed when it
  moves rather than when the bill does.
- Duty cycle as a tracked number. 96% is not a cost signal to interpret later;
  it is a design error visible on day one.
- Route-level tests that pin query *counts*, not just responses — see
  `src/app/api/heartbeat.test.ts`, which fails if the database returns to the
  heartbeat. A comment claiming "this is cheap now" would not.

## Rule 5 — Failure direction is per call site, and it is written down

Every dependency on an external store declares which way it fails and why, at
the top of the module. The reasoning differs by call site and the wrong default
is silent:

- **Reading liveness fails OPEN** (everyone online). LiveKit's participant list
  is the authority on delivery; reporting everyone offline would silently stop
  every page, announcement and reminder in the house.
- **The durable writeback fails CLOSED.** Skipping it costs nothing; doing it
  per-beat during an outage is exactly the load being removed.
- **Rate limiting fails OPEN.** Locking every household out of their own house
  is worse than the guessing it slows.
- **The auth cache falls through to Postgres.** Worst case is the load we had
  before. It never invents a device.

"Fails open" and "fails closed" are both correct answers. Having never chosen is
not.

---

## Decision log

Decisions that shape the system, with the evidence. Append; do not rewrite.

### ADR-001 — Presence belongs in Redis, not Postgres
**2026-09-21 · Accepted · Implemented**

Measured: 36 Postgres queries/min for a two-panel household; 96% duty cycle on
the database compute; `compute_time_seconds` 1.33M in 16 days for one
household. Presence has a 20-second lifetime and no durability requirement.

Moved to a Redis key whose TTL is the presence window. `Device.lastSeenAt`
survives as the durable "when did we last hear from this at all" signal —
a different question, worth keeping, throttled to one write per device per five
minutes.

Verified in production: 59 heartbeats in five minutes produced zero
`lastSeenAt` writes, with panels still beating at full rate.

### ADR-002 — Vercel function region pinned to `syd1`
**2026-09-21 · Accepted · Implemented**

Functions ran in `iad1` while the database is in `ap-southeast-2`, putting the
Pacific in the middle of every query. Confirmed live as `x-vercel-id:
iad1::iad1`. Pinned in `vercel.json` rather than the dashboard so it is
reviewable and travels with the repo.

AU-first is not AU-only. Going global means a region per customer cluster with
data resident near them — a tenancy decision before a config one. See ADR-003.

### ADR-004 — Device OS: AOSP or custom Linux?
**2026-09-21 · OPEN — recommendation made, needs a week of measurement**

See `docs/architecture/device-os.md`. Recommends AOSP, on the grounds that the
panel runs in a browser either way (so "lean Linux" is not on the table, only
whose browser and audio stack), that Web Bluetooth cannot scan at all — already
blocking Follow-Me and costing a beacon per room — and that Apple Music's EME
requirement probably makes Widevine a licensing project on custom Linux.

That last point is flagged rather than asserted: it came from reading the
MusicKit bundle, not from a test on hardware, and it is the highest-value thing
to check first. §6 of the doc is a week of measurement on two dev boards that
would settle it with evidence.

Honest counterweight: the control-plane daemon is genuinely easier on Linux,
which matters because LAN-first is why it exists.

### ADR-003 — Is Vercel the right platform?
**2026-09-21 · OPEN — needs a decision**

See `docs/architecture/platform.md`. Summary: Vercel is right for the web
surfaces and increasingly wrong for the control plane, and the control plane is
where this product's hard parts are. Recommendation is to split rather than
migrate. Open until decided.

**Spike built and measured** — `services/control-plane/`. 3,000 panels across
1,000 households in one process: 59.9 MB for both sides of every socket,
fan-out p99 1ms, presence 0.38µs per lookup, and one database query per panel
for the life of the connection against 900/s for the polling it replaces.

The transport question is answered: it is not the obstacle. What remains open
is multi-instance routing in the cloud, local durable state on a Hub (the
actual hard part of LAN-first, and a data problem rather than a transport one),
and operational appetite.
