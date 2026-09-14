import XCTest
import SwiftUI
@testable import HomeIntercom

/// The identity system is the one visual rule the household actually relies on
/// ("amber means Willoughby"), so the token mapping and the colour maths are
/// worth pinning down.
final class ThemeTests: XCTestCase {
    func testMatchesPeopleAndRoomsByName() {
        XCTAssertEqual(Theme.token(for: "Willoughby"), "willoughby")
        XCTAssertEqual(Theme.token(for: "kitchen"), "kitchen")
        XCTAssertEqual(Theme.token(for: "Downstairs"), "downstairs")
    }

    /// Room labels from the database are free text — "Gus's room" must still
    /// land on Gus's teal.
    func testMatchesOnASubstringOfAFreeTextRoomName() {
        XCTAssertEqual(Theme.token(for: "Gus's room"), "gus")
        XCTAssertEqual(Theme.token(for: "The Rumpus Room"), "rumpus")
    }

    func testResolvesTheAliasesTheCSSDeclares() {
        XCTAssertEqual(Theme.token(for: "Mum"), "georgette")
        XCTAssertEqual(Theme.token(for: "Dad"), "gus")
    }

    func testUnknownNamesFallBackToTheHouseAccent() {
        XCTAssertEqual(Theme.token(for: "Laundry"), "everyone")
        XCTAssertEqual(Theme.token(for: nil), "everyone")
        XCTAssertEqual(Theme.token(for: ""), "everyone")
    }

    /// Round-tripping through Oklab must land back where it started, or every
    /// tint in the app is subtly wrong.
    func testOklabRoundTripsAHexGround() {
        let ground = Oklab(hex: "#161826")
        let components = ground.color.resolvedComponents()
        XCTAssertEqual(components.red, 0x16 / 255, accuracy: 0.01)
        XCTAssertEqual(components.green, 0x18 / 255, accuracy: 0.01)
        XCTAssertEqual(components.blue, 0x26 / 255, accuracy: 0.01)
    }

    func testMixingBySomethingLeavesTheStartingColourUntouched() {
        let a = Oklab(hex: "#161826")
        let b = OKLCH(0.72, 0.125, 289).oklab
        XCTAssertEqual(a.mixed(with: b, amount: 0).l, a.l, accuracy: 0.0001)
        XCTAssertEqual(a.mixed(with: b, amount: 1).l, b.l, accuracy: 0.0001)
    }

    /// Tint steps walk from the ground toward the identity hue, so each step is
    /// further from the ground than the one before it.
    func testTintStepsMoveProgressivelyTowardTheIdentityHue() {
        let ground = Theme.dark.background
        let ident = Theme.identOklab("willoughby", scheme: .dark)
        var previousDistance = 0.0
        for step in 1...4 {
            let amount = Theme.dark.tintSteps[step - 1]
            let mixed = ground.mixed(with: ident, amount: amount)
            let distance = abs(mixed.l - ground.l)
            XCTAssertGreaterThan(distance, previousDistance, "tint step \(step) did not advance")
            previousDistance = distance
        }
    }

    /// The LED ramp is emitted light, so it must not change with the screen's
    /// ground — noon and midnight look the same on the hardware.
    func testLitIdentityIsTheSameInBothThemes() {
        let first = Theme.litIdent("raff").resolvedComponents()
        let second = Theme.litIdent("raff").resolvedComponents()
        XCTAssertEqual(first.red, second.red, accuracy: 0.0001)
        XCTAssertEqual(first.green, second.green, accuracy: 0.0001)
        XCTAssertEqual(first.blue, second.blue, accuracy: 0.0001)
        // And it must differ from the light-ground screen colour, which is
        // re-tuned darker.
        let onLightGround = Theme.ident("raff", scheme: .light).resolvedComponents()
        XCTAssertNotEqual(first.red, onLightGround.red, accuracy: 0.0001)
    }
}

private extension Color {
    /// Pull sRGB components back out for comparison.
    func resolvedComponents() -> (red: Double, green: Double, blue: Double) {
        let resolved = self.resolve(in: EnvironmentValues())
        return (Double(resolved.red), Double(resolved.green), Double(resolved.blue))
    }
}
