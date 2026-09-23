# Apple Music — policy, data and runbook

Music on the Hub plays through Apple Music, using each listener's own
subscription. That makes Apple's rules part of the product rather than a
footnote to it: App Review Guideline 4.5.2 says what may and may not be done
with MusicKit, the Developer Program License Agreement adds to it, and Apple's
marketing guidelines say how the service may be named and shown.

This note records the decisions those rules forced, what the code does to keep
to them, and the operational steps nobody should have to rediscover. Where a
rule cannot be closed in code, §7 says so and says who has to close it.

---

## 1. Product decision: Apple Music is never behind the famOS paywall

**Recorded 23 Sep 2026.**

Guideline 4.5.2(i): access to Apple Music through MusicKit may not require
payment, and may not be *indirectly* monetised either — not through in-app
purchase, not through advertising, and not by asking the user for information
in exchange. The listener already pays Apple; we may not charge them again for
the privilege of pressing play.

So, whatever famOS's own tiers turn out to be:

- **Music stays in the base tier.** No famOS subscription, trial or upgrade
  ever gates playing, searching, queuing or handing off Apple Music.
- **No advertising on the Music screen**, including our own upsell for other
  famOS features. A promotion sitting beside the player is the indirect
  monetisation the guideline names.
- **Linking Apple Music never asks for extra personal data.** The sign-in is
  Apple's own `authorize()` sheet and nothing else: no email capture, no
  "tell us your favourite genre", no survey on the way in.

The About block at the bottom of the controller's Music section says this in
one sentence, so a parent reading it does not have to take our word for it
from a policy page.

## 2. Commercial rules (4.5.2)

What we may do with what MusicKit gives us, in short: play it for the person
who asked, and nothing else.

- **Data is used only to run the feature.** Library contents, playlists,
  listening history and ratings are never shared with anyone, never used to
  identify a user or a device, and never used to target advertising.
- **Out of analytics, out of any AI index.** `nowPlaying*`, playlists and
  ratings must not reach an analytics pipeline, an event log or a search/AI
  index. None of the last exists yet; when one does, it must not ingest these.
  A question such as "what's playing in the kitchen?" is answered live from the
  panel's current `Device.nowPlaying*`, never from a stored history — there is
  no history to answer from, and that is on purpose.
- **Artwork and metadata only alongside playback.** Cover art, titles and
  artist names are licensed for showing what is playing or about to. They do
  not go into famOS marketing renders, the website, app-store screenshots or
  social posts without the rights holder's permission. Use placeholder art in
  anything promotional.
- **MusicKit is not a sync licence.** The app never chooses a song and plays
  it at a moment of its own choosing: no jingles, no chore-completed
  celebration track, no soundtrack under a family video. Music plays because a
  person picked it.
- **Personal, household use.** famOS is not to be marketed to businesses —
  cafés, shops, waiting rooms, gyms — as a way to play Apple Music to the
  public. A consumer subscription does not cover that, and we must not suggest
  it does.

## 3. Branding

- **The feature is called "Music"**, never "Apple Music". It is a famOS
  feature that plays *on* Apple Music, not an Apple product.
- **Always "on Apple Music"** when naming the service: "Listen on Apple Music",
  "Playing on Apple Music". Not "with", not "via", not "from".
- **Apple's badge only.** The Apple-supplied "Listen on Apple Music" badge is
  stored at `public/brand/apple-music/listen-on-apple-music.svg`, exactly as
  downloaded. Do not recolour, crop, redraw or animate it.
  - At least **30px high** in digital use.
  - Clear space around it of at least **one tenth of the badge's height** on
    every side.
  - **One badge per view.**
  - If other music services are ever shown beside it, **Apple Music comes
    first**.
- **Trademark line**, wherever the marks appear in our own material:

  > Apple and Apple Music are trademarks of Apple Inc., registered in the U.S.
  > and other countries.

  The controller's Music section carries it in its About block.

## 4. Data handling

What is kept, where, and for how long. Anything not in this table is not kept.

