import SwiftUI

/// Reminders, with the plain-words path first: type "remind Willoughby to read
/// his novel at 4pm tomorrow" and the server's Claude call resolves who, when
/// and what to say. The manual form is the fallback when that's not configured.
@MainActor
struct RemindersView: View {
    @EnvironmentObject private var store: HouseholdStore
    @Environment(\.colorScheme) private var scheme

    @State private var reminders: [Reminder] = []
    @State private var request = ""
    @State private var isParsing = false
    @State private var banner = ""
    @State private var bannerKind: StatusBanner.Kind = .neutral
    @State private var loadError: String?
    @State private var showingManualForm = false
    @FocusState private var requestFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    askBox

                    if !banner.isEmpty {
                        StatusBanner(text: banner, kind: bannerKind)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        SectionLabel("Scheduled")
                        if let loadError {
                            StatusBanner(text: loadError, kind: .bad)
                        } else if reminders.isEmpty {
                            Text("Nothing scheduled.")
                                .font(.footnote)
                                .foregroundStyle(Theme.ground(for: scheme).inkDim)
                        } else {
                            ForEach(reminders) { reminder in
                                ReminderCard(
                                    reminder: reminder,
                                    target: store.targetLabel(
                                        deviceID: reminder.targetDeviceId,
                                        zoneID: reminder.targetZoneId
                                    ),
                                    onToggle: { enabled in
                                        Task { await setEnabled(reminder, enabled) }
                                    },
                                    onDelete: { Task { await delete(reminder) } }
                                )
                            }
                        }
                    }
                }
                .padding(18)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.ground(for: scheme).background.color.ignoresSafeArea())
            .navigationTitle("Reminders")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingManualForm = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add a reminder manually")
                }
            }
            .refreshable { await load() }
        }
        .task { await load() }
        .sheet(isPresented: $showingManualForm) {
            NavigationStack {
                ManualReminderForm { await load() }
            }
        }
    }

    // MARK: - Ask in plain words

    private var askBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Ask in plain words")

            TextField("Remind Willoughby to read his novel at 4pm tomorrow", text: $request, axis: .vertical)
                .lineLimit(2...4)
                .focused($requestFocused)
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Theme.ground(for: scheme).surface)
                )
                .disabled(isParsing)

            Button {
                Task { await ask() }
            } label: {
                Group {
                    if isParsing {
                        ProgressView().tint(.white)
                    } else {
                        Label("Set it", systemImage: "sparkles").font(.headline)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.ident("willoughby", scheme: scheme))
            .disabled(isParsing || request.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    private func ask() async {
        let text = request.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        requestFocused = false
        isParsing = true
        defer { isParsing = false }

        do {
            let response = try await store.api.parseReminder(text: text)
            banner = response.confirmation
            bannerKind = .good
            request = ""
            await load()
        } catch APIError.server(let status, let message) where status == 503 {
            // The server says AI reminders aren't configured. Point at the fix
            // rather than just failing.
            banner = message.isEmpty
                ? "AI reminders aren't set up on the server yet. Use + to add one by hand."
                : "\(message) Use + to add one by hand."
            bannerKind = .bad
        } catch {
            banner = error.localizedDescription
            bannerKind = .bad
        }
    }

    // MARK: - List

    private func load() async {
        do {
            reminders = try await store.api.reminders()
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func setEnabled(_ reminder: Reminder, _ enabled: Bool) async {
        do {
            let updated = try await store.api.setReminderEnabled(id: reminder.id, enabled: enabled)
            if let index = reminders.firstIndex(where: { $0.id == reminder.id }) {
                reminders[index] = updated
            }
        } catch {
            banner = error.localizedDescription
            bannerKind = .bad
        }
    }

    private func delete(_ reminder: Reminder) async {
        do {
            try await store.api.deleteReminder(id: reminder.id)
            reminders.removeAll { $0.id == reminder.id }
        } catch {
            banner = error.localizedDescription
            bannerKind = .bad
        }
    }
}

@MainActor
private struct ReminderCard: View {
    let reminder: Reminder
    let target: String
    let onToggle: (Bool) -> Void
    let onDelete: () -> Void

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        IdentityCard(identity: target) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(reminder.text)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.ground(for: scheme).ink)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(Theme.ground(for: scheme).inkDim)
                }

                Spacer(minLength: 0)

                Toggle("", isOn: Binding(get: { reminder.enabled }, set: onToggle))
                    .labelsHidden()
                    .tint(Theme.ident(target, scheme: scheme))
            }
        }
        .opacity(reminder.enabled ? 1 : 0.55)
        .contextMenu {
            Button("Delete", systemImage: "trash", role: .destructive, action: onDelete)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(reminder.text). \(subtitle).")
    }

    private var subtitle: String {
        var parts = [target]
        parts.append(Self.schedule(reminder))
        if !reminder.enabled { parts.append("Off") }
        return parts.joined(separator: " · ")
    }

    /// Say when it next fires in the reader's own words, not cron syntax.
    static func schedule(_ reminder: Reminder) -> String {
        guard let next = reminder.nextRunAt else {
            return reminder.enabled ? "Not scheduled" : "Paused"
        }
        let formatter = DateFormatter()
        formatter.doesRelativeDateFormatting = true
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        let when = formatter.string(from: next)
        return reminder.isRecurring ? "Every day · next \(when)" : when
    }
}
