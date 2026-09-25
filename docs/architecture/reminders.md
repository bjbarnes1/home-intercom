# Reminders & Notifications module

Status: built on `feat/reminders-module`, Sep 2026. Replaces the fire-and-forget
reminder (a spoken card that disappears on its own) with a reminder the
household can **act on**: Done, Snooze or Dismiss. The Hub is where they
answer it.

## 1. Data model

```
Reminder (the series)                 ReminderOccurrence (one firing)
─────────────────────                 ───────────────────────────────
text        title, shown and spoken   reminderId, householdId
details     context                   scheduledFor  the slot  ─┐ @@unique
kind        ONE_OFF | RECURRING       status        PENDING/SNOOZED/COMPLETED/DISMISSED
recurrence  RecurrenceRule JSON       snoozedUntil, snoozeCount
cron        legacy only               firedAt, fireCount
runAt       one-off time              resolvedAt, resolution  user|superseded|expired|missed
nextRunAt   next *series* slot        resolvedByDeviceId / resolvedByUserId
status      mirrors the series
assigneeUserId | assigneeKidId   (CHECK: at most one)
targetDeviceId | targetZoneId    (where it rings)
```

**Why occurrences.** Status belongs to a *firing*, not to a reminder. "Bins
every Tuesday" is never "completed". Tonight's bins are. The old model kept
`snoozedUntil` on the reminder and let it override the next run, so a long
snooze could swallow the following slot. Now a snooze re-fires the *same*
occurrence and never touches the series.

**Assignee vs target.** *Who it's for* (assignee: a person) and *where it rings*
(target: a panel or zone) are separate. When no target is given, it is picked
by rule: the assignee's own panel ("Gus" → Gus's room), then the panel it was
made on, then the widest zone.

**Assignee is two nullable FKs** because people are still split across `User`
and `Kid`. It collapses to one `person` FK when the identity migration (D2)
lands.

Migration `13_reminders_module` only adds columns and tables. It was checked by
applying all 14 migrations in order to a clean Postgres 16.

## 2. Recurrence (`src/lib/reminders/recurrence.ts`)

A structured rule, not cron:

| freq | fields | example |
|---|---|---|
| `daily` | interval | every 3 days |
| `weekly` | interval, weekdays[] | every Tue; every other Tue (interval 2); weekdays |
| `monthly` | interval, monthDay | the 15th; the 31st is clamped to the last day |
| `monthly_nth` | interval, nth (1–4, -1), weekday | 2nd Tuesday of the month; last Friday |

Every rule also has `time` (local HH:mm), `start` (local date; anchors the
interval phase) and an optional `until`.

