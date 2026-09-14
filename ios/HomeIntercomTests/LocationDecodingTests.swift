import XCTest
@testable import HomeIntercom

/// Locks the client to what `/api/location/*` actually returns.
final class LocationDecodingTests: XCTestCase {
    private func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            let withFraction = ISO8601DateFormatter()
            withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = withFraction.date(from: text) { return date }
            if let date = ISO8601DateFormatter().date(from: text) { return date }
            throw DecodingError.dataCorrupted(
                .init(codingPath: [], debugDescription: "Bad date: \(text)")
            )
        }
        return decoder
    }

    func testDecodesPlacesWithTheRegionBudget() throws {
        let json = """
        {"places":[{"id":"p1","name":"Home","lat":-33.8688,"lng":151.2093,
        "radiusM":150,"icon":"house.fill"}],"maxMonitored":20,"overBudget":0}
        """.data(using: .utf8)!

        let response = try decoder().decode(PlacesResponse.self, from: json)
        XCTAssertEqual(response.places.first?.name, "Home")
        XCTAssertEqual(response.maxMonitored, 20)
        XCTAssertEqual(response.overBudget, 0)
    }

    /// Someone not sharing must still appear, with no position — a silent gap
    /// is worse than "Raff isn't sharing".
    func testDecodesAPersonWhoIsNotSharing() throws {
        let json = """
        {"people":[{"id":"u1","name":"Raff","role":"MEMBER","sharing":"OFF",
        "reporting":false,"liveUntil":null,"lastFix":null,"at":null}],
        "places":[],"viewerId":"u2"}
        """.data(using: .utf8)!

        let response = try decoder().decode(PeopleLocationResponse.self, from: json)
        let person = try XCTUnwrap(response.people.first)
        XCTAssertEqual(person.sharing, .off)
        XCTAssertFalse(person.reporting)
        XCTAssertNil(person.lastFix)
    }

    func testDecodesAPersonAtAPlace() throws {
        let json = """
        {"people":[{"id":"u1","name":"Willoughby","role":"MEMBER","sharing":"PLACES",
        "reporting":true,"liveUntil":null,
        "lastFix":{"lat":-33.869,"lng":151.209,"accuracyM":null,"batteryPct":14,
        "coarse":true,"capturedAt":"2026-09-14T08:30:00.000Z"},
        "at":{"id":"p1","name":"School","icon":null,"since":"2026-09-14T08:15:00.000Z"}}],
        "places":[],"viewerId":"u2"}
        """.data(using: .utf8)!

        let person = try XCTUnwrap(
            decoder().decode(PeopleLocationResponse.self, from: json).people.first
        )
        XCTAssertEqual(person.at?.name, "School")
        XCTAssertEqual(person.lastFix?.batteryPct, 14)
        // A coarsened row must say so, or the UI implies precision it lost.
        XCTAssertEqual(person.lastFix?.coarse, true)
        XCTAssertNil(person.lastFix?.accuracyM)
    }

    func testDecodesSharingStateWithItsRetentionPromise() throws {
        let json = """
        {"mode":"PLACES","liveUntil":null,"reporting":true,
        "retention":{"coarsenAfterHours":24,"deleteAfterDays":7}}
        """.data(using: .utf8)!

        let state = try decoder().decode(SharingState.self, from: json)
        XCTAssertEqual(state.mode, .places)
        XCTAssertTrue(state.reporting)
        XCTAssertEqual(state.retention?.coarsenAfterHours, 24)
        XCTAssertEqual(state.retention?.deleteAfterDays, 7)
    }

    /// The server is the authority on sharing: a `reporting: false` reply is how
    /// a phone learns that someone switched it off from another device.
    func testDecodesAPingRejectedBecauseSharingIsOff() throws {
        let json = """
        {"stored":false,"reporting":false,"sharing":"OFF","precision":null,
        "arrivals":null,"departures":null}
        """.data(using: .utf8)!

        let response = try decoder().decode(LocationPingResponse.self, from: json)
        XCTAssertFalse(response.stored)
        XCTAssertFalse(response.reporting)
        XCTAssertEqual(response.sharing, .off)
    }

    func testEncodesAPingWithGeofenceCrossings() throws {
        let ping = LocationPingRequest(
            lat: -33.8688, lng: 151.2093, accuracyM: 65, batteryPct: 80,
            source: "region", capturedAt: "2026-09-14T08:30:00Z",
            events: [PlaceEvent(placeId: "p1", type: "enter", at: "2026-09-14T08:30:00Z")]
        )
        let encoded = try JSONEncoder().encode(ping)
        let round = try JSONDecoder().decode(LocationPingRequest.self, from: encoded)
        XCTAssertEqual(round.events.count, 1)
        XCTAssertEqual(round.events.first?.type, "enter")
        XCTAssertEqual(round.source, "region")
    }
}

/// The geofence → announcement crossover.
final class PlaceRuleDecodingTests: XCTestCase {
    func testDecodesARuleWithItsRenderedPreview() throws {
        let json = """
        {"rules":[{"id":"r1","placeId":"p1","placeName":"Home","trigger":"ARRIVE",
        "subjectUserId":"u1","subjectName":"Willoughby","template":"{name}'s home",
        "targetDeviceId":null,"targetZoneId":"z1","enabled":true,"cooldownMinutes":15,
        "preview":"Willoughby's home"}]}
        """.data(using: .utf8)!

        let rules = try JSONDecoder().decode(PlaceRulesEnvelope.self, from: json).rules
        let rule = try XCTUnwrap(rules.first)
        XCTAssertEqual(rule.trigger, .arrive)
        XCTAssertEqual(rule.subjectName, "Willoughby")
        // The list shows the sentence, not the template.
        XCTAssertEqual(rule.preview, "Willoughby's home")
        XCTAssertEqual(rule.targetZoneId, "z1")
    }

    /// A rule with no subject means anyone in the household.
    func testDecodesASubjectlessRule() throws {
        let json = """
        {"rules":[{"id":"r2","placeId":"p1","placeName":"Home","trigger":"DEPART",
        "subjectUserId":null,"subjectName":null,"template":"Someone left {place}",
        "targetDeviceId":"d1","targetZoneId":null,"enabled":false,"cooldownMinutes":0,
        "preview":"Someone left Home"}]}
        """.data(using: .utf8)!

        let rule = try XCTUnwrap(
            JSONDecoder().decode(PlaceRulesEnvelope.self, from: json).rules.first
        )
        XCTAssertNil(rule.subjectUserId)
        XCTAssertNil(rule.subjectName)
        XCTAssertEqual(rule.trigger, .depart)
        XCTAssertFalse(rule.enabled)
        XCTAssertEqual(rule.cooldownMinutes, 0)
    }

    /// `spoken` is nil when the test announcement reached no connected speaker —
    /// the UI must not claim the house said something it didn't.
    func testDecodesACreateWhoseTestReachedNobody() throws {
        let json = """
        {"rule":{"id":"r3","template":"{name}'s home"},"spoken":null}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(CreatePlaceRuleResponse.self, from: json)
        XCTAssertEqual(response.rule.id, "r3")
        XCTAssertNil(response.spoken)
    }

    func testDecodesACreateThatWasSpokenAloud() throws {
        let json = """
        {"rule":{"id":"r4","template":"{name}'s home"},"spoken":"Willoughby's home"}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(CreatePlaceRuleResponse.self, from: json)
        XCTAssertEqual(response.spoken, "Willoughby's home")
    }
}
