import SwiftUI

/// Zones first, then rooms — the same order as the web controller, because the
/// commonest action is "tell everyone", not "page one child".
@MainActor
struct HomeView: View {
    let user: User

    @EnvironmentObject private var store: HouseholdStore
    @Environment(\.colorScheme) private var scheme
    @State private var talkTarget: Device?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let refreshError = store.refreshError {
                        StatusBanner(text: refreshError, kind: .bad)
                    }

                    if !store.zones.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            SectionLabel("Zones")
                            ForEach(store.zones) { zone in
                                ZoneRowCard(zone: zone)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        SectionLabel("Rooms")
                        if store.endpoints.isEmpty {
                            emptyRooms
                        } else {
                            ForEach(store.endpoints) { device in
                                Button {
                                    talkTarget = device
                                } label: {
                                    RoomRowCard(device: device)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(18)
            }
            .background(Theme.ground(for: scheme).background.color.ignoresSafeArea())
            .navigationTitle("Hello, \(user.name)")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 6) {
                        PresenceDot(online: store.onlineEndpointCount > 0, identity: "raff")
                        Text("\(store.onlineEndpointCount) online")
                            .font(.caption)
                            .foregroundStyle(Theme.ground(for: scheme).inkDim)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(store.onlineEndpointCount) rooms online")
                }
            }
            .refreshable { await store.refresh() }
            .navigationDestination(item: $talkTarget) { device in
                PageTalkView(device: device, user: user, api: store.api)
            }
        }
    }

    private var emptyRooms: some View {
        IdentityCard(identity: nil) {
            VStack(alignment: .leading, spacing: 6) {
                Text("No room devices yet")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.ground(for: scheme).ink)
                Text("Register and pair one from the web controller, then it shows up here.")
                    .font(.footnote)
                    .foregroundStyle(Theme.ground(for: scheme).inkDim)
            }
        }
    }
}

@MainActor
private struct ZoneRowCard: View {
    let zone: Zone

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        IdentityCard(identity: zone.name) {
            HStack(spacing: 12) {
                Image(systemName: "speaker.wave.3.fill")
                    .font(.title3)
                    .foregroundStyle(Theme.ident(zone.name, scheme: scheme))
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 2) {
                    Text(zone.name)
                        .font(.headline)
                        .foregroundStyle(Theme.ground(for: scheme).ink)
                    Text("\(zone.onlineCount) of \(zone.deviceCount) online")
                        .font(.caption)
                        .foregroundStyle(Theme.ground(for: scheme).inkDim)
                }

                Spacer()
                PresenceDot(online: zone.onlineCount > 0, identity: zone.name)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

@MainActor
private struct RoomRowCard: View {
    let device: Device

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        IdentityCard(identity: device.roomLabel) {
            HStack(spacing: 12) {
                Image(systemName: Self.icon(for: device.roomLabel))
                    .font(.title3)
                    .foregroundStyle(Theme.ident(device.roomLabel, scheme: scheme))
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 2) {
                    Text(device.displayName)
                        .font(.headline)
                        .foregroundStyle(Theme.ground(for: scheme).ink)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(Theme.ground(for: scheme).inkDim)
                }

                Spacer()
                PresenceDot(online: device.online, identity: device.roomLabel)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.ground(for: scheme).inkDim)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(device.displayName), \(subtitle)")
        .accessibilityHint("Opens page and call")
    }

    private var subtitle: String {
        var parts: [String] = [device.online ? "Online" : "Offline"]
        if let room = device.room, room != device.displayName { parts.append(room) }
        if device.doNotDisturb == true { parts.append("Do not disturb") }
        return parts.joined(separator: " · ")
    }

    /// Mirrors `roomIcon()` in `src/app/controller/types.ts`, in SF Symbols.
    static func icon(for name: String) -> String {
        let lowered = name.lowercased()
        if lowered.contains("kitchen") { return "fork.knife" }
        if lowered.contains("rumpus") { return "gamecontroller.fill" }
        if lowered.contains("lounge") { return "sofa.fill" }
        return "door.left.hand.closed"
    }
}