Cron cannot express "every other Tuesday", because it has no phase. "Every 2nd
Tuesday" is also ambiguous in English, so the rule makes the reading explicit
and stored. All maths is on wall-clock time in the household's IANA zone, so
7:30 pm stays 7:30 pm across DST (tested against Melbourne's 4 Oct change). The
rule exports to an RFC 5545 RRULE (`toRRule`) for calendars and MCP. Legacy cron
rows keep working.

## 3. Background execution: the timer

The .NET-style `BackgroundService` equivalent is **`ReminderScheduler`**
(`scheduler.ts`). It has a `start()` / `stop()` lifecycle and one loop. Shutdown
is graceful: `stop()` waits for the pass in flight.

**Sleep until due, capped.** After each pass the scheduler asks for the earliest
instant anything is due: a series slot, a snooze ending, or an alert ageing out.
It sets one `setTimeout` for exactly then, clamped to `[250 ms, 30 s]`:

- The **30 s cap** bounds lateness for rows another process wrote. It also
  bounds drift after the host sleeps: a late timer just runs a pass that finds
  things overdue.
- The **250 ms floor** stops an overdue row that keeps failing from spinning the
  loop. A failed pass backs off 5 s.
- **`wake()`** short-circuits the sleep. Create and snooze emit `changed` on the
  in-process bus, so a reminder set for two minutes from now is timed exactly.
- A wake that arrives *during* a pass is remembered and runs straight after.
  There is **never more than one pass in flight** per process.

A reminder therefore fires at 7:30:00, not somewhere between 7:30:00 and
7:30:59.

**Hosting.** `src/instrumentation.ts` starts the scheduler when
`REMINDER_SCHEDULER=inprocess`, on the Node runtime. That is the setting for
`next start` on a home server or on the Hub itself. On Vercel a function lives
for one request, so Vercel Cron → `/api/cron/tick` stays the scheduler there.
The two can run together.

**Correctness does not depend on the timer.** The engine (`engine.ts`) is
idempotent under concurrency:

1. **Optimistic claim** on `Reminder.nextRunAt`. The loser of a race updates 0
   rows and moves on.
2. **`@@unique([reminderId, scheduledFor])`**. A slot can become only one
   occurrence (P2002 → already fired).
3. **Optimistic claim** on a snoozed occurrence's `snoozedUntil`.

Work is partitioned by household, with 4 households in parallel. The old loop
was serial across every tenant.

**Late-firing policy** (`policy.ts`):

- Up to 2 min late: fire normally.
- A recurring slot more than 30 min late is **skipped**, recorded as missed. Bins
  announced at 2 am because the server came back then is worse than silence.
- A one-off gets 60 min before it is skipped the same way.
- Anything in between fires flagged `late` ("was due 7:30 pm").
- An alert unanswered for 6 h is closed as `expired`.
- A new slot supersedes an unanswered earlier one.

## 4. AI natural-language parsing (`src/lib/reminders/ai/`)

```
"Remind Sophia to take out the bins every Tuesday night"
   │ 1 extract   Claude, forced strict tool call → labelled slots
   │ 2 validate  zod (model output is untrusted input)
   │ 3 resolve   code, against this household
   ▼
draft { title "Take out the bins", assignee Soph (user),
        when weekly [Tue] 19:30 }            → "Soph · Every Tuesday at 7:30 pm"
   │ 4 confirm   a person, in the Creation Modal
   ▼
createReminder()
```

**The model is a parser, not a calculator.** It reports what was said as slots
("tue", "night", "tomorrow", the name as spoken). It never produces a timestamp,
a database id, a cron string or the spoken line. `resolve.ts` turns slots into
facts using written-down rules, all tested:

- **Parts of day** have household defaults: night is 7:30 pm, after school is
  3:45 pm, and so on.
- **"At 7" with no am/pm and no day** means the next 7 o'clock that hasn't
  passed. With a day named, 7–11 is am and 1–6 is pm.
- **A past time with no day named** rolls to tomorrow. This fixes report #1
  bug 9 at its root.
- **"Every 2nd Tuesday"** is read as fortnightly, and the draft says so.
- **Names** are fuzzy-matched to members: exact, then prefix ("Sophia" ↔ "Soph"),
  then one edit away. An ambiguous or unknown name is flagged, never guessed.

This is the capstone research's rule (the model must not produce the value)
applied here. It keeps date arithmetic out of the model and household ids out
of the prompt.

**Parsing never blocks on AI.** `fallback.ts` fills the same slots with regexes
for the common shapes. It runs:

- when there is no API key, or the household is over its parse allowance (30 per
  10 min, Upstash);
- when the model is slow (8 s budget), unreachable, or off-schema.

That is the minimal non-subscription path for the hardware. The response
carries `source: "ai" | "fallback"`.

Nothing the parser returns is written until a person confirms it. The panel
calls `/api/endpoint/reminders/parse`, which writes nothing. The controller's
`/api/reminders/parse` keeps its commit-on-parse behaviour (`commit: true` by
default) so the phone UI is unchanged.

## 5. Real-time UI state

```
engine / service ──reminder, reminderState, remindersChanged──▶ LiveKit lobby
                                                                    │
usePanelPresence ──onReminder / onReminderState / onChanged──▶ ReminderStore
GET /api/endpoint/reminders/today (poll 60 s + on change) ──────▶     │
this panel's taps (optimistic, rolled back on refusal) ─────────▶     │
                                                                    ▼
                   useSyncExternalStore → Triggered Alert · toast · Home card · agenda
```

- **Fired:** the panel gets `reminder` with an `occurrenceId`. It raises the
  Triggered Alert (instead of the transient spoken card) and marks the agenda
  row due, in the same render. The voice plays as before.
- **Acted on anywhere:** `reminderState` goes to *every* active panel in the
  household, so Done in the kitchen clears the same alert in the bedroom.
- **Changed shape** (create/edit/delete): `remindersChanged` carries no data.
  Panels refetch, so there is one read path.
- **Recovery:** the snapshot poll converges any panel that missed a message. A
  missed message costs one poll, never a wrong screen, and mock mode (no lobby)
  still works.
- **Races:** a snapshot read just before a local tap cannot resurrect the alert.
  Unconfirmed local actions outrank the server for 15 s.

The reducers are pure and tested (`store.test.ts`).

## 6. Touch UI (`src/app/hub/reminders/`)

- **Triggered Alert.** Built on the one Overlay Card.
  - Done and Snooze are the largest targets in the system (`--touch-hero`).
  - Snooze opens in place: 5 min, 15 min, 1 hour, Tomorrow at the same time, or
    "Pick a time…" with ± steppers.
  - It never disappears on its own. Its stated exit is **Later**, which tucks it
    into a pill at the top of every screen. It tucks itself after 2 min
    untouched.
  - Interruption priority: ring > live call > spoken broadcast > reminder.
- **Creation Modal**
  - A say-it-or-type-it line, with "Fill in" running the parser.
  - Below it: avatar chips for who, day tiles, ± hour/5-min steppers with
    am/pm and quick-pick times, round weekday toggles, fortnightly/monthly
    options.
  - No native date/time inputs: kiosk browsers open mouse-sized pickers.
  - A live read-back line shows what will be saved.
- **Daily Agenda.** The `/hub/reminders` screen (full day, done and missed
  included, large check targets). Home keeps its one-fact rule with a live
  "Next reminder" card, which replaces the `data.ts` fixture.
- **Touch tokens.** `--touch-min` / `--touch-hero` / `--touch-gap` are set per
  size tier in `globals.css`. They are pixel values computed from each tier's
  pixel density to hold ~10 mm physical. CSS `mm` cannot do that.

## 7. API

| Route | Auth | |
|---|---|---|
| `GET /api/endpoint/reminders/today` | device | agenda, alerts ringing here, members |
| `POST /api/endpoint/reminders` | device | create from the Creation Modal |
| `POST /api/endpoint/reminders/parse` | device | NL → draft, no write |
| `POST /api/endpoint/reminders/occurrences/:id` | device | complete / dismiss / snooze |
| `POST /api/reminders/occurrences/:id` | user | same, from a phone |
| `POST /api/reminders` | user | accepts the new draft shape *and* the old one |
| `POST /api/reminders/parse` | user | via ReminderParser; `commit` defaults true |

Every write goes through `service.ts`, whose functions take the householdId from
the caller's authenticated identity.

## 8. Known gaps

- DB-touching orchestration (`engine.ts`, `service.ts`) has no automated tests.
  The Prisma query engine could not be downloaded in the build sandbox. Pure
  logic is covered (≈110 new tests). An `authorization.test.ts`-style fake-Prisma
  suite for the new routes is the next thing to add.
- Deliver-time audio is synthesised per occurrence. A per-reminder cache would
  save TTS spend on recurring reminders.
- A reminder can't be marked done before it fires, because there is no
  occurrence yet. Pre-completing would mean creating the occurrence early.
- Phone push for assignees without a panel (e.g. a parent at work) isn't wired.
  The web-push plumbing exists.
