import Foundation
import Combine

/// The app's single source of truth: who's signed in, which server we're
/// pointed at, and the live picture of the house.
///
/// Presence is polled on the same 5-second cadence the web controller uses
/// (`src/app/controller/page.tsx`), and only while the app is in the
/// foreground — a backgrounded phone shouldn't keep waking the server.
@MainActor
final class HouseholdStore: ObservableObject {
    enum AuthState: Equatable {
        case unknown
        case signedOut
        case signedIn(User)

        var user: User? {
            if case let .signedIn(user) = self { return user }
            return nil
        }
    }

    @Published private(set) var auth: AuthState = .unknown
    @Published private(set) var devices: [Device] = []
    @Published private(set) var zones: [Zone] = []
    /// Non-nil when the last refresh failed, so the UI can say why it looks stale.
    @Published private(set) var refreshError: String?
    /// Mirrors `settings.baseURL` so views that show the server address redraw
    /// when it changes — they observe the store, not the settings object.
    @Published private(set) var baseURL: URL

    let settings: AppSettings
    private(set) var api: APIClient
    /// Owned by the store rather than a view, because iOS relaunches a
    /// terminated app to deliver a geofence crossing and the manager has to
    /// exist before any view does.
    private(set) lazy var location = LocationService(api: api)

    private var pollTask: Task<Void, Never>?
    private static let pollInterval: Duration = .seconds(5)

    init(settings: AppSettings = AppSettings()) {
        self.settings = settings
        self.baseURL = settings.baseURL
        self.api = APIClient(baseURL: settings.baseURL)
    }

    /// Endpoints only — controllers are phones, not speakers, so they never
    /// appear as somewhere to page.
    var endpoints: [Device] {
        devices.filter(\.isEndpoint)
    }

    var onlineEndpointCount: Int {
        endpoints.filter(\.online).count
    }

    /// The widest zone, which is what Broadcast should default to.
    var everyoneZone: Zone? {
        zones.max(by: { $0.deviceCount < $1.deviceCount })
    }

    // MARK: - Session

    /// Idempotent: `.task` can fire more than once for the same view.
    func restoreSession() async {
        guard auth == .unknown else { return }
        do {
            auth = .signedIn(try await api.me())
            await refresh()
            startPolling()
            await resumeLocationSharing()
        } catch {
            auth = .signedOut
        }
    }

    func signIn(email: String, password: String) async throws {
        let user = try await api.login(email: email, password: password)
        auth = .signedIn(user)
        await refresh()
        startPolling()
        await resumeLocationSharing()
    }

    func signOut() async {
        stopPolling()
        location.stopMonitoring()
        try? await api.logout()
        devices = []
        zones = []
        refreshError = nil
        auth = .signedOut
    }

    /// Repoint at a different server. The old session cookie is dropped first —
    /// a cookie for one household must never ride along to another host.
    func updateServer(to url: URL) async {
        stopPolling()
        api.clearCookies()
        location.stopMonitoring()
        settings.baseURL = url
        baseURL = url
        api = APIClient(baseURL: url)
        location.updateClient(api)
        devices = []
        zones = []
        refreshError = nil
        auth = .signedOut
    }

    // MARK: - Presence

    func refresh() async {
        guard auth.user != nil else { return }
        do {
            async let freshDevices = api.devices()
            async let freshZones = api.zones()
            devices = try await freshDevices
            zones = try await freshZones
            refreshError = nil
        } catch APIError.unauthorized {
            stopPolling()
            auth = .signedOut
        } catch {
            refreshError = error.localizedDescription
        }
    }

    func startPolling() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: Self.pollInterval)
                guard !Task.isCancelled else { return }
                await self?.refresh()
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: - Location

    /// Pick monitoring back up to match what this person already consented to,
    /// so signing in on a new phone doesn't silently leave sharing dormant.
    func resumeLocationSharing() async {
        do {
            let state = try await api.sharing()
            await location.sync(sharing: state.mode)
        } catch {
            // Not fatal — the Where tab surfaces sharing state and can retry.
        }
    }

    // MARK: - Lookups

    func device(id: String?) -> Device? {
        guard let id else { return nil }
        return devices.first { $0.id == id }
    }

    func zone(id: String?) -> Zone? {
        guard let id else { return nil }
        return zones.first { $0.id == id }
    }

    /// What a reminder or announcement is addressed to, for display.
    func targetLabel(deviceID: String?, zoneID: String?) -> String {
        if let device = device(id: deviceID) { return device.displayName }
        if let zone = zone(id: zoneID) { return zone.name }
        return "Everyone"
    }
}
