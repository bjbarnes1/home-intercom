# Follow Me — BLE room presence

Move the music into whichever room you walk into.

## Why the phone listens, not the panels

The obvious arrangement — panels scanning for a tag you carry — is the one we
cannot build. Web Bluetooth only talks to a device the user has picked out of a
chooser dialog: no passive scanning, nothing in the background. A panel running
in a browser cannot hear anything at all.

So it is inverted. Each room gets a beacon, and the phone already in your pocket
listens for it. On iOS that is CoreLocation beacon-region monitoring rather than
CoreBluetooth, which matters: region monitoring runs in the background, survives
the app being killed, and relaunches the app on a crossing. It is the only
mechanism on iOS where this works without the app being open, and this repo
already ships an iOS app using CoreLocation for places.

Android can do the same with a foreground service, and can additionally
advertise as a beacon — so an Android panel could be its own room beacon and
save buying hardware.

## Hardware

One iBeacon per room. One UUID for the household, `major`/`minor` per room, which
is the grouping CoreLocation monitors efficiently. Options, cheapest first:

- an Android panel advertising as a beacon (no extra hardware)
- a battery iBeacon keyfob per room, a few dollars each, a year or two of battery
- an ESP32 per room, if they are going in anyway for other sensing

Placement matters more than price: a beacon low and central in a room reads far
more consistently than one on a doorframe between two rooms.

## What is built

- `src/lib/ble/room.ts` — sightings to a room. Pure, 20 tests.
- `src/lib/ble/follow.ts` — applies a fix and says whether the music should move.
- `POST /api/ble/sightings` — the phone reports what it hears.
- `RoomBeacon`, `RoomFix`, `User.followMeMusic` — migration `10_room_beacons`.

The music itself moves through the handoff already built: `POST /api/music/handoff`.

## The part that is actually hard

Radio is noisy. RSSI swings several dB standing still, and a doorway sits
between two beacons by definition. Naively following the strongest beacon would
restart the music every few seconds and flap forever in a hallway.

Two defences, both in `room.ts` and both tested:

- a **median** over a short window, which discards a single spike from the next
  room without the lag of a long average
- **hysteresis**: the room you are in keeps the benefit of the doubt, and
  somewhere else must beat it by `marginDb` (default 6 dB, about the swing seen
  standing still) before the music follows

A third is the caller's polling interval: act on a fix when it is still the
answer next pass.

Losing the signal is deliberately **not** a move. A phone face-down on a sofa
stops being heard, and stopping the music for that would be the most annoying
thing this feature could do.

## The iOS side

`BeaconService.swift` monitors **one** region for the whole household, not one
per room. iOS allows twenty monitored regions per app in total and
`LocationService` is already spending that budget on places — a region
constrained only by UUID covers every room for a single slot, and the rooms are
told apart by ranging inside it, which is where the RSSI comes from anyway.

The two mechanisms do different jobs and neither is asked to do the other's:

- **Monitoring** (background, survives termination) says they are home and
  moving about. It is what wakes the app.
- **Ranging** (foreground, plus a short window after a background crossing)
  says which room. It is throttled to one report every ten seconds, because a
  person standing still does not need ten writes a minute.

A sighting with `rssi == 0` is dropped: that is CoreLocation's "unknown", and
taken at face value it reads as the strongest possible signal.

## Still to do

1. **Beacon setup UI in the app.** `POST /api/ble/beacons` exists and
   `createRoomBeacon` is on the client, but no screen calls it — beacons have
   to be added by hand for now.
2. **The toggle**: `followMeMusic` is on `User` and honoured by the API, but no
   screen sets it yet.
3. **Acting on `followTo`.** `BeaconService.onFollow` fires with the panel id;
   nothing is listening. The phone is not the thing that plays music, so this
   wants to reach the panel — most likely by calling the handoff API rather
   than doing anything locally.
4. **Tuning on real hardware.** The defaults are reasoned, not measured. Walk the
   house with logging on before trusting them.
5. **Nothing here has been compiled.** There is no Swift toolchain in the
   environment this was written in, so the Swift is careful but unverified.

## Worth knowing before the hardware order

Follow Me inherits Apple Music's one-stream-per-subscription limit: the music
moves rather than spreading. If the goal is the same song in several rooms at
once, that needs AirPlay 2 or Chromecast groups — which we can hand off to, but
cannot drive from a browser.
