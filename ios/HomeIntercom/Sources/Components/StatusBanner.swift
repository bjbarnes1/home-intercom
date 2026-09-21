import SwiftUI

/// One line of honest feedback — what reached, what didn't, what failed.
@MainActor
struct StatusBanner: View {
    enum Kind {
        case neutral, good, bad

        var icon: String {
            switch self {
            case .neutral: return "info.circle"
            case .good: return "checkmark.circle.fill"
            case .bad: return "exclamationmark.triangle.fill"
            }
        }
    }

    let text: String
    var kind: Kind = .neutral

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if !text.isEmpty {
            Label {
                Text(text)
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: kind.icon)
            }
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(foreground.opacity(0.10))
            )
            .accessibilityElement(children: .combine)
        }
    }

    private var foreground: Color {
        switch kind {
        case .neutral: return Theme.ground(for: scheme).inkDim
        case .good: return Theme.ident("raff", scheme: scheme)
        case .bad: return Theme.ident("lounge", scheme: scheme)
        }
    }
}
