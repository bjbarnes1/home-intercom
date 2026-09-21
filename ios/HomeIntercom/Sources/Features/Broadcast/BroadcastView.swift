import SwiftUI

/// Two ways to reach a whole zone at once:
///
/// **Say something** posts text to `/api/announce`; the server synthesises it
/// with OpenAI's Ash voice (or the panels fall back to on-device speech) and it
/// plays immediately — nothing to hold, nobody to wait for.
///
/// **Talk live** opens a real one-way LiveKit broadcast, held down like a page.
@MainActor
struct BroadcastView: View {
    let user: User

    @EnvironmentObject private var store: HouseholdStore
    @Environment(\.colorScheme) private var scheme
    @StateObject private var talk: TalkController

    @State private var mode: Mode = .say
    @State private var zoneID: String?
    @State private var text = ""
    @State private var isSending = false
    @State private var result: String = ""
    @State private var resultKind: StatusBanner.Kind = .neutral
    @FocusState private var textFocused: Bool

    private enum Mode: String, CaseIterable {
        case say = "Say something"
        case live = "Talk live"
    }

    init(user: User, api: APIClient) {
        self.user = user
        _talk = StateObject(wrappedValue: TalkController(api: api))
    }

    private var selectedZone: Zone? { store.zone(id: zoneID) }
    private var identity: String? { selectedZone?.name }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Picker("Mode", selection: $mode) {
                        ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .disabled(talk.status.isConnected)

                    zonePicker

                    switch mode {
                    case .say: sayControls
                    case .live: liveControls
                    }

                    if !bannerText.isEmpty {
                        StatusBanner(text: bannerText, kind: bannerKind)
                    }
                }
                .padding(18)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.ground(for: scheme).background.color.ignoresSafeArea())
            .navigationTitle("Broadcast")
        }
        .onAppear { selectInitialZone() }
        .onChange(of: store.zones) { _, _ in selectInitialZone() }
        .onChange(of: zoneID) { _, newValue in store.settings.lastTalkZoneID = newValue }
    }

    // MARK: - Zone

    private var zonePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Send to")
            if store.zones.isEmpty {
                Text("No zones yet — create one in the web controller.")
                    .font(.footnote)
                    .foregroundStyle(Theme.ground(for: scheme).inkDim)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(store.zones) { zone in
                            zoneChip(zone)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func zoneChip(_ zone: Zone) -> some View {
        let selected = zone.id == zoneID
        return Button {
            zoneID = zone.id
        } label: {
            HStack(spacing: 7) {
                PresenceDot(online: zone.onlineCount > 0, identity: zone.name)
                Text(zone.name).font(.subheadline)
                Text("\(zone.onlineCount)/\(zone.deviceCount)")
                    .font(.caption2)
                    .foregroundStyle(Theme.ground(for: scheme).inkDim)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                Capsule().fill(
                    selected
                        ? Theme.tint(zone.name, step: 3, scheme: scheme)
                        : Theme.ground(for: scheme).surface
                )
            )
            .overlay(
                Capsule().strokeBorder(
                    selected ? Theme.ident(zone.name, scheme: scheme) : .clear,
                    lineWidth: 1
                )
            )
            .foregroundStyle(Theme.ground(for: scheme).ink)
        }
        .buttonStyle(.plain)
        .disabled(talk.status.isConnected)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    private func selectInitialZone() {
        guard zoneID == nil || store.zone(id: zoneID) == nil else { return }
        // Last one used, else the widest zone — "everyone" is the common case.
        if let remembered = store.settings.lastTalkZoneID, store.zone(id: remembered) != nil {
            zoneID = remembered
        } else {
            zoneID = store.everyoneZone?.id
        }
    }

    // MARK: - Say something

    private var sayControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Dinner's ready", text: $text, axis: .vertical)
                .lineLimit(2...5)
                .focused($textFocused)
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Theme.ground(for: scheme).surface)
                )
                .disabled(isSending)

            Text("Tap the microphone on the keyboard to dictate instead of typing.")
                .font(.caption2)
                .foregroundStyle(Theme.ground(for: scheme).inkDim)

            Button {
                Task { await send() }
            } label: {
                Group {
                    if isSending {
                        ProgressView().tint(.white)
                    } else {
                        Label("Say it", systemImage: "speaker.wave.2.fill").font(.headline)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 52)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.ident(identity, scheme: scheme))
            .disabled(!canSend)
        }
    }

    private var canSend: Bool {
        !isSending && zoneID != nil && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func send() async {
        guard let zoneID, canSend else { return }
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        textFocused = false
        isSending = true
        defer { isSending = false }

        do {
            let response = try await store.api.announce(
                text: message, from: user.name, targetZoneID: zoneID
            )
            result = DeliverySummary.announce(response)
            resultKind = response.reached.isEmpty ? .bad : .good
            if !response.reached.isEmpty { text = "" }
        } catch {
            result = error.localizedDescription
            resultKind = .bad
        }
    }

    // MARK: - Talk live

    private var liveControls: some View {
        VStack(spacing: 14) {
            TalkButton(
                identity: identity,
                isLive: talk.status == .live,
                isBusy: talk.status.isBusy,
                label: "Hold to broadcast",
                onPress: {
                    guard let zoneID else { return }
                    Task { await talk.broadcast(zoneID: zoneID, as: user.name) }
                },
                onRelease: { Task { await talk.stop() } }
            )
            .disabled(zoneID == nil)

            Text("Everyone in \(selectedZone?.name ?? "the zone") hears you. They can't talk back.")
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.ground(for: scheme).inkDim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
    }

    // MARK: - Banner

    private var bannerText: String {
        switch mode {
        case .say:
            return result
        case .live:
            if case let .failed(reason) = talk.status { return reason }
            return talk.message
        }
    }

    private var bannerKind: StatusBanner.Kind {
        switch mode {
        case .say:
            return resultKind
        case .live:
            if case .failed = talk.status { return .bad }
            return talk.status.isConnected ? .good : .neutral
        }
    }
}
