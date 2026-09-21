import Foundation

/// Turns the server's reached / not-connected / DND / offline lists into one
/// honest sentence for the banner.
///
/// This is pure formatting on purpose: a household notices silence, so every
/// partial delivery has to be sayable, and that logic deserves to be testable
/// without standing up a room or a view.
enum DeliverySummary {
    /// For a page, call or live broadcast.
    static func talk(_ response: InitiateResponse) -> String {
        guard !response.reached.isEmpty else {
            if !response.offline.isEmpty {
                return "Nothing reached — nobody's device is online."
            }
            if !response.notConnected.isEmpty {
                return "Nothing reached — online, but not connected to the intercom."
            }
            return "Nothing reached."
        }

        var summary = "Live on " + speakers(response.reached.count)
        let missed = response.notConnected.count + response.offline.count
        if missed > 0 { summary += " · \(missed) not reached" }
        if !response.suppressedByDnd.isEmpty {
            summary += " · \(response.suppressedByDnd.count) on do-not-disturb"
        }
        return summary
    }

    /// For a spoken announcement. Names *which* voice spoke — a household
    /// notices when Ash silently degrades to the panel's robot voice, and the
    /// reason (usually a missing key on the server) belongs on screen.
    static func announce(_ response: AnnounceResponse) -> String {
        guard !response.reached.isEmpty else {
            return "No speakers reached — none are connected."
        }

        var summary = "Spoken on " + speakers(response.reached.count)
        summary += response.usedNeuralVoice
            ? " · Ash voice"
            : " · device voice" + (response.voiceError.map { " (\($0))" } ?? "")
        if response.missedCount > 0 { summary += " · \(response.missedCount) not reached" }
        if !response.suppressedByDnd.isEmpty {
            summary += " · \(response.suppressedByDnd.count) on do-not-disturb"
        }
        return summary
    }

    private static func speakers(_ count: Int) -> String {
        "\(count) " + (count == 1 ? "speaker" : "speakers")
    }
}
