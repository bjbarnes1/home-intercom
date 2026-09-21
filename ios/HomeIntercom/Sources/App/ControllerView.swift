import SwiftUI

/// The four tabs the web controller has, in the shape iOS expects.
@MainActor
struct ControllerView: View {
    let user: User

    @EnvironmentObject private var store: HouseholdStore
    @Environment(\.colorScheme) private var scheme
    @State private var selection: Tab = .home

    enum Tab: Hashable {
        case home, broadcast, whereabouts, reminders, settings
    }

    var body: some View {
        TabView(selection: $selection) {
            HomeView(user: user)
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(Tab.home)

            BroadcastView(user: user, api: store.api)
                .tabItem { Label("Broadcast", systemImage: "megaphone.fill") }
                .tag(Tab.broadcast)

            WhereView()
                .tabItem { Label("Where", systemImage: "map.fill") }
                .tag(Tab.whereabouts)

            RemindersView()
                .tabItem { Label("Reminders", systemImage: "bell.fill") }
                .tag(Tab.reminders)

            SettingsView(user: user)
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
                .tag(Tab.settings)
        }
        .tint(Theme.ident("everyone", scheme: scheme))
    }
}
