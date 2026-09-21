import SwiftUI

/// Repoint the app at a different Home Intercom server — the deployed one, or
/// `npm run dev` on a laptop on the same Wi-Fi.
@MainActor
struct ServerURLEditor: View {
    @EnvironmentObject private var store: HouseholdStore
    @Environment(\.dismiss) private var dismiss

    @State private var text = ""
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                TextField("https://intercom.zeebee.au", text: $text)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Server address")
            } footer: {
                Text(
                    "Where this app looks for the intercom. Use the deployed URL "
                    + "normally, or something like http://192.168.1.20:3000 to point "
                    + "at a laptop on your home network. Changing it signs you out."
                )
            }

            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }

            Section {
                Button("Reset to the default server") {
                    text = AppSettings.shippedBaseURL.absoluteString
                }
            }
        }
        .navigationTitle("Server")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }
                    .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .onAppear {
            if text.isEmpty { text = store.baseURL.absoluteString }
        }
    }

    private func save() {
        guard let url = AppSettings.normalise(text) else {
            error = "That doesn't look like a web address. Try something like https://intercom.zeebee.au."
            return
        }
        guard url != store.baseURL else {
            dismiss()
            return
        }
        Task {
            await store.updateServer(to: url)
            dismiss()
        }
    }
}
