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
