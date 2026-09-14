import Foundation
import AVFoundation
import Combine
import LiveKit

/// Owns one live conversation — a page, a two-way call, or a zone broadcast.
///
/// The flow mirrors the web controller's `useTalk`:
///   1. `POST /api/page` mints the room and the initiator's token, and tells the
///      target endpoints to join (or rings them, for a call) over the lobby.
///   2. We connect to that LiveKit room and publish the microphone.
///   3. On release, `POST /api/page/hangup` clears the endpoints and the room.
///
/// Every LiveKit call the app makes lives in this one file, so if the SDK's
/// surface shifts between versions there is exactly one place to fix.
@MainActor
final class TalkController: ObservableObject {
    enum Status: Equatable {
        case idle
        /// Server is minting the room and waking endpoints.
        case connecting
        /// Connected; microphone open and audio flowing.
        case live
        /// Connected for a call, waiting for someone to pick up.
        case ringing
        case ending
        case failed(String)

        var isBusy: Bool {
            switch self {
            case .connecting, .ending: return true
            default: return false
            }
        }

        var isConnected: Bool {
            switch self {
            case .live, .ringing: return true
            default: return false
            }
        }
    }

    @Published private(set) var status: Status = .idle
    /// A short line for under the button: who was reached, who wasn't.
    @Published private(set) var message: String = ""
    /// True once a remote participant is publishing audio — i.e. they answered.
    @Published private(set) var remoteIsSpeaking = false
    /// Route audio out the loudspeaker rather than the earpiece (calls only).
    @Published var speakerOn = true {
        didSet { applyAudioRoute() }
    }

    private let api: APIClient
    private var room: Room?
    private var session: ActiveSession?
    private var delegateProxy: RoomDelegateProxy?
    /// Bumped by `stop()` so a start still in flight knows it has been superseded.
    private var generation = 0

    private struct ActiveSession {
        let eventID: String
        let reached: [String]
        let kind: IntercomKind
    }

    init(api: APIClient) {
        self.api = api
    }

    // MARK: - Starting

    /// Hold-to-talk page at one endpoint. One-way: they hear us, we don't hear them.
    func page(deviceID: String, as identity: String) async {
        await start(kind: .page, identity: identity, deviceID: deviceID, zoneID: nil)
    }

    /// Live broadcast to a zone. One-way to many.
    func broadcast(zoneID: String, as identity: String) async {
        await start(kind: .broadcast, identity: identity, deviceID: nil, zoneID: zoneID)
    }

    /// Two-way call to one endpoint. It rings there before audio opens.
    func call(deviceID: String, as identity: String) async {
        await start(kind: .call, identity: identity, deviceID: deviceID, zoneID: nil)
    }

    private func start(
        kind: IntercomKind,
        identity: String,
        deviceID: String?,
        zoneID: String?
    ) async {
        guard case .idle = status else { return }

        // Every await below is a chance for the talk button to come back up. If
        // that happens we must not go on to open the microphone — a page that
        // starts *after* you let go is a hot mic broadcasting the room. `stop()`
        // bumps the generation, and each step here checks it still owns the
        // session before doing anything irreversible.
        generation &+= 1
        let generationAtStart = generation

        status = .connecting
        message = ""
        remoteIsSpeaking = false

        guard await requestMicrophonePermission() else {
            guard generationAtStart == generation else { return }
            status = .failed("Microphone access is off. Turn it on in Settings → Intercom.")
            return
        }
        guard generationAtStart == generation else { return }

        let response: InitiateResponse
        do {
            response = try await api.initiate(
                kind: kind,
                initiatorIdentity: identity,
                targetDeviceID: deviceID,
                targetZoneID: zoneID
            )
        } catch {
            guard generationAtStart == generation else { return }
            status = .failed(error.localizedDescription)
            return
        }

        // The endpoints have been woken by now, so abandoning means telling them
        // to stand down — not just dropping the reference.
        guard generationAtStart == generation else {
            await standDown(response)
            return
        }

        session = ActiveSession(eventID: response.eventId, reached: response.reached, kind: kind)
        message = DeliverySummary.talk(response)

        // Nobody heard it — don't burn a LiveKit connection talking to no one.
        guard !response.reached.isEmpty else {
            status = .failed(DeliverySummary.talk(response))
            discardSession()
            return
        }

        guard let urlString = response.livekitUrl, let url = normaliseLiveKitURL(urlString) else {
            status = .failed("The server didn't return a LiveKit URL. Check LIVEKIT_URL.")
            await standDown(response)
            discardSession()
            return
        }

        // MOCK_LOCAL_SERVICES fakes the server side; there's no SFU to reach, so
        // report honestly rather than hanging on a connection that can't succeed.
        if response.mock == true {
            status = .failed("Server is in mock mode — control works, but there's no live audio.")
            await standDown(response)
            discardSession()
            return
        }

        let connected: Room
        do {
            connected = try await openRoom(url: url, token: response.initiatorToken, kind: kind)
        } catch {
            if generationAtStart == generation {
                status = .failed("Couldn't open audio: \(error.localizedDescription)")
            }
            await standDown(response)
            discardSession()
            return
        }

        // Released while we were connecting: tear the room straight back down
        // rather than publishing into it.
        guard generationAtStart == generation else {
            await connected.disconnect()
            await standDown(response)
            discardSession()
            return
        }

        room = connected
        do {
            // The page/broadcast token is publish-only and the call token is
            // duplex; either way the microphone is what we publish.
            try await connected.localParticipant.setMicrophone(enabled: true)
        } catch {
            let reason = error.localizedDescription
            await stop()
            status = .failed("Couldn't open the microphone: \(reason)")
            return
        }

        guard generationAtStart == generation else { return }
        applyAudioRoute()
        status = kind == .call ? .ringing : .live
    }

