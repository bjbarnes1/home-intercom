import Foundation

/// Codable mirrors of the JSON the Next.js API returns. Field names match the
/// route handlers in `src/app/api/**/route.ts` exactly — if a route changes
/// shape, change it here too.
///
/// Dates arrive as ISO-8601 strings and are decoded by `APIClient`'s decoder.

// MARK: - Auth

struct User: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let email: String
    let role: String

    var isAdmin: Bool { role == "ADMIN" }
}

struct UserEnvelope: Codable { let user: User }

// MARK: - Devices & zones

struct Device: Codable, Identifiable, Hashable {
    let id: String
    let displayName: String
    let room: String?
    let type: String
    let pairing: String?
    let doNotDisturb: Bool?
    let online: Bool

    var isEndpoint: Bool { type == "ENDPOINT" }
    /// What to show under the name — the room label, falling back to the name.
    var roomLabel: String { room ?? displayName }
}

struct DevicesEnvelope: Codable { let devices: [Device] }

struct ZoneDevice: Codable, Identifiable, Hashable {
    let id: String
    let displayName: String
    let room: String?
    let online: Bool
}

struct Zone: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let deviceCount: Int
    let onlineCount: Int
    let devices: [ZoneDevice]?
}

struct ZonesEnvelope: Codable { let zones: [Zone] }

// MARK: - Intercom (page / call / broadcast)

enum IntercomKind: String, Codable {
    case page, call, broadcast

    /// LiveKit role the *initiator* gets: a call is two-way, the rest are talk-only.
    var initiatorPublishesOnly: Bool { self != .call }
}

struct InitiateRequest: Codable {
    let kind: String
    let initiatorIdentity: String
    var targetDeviceId: String?
    var targetZoneId: String?
}

struct InitiateResponse: Codable {
    let eventId: String
    let room: String
    let initiatorToken: String
    let reached: [String]
    let notConnected: [String]
    let suppressedByDnd: [String]
    let offline: [String]
    let livekitUrl: String?
    let mock: Bool?
}

struct HangupRequest: Codable {
    let eventId: String
    let deviceIds: [String]
}

// MARK: - Announce

struct AnnounceRequest: Codable {
    let text: String
    var from: String?
    var targetDeviceId: String?
    var targetZoneId: String?
}

struct AnnounceResponse: Codable {
    let reached: [String]
    let notConnected: [String]
    let suppressedByDnd: [String]
    let offline: [String]
    /// "ash" when OpenAI TTS synthesised the clip, "browser-fallback" otherwise.
    let voice: String
    let voiceError: String?
    let audioUrl: String?

    var usedNeuralVoice: Bool { voice == "ash" }
    var missedCount: Int { notConnected.count + offline.count }
}

// MARK: - Reminders

struct Reminder: Codable, Identifiable, Hashable {
    let id: String
    let text: String
    let kind: String
    let cron: String?
    let runAt: Date?
    let timezone: String?
    let enabled: Bool
    let nextRunAt: Date?
    let targetDeviceId: String?
    let targetZoneId: String?

    var isRecurring: Bool { kind == "RECURRING" }
}

struct RemindersEnvelope: Codable { let reminders: [Reminder] }

struct ParseReminderRequest: Codable { let text: String }

struct ParseReminderResponse: Codable {
    let reminder: Reminder
    /// Claude's short human confirmation, e.g. "Set for 4pm tomorrow".
    let confirmation: String
}

struct CreateReminderRequest: Codable {
    let text: String
    let kind: String
    var cron: String?
    var runAt: String?
    var timezone: String
    var targetDeviceId: String?
    var targetZoneId: String?
}

struct ReminderEnvelope: Codable { let reminder: Reminder }

struct PatchReminderRequest: Codable {
    var text: String?
    var enabled: Bool?
}

// MARK: - Location

/// What someone has consented to share. Mirrors `LocationShareMode` in the
/// Prisma schema.
enum LocationShareMode: String, Codable, CaseIterable, Hashable {
    /// Nothing is reported, and the phone stops monitoring entirely.
    case off = "OFF"
    /// Arrivals and departures, plus a coarse last-known position.
    case places = "PLACES"
    /// High-accuracy and time-boxed. Reserved — not implemented yet.
    case live = "LIVE"

    var label: String {
        switch self {
        case .off: return "Not sharing"
        case .places: return "Places"
        case .live: return "Live"
        }
    }
}

struct Place: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let lat: Double
    let lng: Double
    let radiusM: Int
    let icon: String?
}

