import Foundation
import Combine

/// Where the app points and what it remembers between launches.
///
/// The server URL is settable at runtime (Settings tab) so the same build can
/// talk to the deployed app or to `npm run dev` on a laptop over the LAN.
final class AppSettings: ObservableObject {
    private enum Key {
        static let baseURL = "serverBaseURL"
        static let lastTalkZoneID = "lastTalkZoneID"
    }

    /// Shipped default. Edit this one line to point new installs somewhere else;
    /// an existing install keeps whatever the user typed in Settings.
    static let shippedBaseURL = URL(string: "https://home-intercom.vercel.app")!

    private let defaults: UserDefaults

    @Published var baseURL: URL {
        didSet { defaults.set(baseURL.absoluteString, forKey: Key.baseURL) }
    }

    /// Remembers the zone you broadcast to last, so Broadcast opens ready to go.
    @Published var lastTalkZoneID: String? {
        didSet { defaults.set(lastTalkZoneID, forKey: Key.lastTalkZoneID) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let stored = defaults.string(forKey: Key.baseURL).flatMap(URL.init(string:))
        self.baseURL = stored ?? Self.shippedBaseURL
        self.lastTalkZoneID = defaults.string(forKey: Key.lastTalkZoneID)
    }

    /// Accepts what someone actually types — "intercom.example.com",
    /// "http://192.168.1.20:3000", a trailing slash — and normalises it.
    /// Returns nil if there's no usable host.
    static func normalise(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") { text = "https://" + text }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), let host = url.host, !host.isEmpty else {
            return nil
        }
        guard url.scheme == "http" || url.scheme == "https" else { return nil }
        return url
    }
}
