# Home Intercom — iOS controller

A native SwiftUI app for the **Controller** role: the parent's iPhone that
pages a room, calls it back, broadcasts to the house, and sets reminders. The
room devices (wall panels) stay on the kiosk PWA at `/endpoint`.

It talks to the same Next.js backend as the web controller — **no server
changes were needed**. Sign-in uses the existing `intercom_session` cookie, and
`URLSession` stores and replays it, so a signed-in phone stays signed in for the
server's 30-day sliding window.

## What's here

| Screen | What it does | Backend |
|---|---|---|
| **Home** | Zones and rooms with live presence, polled every 5s while foregrounded | `GET /api/devices`, `GET /api/zones` |
| **Page / Call** | Hold-to-talk paging (one way) and two-way calls (rings first) | `POST /api/page`, `POST /api/page/hangup` + LiveKit |
| **Broadcast** | "Say something" spoken by Ash TTS, or hold-to-broadcast live to a zone | `POST /api/announce`, `POST /api/page` + LiveKit |
| **Reminders** | Plain-words reminders via Claude, plus a manual form; enable/disable/delete | `POST /api/reminders/parse`, `GET/POST /api/reminders`, `PATCH/DELETE /api/reminders/:id` |
| **Settings** | Who's signed in, which server, sign out | `GET /api/auth/me`, `POST /api/auth/logout` |

Device registration and pairing stay in the web controller — that's an
admin-at-a-desk job with a QR code, not a phone job.

## Setting it up on a Mac

Xcode is macOS-only, so everything below runs on your Mac, not in a Linux
container or a cloud session.

```bash
brew install xcodegen      # once
cd ios
./Scripts/bootstrap.sh     # generates HomeIntercom.xcodeproj
open HomeIntercom.xcodeproj
```

On first open Xcode resolves the **LiveKit Swift SDK** from Swift Package
Manager (needs network, takes a minute). Then ⌘R.

The `.xcodeproj` is **generated and git-ignored** — `project.yml` is the source
of truth. Re-run `./Scripts/bootstrap.sh` after adding files or changing build
settings. Source files are globbed, so new `.swift` files under
`HomeIntercom/Sources/` are picked up with no edit to `project.yml`.

### Running on a real iPhone

You need a signing team, even a free Apple ID:

1. Xcode → Settings → Accounts → add your Apple ID.
2. Put the team ID in `ios/Local.xcconfig` (created by the bootstrap script, and
   git-ignored):
   ```
   DEVELOPMENT_TEAM = ABCDE12345
   ```
   A free account also needs a globally unique bundle id — uncomment and change
   `PRODUCT_BUNDLE_IDENTIFIER` in the same file.
3. Re-run `./Scripts/bootstrap.sh`, pick your iPhone, ⌘R.

Free-account provisioning profiles expire after 7 days; a paid Developer
account (or TestFlight) avoids re-installing weekly.

### From the command line

```bash
# Unit tests on a simulator
xcodebuild test -project HomeIntercom.xcodeproj -scheme HomeIntercom \
  -destination 'platform=iOS Simulator,name=iPhone 15'

# Build only
xcodebuild build -project HomeIntercom.xcodeproj -scheme HomeIntercom \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

## Pointing it at a server

The shipped default is `https://intercom.zeebee.au`, set in one line —
`AppSettings.shippedBaseURL` in `HomeIntercom/Sources/Core/AppSettings.swift`.
Change it there for new installs.

At runtime, **Settings → Server** (also reachable from the sign-in screen)
repoints the app without a rebuild:

- `https://intercom.zeebee.au` for normal use;
- `http://192.168.1.20:3000` (your Mac's LAN IP, not `localhost`) to hit
  `npm run dev` from a physical phone — plain HTTP to a LAN address is allowed
  by the `NSAllowsLocalNetworking` exception in `project.yml`.

Changing the server signs you out and drops the old session cookie, so one
household's cookie never rides along to another host.

## Audio notes

- **Microphone permission** is requested the first time you page or call. Deny
  it and the app says so rather than silently connecting a dead mic.
- **Background audio** is enabled, so a call survives the screen locking.
- Pages and broadcasts use `.videoChat` mode (we're talking *out*); calls use
  `.voiceChat`, which turns on echo cancellation.
- If the server runs with `MOCK_LOCAL_SERVICES=true` there is no SFU to reach.
  The app detects that from the response and says "mock mode — no live audio"
  instead of hanging on a connection that can't succeed.

## Layout

```
HomeIntercom/Sources/
  App/          HomeIntercomApp, RootView (splash → login → controller), tabs
  Core/         APIClient, API models, AppSettings, HouseholdStore,
                DeliverySummary, OKLCH + Theme
  Talk/         TalkController — every LiveKit call the app makes
  Components/   TalkButton, IdentityCard, PresenceDot, StatusBanner, SectionLabel
  Features/     Login, Home, Talk, Broadcast, Reminders, Settings
HomeIntercomTests/   decoding, settings, theme and delivery-summary tests
```

Two deliberate choices:

- **Every LiveKit call lives in `Talk/TalkController.swift`.** If the SDK's
  surface shifts between versions, there is exactly one file to fix.
- **The colour system is ported as maths, not hex.** `OKLCH.swift` implements the
  same oklab conversion and mixing the browser does, so the tokens in
  `Theme.swift` are the literal values from `src/styles/identity.css`. Re-tune a
  hue on the web and you change the same two numbers here — no second palette to
  keep in step. See `docs/handoff/colours/`.

## Known rough edges

None of this was compiled before it landed — it was written in a Linux
container, where Xcode doesn't exist. Expect to fix a few things on first build:

- **The app icon is an empty placeholder.** Drop a 1024×1024 PNG into
  `HomeIntercom/Resources/Assets.xcassets/AppIcon.appiconset/` and add its
  `filename` to that set's `Contents.json`. Simulator builds warn; archiving
  for a device needs a real icon.
- **The LiveKit SDK surface is the likeliest thing to need a touch-up.** It's
  pinned to 2.0.14+ and confined to `Talk/TalkController.swift`. If a delegate
  callback signature has drifted, Swift won't error — `RoomDelegate`'s methods
  have default implementations, so a stale signature silently stops firing. The
  symptom would be a call that never leaves "Ringing…" even after the panel
  answers.
- **Reminder times.** The manual form sends the phone's current timezone. If you
  set reminders while travelling, they fire on the household's schedule as the
  server computed it, not as you meant it locally.

## Not built yet

- **Push wake.** A backgrounded phone won't ring for an incoming call; that
  needs the web-push/APNs work in Phase 4 of `docs/PLAN.md`, plus CallKit for
  a real incoming-call screen.
- **The Endpoint role** (pairing, lobby, auto-answer) — wall panels stay on the
  PWA.
- **Controller "Manage" CRUD** (schedule / jobs / music) — web-only for now.
- **Recorded-voice broadcast** — still open on the web side too.
