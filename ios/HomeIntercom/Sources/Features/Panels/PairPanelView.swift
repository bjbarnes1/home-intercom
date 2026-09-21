import SwiftUI

/// Add a wall panel to the household.
///
/// The panel cannot register itself — anyone who could reach the server would
/// be able to join a device to somebody's house. So a parent registers it here,
/// and the server issues a short code that is typed into the panel once. The
/// panel trades the code for a long-lived secret and the code is cleared.
///
/// Which means this screen's job is to produce a code and show it plainly
/// enough to read across a kitchen while holding a tablet in the other hand.
@MainActor
struct PairPanelView: View {
    let api: APIClient

    @State private var name = ""
    @State private var room = ""
    @State private var issued: PendingDevice?
    @State private var working = false
    @State private var error: String?

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if let issued, let code = issued.pairingCode {
                    codeSection(name: issued.displayName, code: code)
                } else {
                    detailsSection
                }

                if let error {
                    Section {
                        StatusBanner(text: error, kind: .bad)
                    }
                }
            }
            .navigationTitle(issued == nil ? "Add a panel" : "Pair it")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(issued == nil ? "Cancel" : "Done") { dismiss() }
                }
            }
        }
    }

    private var detailsSection: some View {
        Group {
            Section {
                TextField("Name", text: $name)
                    .textInputAutocapitalization(.words)
                TextField("Room", text: $room)
                    .textInputAutocapitalization(.words)
            } header: {
                SectionLabel("The panel")
            } footer: {
                Text("The room is what everyone else sees — “Kitchen”, “Rumpus”. It is the label on the speaker list and the name a call announces.")
            }

            Section {
                Button {
                    Task { await register() }
                } label: {
                    if working {
                        ProgressView()
                    } else {
                        Text("Get a pairing code")
                    }
                }
                .disabled(working || trimmedName.isEmpty)
            }
        }
    }

    private func codeSection(name: String, code: String) -> some View {
        Section {
            VStack(spacing: 12) {
                Text(code)
                    // Wide tracking and a monospaced face: this gets read out
                    // loud across a room and typed by somebody else.
                    .font(.system(size: 44, weight: .semibold, design: .monospaced))
                    .tracking(6)
                    .textSelection(.enabled)
                    .accessibilityLabel(code.map(String.init).joined(separator: " "))

                Text("Open the panel, choose **Wall panel**, and type this in.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        } header: {
            SectionLabel(name)
        } footer: {
            Text("The code works once and stops working as soon as the panel uses it. If it expires before you get there, add the panel again.")
        }
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func register() async {
        working = true
        error = nil
        defer { working = false }

        do {
            let trimmedRoom = room.trimmingCharacters(in: .whitespacesAndNewlines)
            issued = try await api.createDevice(
                displayName: trimmedName,
                room: trimmedRoom.isEmpty ? nil : trimmedRoom
            )
        } catch {
            // Only an admin can register a panel; say so rather than showing a
            // bare 401, which sends people looking at the network.
            if case APIError.unauthorized = error {
                self.error = "Only a parent account can add a panel."
            } else {
                self.error = String(describing: error)
            }
        }
    }
}
