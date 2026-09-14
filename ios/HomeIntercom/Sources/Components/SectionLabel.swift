import SwiftUI

/// The small upper-case rubric above each group, matching `.uplabel` on the web.
@MainActor
struct SectionLabel: View {
    let text: String

    @Environment(\.colorScheme) private var scheme

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.semibold))
            .kerning(0.8)
            .foregroundStyle(Theme.ground(for: scheme).inkDim)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