struct PlacesResponse: Codable {
    let places: [Place]
    /// iOS's per-app region cap, echoed by the server.
    let maxMonitored: Int
    /// How many places exceed it — a geofence past the cap never fires.
    let overBudget: Int
}

/// One geofence crossing, computed on the phone by Core Location.
struct PlaceEvent: Codable {
    let placeId: String
    /// "enter" or "exit".
    let type: String
    /// ISO-8601.
    let at: String
}

struct LocationPingRequest: Codable {
    let lat: Double
    let lng: Double
    var accuracyM: Double?
    var batteryPct: Int?
    var source: String
    let capturedAt: String
    var events: [PlaceEvent]
}

struct LocationPingResponse: Codable {
    let stored: Bool
    /// False once sharing is off — the phone should stop monitoring.
    let reporting: Bool
    let sharing: LocationShareMode
    let precision: String?
    let arrivals: Int?
    let departures: Int?
}

struct LocationFix: Codable, Hashable {
    let lat: Double
    let lng: Double
    let accuracyM: Double?
    let batteryPct: Int?
    /// True once retention has rounded this to ~100m.
    let coarse: Bool
    let capturedAt: Date
}

struct PlacePresence: Codable, Hashable {
    let id: String
    let name: String
    let icon: String?
    /// Nil when the place was derived from geometry rather than a real arrival.
    let since: Date?
}

struct PersonLocation: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let role: String
    let sharing: LocationShareMode
    let reporting: Bool
    let liveUntil: Date?
    /// Nil when they aren't sharing, or haven't reported yet.
    let lastFix: LocationFix?
    /// The place they're at right now, if any.
    let at: PlacePresence?
}

struct PeopleLocationResponse: Codable {
    let people: [PersonLocation]
    let places: [Place]
    let viewerId: String
}

struct RetentionPolicy: Codable, Hashable {
    let coarsenAfterHours: Int
    let deleteAfterDays: Int
}

struct SharingState: Codable, Hashable {
    let mode: LocationShareMode
    let liveUntil: Date?
    let reporting: Bool
    let retention: RetentionPolicy?
    /// Returned by PATCH when switching off wipes history.
    let clearedPings: Int?
}

struct PatchSharingRequest: Codable {
    let mode: String
    var liveMinutes: Int
}

struct CreatePlaceRequest: Codable {
    let name: String
    let lat: Double
    let lng: Double
    let radiusM: Int
    var icon: String?
}

struct PatchPlaceRequest: Codable {
    var name: String?
    var lat: Double?
    var lng: Double?
    var radiusM: Int?
    var icon: String?
}

struct PlaceResponse: Codable {
    let place: Place
    /// Set when this place pushes the household past iOS's region cap, so the
    /// warning lands on the action that caused it rather than later, when a
    /// geofence mysteriously never fires.
    let warning: String?
}

// MARK: - Place rules

enum PlaceTrigger: String, Codable, CaseIterable, Hashable {
    case arrive = "ARRIVE"
    case depart = "DEPART"

    var label: String {
        switch self {
        case .arrive: return "Arrives"
        case .depart: return "Leaves"
        }
    }
}

/// "When Willoughby arrives Home, say *Willoughby's home* in the Kitchen."
struct PlaceRule: Codable, Identifiable, Hashable {
    let id: String
    let placeId: String
    let placeName: String
    let trigger: PlaceTrigger
    /// Nil means anyone in the household.
    let subjectUserId: String?
    let subjectName: String?
    let template: String
    let targetDeviceId: String?
    let targetZoneId: String?
    let enabled: Bool
    let cooldownMinutes: Int
    /// What it will actually say, rendered server-side.
    let preview: String
}

struct PlaceRulesEnvelope: Codable { let rules: [PlaceRule] }

struct CreatePlaceRuleRequest: Codable {
    let placeId: String
    let trigger: String
    var subjectUserId: String?
    let template: String
    var targetDeviceId: String?
    var targetZoneId: String?
    var cooldownMinutes: Int
    /// Speak it once on save, so you hear what you just built.
    var testNow: Bool
}

struct CreatePlaceRuleResponse: Codable {
    struct Created: Codable { let id: String; let template: String }
    let rule: Created
    /// The sentence that was spoken by the test, or nil if nothing was reached.
    let spoken: String?
}

struct PatchPlaceRuleRequest: Codable {
    var template: String?
    var enabled: Bool?
    var cooldownMinutes: Int?
}

