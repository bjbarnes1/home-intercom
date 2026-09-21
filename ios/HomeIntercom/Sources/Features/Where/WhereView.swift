import SwiftUI
import MapKit

/// Where everyone is.
///
/// Everybody in the household sees this same screen — children included. That
/// symmetry is the design, not an oversight: a map only some people can see is
/// surveillance, and one everyone can see is coordination.
///
/// Someone who isn't sharing appears in the list with no position rather than
/// vanishing, because "Raff isn't sharing" is more useful than a silent gap.
@MainActor
struct WhereView: View {
    @EnvironmentObject private var store: HouseholdStore
    @EnvironmentObject private var location: LocationService
    @Environment(\.colorScheme) private var scheme

    @State private var people: [PersonLocation] = []
    @State private var places: [Place] = []
    @State private var viewerID: String?
    @State private var loadError: String?
    @State private var camera: MapCameraPosition = .automatic
    @State private var refreshTimer: Task<Void, Never>?

    private var located: [PersonLocation] {
        people.filter { $0.lastFix != nil }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                map
                roster
            }
            .background(Theme.ground(for: scheme).background.color.ignoresSafeArea())
            .navigationTitle("Where")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        PlacesEditorView(canEdit: store.auth.user?.isAdmin == true)
                    } label: {
                        Image(systemName: "mappin.and.ellipse")
                    }
                    .accessibilityLabel("Places")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SharingSettingsView()
                    } label: {
                        Image(systemName: "person.badge.shield.checkmark")
                    }
                    .accessibilityLabel("Location sharing")
                }
            }
        }
        .task { await load() }
        .onAppear { startRefreshing() }
        .onDisappear { stopRefreshing() }
    }

    // MARK: - Map

    private var map: some View {
        Map(position: $camera) {
            ForEach(places) { place in
                MapCircle(
                    center: CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng),
                    radius: CLLocationDistance(place.radiusM)
                )
                .foregroundStyle(Theme.ident(place.name, scheme: scheme).opacity(0.12))
                .stroke(Theme.ident(place.name, scheme: scheme).opacity(0.5), lineWidth: 1)
            }

            ForEach(located) { person in
                if let fix = person.lastFix {
                    Annotation(
                        person.name,
                        coordinate: CLLocationCoordinate2D(latitude: fix.lat, longitude: fix.lng)
                    ) {
                        PersonPin(person: person)
                    }
                }
            }
        }
        .frame(minHeight: 260)
    }

    // MARK: - Roster

    private var roster: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if let loadError {
                    StatusBanner(text: loadError, kind: .bad)
                }

                if people.isEmpty && loadError == nil {
                    Text("Nobody in the household yet.")
                        .font(.footnote)
                        .foregroundStyle(Theme.ground(for: scheme).inkDim)
                }

                if !places.isEmpty {
                    NavigationLink {
                        PlaceRulesView(canEdit: store.auth.user?.isAdmin == true)
                    } label: {
                        IdentityCard(identity: nil) {
                            HStack(spacing: 10) {
                                Image(systemName: "speaker.wave.2.fill")
                                    .foregroundStyle(Theme.ident("everyone", scheme: scheme))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Arrival announcements")
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(Theme.ground(for: scheme).ink)
                                    Text("Say something on the speakers when someone gets home.")
                                        .font(.caption)
                                        .foregroundStyle(Theme.ground(for: scheme).inkDim)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Theme.ground(for: scheme).inkDim)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }

                if places.isEmpty && !people.isEmpty {
                    NavigationLink {
                        PlacesEditorView(canEdit: store.auth.user?.isAdmin == true)
                    } label: {
                        IdentityCard(identity: nil) {
                            VStack(alignment: .leading, spacing: 4) {
                                Label("Add your first place", systemImage: "mappin.and.ellipse")
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(Theme.ground(for: scheme).ink)
                                Text("Arrivals and departures need somewhere to arrive at. Start with Home.")
                                    .font(.caption)
                                    .foregroundStyle(Theme.ground(for: scheme).inkDim)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }

                ForEach(people) { person in
                    PersonRow(person: person, isViewer: person.id == viewerID) {
                        focus(on: person)
                    }
                }

                if !people.isEmpty {
                    retentionNote
                }
            }
            .padding(16)
        }
    }

    /// The promise, on the screen where the data is — not buried in a policy.
    private var retentionNote: some View {
        Text(
            "Positions older than a day are rounded to about 100m, and everything "
            + "is deleted after a week. Everyone here sees the same map."
        )
        .font(.caption2)
        .foregroundStyle(Theme.ground(for: scheme).inkDim)
        .padding(.top, 4)
    }

    // MARK: - Data

    private func load() async {
        do {
            let response = try await store.api.people()
            people = response.people
            places = response.places
            viewerID = response.viewerId
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func focus(on person: PersonLocation) {
        guard let fix = person.lastFix else { return }
        withAnimation {
            camera = .region(
                MKCoordinateRegion(
                    center: CLLocationCoordinate2D(latitude: fix.lat, longitude: fix.lng),
                    latitudinalMeters: 1_200,
                    longitudinalMeters: 1_200
                )
            )
        }
    }

    /// Slower than the 5s presence poll — nobody's position changes that fast,
    /// and each call is a real database read.
    private func startRefreshing() {
        guard refreshTimer == nil else { return }
        location.reportNow()
        refreshTimer = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard !Task.isCancelled else { return }
                await load()
            }
        }
    }

    private func stopRefreshing() {
        refreshTimer?.cancel()
        refreshTimer = nil
    }
}

// MARK: - Pieces

@MainActor
private struct PersonPin: View {
    let person: PersonLocation

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .fill(Theme.ident(person.name, scheme: scheme))
                    .frame(width: 34, height: 34)
                Text(initials)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
            }
            .overlay(
                Circle().strokeBorder(.white.opacity(0.8), lineWidth: 2)
            )
            .shadow(radius: 3)

            // A rounded position must not look like a precise one.
            if person.lastFix?.coarse == true {
                Image(systemName: "circle.dashed")
                    .font(.system(size: 9))
                    .foregroundStyle(Theme.ground(for: scheme).inkDim)
            }
        }
        .accessibilityLabel(person.name)
    }

    private var initials: String {
        String(person.name.prefix(2)).uppercased()
    }
}

