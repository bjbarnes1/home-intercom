# Hub gaps — what the old panel did that the Hub does not yet

The `/endpoint` panel was removed once the Hub was running on hardware. Four of its
six rails have no Hub screen yet, so their **server routes were deliberately kept**.
They currently have no caller. That is not an oversight, and a future dead-code sweep
should not take them out — it would mean writing them again.

| Rail (gone) | Route kept | Auth |
| --- | --- | --- |
| Messages | `POST/GET /api/endpoint/messages` | device |
| Schedule | `GET /api/schedule` | device |
| Jobs | `GET /api/jobs`, `POST /api/jobs/tick` | device |
| Reminders | `GET /api/endpoint/reminders` | device |

The user-authed halves of the same features — `/api/controller/schedule`,
`/api/controller/jobs`, `/api/reminders` — are live behind `/controller` and were
never at risk.

Three of the old panel's files moved rather than died, because the Hub runtime uses
them: `useEndpointPresence` → `src/app/hub/_runtime/usePanelPresence.ts` (renamed,
since there is no endpoint any more), `useMediaSession` → `src/app/hub/_runtime/`,
and `PairingScreen` → `src/app/hub/_components/`.

## The larger gap

Every Hub screen except Music and Weather still renders from `src/app/hub/data.ts` —
invented people, calendar entries and conversations. `/hub/broadcast`, `/hub/call`,
`/hub/open-line`, `/hub/me`, `/hub/profile` and `/hub/pin` make no network call at
all. The Hub is live, but as a shell: pairing, presence, overlays, music and weather
are real; the rest is a fixture.

`data.ts` says it of itself — *"when a screen gets a real data source, delete its
slice here rather than leaving both"*. That is the order of work: wire a screen, then
delete its fixture, so the file shrinks to nothing rather than quietly becoming the
thing the panel actually shows.
