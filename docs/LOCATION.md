# Location & presence — design note

Two features, often conflated, with almost nothing in common technically:

1. **Live location sharing** — where family members are *in the world*
   (Life360-shaped): a map, arrival/departure events, "is Willoughby home yet".
2. **Endpoint proximity** — where someone is *in the house*: walk up to the
   kitchen panel and it greets you in your colour with your jobs and calendar.

They need different sensors, different battery strategies and different data
models. Build them separately.

---

## The constraint that shapes everything: BLE on iOS

The Follow-me backlog entry originally proposed **the phone advertising** over
BLE and **the room devices scanning** for it. On iOS that does not work, and
it's worth understanding why before anything gets built on the assumption.

When an iOS app using CoreBluetooth advertises as a peripheral and then goes to
the background, two things happen: the local name stops being advertised, and
every service UUID moves into a special **"overflow area"**. That area is
undocumented and can only be decoded by another **Apple** device that is
explicitly scanning for the exact UUID it's looking for.

So a backgrounded iPhone advertising to an Android tablet running Fully Kiosk is
invisible. And a phone that only advertises while the app is *foregrounded* is
useless for presence — the whole point is that it works with the phone in your
pocket.

**Invert it.** The room device becomes the beacon; the phone becomes the
listener:

```
  ✗  iPhone advertises  →  room device scans      (dies in the background)
  ✓  room device beacons →  iPhone monitors region (survives termination)
```

iOS supports the listening direction properly, through Core Location rather
than CoreBluetooth. `startMonitoring(for: CLBeaconRegion)` keeps working when
the app is backgrounded *or fully terminated* — iOS relaunches the app and gives
it a few seconds to report in. It needs **Always** location authorisation, and
the work done on wake must be quick or the system wakes you less often.