| Data | Where it lives | How long | Notes |
| --- | --- | --- | --- |
| Music User Token (the listener's Apple Music credential) | The Hub's `localStorage`, put there by MusicKit JS | Until the listener signs out or Apple expires it | Never sent to our server, never logged, never in an error report. The server cannot play anyone's music. |
| Resume state (queue item ids and playback position) | The Hub's `localStorage` (`famos.applemusic.resume`) | 12 hours, then ignored | Lets a Hub that reloaded pick up where it was. Catalogue ids only; no titles. |
| `Device.nowPlayingTitle` / `nowPlayingArtist` / `nowPlayingAt` | Postgres | Current value only | Overwritten as the song changes and cleared when it stops. No history table, no audit log of it. |
| `Device.musicLinkedAt` | Postgres | Until the panel unlinks | Only *whether* a panel has an account linked, so a handoff knows where it can land. |
| `Device.musicCleanOnly` | Postgres | Until a parent changes it | A household setting, not listening data. |
| Ratings, playlists, library | Apple | — | Read live from Apple when shown. Never copied into our database or cache. |

## 5. Privacy policy paragraph

Ready to paste into the famOS privacy policy:

> **Music.** If you link Apple Music on a famOS Hub, famOS accesses your Apple
> Music library, playlists, recently played items and ratings, and controls
> playback, so that you can browse and play your music on your Hubs. The Apple
> Music sign-in token that makes this possible stays on the Hub where you
> signed in; it is never sent to famOS's servers. Our servers hold only whether
> a Hub has an Apple Music account linked, and the title and artist of the song
> currently playing so that your other Hubs can show it. We do not keep a
> history of what you listen to. Nothing from Apple Music is shared with anyone
> else or used for advertising.

## 6. Developer token and key rotation

### The token

`src/lib/music/appleToken.ts` mints the MusicKit developer token, and
`GET /api/music/apple/token` hands it to a Hub.

- **ES256**, signed with the MusicKit private key (`.p8`), JOSE signature
  encoding (raw r‖s, not DER).
- Header: `alg: ES256`, `kid` = `APPLE_MUSIC_KEY_ID`.
- Payload: `iss` = `APPLE_MUSIC_TEAM_ID`, `iat`, and `exp` **twelve hours**
  after `iat` — far inside Apple's six-month ceiling, so a token lifted from a
  page is short-lived.
- **`origin`**, set from `APPLE_MUSIC_ORIGINS` (comma-separated). Apple
  recommends it for web clients: the token is then refused on any site but
  ours. List every origin a Hub loads from — the production domain, and any
  preview host music is tested on. A missing origin makes Apple answer **401**,
  which looks exactly like a broken key, so check this list first when a new
  host cannot play. Leave it empty to omit the claim.
- The endpoint requires a **paired, ACTIVE device**. The token identifies the
  app, not a listener, but it drives Apple's catalogue API under our developer
  identity for twelve hours and cannot be revoked short of revoking the key, so
  it is not handed to anyone who asks.
- The server caches the token, keyed on a hash of team id, key id, private key
  and origins. A new key or a new origin list therefore applies on the **next
  request**, not when the old token runs out.

### Rotating the key

Do these in order. Revoking first leaves every Hub unable to play until the
new key is live.

1. In the Apple Developer portal, under Certificates, Identifiers & Profiles →
   Keys, **create a new key with MusicKit enabled**. Download the `.p8` (it
   downloads once) and note its Key ID.
2. **Update `APPLE_MUSIC_KEY_ID` and `APPLE_MUSIC_PRIVATE_KEY`** in the
   deployment's environment. Paste the whole `.p8`, BEGIN and END lines
   included; `normalisePrivateKey` copes with most of the ways a dashboard
   mangles newlines, but not with a truncated key.
3. **Redeploy.**
4. **Confirm Hubs recover**: open Music on a Hub and play a track; check the
   token route answers `configured: true` with a token and no `reason`.
5. **Only then revoke the old key** in the portal.

## 7. Open items that code cannot close

- **R2 — per-member PIN gating.** Blocked. Gating Music (or its explicit
  content) per family member needs a real per-person session at the Hub, and
  the Hub's PIN and profile screens are still fixtures — see
  `src/app/hub/pin/page.tsx`. Until that exists, "Clean only" is per panel and
  set by a parent from the controller.
- **R5 — music alarms.** Need confirmation from Apple Developer Relations
  before shipping. An alarm is the app starting playback at a time, which sits
  close to the sync-licence line in §2. Only a track the user chose for the
  alarm can count; an app-chosen wake-up song cannot.
- **R7 — device OS.** Must be tested on hardware: play a **full-length
  catalogue track** (not a preview clip) in the kiosk browser on both
  candidate boards, which exercises Widevine/EME. See
  `docs/architecture/device-os.md` §2.2.
- **DPLA §3.3.6 (MusicKit)** is to be read by the Apple Developer account
  holder, who is the one agreeing to it.
- **Non-subscriber errors.** The MusicKit `errorCode` strings for these cases were
  checked against the v3 bundle — `SUBSCRIPTION_ERROR`, `STREAM_UPSELL`,
  `CONTENT_RESTRICTED`, `CONTENT_UNAVAILABLE`, `GEO_BLOCK`,
  `AUTHORIZATION_ERROR`, `TOKEN_EXPIRED`, `UNAUTHORIZED_ERROR` — but should
  still be confirmed once by signing in with a real Apple ID that has no
  subscription and trying to play.

## 8. iOS (MusicKit for Swift), for when music lands there

None of this is built. It is what the iOS app will need when it is.

- Enable the **MusicKit App Service** on the App ID.
- Add **`NSAppleMusicUsageDescription`** to Info.plist. Suggested text:
  "famOS uses your Apple Music library and playlists so you can play and queue
  music on your family's Hubs."
- Call **`MusicAuthorization.request()`** only when the user opens Music —
  never at launch, never during onboarding.
- Observe **`MusicSubscription.subscriptionUpdates`**. When
  `canPlayCatalogContent` is false and `canBecomeSubscriber` is true, present
  Apple's own **`.musicSubscriptionOffer`** sheet rather than a screen of ours.
- Local playback uses **`ApplicationMusicPlayer`** (or `SystemMusicPlayer`
  where handing off to the Music app is the point). A phone acting as a
  **remote** for a Hub plays nothing locally.
- **App Review notes** must say plainly that the famOS subscription does not
  gate Apple Music (§1), and give demo steps a reviewer can follow with their
  own Apple ID.

## 9. Deliberately excluded

- **Crossfade, EQ, lossless.** MusicKit on the web does not expose them.
- **Lyrics.** Not available to third-party apps.
- **The same song in several rooms at once.** One subscription is one stream;
  playing a second room is a handoff, not a copy.
- **"Added by" on queue items.** Needs a real per-person identity at the Hub,
  and PIN sessions do not exist yet (§7, R2).
