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
                // Its own ObservableObject: views that show sharing state must
                // observe it directly, or they'd never see it change.
                .environmentObject(store.location)
                .environmentObject(store.beacons)
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
                    // Ranging is foreground-only anyway, so it runs while
                    // somebody is looking and stops when they are not.
                    store.beacons.startRanging()
                case .background, .inactive:
                    store.stopPolling()
                    store.beacons.stopRanging()
                @unknown default:
                    break
                }
            }
        }
    }
}
