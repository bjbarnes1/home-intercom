import SwiftUI

/// The tinted card the whole app is built from: identity hue mixed into the
/// ground at tint step 1, with a hairline rule and a hue-matched border.
@MainActor
struct IdentityCard<Content: View>: View {
    var identity: String?
    var isHighlighted: Bool = false
    @ViewBuilder var content: Content

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Theme.tint(identity, step: isHighlighted ? 3 : 1, scheme: scheme))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(
                        isHighlighted
                            ? Theme.ident(identity, scheme: scheme)
                            : Theme.ground(for: scheme).rule,
                        lineWidth: 1
                    )
            )
    }
}
