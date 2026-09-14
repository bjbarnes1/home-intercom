import SwiftUI

/// Arrival and departure announcements.
///
/// The thing this house can do that an off-the-shelf tracker can't: a geofence
/// crossing is already on the server, and so is a house full of speakers.
@MainActor
struct PlaceRulesView: View {
    let canEdit: Bool

    @EnvironmentObject private var store: HouseholdStore
    @Environment(\.colorScheme) private var scheme

    @State private var rules: [PlaceRule] = []
    @State private var places: [Place] = []
    @State private var loadError: String?
    @State private var banner: String?
    @State private var bannerKind: StatusBanner.Kind = .neutral
    @State private var isAdding = false
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
                if rules.isEmpty && !isLoading {
                    emptyState
                }
                ForEach(rules) { rule in
                    RuleRow(rule: rule, canEdit: canEdit) { enabled in
                        Task { await setEnabled(rule, enabled) }
                    }
                    .deleteDisabled(!canEdit)
                }
                .onDelete { delete(at: $0) }
            } header: {
                Text("When someone arrives or leaves")
            } footer: {
                if !rules.isEmpty {
                    Text(
                        "Announcements respect each panel's do-not-disturb, and murmur "
                        + "rather than call out during its quiet hours."
                    )
                }
            }
        }
        .navigationTitle("Announcements")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit && !places.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isAdding = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add an announcement")
                }
            }
        }
        .task { await load() }
        .sheet(isPresented: $isAdding) {
            NavigationStack {
                PlaceRuleFormView(places: places) { spoken in
                    if let spoken {
                        banner = "Saved, and said \u{201C}\(spoken)\u{201D} just now."
                        bannerKind = .good
                    } else {
                        banner = nil
                    }
                    await load()
                }
            }
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if places.isEmpty {
            Text("Add a place first — an announcement needs somewhere to arrive at.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("Nothing announced yet.")
                    .font(.subheadline.weight(.medium))
                Text(
                    "A good first one: when anyone arrives Home, say "
                    + "\u{201C}{name}\u{2019}s home\u{201D} in the Kitchen."
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let fetchedRules = store.api.placeRules()
            async let fetchedPlaces = store.api.places()
            rules = try await fetchedRules
            places = try await fetchedPlaces.places
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func setEnabled(_ rule: PlaceRule, _ enabled: Bool) async {
        do {
            try await store.api.setPlaceRuleEnabled(id: rule.id, enabled: enabled)
            await load()
        } catch {
            banner = error.localizedDescription
            bannerKind = .bad
        }
    }

    private func delete(at offsets: IndexSet) {
        let doomed = offsets.map { rules[$0] }
        Task {
            for rule in doomed {
                do {
                    try await store.api.deletePlaceRule(id: rule.id)
                } catch {
                    banner = error.localizedDescription
                    bannerKind = .bad
                }
            }
            await load()
        }
    }
}

@MainActor
private struct RuleRow: View {
    let rule: PlaceRule
    let canEdit: Bool
    let onToggle: @MainActor (Bool) -> Void

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: rule.trigger == .arrive ? "arrow.down.to.line" : "arrow.up.forward")
                .foregroundStyle(Theme.ident(rule.placeName, scheme: scheme))
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 3) {
                // The sentence first — that's what someone is checking.
                Text("\u{201C}\(rule.preview)\u{201D}")
                    .font(.subheadline.weight(.medium))
                Text(condition)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            Toggle("", isOn: Binding(get: { rule.enabled }, set: { onToggle($0) }))
                .labelsHidden()
                .disabled(!canEdit)
                .tint(Theme.ident(rule.placeName, scheme: scheme))
        }
        .opacity(rule.enabled ? 1 : 0.55)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(rule.preview). \(condition).")
    }

    private var condition: String {
        let who = rule.subjectName ?? "Anyone"
        let verb = rule.trigger == .arrive ? "arrives at" : "leaves"
        return "\(who) \(verb) \(rule.placeName)"
    }
}
