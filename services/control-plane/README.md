# Control-plane spike

A long-running process that holds a socket to every panel, instead of every
panel polling over HTTP.

Built to settle ADR-003 with numbers. It runs beside production, replaces
nothing, and is deliberately the whole control plane in **one process with no
external state** — because that is the property under test: the same binary
has to run in the cloud for many households *and* on a Hub in one house, where
there is no Redis, no Vercel and possibly no internet.

```
npx tsx services/control-plane/bench/panels.ts 3000 3
npx vitest run services/control-plane
```

---

## What it replaces

| | Polling (today) | Connection (this) |
| --- | --- | --- |
| Liveness | POST every 10s, a Redis key with a TTL, a 20s window where the answer is wrong | the socket. Closes → offline, immediately |
| "Who is online?" | read N keys | a map lookup |
| "Who can I reach?" | ask LiveKit to list the room, over the network | a byproduct of sending |
| Settings change | panel re-fetches on its next beat, up to 10s later | pushed |
| Cost per panel | 6 req/min forever | 1 auth query, ever |

The last row is the one that matters. A panel up for a week costs **one**
database query. The poll costs 60,480.

## Measured

`3000 panels / 1000 households`, both client and server in one process on one
core — so real panels on real hardware make the server's share *lower* than
this, not higher.

```
connections
  established      3000 / 3000
  time to connect  2654ms  (1130/s)
  auth queries     3000   — one per panel, for the life of the connection

memory (both sides of every socket, in one process)
  baseline         9.3 MB
  holding 3000     59.9 MB
  per connection   17.3 KB

fan-out to a household
  p50              0ms
  p99              1ms
  delivered        600 / 600 panels in the 200 households touched

presence
  per lookup       0.38µs   — a map read, no store

disconnect
  closed 1500 → still registered 1500, presence correct

the same scale, polling every 10s
  requests         300/s, continuously
  db queries (was) 900/s   — 3 per beat
  db queries (now) 10.0/s  — throttled writeback only
  db queries (ws)  ~0      — 3000 at connect, then none
```

### Reading these honestly

- **17.3 KB per connection includes both ends.** The server's half is roughly
  half that. 1,000 households fits in well under 100 MB — a small instance,
  not a fleet.
- **`p50 0ms` means "below the clock's resolution"**, not zero. Fan-out is a
  map lookup and a socket write; there is no network round trip to measure.
- **1,130 connections/second** is the reconnect storm figure — what happens
  when the process restarts and every panel comes back at once. 3,000 panels
  recover in under three seconds.
- **The polling rows are arithmetic, not measurement.** Its cost is fully
  determined by the beat interval; nothing needs to be run to know it.

## What this does NOT do

Named so the spike is not mistaken for a migration:

- **Media stays on LiveKit.** This is the control path. Audio is a different
  problem and LiveKit solves it well.
- **It does not own the schema.** Same Postgres as the web app.
- **The job loop is not built.** Reminders and retention still run from the
  Vercel cron. Parallel per-household fan-out is the next piece and is where
  the *other* scaling ceiling is — `fireDueReminders` currently does one
  serial pass over every tenant inside a 60-second function.
- **Multi-instance is not solved.** One process holds its own connections. Two
  instances need either sticky routing or a shared view of who is where. On a
  Hub this is free — there is only ever one process. In the cloud it is the
  main open design question.
- **No panel client yet.** The web panel still heartbeats. Swapping it is a
  contained change to `usePanelPresence`, but it belongs to the decision, not
  the spike.

## On running this on a Hub

The reason the spike is shaped this way. Nothing above needs Redis, Vercel or
the internet:

- presence is in-process memory
- fan-out is sockets this process already holds
- auth is injectable (`Authenticate`), so a Hub could check local state instead
  of a shared Postgres

What is still cloud-shaped is the **database**. A Hub running this needs local
durable state and a reconciliation story with the cloud when it comes back —
that is the real work in a LAN-first deployment, and it is a data problem, not
a transport one. This spike shows the transport is not the obstacle.

## What it argues

The transport question is settled: a single small process holds every panel a
plausible business has, answers presence in sub-microseconds, and fans out in
under a millisecond, with no store and no window.

What is not settled, and should decide the rest:

1. **Multi-instance routing** in the cloud — sticky sessions, or a shared
   registry, or one process per region and accept the ceiling.
2. **Local durable state on a Hub** — the actual hard part of LAN-first.
3. **Operational appetite** — this is a process that can be down at 3am in a
   way a Vercel function cannot.

None of those are reasons the answer is no. They are the design work the answer
being yes would start.
