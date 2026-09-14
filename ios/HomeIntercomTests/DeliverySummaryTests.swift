import XCTest
@testable import HomeIntercom

/// A household notices silence. Whatever happened — reached nobody, reached
/// half the house, degraded to the panel's robot voice — the banner has to say
/// so out loud.
final class DeliverySummaryTests: XCTestCase {
    private func initiate(
        reached: [String] = [],
        notConnected: [String] = [],
        suppressedByDnd: [String] = [],
        offline: [String] = []
    ) -> InitiateResponse {
        InitiateResponse(
            eventId: "e1", room: "page:d1", initiatorToken: "jwt",
            reached: reached, notConnected: notConnected,
            suppressedByDnd: suppressedByDnd, offline: offline,
            livekitUrl: "wss://example", mock: false
        )
    }

    func testSaysWhenNothingWasReachedBecauseEveryoneIsOffline() {
        let summary = DeliverySummary.talk(initiate(offline: ["d1", "d2"]))
        XCTAssertTrue(summary.contains("Nothing reached"))
        XCTAssertTrue(summary.contains("online"))
    }

    func testDistinguishesOnlineButNotConnected() {
        let summary = DeliverySummary.talk(initiate(notConnected: ["d1"]))
        XCTAssertTrue(summary.contains("not connected to the intercom"))
    }

    func testCountsSpeakersAndNamesTheMisses() {
        let summary = DeliverySummary.talk(
            initiate(reached: ["d1", "d2"], notConnected: ["d3"], offline: ["d4"])
        )
        XCTAssertTrue(summary.contains("2 speakers"))
        XCTAssertTrue(summary.contains("2 not reached"))
    }

    func testUsesTheSingularForOneSpeaker() {
        XCTAssertTrue(DeliverySummary.talk(initiate(reached: ["d1"])).contains("1 speaker"))
    }

    func testCallsOutDoNotDisturb() {
        let summary = DeliverySummary.talk(
            initiate(reached: ["d1"], suppressedByDnd: ["d2"])
        )
        XCTAssertTrue(summary.contains("do-not-disturb"))
    }

    private func announce(
        reached: [String], voice: String, voiceError: String? = nil,
        notConnected: [String] = [], offline: [String] = [], dnd: [String] = []
    ) -> AnnounceResponse {
        AnnounceResponse(
            reached: reached, notConnected: notConnected, suppressedByDnd: dnd,
            offline: offline, voice: voice, voiceError: voiceError, audioUrl: nil
        )
    }

    func testAnnounceNamesTheAshVoiceWhenItWasUsed() {
        let summary = DeliverySummary.announce(announce(reached: ["d1"], voice: "ash"))
        XCTAssertTrue(summary.contains("Ash voice"))
    }

    /// Falling back to the panel's own speech synthesis is a visible downgrade,
    /// and the reason for it belongs on screen.
    func testAnnounceExplainsAFallbackToTheDeviceVoice() {
        let summary = DeliverySummary.announce(
            announce(reached: ["d1"], voice: "browser-fallback", voiceError: "OPENAI_API_KEY is not set")
        )
        XCTAssertTrue(summary.contains("device voice"))
        XCTAssertTrue(summary.contains("OPENAI_API_KEY is not set"))
    }

    func testAnnounceSaysWhenNoSpeakerHeardIt() {
        let summary = DeliverySummary.announce(announce(reached: [], voice: "ash"))
        XCTAssertTrue(summary.contains("No speakers reached"))
    }
}
