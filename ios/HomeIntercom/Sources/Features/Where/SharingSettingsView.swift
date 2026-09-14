import SwiftUI
import CoreLocation
import UIKit

/// Turn your own location sharing on or off.
///
/// Deliberately self-only — there is no control here for switching on someone
/// else's sharing. That's a thing a person does on their own phone, where iOS
/// also asks them, and where they can see that it's on.
@MainActor
struct SharingSettingsView: View {
    @EnvironmentObject private var store: HouseholdStore
    @EnvironmentObject private var location: LocationService

    @State private var state: SharingState?
    @State private var isSaving = false
    @State private var message: String?
    @State private var confirmingOff = false

    private var isSharing: Bool { state?.mode == .places || state?.mode == .live }

    var body: some View {
        Form {
            Section {
                Toggle("Share my places", isOn: Binding(
                    get: { isSharing },
                    set: { on in
                        if on {
                            Task { await setMode(.places) }
                        } else {
                            confirmingOff = true
                        }
                    }
                ))
                .disabled(isSaving || state == nil)
            } header: {
                Text("Location sharing")
            } footer: {
                Text(
                    "Reports when you arrive at or leave the household's places, "
                    + "plus a rounded last-known position. Everyone in the household "
                    + "sees the same map — including you."
                )
            }

            if let retention = state?.retention {
                Section("What's kept") {
                    LabeledContent(
                        "Full precision",
                        value: "\(retention.coarsenAfterHours) hours"
                    )
                    LabeledContent(
                        "Then rounded to ~100m for",
                        value: "\(retention.deleteAfterDays) days"
                    )
                    Text("Turning sharing off deletes your history straight away.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("On this phone") {
                LabeledContent("Permission", value: permissionLabel)
                if location.authorization != .always {
                    Button("Allow \"Always\" in Settings") {
                        openSystemSettings()
                    }
                    Text(
                        "Geofences only fire with the app closed if iOS has "
                        + "\"Always\". With \"While Using\", arrivals are missed."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                LabeledContent("Places monitored", value: "\(location.monitoredCount)")
                if location.overBudget > 0 {
                    Text(
                        "\(location.overBudget) place(s) beyond iOS's "
                        + "\(LocationService.maxMonitoredRegions)-region limit aren't "
                        + "monitored. Remove some places in the web controller."
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)
                }
                if let error = location.lastReportError {
                    Text(error).font(.caption).foregroundStyle(.red)
                }
            }

            if let message {
                Section { Text(message).font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Sharing")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .confirmationDialog(
            "Stop sharing your location?",
            isPresented: $confirmingOff,
            titleVisibility: .visible
        ) {
            Button("Stop and delete my history", role: .destructive) {
                Task { await setMode(.off) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your stored positions and place visits are deleted immediately.")
        }
    }

    private var permissionLabel: String {
        switch location.authorization {
        case .notDetermined: return "Not asked yet"
        case .denied: return "Denied"
        case .whenInUse: return "While using the app"
        case .always: return "Always"
        }
    }

    private func load() async {
        do {
            state = try await store.api.sharing()
        } catch {
            message = error.localizedDescription
        }
    }

    private func setMode(_ mode: LocationShareMode) async {
        isSaving = true
        defer { isSaving = false }

        // Ask iOS before telling the server we're sharing — otherwise sharing
        // reads as "on" while nothing can actually be reported.
        if mode != .off { location.requestAuthorization() }

        do {
            let updated = try await store.api.setSharing(mode: mode)
            state = updated
            await location.sync(sharing: updated.mode)
            if mode == .off, let cleared = updated.clearedPings {
                message = cleared > 0
                    ? "Sharing off. Deleted \(cleared) stored position\(cleared == 1 ? "" : "s")."
                    : "Sharing off."
            } else {
                message = nil
            }
        } catch {
            message = error.localizedDescription
        }
    }

    private func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
