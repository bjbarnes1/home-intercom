import SwiftUI
import MapKit
import CoreLocation

/// What the form is editing — a new place, or an existing one.
struct PlaceDraft: Identifiable {
    /// Nil for a new place.
    let placeID: String?
    var name: String
    var radiusM: Double
    var icon: String
    var coordinate: CLLocationCoordinate2D?

    var id: String { placeID ?? "new" }
    var isNew: Bool { placeID == nil }

    init() {
        placeID = nil
        name = ""
        radiusM = 150
        icon = "house.fill"
        coordinate = nil
    }

    init(place: Place) {
        placeID = place.id
        name = place.name
        radiusM = Double(place.radiusM)
        icon = place.icon ?? "mappin.circle.fill"
        coordinate = CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng)
    }
}

/// Pick a spot and a radius.
///
/// Two ways in, because both are needed: **Use my location** for somewhere you
/// are (Home), and panning the map for somewhere you aren't (School — you can't
/// stand in the playground to add it).
///
/// The pin is fixed to the centre of the map and the map moves underneath it.
/// That's easier on a phone than dragging a small target with the thumb that's
/// covering it.
@MainActor
struct PlaceFormView: View {
    @State var draft: PlaceDraft
    let onSaved: @MainActor () async -> Void

    @EnvironmentObject private var store: HouseholdStore
    @EnvironmentObject private var location: LocationService
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    @State private var camera: MapCameraPosition = .automatic
    /// Tracked from the map's camera, which is what actually gets saved.
    @State private var centre: CLLocationCoordinate2D?
    @State private var isLocating = false
    @State private var isSaving = false
    @State private var error: String?

    private static let suggestedIcons = [
        "house.fill", "graduationcap.fill", "building.2.fill", "figure.run",
        "cart.fill", "mappin.circle.fill",
    ]

    var body: some View {
        Form {
            Section {
                TextField("Home", text: $draft.name)
                    .textInputAutocapitalization(.words)
            } header: {
                Text("Name")
            } footer: {
                Text("Spoken aloud later, if you wire arrivals up to announcements.")
            }

            Section("Where") {
                mapPicker
                Button {
                    Task { await useMyLocation() }
                } label: {
                    Label(
                        isLocating ? "Finding you…" : "Use my location",
                        systemImage: "location.fill"
                    )
                }
                .disabled(isLocating)
            }

            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Slider(value: $draft.radiusM, in: 50...1000, step: 25)
                    Text("\(Int(draft.radiusM))m")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text("Radius")
            } footer: {
                Text(
                    "How close counts as \"here\". Too tight and arrivals get missed — "
                    + "GPS scatters by tens of metres near buildings, so 150m is a sane "
                    + "default for a house."
                )
            }

            Section("Icon") {
                iconPicker
            }

            if let error {
                Section { Text(error).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle(draft.isNew ? "New place" : draft.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? "Saving…" : "Save") { Task { await save() } }
                    .disabled(!canSave)
            }
        }
        .onAppear { start() }
    }

    // MARK: - Map

    private var mapPicker: some View {
        ZStack {
            Map(position: $camera) {
                if let centre {
                    MapCircle(center: centre, radius: draft.radiusM)
                        .foregroundStyle(Theme.ident(draft.name, scheme: scheme).opacity(0.18))
                        .stroke(Theme.ident(draft.name, scheme: scheme), lineWidth: 1)
                }
            }
            .frame(height: 220)
            .onMapCameraChange(frequency: .continuous) { context in
                centre = context.region.center
            }

            // The pin stays put; the map moves under it.
            Image(systemName: "mappin")
                .font(.title2)
                .foregroundStyle(Theme.ident(draft.name, scheme: scheme))
                .shadow(radius: 2)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
        .listRowInsets(EdgeInsets())
        .accessibilityLabel("Map. Pan to place the pin at the centre.")
    }

    private var iconPicker: some View {
        HStack(spacing: 14) {
            ForEach(Self.suggestedIcons, id: \.self) { name in
                Button {
                    draft.icon = name
                } label: {
                    Image(systemName: name)
                        .font(.title3)
                        .frame(width: 40, height: 40)
                        .background(
                            Circle().fill(
                                draft.icon == name
                                    ? Theme.tint(draft.name, step: 3, scheme: scheme)
                                    : Color.clear
                            )
                        )
                        .foregroundStyle(
                            draft.icon == name
                                ? Theme.ident(draft.name, scheme: scheme)
                                : Color.secondary
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(name)
                .accessibilityAddTraits(draft.icon == name ? [.isSelected] : [])
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Actions

    private func start() {
        if let existing = draft.coordinate {
            centre = existing
            camera = .region(region(around: existing))
        } else {
            // A new place almost always starts where you're standing.
            Task { await useMyLocation() }
        }
    }

    private func region(around coordinate: CLLocationCoordinate2D) -> MKCoordinateRegion {
        // Frame roughly four radii across, so the circle sits comfortably inside.
        let span = max(draft.radiusM * 4, 400)
        return MKCoordinateRegion(
            center: coordinate, latitudinalMeters: span, longitudinalMeters: span
        )
    }

    private func useMyLocation() async {
        isLocating = true
        defer { isLocating = false }
        do {
            let coordinate = try await location.currentCoordinate()
            centre = coordinate
            withAnimation { camera = .region(region(around: coordinate)) }
            error = nil
        } catch {
            // Not fatal — the map still pans by hand.
            self.error = error.localizedDescription
        }
    }

    private var canSave: Bool {
        !isSaving && centre != nil && !draft.name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func save() async {
        guard canSave, let centre else { return }
        isSaving = true
        defer { isSaving = false }

        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let radius = Int(draft.radiusM.rounded())

        do {
            if let id = draft.placeID {
                _ = try await store.api.updatePlace(
                    id: id,
                    PatchPlaceRequest(
                        name: name, lat: centre.latitude, lng: centre.longitude,
                        radiusM: radius, icon: draft.icon
                    )
                )
            } else {
                let response = try await store.api.createPlace(
                    CreatePlaceRequest(
                        name: name, lat: centre.latitude, lng: centre.longitude,
                        radiusM: radius, icon: draft.icon
                    )
                )
                // Over the region cap: the geofence exists but will never fire,
                // so say so now rather than letting it fail silently later.
                if let warning = response.warning {
                    error = warning
                    await onSaved()
                    return
                }
            }
            await onSaved()
            // Register the new geometry straight away.
            await location.refreshGeofences()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
