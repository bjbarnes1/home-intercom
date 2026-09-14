import Foundation
import CoreLocation
import Combine
import UIKit

/// Reports where this phone is, as cheaply as iOS allows.
///
/// Two sensors, both chosen for battery rather than precision — see
/// `docs/LOCATION.md`:
///
/// - **Significant-change monitoring** is cell-tower based, roughly 500m, and
///   costs almost nothing. It answers "roughly where is everyone".
/// - **Region monitoring** on the household's places gives the signal that
///   actually matters: arrived at school, left home.
///
/// Neither needs the app to be running. Both relaunch a *terminated* app to
/// deliver an event, which is the whole reason this is a native app and not the
/// PWA — but only with **Always** authorisation, and only if the work done on
/// wake is quick. So the wake path here is: build a ping, POST it, done.
///
/// Continuous high-accuracy GPS is deliberately absent. That's the LIVE tier,
/// and it isn't built yet.
@MainActor
final class LocationService: NSObject, ObservableObject {
    /// iOS monitors at most 20 regions per app — shared across everyone in the
    /// household, not per person. Past the cap a region simply never fires, so
    /// we cap deliberately and say so rather than letting it fail silently.
    static let maxMonitoredRegions = 20

    enum Authorization: Equatable {
        case notDetermined
        case denied
        /// Foreground only — geofences won't fire with the app closed.
        case whenInUse
        case always

        var allowsBackgroundGeofencing: Bool { self == .always }
    }

    @Published private(set) var authorization: Authorization = .notDetermined
    @Published private(set) var sharing: LocationShareMode = .off
    @Published private(set) var monitoredCount = 0
    /// Non-nil when the household has more places than iOS will monitor.
    @Published private(set) var overBudget: Int = 0
    @Published private(set) var lastReportError: String?
    @Published private(set) var lastReportedAt: Date?

    private let manager = CLLocationManager()
    private var api: APIClient
    /// The household's places, cached from the last refresh. A region crossing
    /// wakes us with only a few seconds of runtime, so looking a place up must
    /// not cost a round-trip.
    private var places: [String: Place] = [:]
    /// Pending one-shot request from the places editor.
    private var pendingFix: CheckedContinuation<CLLocationCoordinate2D, Error>?

    /// Set while a routine position report is in flight, so a burst of
    /// significant-change callbacks doesn't stack up duplicate POSTs. Crossings
    /// ignore it — an arrival is the signal that matters and must never be
    /// dropped just because a background ping was already going out.
    private var isReportingPosition = false

    init(api: APIClient) {
        self.api = api
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        // Don't let iOS pause updates on us — a paused manager stops delivering
        // significant changes, and we have no way to notice.
        manager.pausesLocationUpdatesAutomatically = false
        authorization = Self.map(manager.authorizationStatus)
    }

    /// Point at a different server (Settings → Server).
    func updateClient(_ api: APIClient) {
        self.api = api
    }

    // MARK: - Permission

