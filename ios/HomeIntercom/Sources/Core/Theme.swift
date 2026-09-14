import SwiftUI

/// The household's colour system, ported from `src/styles/identity.css` and
/// `docs/handoff/colours/`.
///
/// Every person, room and zone owns one hue, so "who is this for" is legible
/// before you read the label. Dark is the default ground; light re-tunes
/// lightness, never hue, so "amber" stays amber in both.
enum Theme {
    // MARK: - Grounds

    struct Ground {
        let background: Oklab
        let surface: Color
        let ink: Color
        let inkDim: Color
        let rule: Color
        /// How strongly the four derived tint steps pull toward the identity hue.
        let tintSteps: [Double]
    }

    static let dark = Ground(
        background: Oklab(hex: "#161826"),
        surface: Color(hex: "#26283a"),
        ink: Color(hex: "#e9e9ed"),
        inkDim: Color(hex: "#a8a8b8"),
        rule: Color(hex: "#2c2e40"),
        tintSteps: [0.08, 0.14, 0.22, 0.55]
    )

    static let light = Ground(
        background: Oklab(hex: "#f4f4f8"),
        surface: Color(hex: "#fbfbfd"),
        ink: Color(hex: "#1b1c28"),
        inkDim: Color(hex: "#5c5d70"),
        rule: Color(hex: "#dcdce6"),
        tintSteps: [0.05, 0.09, 0.15, 0.45]
    )

    static func ground(for scheme: ColorScheme) -> Ground {
        scheme == .dark ? dark : light
    }

    // MARK: - Identity hues

    /// Dark-ground identity ramp — the `:root` block of identity.css.
    private static let darkIdent: [String: OKLCH] = [
        "gus": OKLCH(0.75, 0.115, 205),
        "georgette": OKLCH(0.74, 0.125, 350),
        "willoughby": OKLCH(0.80, 0.125, 72),
        "raff": OKLCH(0.77, 0.125, 148),
        "kitchen": OKLCH(0.71, 0.125, 289),
        "rumpus": OKLCH(0.73, 0.120, 262),
        "lounge": OKLCH(0.75, 0.130, 28),
        "kids": OKLCH(0.75, 0.120, 320),
        "downstairs": OKLCH(0.74, 0.110, 240),
        "everyone": OKLCH(0.72, 0.125, 289),
    ]

    /// Light-ground ramp — the `[data-theme="light"]` block. Same hues, darker
    /// and more saturated so they hold contrast against a pale ground.
    private static let lightIdent: [String: OKLCH] = [
        "gus": OKLCH(0.52, 0.11, 205),
        "georgette": OKLCH(0.53, 0.15, 350),
        "willoughby": OKLCH(0.55, 0.14, 72),
        "raff": OKLCH(0.52, 0.13, 148),
        "kitchen": OKLCH(0.52, 0.16, 289),
        "rumpus": OKLCH(0.50, 0.16, 262),
        "lounge": OKLCH(0.55, 0.17, 28),
        "kids": OKLCH(0.53, 0.16, 320),
        "downstairs": OKLCH(0.52, 0.14, 240),
        "everyone": OKLCH(0.52, 0.16, 289),
    ]

    /// Aliases the CSS declares by pointing one token at another.
    private static let aliases = ["mum": "georgette", "dad": "gus"]

    /// Everything falls back to the "everyone" blurple, matching
    /// `ACCENT_FALLBACK` in `docs/handoff/colours/identity.ts`.
    private static let fallbackToken = "everyone"

    /// Map a free-text name ("Willoughby", "Gus's room", "Downstairs") onto an
    /// identity token. Room and zone names from the database are arbitrary, so
    /// match on the substring rather than demanding an exact key.
    static func token(for name: String?) -> String {
        guard let name = name?.lowercased(), !name.isEmpty else { return fallbackToken }

        if darkIdent[name] != nil { return name }
        if let target = aliases[name] { return target }

        // Sorted so the match is deterministic when a name contains two tokens.
        for key in darkIdent.keys.sorted() where name.contains(key) {
            return key
        }
        for (alias, target) in aliases.sorted(by: { $0.key < $1.key }) where name.contains(alias) {
            return target
        }
        return fallbackToken
    }

    /// The identity colour for a name, on the given ground.
    static func ident(_ name: String?, scheme: ColorScheme) -> Color {
        identOklab(name, scheme: scheme).color
    }

    static func identOklab(_ name: String?, scheme: ColorScheme) -> Oklab {
        let table = scheme == .dark ? darkIdent : lightIdent
        let value = table[token(for: name)] ?? table[fallbackToken]!
        return value.oklab
    }

    /// Identity as *emitted light* — the LED ramp, which never follows the
    /// screen's ground. A person's on-air colour is a physical thing; it must
    /// read the same at noon as at midnight.
    static func litIdent(_ name: String?) -> Color {
        (darkIdent[token(for: name)] ?? darkIdent[fallbackToken]!).color
    }

    /// One of the four derived tint steps: the identity hue mixed into the
    /// ground, exactly like `--hi-tint-1…4`. `step` is 1-based.
    static func tint(_ name: String?, step: Int, scheme: ColorScheme) -> Color {
        let ground = ground(for: scheme)
        let amount = ground.tintSteps[min(max(step, 1), ground.tintSteps.count) - 1]
        return ground.background.mixed(with: identOklab(name, scheme: scheme), amount: amount).color
    }
}

extension Color {
    /// `#rrggbb` only — the grounds in identity.css are all plain hex.
    init(hex: String) {
        var value: UInt64 = 0
        Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&value)
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: 1
        )
    }
}