@MainActor
private struct PersonRow: View {
    let person: PersonLocation
    let isViewer: Bool
    let onTap: @MainActor () -> Void

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Button { onTap() } label: {
            IdentityCard(identity: person.name) {
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(Theme.tint(person.name, step: 3, scheme: scheme))
                            .frame(width: 38, height: 38)
                        Image(systemName: icon)
                            .foregroundStyle(Theme.ident(person.name, scheme: scheme))
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(person.name)
                                .font(.headline)
                                .foregroundStyle(Theme.ground(for: scheme).ink)
                            if isViewer {
                                Text("you")
                                    .font(.caption2)
                                    .foregroundStyle(Theme.ground(for: scheme).inkDim)
                            }
                        }
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(Theme.ground(for: scheme).inkDim)
                    }

                    Spacer(minLength: 0)

                    if let battery = person.lastFix?.batteryPct, battery <= 20 {
                        Label("\(battery)%", systemImage: "battery.25")
                            .font(.caption2)
                            .foregroundStyle(Theme.ident("lounge", scheme: scheme))
                            .accessibilityLabel("Battery \(battery) percent")
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(person.lastFix == nil)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(person.name). \(subtitle).")
    }

    private var icon: String {
        guard person.reporting else { return "location.slash" }
        return person.at == nil ? "location.fill" : "house.fill"
    }

    private var subtitle: String {
        guard person.reporting else { return "Not sharing location" }
        guard let fix = person.lastFix else { return "Sharing on — nothing reported yet" }

        var parts: [String] = []
        if let at = person.at {
            parts.append("At \(at.name)")
        } else {
            parts.append(fix.coarse ? "Somewhere (rounded)" : "Out")
        }
        parts.append(Self.relative(fix.capturedAt))
        return parts.joined(separator: " · ")
    }

    private static func relative(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
