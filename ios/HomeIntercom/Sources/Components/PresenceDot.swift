import SwiftUI

/// Online / offline at a glance. Colour alone never carries the meaning — the
/// dot is always next to a word, and it changes size as well as colour.
@MainActor
struct PresenceDot: View {
    let online: Bool
    var identity: String?

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Circle()
            .fill(online ? Theme.ident(identity, scheme: scheme) : Theme.ground(for: scheme).rule)
            .frame(width: online ? 9 : 7, height: online ? 9 : 7)
            .accessibilityHidden(true)
    }
}
