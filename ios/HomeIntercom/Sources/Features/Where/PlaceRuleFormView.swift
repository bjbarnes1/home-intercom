import SwiftUI

/// Build one arrival/departure announcement.
///
/// The form is a sentence you fill in, and the sentence is shown as you build
/// it — a template with `{name}` in it is hard to picture until you see it
/// rendered. "Say it now" speaks it once on save, because the only real test of
/// an announcement is hearing it come out of the kitchen.
@MainActor
struct PlaceRuleFormView: View {
    let places: [Place]
    /// Passed the spoken sentence when the test actually reached a speaker.
    let onSaved: (String?) async -> Void

    @EnvironmentObject private var store: HouseholdStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    @State private var placeID: String?
    @State private var trigger: PlaceTrigger = .arrive
    /// Nil means anyone in the household.
    @State private var subjectID: String?
    @State private var template = "{name}'s home"
    @State private var target: Target?
    @State private var cooldown = 15.0
    @State private var testNow = true
    @State private var isSaving = false
    @State private var error: String?
    /// Fetched here rather than held on the store — the household roster is
    /// only needed on this screen, and adding it to the 5s presence poll would
    /// cost a database read every five seconds for a list that never changes.
    @State private var members: [PersonLocation] = []

    private enum Target: Hashable {
        case device(String)
        case zone(String)
    }

    private var place: Place? { places.first { $0.id == placeID } }
    private var subjectName: String {
        members.first { $0.id == subjectID }?.name ?? "Someone"
    }

    var body: some View {
        Form {
            Section("When") {
                Picker("Who", selection: $subjectID) {
                    Text("Anyone").tag(String?.none)
                    ForEach(members) { person in
                        Text(person.name).tag(String?.some(person.id))
                    }
                }
                Picker("Arrives or leaves", selection: $trigger) {
                    ForEach(PlaceTrigger.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                Picker("Place", selection: $placeID) {
                    Text("Choose…").tag(String?.none)
                    ForEach(places) { place in
                        Text(place.name).tag(String?.some(place.id))
                    }
                }
            }

            Section {
                TextField("{name}'s home", text: $template, axis: .vertical)
                    .lineLimit(1...3)
                preview
            } header: {
                Text("Say")
            } footer: {
                Text("{name} becomes the person, {place} becomes the place.")
            }

            Section("Where to say it") {
                Picker("Speakers", selection: $target) {
                    Text("Choose…").tag(Target?.none)
                    ForEach(store.zones) { zone in
                        Text("\(zone.name) (zone)").tag(Target?.some(.zone(zone.id)))
                    }
                    ForEach(store.endpoints) { device in
                        Text(device.displayName).tag(Target?.some(.device(device.id)))
                    }
                }
            }

            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Slider(value: $cooldown, in: 0...60, step: 5)
                    Text(cooldown == 0 ? "No cooldown" : "At most once every \(Int(cooldown)) min")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Toggle("Say it now, to check", isOn: $testNow)
            } header: {
                Text("Cooldown")
            } footer: {
                Text(
                    "A phone sitting on the edge of a geofence can cross it over and "
                    + "over. The cooldown is what stops the house announcing the same "
                    + "arrival five times."
                )
            }

            if let error {
                Section { Text(error).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle("New announcement")
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
        .task { await loadMembers() }
    }

    /// Show the sentence, not the template — nobody can picture "{name}'s home"
    /// until they see "Willoughby's home".
    private var preview: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "speaker.wave.2.fill")
                .foregroundStyle(Theme.ident(place?.name, scheme: scheme))
            Text("\u{201C}\(rendered)\u{201D}")
                .font(.subheadline.weight(.medium))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Will say: \(rendered)")
    }

    private var rendered: String {
        template
            .replacingOccurrences(of: "{name}", with: subjectName)
            .replacingOccurrences(of: "{place}", with: place?.name ?? "the place")
    }

    private func loadMembers() async {
        // Not fatal — "Anyone" still works without a roster.
        members = (try? await store.api.people().people) ?? []
    }

    private func start() {
        if placeID == nil { placeID = places.first?.id }
        if target == nil, let everyone = store.everyoneZone {
            target = .zone(everyone.id)
        }
    }

    private var canSave: Bool {
        !isSaving && placeID != nil && target != nil
            && !template.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func save() async {
        guard canSave, let placeID, let target else { return }
        isSaving = true
        defer { isSaving = false }

        var request = CreatePlaceRuleRequest(
            placeId: placeID,
            trigger: trigger.rawValue,
            subjectUserId: subjectID,
            template: template.trimmingCharacters(in: .whitespacesAndNewlines),
            cooldownMinutes: Int(cooldown),
            testNow: testNow
        )
        switch target {
        case let .device(id): request.targetDeviceId = id
        case let .zone(id): request.targetZoneId = id
        }

        do {
            let response = try await store.api.createPlaceRule(request)
            await onSaved(response.spoken)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
