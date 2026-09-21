import Foundation
import CoreLocation
import Combine

/// Works out which room this phone is in, from the household's BLE beacons.
///
/// The arrangement is inverted from the obvious one, and the reason is worth
/// keeping here. Panels cannot scan for a tag you carry: a browser only talks
/// to a Bluetooth device the user has picked from a chooser, so a panel hears
/// nothing at all. Each room gets a beacon instead, and the phone already in
/// your pocket listens for it.
///
/// This is CoreLocation, not CoreBluetooth, and that is the whole point.
/// Beacon-region monitoring runs in the background, survives the app being
/// killed, and relaunches it on a crossing. CoreBluetooth scanning does none of
/// those things with the screen off.
///
/// **One region for the household, not one per room.** iOS monitors twenty
/// regions per app in total, and `LocationService` is already spending that
/// budget on the household's places. A beacon region constrained only by UUID
/// covers every room for one slot; the rooms are told apart by ranging inside
/// it, which is where the RSSI comes from anyway.
///
/// Ranging is foreground-only — plus a short window after a background region
/// crossing. So the two mechanisms do different jobs: monitoring says "they are
/// home and moving about", ranging says which room. Neither is asked to do the
/// other's.
@MainActor
final class BeaconService: NSObject, ObservableObject {
    /// Long enough to collect a few advertisements, short enough that the wake
    /// budget iOS grants after a crossing is not spent waiting.
    private static let backgroundRangingWindow: TimeInterval = 8

    /// Ranging delivers roughly once a second; reporting every one of those
    /// would be a lot of writes for a person standing still.
    private static let reportInterval: TimeInterval = 10

    @Published private(set) var currentRoom: String?
    @Published private(set) var isRanging = false
    @Published private(set) var lastError: String?
    /// Set when the household has beacons but this phone cannot use them.
    @Published private(set) var needsAlwaysAuthorization = false

    private let manager = CLLocationManager()
    private var api: APIClient
    private var beacons: [RoomBeacon] = []
    private var householdUUID: UUID?
    private var constraint: CLBeaconIdentityConstraint?
    private var lastReportedAt: Date?
    private var stopRangingWork: Task<Void, Never>?

    /// What the music should do about a move, handed to whoever owns playback.
    var onFollow: ((_ deviceID: String) -> Void)?

    init(api: APIClient) {
        self.api = api
        super.init()
        manager.delegate = self
        manager.allowsBackgroundLocationUpdates = false
    }

    func updateClient(_ api: APIClient) {
        self.api = api
    }

    /// Load the household's beacons and start watching for them.
    func start() async {
        guard CLLocationManager.isMonitoringAvailable(for: CLBeaconRegion.self) else {
            lastError = "This device cannot monitor beacons."
            return
        }

        do {
            let response = try await api.roomBeacons()
            beacons = response.beacons
            guard let raw = response.uuid, let uuid = UUID(uuidString: raw) else {
                // No beacons placed yet. Not an error — most households.
                stop()
                return
            }
            householdUUID = uuid
        } catch {
            lastError = String(describing: error)
            return
        }

        // Monitoring needs Always; ranging alone would work in the foreground,
        // but a room that is only known while the app is open is not useful.
        needsAlwaysAuthorization = manager.authorizationStatus != .authorizedAlways
        guard let uuid = householdUUID else { return }

        let constraint = CLBeaconIdentityConstraint(uuid: uuid)
        self.constraint = constraint

        let region = CLBeaconRegion(beaconIdentityConstraint: constraint, identifier: Self.regionIdentifier)
        // A crossing either way is worth knowing: coming home starts the room
        // tracking, leaving stops it and saves the battery.
        region.notifyOnEntry = true
        region.notifyOnExit = true
        region.notifyEntryStateOnDisplay = false
        manager.startMonitoring(for: region)
        manager.requestState(for: region)
    }

