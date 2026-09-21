import SwiftUI

@MainActor
struct LoginView: View {
    @EnvironmentObject private var store: HouseholdStore
    @Environment(\.colorScheme) private var scheme

    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var isSigningIn = false
    @State private var showingServerSheet = false
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    var body: some View {
        ZStack {
            Theme.ground(for: scheme).background.color.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    header

                    VStack(spacing: 12) {
                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focus, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focus = .password }

                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .focused($focus, equals: .password)
                            .submitLabel(.go)
                            .onSubmit { Task { await signIn() } }
                    }
                    .textFieldStyle(.plain)
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Theme.ground(for: scheme).surface)
                    )

                    if let error {
                        StatusBanner(text: error, kind: .bad)
                    }

                    Button {
                        Task { await signIn() }
                    } label: {
                        Group {
                            if isSigningIn {
                                ProgressView().tint(.white)
                            } else {
                                Text("Sign in").font(.headline)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.ident("everyone", scheme: scheme))
                    .disabled(!canSubmit)

                    Button {
                        showingServerSheet = true
                    } label: {
                        VStack(spacing: 2) {
                            Text("Server")
                                .font(.caption2.weight(.semibold))
                            Text(store.baseURL.host() ?? store.baseURL.absoluteString)
                                .font(.caption)
                        }
                    }
                    .foregroundStyle(Theme.ground(for: scheme).inkDim)
                }
                .padding(24)
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .sheet(isPresented: $showingServerSheet) {
            NavigationStack {
                ServerURLEditor()
            }
            .presentationDetents([.medium])
        }
    }

    private var header: some View {
        VStack(spacing: 10) {
            Image(systemName: "house.badge.wifi")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(Theme.ident("everyone", scheme: scheme))
            Text("Home Intercom")
                .font(.title2.weight(.semibold))
                .foregroundStyle(Theme.ground(for: scheme).ink)
            Text("Page the kids, call a room, tell the house.")
                .font(.subheadline)
                .foregroundStyle(Theme.ground(for: scheme).inkDim)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 40)
        .padding(.bottom, 8)
    }

    private var canSubmit: Bool {
        !isSigningIn && email.contains("@") && !password.isEmpty
    }

    private func signIn() async {
        guard canSubmit else { return }
        focus = nil
        isSigningIn = true
        error = nil
        defer { isSigningIn = false }
        do {
            try await store.signIn(
                email: email.trimmingCharacters(in: .whitespaces),
                password: password
            )
        } catch {
            self.error = error.localizedDescription
        }
    }
}
