import SwiftUI
import MapKit

/// Manage the household's geofences.
///
/// Lives on the phone rather than the web controller because adding a place is
/// inherently a standing-somewhere job: "Home" is best added from the kitchen.
/// Places are household-wide — iOS's 20-region budget is shared by everyone, so
/// the list is one list, and this screen keeps the count visible.
@MainActor
struct PlacesEditorView: View {
    let canEdit: Bool

    @EnvironmentObject private var store: HouseholdStore
    @EnvironmentObject private var location: LocationService
    @Environment(\.colorScheme) private var scheme

    @State private var places: [Place] = []
    @State private var loadError: String?
    @State private var banner: String?
    @State private var bannerKind: StatusBanner.Kind = .neutral
    @State private var editing: PlaceDraft?
    @State private var isLoading = true

    var body: some View {
        List {
            if let loadError {
                Section { StatusBanner(text: loadError, kind: .bad) }
            }
            if let banner {
                Section { StatusBanner(text: banner, kind: bannerKind) }
            }

            Section {
                if places.isEmpty && !isLoading {
                    Text("No places yet. Add Home first — it's the one that earns its keep.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                ForEach(places) { place in
                    Button {
                        guard canEdit else { return }
                        editing = PlaceDraft(place: place)
                    } label: {
                        PlaceRow(place: place)
                    }
                    .buttonStyle(.plain)
                    .deleteDisabled(!canEdit)
                }
                .onDelete { delete(at: $0) }
            } header: {
                Text("Places")
            } footer: {
                budgetFooter
            }
        }
        .navigationTitle("Places")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        editing = PlaceDraft()
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add a place")
                }
            }
        }
        .task { await load() }
        .sheet(item: $editing) { draft in
            NavigationStack {
                PlaceFormView(draft: draft) { await load() }
            }
        }
    }

    /// iOS stops monitoring past its cap without complaining, so the count is
    /// always on screen rather than only when something breaks.
    @ViewBuilder
    private var budgetFooter: some View {
        let limit = LocationService.maxMonitoredRegions
        if places.count > limit {
            Text(
                "\(places.count) places, but iOS monitors only \(limit) per app — "
                + "\(places.count - limit) will never fire. Remove some."
            )
            .foregroundStyle(.orange)
        } else {
            Text(
                "\(places.count) of \(limit) geofences used. The limit is per app and "
                + "shared by everyone in the household, not per person."
                + (canEdit ? "" : " Only admins can change these.")
            )
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            places = try await store.api.places().places
            loadError = nil
            // The set of monitored regions just changed under us.
            await location.refreshGeofences()
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func delete(at offsets: IndexSet) {
        let doomed = offsets.map { places[$0] }
        Task {
            for place in doomed {
                do {
                    try await store.api.deletePlace(id: place.id)
                } catch {
                    banner = error.localizedDescription
                    bannerKind = .bad
                }
            }
            // Deleting a place deletes its visit history too — say so, because
            // it isn't obvious from a swipe.
            if banner == nil, let first = doomed.first {
                banner = doomed.count == 1
                    ? "Removed \(first.name) and its arrivals."
                    : "Removed \(doomed.count) places and their arrivals."
                bannerKind = .neutral
            }
            await load()
        }
    }
}

@MainActor
private struct PlaceRow: View {
    let place: Place

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: place.icon ?? "mappin.circle.fill")
                .foregroundStyle(Theme.ident(place.name, scheme: scheme))
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(place.name)
                Text("\(place.radiusM)m radius")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .accessibilityElement(children: .combine)
    }
}
