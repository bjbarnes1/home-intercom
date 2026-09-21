import SwiftUI

/// One room, two ways to reach it: hold-to-talk paging (they hear you) and a
/// two-way call (you hear each other). Paging is the default because it's the
/// household verb — "tell Raff dinner's ready" — and it can't leave a hot mic.
@MainActor
struct PageTalkView: View {
    let device: Device
    let user: User

    @EnvironmentObject private var store: HouseholdStore
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var talk: TalkController
    @State private var mode: Mode = .page

    private enum Mode: String, CaseIterable {
        case page = "Page"
        case call = "Call"

        var caption: String {
            switch self {
            case .page: return "Hold to talk · one way"
            case .call: return "Rings first · both ways"
            }
        }
    }

    /// `api` comes from the store so this screen always talks to whichever
    /// server Settings currently points at.
    init(device: Device, user: User, api: APIClient) {
        self.device = device
        self.user = user
        _talk = StateObject(wrappedValue: TalkController(api: api))
    }

    private var identity: String { device.roomLabel }

    var body: some View {
        VStack(spacing: 20) {
            header

            Picker("Mode", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .disabled(talk.status != .idle)

            Text(mode.caption)
                .font(.caption)
                .foregroundStyle(Theme.ground(for: scheme).inkDim)

            Spacer(minLength: 0)

            control

            Spacer(minLength: 0)

            if !statusText.isEmpty {
                StatusBanner(text: statusText, kind: statusKind)
            }

            if !device.online {
                StatusBanner(
                    text: "\(device.displayName) is offline — nothing will be heard there.",
                    kind: .bad
                )
            }
        }
        .padding(20)
        .frame(maxHeight: .infinity)
        .background(Theme.ground(for: scheme).background.color.ignoresSafeArea())
        .navigationTitle(device.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if talk.status.isConnected && mode == .call {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        talk.speakerOn.toggle()
                    } label: {
                        Image(systemName: talk.speakerOn ? "speaker.wave.2.fill" : "iphone.gen3")
                    }
                    .accessibilityLabel(talk.speakerOn ? "Speaker on" : "Earpiece")
                }
            }
        }
        .interactiveDismissDisabled(talk.status.isConnected)
        .onChange(of: mode) { _, _ in talk.acknowledgeFailure() }
        .onDisappear { Task { await talk.stop() } }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "person.wave.2.fill")
                .foregroundStyle(Theme.ident(identity, scheme: scheme))
            Text(device.online ? "Online" : "Offline")
                .font(.subheadline)
                .foregroundStyle(Theme.ground(for: scheme).inkDim)
            PresenceDot(online: device.online, identity: identity)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var control: some View {
        switch mode {
        case .page:
            TalkButton(
                identity: identity,
                isLive: talk.status == .live,
                isBusy: talk.status.isBusy,
                onPress: { Task { await talk.page(deviceID: device.id, as: user.name) } },
                onRelease: { Task { await talk.stop() } }
            )
        case .call:
            callControl
        }
    }

    @ViewBuilder
    private var callControl: some View {
        VStack(spacing: 18) {
            if talk.status.isConnected {
                HStack(spacing: 8) {
                    if talk.remoteIsSpeaking {
                        Image(systemName: "waveform")
                            .symbolEffect(.variableColor.iterative)
                    }
                    Text(talk.status == .ringing ? "Ringing…" : "Connected")
                        .font(.title3.weight(.medium))
                }
                .foregroundStyle(Theme.ident(identity, scheme: scheme))
                .accessibilityElement(children: .combine)

                Button {
                    Task { await talk.stop() }
                } label: {
                    Label("Hang up", systemImage: "phone.down.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 54)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.ident("lounge", scheme: scheme))
            } else {
                Button {
                    Task { await talk.call(deviceID: device.id, as: user.name) }
                } label: {
                    Label(
                        talk.status.isBusy ? "Calling…" : "Call \(device.displayName)",
                        systemImage: "phone.fill"
                    )
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 54)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.ident(identity, scheme: scheme))
                .disabled(talk.status.isBusy)
            }
        }
        .frame(maxWidth: 320)
    }

    private var statusText: String {
        if case let .failed(reason) = talk.status { return reason }
        return talk.message
    }

    private var statusKind: StatusBanner.Kind {
        if case .failed = talk.status { return .bad }
        return talk.status.isConnected ? .good : .neutral
    }
}
