import SwiftUI

/// A colour in OKLCH, the space `src/styles/identity.css` is authored in.
///
/// The web tokens are literal `oklch(L C H)` values and every blend there runs
/// `color-mix(in oklab, …)`. Porting them as pre-baked hex would drift the
/// moment someone re-tunes a hue, so we port the *maths* instead: the same
/// numbers from the CSS go in, and mixing happens in oklab exactly as it does
/// in the browser.
struct OKLCH: Equatable {
    /// Perceptual lightness, 0…1.
    var l: Double
    /// Chroma — 0 is grey; the identity ramp sits around 0.11–0.17.
    var c: Double
    /// Hue angle in degrees.
    var h: Double

    init(_ l: Double, _ c: Double, _ h: Double) {
        self.l = l
        self.c = c
        self.h = h
    }

    var oklab: Oklab {
        let radians = h * .pi / 180
        return Oklab(l: l, a: c * cos(radians), b: c * sin(radians))
    }

    var color: Color { oklab.color }
}

/// Cartesian Oklab — the space blends are interpolated in.
struct Oklab: Equatable {
    var l: Double
    var a: Double
    var b: Double

    init(l: Double, a: Double, b: Double) {
        self.l = l
        self.a = a
        self.b = b
    }

    /// Straight-line interpolation, which is what `color-mix(in oklab, …)` does.
    /// `amount` is the share of `other`, so `mix(x, 0.3)` ≡ `color-mix(… x 30%, self)`.
    func mixed(with other: Oklab, amount: Double) -> Oklab {
        let t = min(max(amount, 0), 1)
        return Oklab(
            l: l + (other.l - l) * t,
            a: a + (other.a - a) * t,
            b: b + (other.b - b) * t
        )
    }

    /// Oklab → linear sRGB → gamma-encoded sRGB, per Björn Ottosson's reference
    /// implementation. Out-of-gamut components are clamped, which is what
    /// browsers do for these tokens too (they all sit close to sRGB).
    var color: Color {
        let l_ = l + 0.3963377774 * a + 0.2158037573 * b
        let m_ = l - 0.1055613458 * a - 0.0638541728 * b
        let s_ = l - 0.0894841775 * a - 1.2914855480 * b

        let lCubed = l_ * l_ * l_
        let mCubed = m_ * m_ * m_
        let sCubed = s_ * s_ * s_

        let red = 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed
        let green = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed
        let blue = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.7076147010 * sCubed

        return Color(
            .sRGB,
            red: Self.gammaEncode(red),
            green: Self.gammaEncode(green),
            blue: Self.gammaEncode(blue),
            opacity: 1
        )
    }

    private static func gammaEncode(_ value: Double) -> Double {
        let encoded = value <= 0.0031308
            ? 12.92 * value
            : 1.055 * pow(value, 1 / 2.4) - 0.055
        return min(max(encoded, 0), 1)
    }

    /// Parse the `#rrggbb` grounds the CSS uses for backgrounds, so tints can be
    /// mixed against them in oklab like `color-mix(… , var(--hi-bg))` does.
    init(hex: String) {
        var value: UInt64 = 0
        Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&value)
        let r = Self.gammaDecode(Double((value >> 16) & 0xFF) / 255)
        let g = Self.gammaDecode(Double((value >> 8) & 0xFF) / 255)
        let b = Self.gammaDecode(Double(value & 0xFF) / 255)

        let l_ = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        let m_ = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        let s_ = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

        self.l = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
        self.a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
        self.b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    }

    private static func gammaDecode(_ value: Double) -> Double {
        value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
    }
}
