import XCTest
@testable import HomeIntercom

/// These lock the client to the JSON the Next.js routes actually return. The
/// fixtures are copied from the shapes in `src/app/api/**/route.ts`; if a route
/// changes, one of these should fail before the app does.
final class APIDecodingTests: XCTestCase {
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

    func testDecodesZonesWithNestedDevices() throws {
        let json = """
        {"zones":[{"id":"z1","name":"Downstairs","deviceCount":3,"onlineCount":2,
        "devices":[{"id":"d1","displayName":"Kitchen","room":"Kitchen","online":true}]}]}
        """.data(using: .utf8)!

        let envelope = try decoder().decode(ZonesEnvelope.self, from: json)
        XCTAssertEqual(envelope.zones.count, 1)
        XCTAssertEqual(envelope.zones[0].name, "Downstairs")
        XCTAssertEqual(envelope.zones[0].onlineCount, 2)
        XCTAssertEqual(envelope.zones[0].devices?.first?.displayName, "Kitchen")
    }

    func testDecodesDevicesIncludingNullRoom() throws {
        let json = """
        {"devices":[{"id":"d1","displayName":"Raff's room","room":null,"type":"ENDPOINT",
        "pairing":"ACTIVE","doNotDisturb":false,"lastSeenAt":"2026-09-14T08:30:00.000Z","online":true}]}
        """.data(using: .utf8)!

        let envelope = try decoder().decode(DevicesEnvelope.self, from: json)
        let device = try XCTUnwrap(envelope.devices.first)
        XCTAssertNil(device.room)
        XCTAssertTrue(device.isEndpoint)
        // Falls back to the display name when the room label is missing.
        XCTAssertEqual(device.roomLabel, "Raff's room")
    }

    /// Prisma serialises dates with milliseconds, which `.iso8601` rejects — the
    /// exact bug this custom strategy exists to avoid.
    func testDecodesPrismaDatesWithFractionalSeconds() throws {
        let json = """
        {"reminders":[{"id":"r1","text":"Read your novel","kind":"ONE_OFF","cron":null,
        "runAt":"2026-09-15T06:00:00.000Z","timezone":"Australia/Sydney","enabled":true,
        "nextRunAt":"2026-09-15T06:00:00.000Z","targetDeviceId":"d1","targetZoneId":null}]}
        """.data(using: .utf8)!

        let envelope = try decoder().decode(RemindersEnvelope.self, from: json)
        let reminder = try XCTUnwrap(envelope.reminders.first)
        XCTAssertEqual(reminder.nextRunAt?.timeIntervalSince1970, 1789452000)
        XCTAssertFalse(reminder.isRecurring)
    }

    func testDecodesInitiateResponse() throws {
        let json = """
        {"eventId":"e1","room":"page:d1","initiatorToken":"jwt","reached":["d1"],
        "notConnected":[],"suppressedByDnd":[],"offline":["d2"],
        "livekitUrl":"wss://example.livekit.cloud","mock":false}
        """.data(using: .utf8)!

        let response = try decoder().decode(InitiateResponse.self, from: json)
        XCTAssertEqual(response.room, "page:d1")
        XCTAssertEqual(response.reached, ["d1"])
        XCTAssertEqual(response.mock, false)
    }

    func testFlattensPlainStringErrorBody() throws {
        let json = #"{"error":"Invalid credentials"}"#.data(using: .utf8)!
        let body = try decoder().decode(ServerErrorBody.self, from: json)
        XCTAssertEqual(body.message, "Invalid credentials")
    }

    /// Zod's `error.flatten()` shape, which several routes return on a 400.
    func testFlattensZodErrorBody() throws {
        let json = """
        {"error":{"formErrors":["Provide exactly one of targetDeviceId or targetZoneId"],
        "fieldErrors":{"text":["String must contain at least 1 character(s)"]}}}
        """.data(using: .utf8)!

        let body = try decoder().decode(ServerErrorBody.self, from: json)
        XCTAssertTrue(body.message.contains("Provide exactly one"))
        XCTAssertTrue(body.message.contains("text:"))
    }
}
