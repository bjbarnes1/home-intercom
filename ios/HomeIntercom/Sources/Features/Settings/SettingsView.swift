import SwiftUI

@MainActor
struct SettingsView: View {
    let user: User

    @EnvironmentObject private var store: HouseholdStore
    @EnvironmentObject private var location: LocationService
    @State private var showingServerSheet = false
    @State private var showingPairSheet = false
    @State private var confirmingSignOut = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Signed in") {
                    LabeledContent(user.name, value: user.email)
                    LabeledContent("Role", value: user.isAdmin ? "Admin" : "Member")
                }

                Section {
                    Button {
                        showingServerSheet = true
                    } label: {
                        LabeledContent("Server") {
                            Text(store.baseURL.host() ?? "—")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                } footer: {
                    Text("Where this phone finds the house.")
                }

                Section {
                    // Only a parent account can register a panel, so the button
                    // is not offered to anyone who would only be refused.
                    if user.isAdmin {
                        Button("Add a wall panel") { showingPairSheet = true }
                    }
                } footer: {
                    Text(
                        user.isAdmin
                        ? "Registers a panel and gives you a code to type into it."
                        : "Wall panels are added by a parent account."
                    )
                }

                Section("The house") {
                    LabeledContent(
                        "Rooms online",
                        value: "\(store.onlineEndpointCount) of \(store.endpoints.count)"
                    )
                    LabeledContent("Zones", value: "\(store.zones.count)")
                    if let refreshError = store.refreshError {
                        Text(refreshError)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    NavigationLink {
                        SharingSettingsView()
                    } label: {
                        LabeledContent("Location sharing") {
                            Text(location.sharing == .off ? "Off" : "On")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    Button("Sign out", role: .destructive) { confirmingSignOut = true }
                }
            }
            .navigationTitle("Settings")
        }
        .sheet(isPresented: $showingPairSheet) {
            PairPanelView(api: store.api)
        }
        .sheet(isPresented: $showingServerSheet) {
            NavigationStack { ServerURLEditor() }
                .presentationDetents([.medium])
        }
        .confirmationDialog(
            "Sign out of Home Intercom?",
            isPresented: $confirmingSignOut,
            titleVisibility: .visible
        ) {
            Button("Sign out", role: .destructive) {
                Task { await store.signOut() }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}