    func stop() {
        stopRanging()
        for region in manager.monitoredRegions where region.identifier == Self.regionIdentifier {
            manager.stopMonitoring(for: region)
        }
        currentRoom = nil
    }

    // MARK: - Ranging

    /// Range continuously. Used while the app is open.
    func startRanging() {
        guard let constraint else { return }
        stopRangingWork?.cancel()
        stopRangingWork = nil
        manager.startRangingBeacons(satisfying: constraint)
        isRanging = true
    }

    func stopRanging() {
        guard let constraint else { return }
        manager.stopRangingBeacons(satisfying: constraint)
        isRanging = false
    }

    /// Range for a few seconds and stop. Used on a background crossing, where
    /// iOS grants a short window and expects the app to be quick about it.
    private func rangeBriefly() {
        startRanging()
        stopRangingWork?.cancel()
        stopRangingWork = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.backgroundRangingWindow))
            guard !Task.isCancelled else { return }
            await MainActor.run { self?.stopRanging() }
        }
    }

    // MARK: - Reporting

    private func report(_ found: [CLBeacon]) {
        guard !found.isEmpty else { return }

        // Throttle: a person standing still does not need ten writes a minute.
        if let last = lastReportedAt, Date().timeIntervalSince(last) < Self.reportInterval {
            return
        }
        lastReportedAt = Date()

        let at = Int(Date().timeIntervalSince1970 * 1000)
        let sightings: [BeaconSighting] = found.compactMap { beacon in
            // Unknown proximity comes through as rssi 0, which would read as
            // the strongest possible signal. Drop it rather than believe it.
            guard beacon.rssi != 0 else { return nil }
            guard let known = match(beacon) else { return nil }
            return BeaconSighting(beaconId: known.id, rssi: beacon.rssi, at: at)
        }
        guard !sightings.isEmpty else { return }

        Task { [api, weak self] in
            do {
                let result = try await api.reportBeaconSightings(sightings)
                await MainActor.run {
                    self?.currentRoom = result.label
                    self?.lastError = nil
                    if let followTo = result.followTo {
                        self?.onFollow?(followTo)
                    }
                }
            } catch {
                await MainActor.run { self?.lastError = String(describing: error) }
            }
        }
    }

    /// The household beacon this sighting belongs to, by major and minor.
    private func match(_ beacon: CLBeacon) -> RoomBeacon? {
        beacons.first {
            $0.major == beacon.major.intValue
                && $0.minor == beacon.minor.intValue
                && $0.uuid.caseInsensitiveCompare(beacon.uuid.uuidString) == .orderedSame
        }
    }

    private static let regionIdentifier = "famos.rooms"
}

extension BeaconService: CLLocationManagerDelegate {
    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didRangeBeacons beacons: [CLBeacon],
        satisfying constraint: CLBeaconIdentityConstraint
    ) {
        Task { @MainActor [weak self] in self?.report(beacons) }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didEnterRegion region: CLRegion
    ) {
        guard region.identifier == BeaconService.regionIdentifier else { return }
        Task { @MainActor [weak self] in self?.rangeBriefly() }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didExitRegion region: CLRegion
    ) {
        guard region.identifier == BeaconService.regionIdentifier else { return }
        Task { @MainActor [weak self] in
            self?.stopRanging()
            self?.currentRoom = nil
        }
    }

    /// Already inside the region at launch — common, since the phone lives here.
    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didDetermineState state: CLRegionState,
        for region: CLRegion
    ) {
        guard region.identifier == BeaconService.regionIdentifier, state == .inside else { return }
        Task { @MainActor [weak self] in self?.rangeBriefly() }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor [weak self] in
            self?.needsAlwaysAuthorization = manager.authorizationStatus != .authorizedAlways
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        monitoringDidFailFor region: CLRegion?,
        withError error: Error
    ) {
        Task { @MainActor [weak self] in self?.lastError = error.localizedDescription }
    }
}
