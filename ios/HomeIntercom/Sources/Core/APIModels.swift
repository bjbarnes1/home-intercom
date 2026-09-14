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