    // MARK: - Ending

    /// Release the talk button / hang up. Always safe to call, at any point in
    /// the start sequence.
    func stop() async {
        guard status != .idle else { return }
        // Invalidates any start still in flight.
        generation &+= 1
        status = .ending

        let closing = room
        let closingSession = session
        room = nil
        delegateProxy = nil
        session = nil
        remoteIsSpeaking = false

        if let closing {
            try? await closing.localParticipant.setMicrophone(enabled: false)
            await closing.disconnect()
        }
        if let closingSession {
            try? await api.hangup(
                eventID: closingSession.eventID, deviceIDs: closingSession.reached
            )
        }
        deactivateAudioSession()
        status = .idle
    }

    /// Tell endpoints we woke to stand down again, for a session we never
    /// actually joined.
    private func standDown(_ response: InitiateResponse) async {
        guard !response.reached.isEmpty else { return }
        try? await api.hangup(eventID: response.eventId, deviceIDs: response.reached)
    }

    /// Drop a half-built session's local state. `status` is the caller's to set,
    /// because only it knows why we stopped.
    private func discardSession() {
        session = nil
        room = nil
        delegateProxy = nil
        deactivateAudioSession()
    }

    /// Dismiss a `.failed` status so the button goes back to ready.
    func acknowledgeFailure() {
        if case .failed = status { status = .idle }
    }

    /// A call is "answered" the moment the endpoint starts publishing audio.
    private func remoteAudioChanged(_ hasRemoteAudio: Bool) {
        remoteIsSpeaking = hasRemoteAudio
        if hasRemoteAudio, status == .ringing {
            status = .live
        }
    }

    // MARK: - LiveKit

    /// Connect and return the room *without* storing it, so a caller that has
    /// been superseded can throw it away cleanly.
    private func openRoom(url: URL, token: String, kind: IntercomKind) async throws -> Room {
        configureAudioSession(for: kind)

        let proxy = RoomDelegateProxy(onRemoteAudio: { [weak self] hasRemoteAudio in
            Task { @MainActor in self?.remoteAudioChanged(hasRemoteAudio) }
        }, onDisconnect: { [weak self] in
            Task { @MainActor in
                guard let self, self.status.isConnected else { return }
                await self.stop()
            }
        })
        delegateProxy = proxy

        let room = Room(delegate: proxy)
        try await room.connect(
            url: url.absoluteString,
            token: token,
            connectOptions: ConnectOptions(autoSubscribe: true)
        )
        return room
    }

    /// The server may hand back `http(s)://…` (Vercel env vars often do). LiveKit
    /// wants `ws(s)://`, the same normalisation the web client does.
    private func normaliseLiveKitURL(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if text.hasPrefix("https://") {
            text = "wss://" + text.dropFirst("https://".count)
        } else if text.hasPrefix("http://") {
            text = "ws://" + text.dropFirst("http://".count)
        }
        guard text.hasPrefix("ws://") || text.hasPrefix("wss://") else { return nil }
        return URL(string: text)
    }

    // MARK: - Audio session

    private func requestMicrophonePermission() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            return true
        case .denied:
            return false
        case .undetermined:
            return await AVAudioApplication.requestRecordPermission()
        @unknown default:
            return false
        }
    }

    /// A page or broadcast is us talking *out*, so it behaves like playback with
    /// a mic. A call is a conversation, so it takes the voice-chat mode that
    /// enables echo cancellation.
    private func configureAudioSession(for kind: IntercomKind) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: kind == .call ? .voiceChat : .videoChat,
                options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
            )
            try session.setActive(true)
        } catch {
            // Non-fatal: LiveKit configures the session too, and a wrong route is
            // better than refusing to connect.
        }
    }

    private func applyAudioRoute() {
        guard status.isConnected || status == .connecting else { return }
        try? AVAudioSession.sharedInstance()
            .overrideOutputAudioPort(speakerOn ? .speaker : .none)
    }

    private func deactivateAudioSession() {
        try? AVAudioSession.sharedInstance().setActive(
            false, options: .notifyOthersOnDeactivation
        )
    }
}

/// LiveKit's delegate is a class protocol, and `TalkController` is `@MainActor`,
/// so the callbacks land here and hop across.
private final class RoomDelegateProxy: RoomDelegate {
    private let onRemoteAudio: (Bool) -> Void
    private let onDisconnect: () -> Void

    init(onRemoteAudio: @escaping (Bool) -> Void, onDisconnect: @escaping () -> Void) {
        self.onRemoteAudio = onRemoteAudio
        self.onDisconnect = onDisconnect
    }

    func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        guard publication.kind == .audio else { return }
        onRemoteAudio(true)
    }

    func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
        guard publication.kind == .audio else { return }
        onRemoteAudio(false)
    }

    func room(_ room: Room, didDisconnectWithError error: LiveKitError?) {
        onDisconnect()
    }
}
