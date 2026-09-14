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
| **Where** | Family map with places, who's at what, battery on low phones; add/edit places | `GET /api/location/people`, `/api/location/places` CRUD |
| **Settings** | Who's signed in, which server, location sharing, sign out | `GET /api/auth/me`, `GET/PATCH /api/location/sharing` |

Device registration and pairing stay in the web controller — that's an
admin-at-a-desk job with a QR code, not a phone job.

## Setting it up on a Mac

Xcode is macOS-only, so everything below runs on your Mac, not in a Linux
container or a cloud session.

```bash
brew install xcodegen      # once — see below if you don't have Homebrew
cd ios
./Scripts/bootstrap.sh     # generates HomeIntercom.xcodeproj
open HomeIntercom.xcodeproj
```

No Homebrew? XcodeGen builds from the Swift toolchain Xcode already ships:

```bash
git clone https://github.com/yonaskolb/XcodeGen.git ~/XcodeGen
cd ~/XcodeGen && make install
```

If `make install` can't write to `/usr/local`, don't install it at all — point
the bootstrap script at the source checkout instead:

```bash
cd ios
XCODEGEN="swift run --package-path ~/XcodeGen xcodegen" ./Scripts/bootstrap.sh
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
# Build for any simulator, without naming one
xcodebuild build -project HomeIntercom.xcodeproj -scheme HomeIntercom \
  -destination 'generic/platform=iOS Simulator'

# Tests need a concrete simulator. See what you actually have installed:
xcrun simctl list devices available

xcodebuild test -project HomeIntercom.xcodeproj -scheme HomeIntercom \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest'
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

## Location notes

The places-only tier of [`docs/LOCATION.md`](../docs/LOCATION.md) — geofence
arrivals and departures plus a coarse last-known position. No continuous GPS.

- **Two cheap sensors, no GPS burn.** Significant-change monitoring (cell-tower
  based, ~500m) for "roughly where is everyone", and region monitoring on the
  household's places for the signal that matters. Both wake even a *terminated*
  app, which is why this works at all as a native app.
- **Always authorisation is required**, and iOS only offers it as an upgrade
  after "While Using" — so the prompt may need accepting twice across sessions.
  With "While Using", arrivals are simply missed. Sharing → Permission says which
  one you're on.
- **iOS monitors at most 20 regions per app**, shared across the whole
  household. The server reports when you're over, because a geofence past the
  cap doesn't error — it just never fires.
- **Sharing is enforced server-side.** Outside a running live share, every fix is
  stored rounded to ~100m; the phone doesn't get to decide. Switching sharing off
  deletes the history immediately.
- **Places are edited on the phone**, not the web controller — adding "Home" is
  a standing-in-the-kitchen job. *Use my location* for somewhere you are; pan
  the map for somewhere you aren't (you can't stand in the playground to add
  School). Admin-only to change; everyone can see the list.
- `UIBackgroundModes` deliberately does **not** include `location` — that mode is
  for continuous updates, which this tier doesn't do.

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