    /// Ask iOS for the next rung of location permission.
    ///
    /// The two-step is the platform's, not ours: from a standing start iOS will
    /// only offer "While Using", and "Always" has to be requested separately
    /// afterwards. So this needs calling twice — once to get in the door, once
    /// to get the background access geofences actually need.
    ///
    /// Returns false when there is nothing left to ask and the only way forward
    /// is the Settings app.
    @discardableResult
    func requestAuthorization() -> Bool {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
            return true
        case .authorizedWhenInUse:
            // iOS shows this prompt only once per install. If it's already been
            // shown and declined, the call quietly does nothing — hence the
            // Settings fallback in the UI.
            manager.requestAlwaysAuthorization()
            return true
        default:
            return false
        }
    }

    /// Whether iOS has a Location row for this app in the Settings app yet.
    ///
    /// It only creates one once the app has actually asked. Sending someone to
    /// Settings before that shows them a page with no location control on it,
    /// which looks like a broken app rather than an unasked question.
    var appearsInSystemSettings: Bool {
        authorization != .notDetermined
    }

    // MARK: - Lifecycle

    /// Start or stop monitoring to match what this person has consented to.
    /// Called on launch, when sharing changes, and when places change.
    func sync(sharing mode: LocationShareMode) async {
        sharing = mode

        guard mode != .off else {
            stopMonitoring()
            return
        }
        guard authorization != .denied, authorization != .notDetermined else { return }

        manager.startMonitoringSignificantLocationChanges()
        await refreshGeofences()
    }

    /// Pull the household's places and register them as geofences. Re-registering
    /// an identical region is harmless, so this is safe to call often.
    func refreshGeofences() async {
        guard sharing != .off else { return }
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }

        let response: PlacesResponse
        do {
            response = try await api.places()
        } catch {
            lastReportError = error.localizedDescription
            return
        }

        overBudget = response.overBudget
        let wanted = Array(response.places.prefix(Self.maxMonitoredRegions))
        let wantedIDs = Set(wanted.map(\.id))

        // Drop regions for places that have been deleted or pushed past the cap.
        for region in manager.monitoredRegions where !wantedIDs.contains(region.identifier) {
            manager.stopMonitoring(for: region)
        }

        for place in wanted {
            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng),
                radius: CLLocationDistance(place.radiusM),
                identifier: place.id
            )
            region.notifyOnEntry = true
            region.notifyOnExit = true
            manager.startMonitoring(for: region)
        }

        places = Dictionary(uniqueKeysWithValues: wanted.map { ($0.id, $0) })
        monitoredCount = wanted.count
    }

    func stopMonitoring() {
        manager.stopMonitoringSignificantLocationChanges()
        for region in manager.monitoredRegions {
            manager.stopMonitoring(for: region)
        }
        places = [:]
        monitoredCount = 0
        overBudget = 0
    }

    /// Report the current position now — used when someone opens the map and
    /// wants their own dot to be current.
    func reportNow() {
        guard sharing != .off else { return }
        manager.requestLocation()
    }

    enum FixError: LocalizedError {
        case denied
        case timedOut
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .denied:
                return "Location access is off. Turn it on in Settings to drop a pin where you are."
            case .timedOut:
                return "Couldn't get a fix. Try again outdoors, or move the map by hand."
            case let .failed(reason):
                return reason
            }
        }
    }

    /// One fix, right now, for the places editor — "add this spot as Home".
    ///
    /// Independent of sharing on purpose: adding a place is not reporting your
    /// position to the household, so it shouldn't require consenting to that.
    func currentCoordinate(timeout: Duration = .seconds(12)) async throws -> CLLocationCoordinate2D {
        if authorization == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        guard authorization != .denied else { throw FixError.denied }

        // A recent cached fix is good enough to centre a 150m circle, and saves
        // waiting on the GPS.
        if let cached = manager.location, cached.timestamp.timeIntervalSinceNow > -120 {
            return cached.coordinate
        }

        // Only one in flight; a second request supersedes the first.
        pendingFix?.resume(throwing: FixError.timedOut)
        pendingFix = nil

        let timeoutTask = Task { [weak self] in
            try? await Task.sleep(for: timeout)
            guard !Task.isCancelled else { return }
            await self?.failPendingFix(.timedOut)
        }
        defer { timeoutTask.cancel() }

        return try await withCheckedThrowingContinuation { continuation in
            pendingFix = continuation
            manager.requestLocation()
        }
    }

    private func resolvePendingFix(_ coordinate: CLLocationCoordinate2D) {
        pendingFix?.resume(returning: coordinate)
        pendingFix = nil
    }

    private func failPendingFix(_ error: FixError) {
        pendingFix?.resume(throwing: error)
        pendingFix = nil
    }

    // MARK: - Reporting

    private func report(location: CLLocation, events: [PlaceEvent] = [], source: String) {
        guard sharing != .off else { return }
        // Only coalesce routine position reports; a crossing always goes.
        if events.isEmpty {
            guard !isReportingPosition else { return }
            isReportingPosition = true
        }

        let ping = LocationPingRequest(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            accuracyM: location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil,
            batteryPct: Self.batteryPercent(),
            source: source,
            capturedAt: ISO8601DateFormatter().string(from: location.timestamp),
            events: events
        )

        Task { [weak self] in
            guard let self else { return }
            do {
                let response = try await api.reportLocation(ping)
                self.lastReportedAt = Date()
                self.lastReportError = nil
                // The server is the authority on sharing. If it says stop —
                // someone turned it off, maybe from another device — then stop.
                if !response.reporting {
                    self.sharing = .off
                    self.stopMonitoring()
                }
            } catch {
                self.lastReportError = error.localizedDescription
            }
            if ping.events.isEmpty { self.isReportingPosition = false }
        }
    }

    /// A region crossing carries no position of its own, so pair it with the
    /// best fix we have rather than waking the GPS on a background budget.
    private func reportCrossing(placeID: String, type: String) {
        guard let place = places[placeID] else { return }
        let event = PlaceEvent(
            placeId: placeID,
            type: type,
            at: ISO8601DateFormatter().string(from: Date())
        )

        if let location = manager.location {
            report(location: location, events: [event], source: "region")
        } else {
            // No cached fix. Use the place's own centre — the visit is the
            // point, and the coordinate is a nicety we already know.
            sendEventOnly(event, at: place)
        }
    }

    /// Post a crossing with no accompanying fix, using the place's own centre so
    /// the ping still has coordinates the map can draw.
    private func sendEventOnly(_ event: PlaceEvent, at place: Place) {
        let ping = LocationPingRequest(
            lat: place.lat,
            lng: place.lng,
            accuracyM: Double(place.radiusM),
            batteryPct: Self.batteryPercent(),
            source: "region",
            capturedAt: event.at,
            events: [event]
        )
        Task { [weak self] in
            guard let self else { return }
            _ = try? await self.api.reportLocation(ping)
            self.lastReportedAt = Date()
        }
    }

    /// The thing you actually want to know when someone isn't where you
    /// expected. Returns nil when monitoring isn't enabled.
    private static func batteryPercent() -> Int? {
        UIDevice.current.isBatteryMonitoringEnabled = true
        let level = UIDevice.current.batteryLevel
        guard level >= 0 else { return nil }
        return Int((level * 100).rounded())
    }

    private static func map(_ status: CLAuthorizationStatus) -> Authorization {
        switch status {
        case .notDetermined: return .notDetermined
        case .restricted, .denied: return .denied
        case .authorizedWhenInUse: return .whenInUse
        case .authorizedAlways: return .always
        @unknown default: return .denied
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            authorization = Self.map(status)
            if authorization == .denied {
                stopMonitoring()
            } else if authorization.allowsBackgroundGeofencing {
                await sync(sharing: sharing)
            }
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let latest = locations.last else { return }
        Task { @MainActor in
            resolvePendingFix(latest.coordinate)
            report(location: latest, source: "significant")
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didEnterRegion region: CLRegion
    ) {
        Task { @MainActor in reportCrossing(placeID: region.identifier, type: "enter") }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didExitRegion region: CLRegion
    ) {
        Task { @MainActor in reportCrossing(placeID: region.identifier, type: "exit") }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            // Someone waiting on a pin drop needs to hear about any failure,
            // even the transient ones.
            failPendingFix(.failed(error.localizedDescription))

            // A transient "unknown location" is normal indoors and not worth
            // showing anyone; a denial already surfaces via authorization.
            guard (error as? CLError)?.code != .locationUnknown else { return }
            lastReportError = error.localizedDescription
        }
    }
}
