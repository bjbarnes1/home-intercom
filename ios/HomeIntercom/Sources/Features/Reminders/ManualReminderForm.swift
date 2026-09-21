import SwiftUI

/// The by-hand path: pick who, pick when, type what to say. Always available,
/// and the only path when `ANTHROPIC_API_KEY` isn't set on the server.
@MainActor
struct ManualReminderForm: View {
    /// Called after a successful create so the list behind can reload.
    let onSaved: @MainActor () async -> Void

    @EnvironmentObject private var store: HouseholdStore
    @Environment(\.dismiss) private var dismiss

    @State private var text = ""
    @State private var target: Target?
    @State private var repeats = false
    @State private var date = Date().addingTimeInterval(60 * 60)
    @State private var timeOfDay = Calendar.current.date(
        bySettingHour: 16, minute: 0, second: 0, of: Date()
    ) ?? Date()
    @State private var isSaving = false
    @State private var error: String?

    /// A reminder goes to exactly one device or one zone, which is what the
    /// API's `targetDeviceId` XOR `targetZoneId` rule requires.
    private enum Target: Hashable {
        case device(String)
        case zone(String)
    }

    var body: some View {
        Form {
            Section("Say") {
                TextField("Willoughby, time to read your novel", text: $text, axis: .vertical)
                    .lineLimit(2...4)
            }

            Section("Where") {
                Picker("Target", selection: $target) {
                    Text("Choose…").tag(Target?.none)
                    ForEach(store.zones) { zone in
                        Text("\(zone.name) (zone)").tag(Target?.some(.zone(zone.id)))
                    }
                    ForEach(store.endpoints) { device in
                        Text(device.displayName).tag(Target?.some(.device(device.id)))
                    }
                }
                .pickerStyle(.menu)
            }

            Section("When") {
                Toggle("Every day", isOn: $repeats)
                if repeats {
                    DatePicker("Time", selection: $timeOfDay, displayedComponents: .hourAndMinute)
                } else {
                    DatePicker("Date and time", selection: $date, in: Date()...)
                }
            }

            if let error {
                Section { Text(error).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle("New reminder")
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
        .onAppear {
            if target == nil, let everyone = store.everyoneZone {
                target = .zone(everyone.id)
            }
        }
    }

    private var canSave: Bool {
        !isSaving && target != nil && !text.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func save() async {
        guard canSave, let target else { return }
        isSaving = true
        defer { isSaving = false }

        var request = CreateReminderRequest(
            text: text.trimmingCharacters(in: .whitespacesAndNewlines),
            kind: repeats ? "RECURRING" : "ONE_OFF",
            // The device's own zone is the right one to schedule in — you set
            // "4pm" meaning 4pm here.
            timezone: TimeZone.current.identifier
        )

        if repeats {
            let parts = Calendar.current.dateComponents([.hour, .minute], from: timeOfDay)
            request.cron = "\(parts.minute ?? 0) \(parts.hour ?? 0) * * *"
        } else {
            request.runAt = ISO8601DateFormatter().string(from: date)
        }

        switch target {
        case let .device(id): request.targetDeviceId = id
        case let .zone(id): request.targetZoneId = id
        }

        do {
            _ = try await store.api.createReminder(request)
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
