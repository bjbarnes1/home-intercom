import SwiftUI

@main
@MainActor
struct HomeIntercomApp: App {
    @StateObject private var store = HouseholdStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(.accentColor)
        }
        .onChange(of: scenePhase) { _, phase in
            // Presence polling is for a screen someone is looking at. A phone in
            // a pocket shouldn't keep the server awake every five seconds.
            Task { @MainActor in
                switch phase {
                case .active:
                    guard store.auth.user != nil else { return }
                    await store.refresh()
                    store.startPolling()
                case .background, .inactive:
                    store.stopPolling()
                @unknown default:
                    break
                }
            }
        }
    }
}
