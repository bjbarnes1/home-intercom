import SwiftUI

/// Decides between the sign-in screen and the controller, and holds the app
/// open on a splash until we know which.
@MainActor
struct RootView: View {
    @EnvironmentObject private var store: HouseholdStore

    var body: some View {
        Group {
            switch store.auth {
            case .unknown:
                SplashView()
            case .signedOut:
                LoginView()
            case let .signedIn(user):
                ControllerView(user: user)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: store.auth)
        .task { await store.restoreSession() }
    }
}

@MainActor
private struct SplashView: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            Theme.ground(for: scheme).background.color.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "house.badge.wifi")
                    .font(.system(size: 44, weight: .light))
                    .foregroundStyle(Theme.ident("everyone", scheme: scheme))
                ProgressView()
            }
        }
    }
}
