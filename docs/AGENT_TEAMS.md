# Home Intercom — Agent teams & delivery playbook

This repo is delivered with a **program office** plus **per-feature product teams**.
The orchestrating agent in Cursor must follow these gates for material feature work.

## Program office

| Role | Skill | Owns |
|------|-------|------|
| Senior Software Architect | `home-intercom-architect` | Control vs media plane, Prisma, LiveKit, auth boundaries, maintainability |
| Program Product Manager | `home-intercom-program-pm` | Roadmap priority, acceptance criteria, release notes |
| QA & Test Lab Lead | `home-intercom-qa-lead` | Regression matrix, release gate, vitest + manual kiosk checks |

## Feature product teams

Each team uses the same role composition (skills below), scoped by charter:

| Team | Owns |
|------|------|
| **Intercom** | Page / call / live broadcast, ring / hangup, DND semantics, lobby presence |
| **Voice & Announce** | Text announce, OpenAI Ash TTS, chime, `audioUrl` playback |
| **Reminders & Schedule** | Reminders, cron fire, calendar / Schedule rail, quiet hours |
| **Jobs** | Chore board, streaks, controller chore CRUD |
| **Devices & Hardware** | Pairing, device settings, LED / cue contract, kiosk hardening |
| **Platform & Ops** | Auth, Neon / Vercel / cron / env, migrations, MOCK mode |

### Standard team roles

| Role | Skill |
|------|-------|
| Feature Product Manager | `home-intercom-feature-pm` |
| UI Specialist | `home-intercom-ui-specialist` |
| Psychologist (family / kids UX) | `home-intercom-psychologist` |
| Business Analyst | `home-intercom-ba` |
| Developer | `home-intercom-developer` |
| Feature QA | `home-intercom-feature-qa` |

## Delivery gates (every increment)

1. **Program PM** — charter: goal, non-goals, acceptance criteria.
2. **BA + Psychologist + UI** — requirements and UX notes (alerts, kids, voice tone).
3. **Architect** — approve technical approach and boundaries.
4. **Developer** — implement + domain unit tests under `src/lib/**/*.test.ts`.
5. **Feature QA** — feature checklist (mock and, when audio, real LiveKit).
6. **Program QA** — short regression: pair, page, announce, reminder tick, DND.
7. **Architect** spot-check + **Program PM** README update if user-facing / env changes.
8. Deploy / migrate only after gates 5–7.

## Regression smoke (Program QA)

- Sign in → `/controller` lists online endpoints.
- Page one room (hold-to-talk); End / hangup clears both sides.
- Broadcast → Say something reaches connected speakers (Ash when configured).
- Reminder cron path: `fireDueReminders` / `/api/cron/tick` with due row.
- Endpoint DND: reminders suppressed; pages still ring.
- Pairing: expired code rejected; fresh code claims.

## Invocation

When starting a feature, say which team owns it and load the matching skills
(e.g. Voice & Announce + architect + feature-qa). Do not skip Program QA on
user-visible or media/control-plane changes.