References:
- [The Mystery of iOS Background Service Advertising](https://github.com/davidgyoung/ios-overflow-area)
- [Apple Developer Forums — advertising in background](https://developer.apple.com/forums/thread/11705)
- [Estimote — iBeacon background monitoring](https://developer.estimote.com/ibeacon/tutorial/part-2-background-monitoring/)

### What this costs

A beacon per room. Options, cheapest effort first:

| Option | Notes |
|---|---|
| Dedicated BLE beacon (~$10–20/room) | No software. Batteries last a year or more. Simplest. |
| Raspberry Pi Zero W per room | More work, but it's a computer you can also use for other things. |
| Companion Android app on the panel | Most Android devices support BLE peripheral mode, but Fully Kiosk won't do it — this means writing and maintaining an app. |
| **The planned custom LED device** | Its natural home. A room device that already has an LED bar and a screen should beacon too. |

### Honest expectation on latency

Background region monitoring reports *enter* within seconds-to-minutes, and
*exit* can lag considerably longer — iOS deliberately debounces to save power.
So "I walk up and the panel lights up instantly" is **not** what background
monitoring alone delivers. It delivers "Dad is in the kitchen area" within a
reasonable window.

For the snappy version you need RSSI **ranging**, which is precise
(immediate/near/far) but only runs reliably while the app is foregrounded. A
practical compromise: background monitoring sets the coarse room, and anything
needing precision either accepts the lag or triggers on a different signal
entirely (the panel's own touch, or Wi-Fi association).

Walls attenuate BLE heavily, so adjacent rooms will bleed into each other. Turn
beacon TX power **down**, and add hysteresis in the presence service so
someone standing in a doorway doesn't make two panels flicker at each other.

---

## Feature 1 — Live location sharing

No hardware. Works today on any iPhone. Bigger immediate payoff than proximity,
and it unlocks a feature this app is uniquely placed to offer (see *Crossover*).

### Battery strategy — three tiers

Continuous GPS would flatten a phone by lunchtime. Use the cheapest sensor that
answers the question:

| Tier | API | Cost | What it's for |
|---|---|---|---|
| Baseline | `startMonitoringSignificantLocationChanges()` | Very low — cell-tower based, ~500m | "Roughly where is everyone." Relaunches a terminated app. |
| Events | `CLCircularRegion` monitoring | Low | Home / school / work / sport. The *useful* signal: arrivals and departures. |
| Live | `startUpdatingLocation()`, high accuracy | High | Only when someone taps "share live", and **must auto-expire** (30–60 min). |

**Hard limit worth designing around:** iOS monitors at most **20 regions per
app**. Five people's worth of places adds up fast — the places are per
household, not per person, so budget them deliberately.

### Data model sketch

```
Place         householdId, name, lat, lng, radiusM, icon
LocationPing  userId, lat, lng, accuracyM, capturedAt, batteryPct, source
PlaceVisit    userId, placeId, arrivedAt, leftAt
LocationShare userId, mode (off | places_only | live), liveUntil
```

`LocationShare` is the consent record, not a setting buried in a menu — see
*Privacy*.

### API sketch

```
POST /api/location/ping      # phone reports a fix (device-secret or session auth)
GET  /api/location/people    # map view: everyone's last known position
GET  /api/location/places    # geofence definitions the phone should monitor
POST /api/location/places    # admin CRUD
```

The phone pulls `places` on launch and after any change, and registers them as
`CLCircularRegion`s. Geofence crossings are computed **on the phone** (that's
what Core Location gives you for free) and posted as events; the server doesn't
need a stream of raw fixes to know someone got home.

### Crossover — the feature that justifies all of it

A geofence event can fire an existing intercom action. "When Willoughby's phone
enters Home, announce *Willoughby's home* on the kitchen panel." That's a
one-line rule on top of machinery this repo already has — `POST /api/announce`
already takes text and a zone. Life360 can't do that; your house can.

**Built.** `PlaceRule` holds the rules, the ping route fires them when a visit
opens or closes, and everything announces through the same
`deliverAnnouncement()` the controller uses — so arrivals respect each panel's
do-not-disturb and murmur rather than call out inside its quiet hours.

Two details that matter in practice:

- **Cooldown.** A phone parked on the edge of a geofence crosses it over and
  over. Without a per-rule, per-person cooldown the house announces the same
  arrival five times and the feature gets switched off. Default 15 minutes, and
  the stamp is written even when nothing was reached — the rule *did* fire;
  that no speaker was connected isn't a reason to retry a minute later.
- **Never fails the ping.** Firing is wrapped so a broken announcement can't
  fail the location report that triggered it. Losing the ping would lose the
  arrival itself.

Still open, same shape: a reminder that fires on *arrival* rather than a clock.
"Remind me to put the bins out when I get home."

---

## Feature 2 — Endpoint proximity

Given the inversion above:

1. Each room device beacons a shared household UUID with a per-room
   `major`/`minor`.
2. The iPhone registers those as `CLBeaconRegion`s and monitors them.
3. On enter/exit it posts to the server, which updates a presence record.
4. The panel subscribes (the lobby control channel already exists — this is a
   new control command, not new transport) and renders that person: their
   identity colour on the LED bar, their jobs, their next calendar event.

### Data model sketch

```
RoomBeacon    deviceId, uuid, major, minor, txPower
NearbyPerson  userId, deviceId, enteredAt, lastSeenAt, rssi
```

### Open questions

- What does a panel show when **two** people are near it? Both? The one who
  arrived most recently? Nothing personal at all?
- Should a panel showing someone's calendar auto-clear after a dwell timeout —
  the way announcements already do via `announceDwellSec`?
- Does proximity gate anything, or is it purely presentational? (A panel that
  unlocks something based on a BLE beacon is trivially spoofable — keep it
  presentational.)

---

## Privacy

This is a household where several of the people being located are children.
That doesn't make the feature wrong — it makes a few design choices load-bearing
rather than incidental. Decide them deliberately:

- **Retention.** A leaked intercom log says who paged whom. A leaked location
  history says where a child was, every day, for years. Keep the last known
  position plus a short window (days, not forever), and prune on a schedule.
  Round stored history to a coarse precision; keep full precision only for a
  live share that's actively running.
- **Symmetry.** If the kids can see the same map the parents can, the feature
  reads as coordination. If they can't, it reads as surveillance — and that's
  the single most common complaint about this category of app.
- **Visible state.** Everyone should be able to see, at a glance, that sharing
  is on and who can see them. No silent modes. `LocationShare.mode` exists so
  that state is a first-class record rather than an implicit consequence of
  having the app installed.
- **Honest permission strings.** iOS periodically shows users how often an app
  used their location in the background. The usage description should say what
  it actually does.

---

## Suggested order

1. ~~**Live location, places-only tier.**~~ Built.
2. ~~**Geofence → announce crossover.**~~ Built.
3. **Live-share tier**, with a hard expiry.
4. **Proximity**, once there's a beacon in at least one room — ideally deferred
   until the custom LED device, which should carry one.
