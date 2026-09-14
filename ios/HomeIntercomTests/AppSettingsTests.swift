import XCTest
@testable import HomeIntercom

final class AppSettingsTests: XCTestCase {
    func testAddsHTTPSWhenSchemeIsOmitted() {
        XCTAssertEqual(
            AppSettings.normalise("intercom.example.com")?.absoluteString,
            "https://intercom.example.com"
        )
    }

    func testKeepsPlainHTTPForALocalDevServer() {
        XCTAssertEqual(
            AppSettings.normalise("http://192.168.1.20:3000")?.absoluteString,
            "http://192.168.1.20:3000"
        )
    }

    func testStripsTrailingSlashesSoPathJoiningStaysClean() {
        XCTAssertEqual(
            AppSettings.normalise("https://intercom.example.com//")?.absoluteString,
            "https://intercom.example.com"
        )
    }

    func testRejectsInputWithoutAHost() {
        XCTAssertNil(AppSettings.normalise(""))
        XCTAssertNil(AppSettings.normalise("   "))
        XCTAssertNil(AppSettings.normalise("https://"))
    }

    func testRejectsNonWebSchemes() {
        XCTAssertNil(AppSettings.normalise("ftp://intercom.example.com"))
    }
}

/// "Your session has expired" on a sign-in screen is nonsense — there is no
/// session yet — and it hid the real problem (a wrong email) behind a message
/// about something else entirely.
final class AuthErrorMessageTests: XCTestCase {
    func testARejectedLoginBlamesTheCredentials() {
        let message = APIError.invalidCredentials(host: "intercom.zeebee.au").localizedDescription
        XCTAssertTrue(message.contains("don't match an account"))
        // Names the host, because a wrong Server setting looks identical to a
        // wrong password from the sign-in screen.
        XCTAssertTrue(message.contains("intercom.zeebee.au"))
        XCTAssertFalse(message.lowercased().contains("expired"))
    }

    func testAnExpiredSessionStillSaysSo() {
        let message = APIError.unauthorized.localizedDescription
        XCTAssertTrue(message.lowercased().contains("expired"))
    }

    func testTheTwoAreNotTheSameError() {
        XCTAssertNotEqual(
            APIError.unauthorized,
            APIError.invalidCredentials(host: "intercom.zeebee.au")
        )
    }

    /// A 404 on an API route means the server is older than the app, not that
    /// the app is broken — the bare "404" sent someone debugging the wrong end.
    func testAMissingRouteBlamesTheDeployment() {
        let message = APIError.featureNotDeployed(
            path: "/api/location/people", host: "intercom.zeebee.au"
        ).localizedDescription
        XCTAssertTrue(message.contains("intercom.zeebee.au"))
        XCTAssertTrue(message.contains("/api/location/people"))
        XCTAssertTrue(message.contains("older deployment"))
    }

    /// A cookie that doesn't stick used to bounce back to a blank sign-in screen
    /// with no explanation at all.
    func testACookieThatDoesNotStickExplainsItself() {
        let message = HouseholdStore.SessionNotEstablished(host: "intercom.zeebee.au")
            .localizedDescription
        XCTAssertTrue(message.contains("cookie"))
        XCTAssertTrue(message.contains("intercom.zeebee.au"))
    }
}
