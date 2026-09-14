import Foundation

/// Talks to the Next.js app the web controller already uses.
///
/// Auth is the existing cookie session: `POST /api/auth/login` returns an
/// HttpOnly `Set-Cookie`, and `URLSession` stores and replays it for us via the
/// shared cookie store — which persists across launches, so a signed-in phone
/// stays signed in for the 30-day sliding window the server grants. No tokens
/// to manage, and no server change was needed to support the native app.
actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(baseURL: URL, session: URLSession? = nil) {
        self.baseURL = baseURL

        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.httpCookieStorage = .shared
            config.httpCookieAcceptPolicy = .always
            config.httpShouldSetCookies = true
            // A page should feel instant or fail fast; nobody waits 60s to find
            // out the house server is off.
            config.timeoutIntervalForRequest = 15
            config.waitsForConnectivity = false
            self.session = URLSession(configuration: config)
        }

        encoder = JSONEncoder()
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(Self.decodeISODate)
    }

    // MARK: - Auth

    func login(email: String, password: String) async throws -> User {
        struct Body: Encodable { let email: String; let password: String }
        let envelope: UserEnvelope = try await send(
            "/api/auth/login", method: "POST",
            body: Body(email: email, password: password)
        )
        return envelope.user
    }

    func me() async throws -> User {
        let envelope: UserEnvelope = try await get("/api/auth/me")
        return envelope.user
    }

    func logout() async throws {
        try await fireAndForget("/api/auth/logout", method: "POST")
        clearCookies()
    }

    /// Set by `POST /api/auth/login` (see `src/lib/auth/session.ts`).
    static let sessionCookieName = "intercom_session"

    /// Drop the session cookie locally. Called on sign-out and whenever the
    /// server URL changes, so one household's cookie never rides to another host.
    nonisolated func clearCookies() {
        guard let cookies = HTTPCookieStorage.shared.cookies else { return }
        for cookie in cookies where cookie.name == Self.sessionCookieName {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }

    // MARK: - Household

    func devices() async throws -> [Device] {
        let envelope: DevicesEnvelope = try await get("/api/devices")
        return envelope.devices
    }

    func zones() async throws -> [Zone] {
        let envelope: ZonesEnvelope = try await get("/api/zones")
        return envelope.zones
    }

    // MARK: - Talk

    /// Start a page, two-way call, or live broadcast. The response carries the
    /// LiveKit room and the initiator's token; endpoints are rung/joined by the
    /// server over the lobby control channel.
    func initiate(
        kind: IntercomKind,
        initiatorIdentity: String,
        targetDeviceID: String? = nil,
        targetZoneID: String? = nil
    ) async throws -> InitiateResponse {
        try await send(
            "/api/page", method: "POST",
            body: InitiateRequest(
                kind: kind.rawValue,
                initiatorIdentity: initiatorIdentity,
                targetDeviceId: targetDeviceID,
                targetZoneId: targetZoneID
            )
        )
    }

    func hangup(eventID: String, deviceIDs: [String]) async throws {
        try await fireAndForget(
            "/api/page/hangup", method: "POST",
            body: HangupRequest(eventId: eventID, deviceIds: deviceIDs)
        )
    }

    // MARK: - Announce

    func announce(
        text: String,
        from: String? = nil,
        targetDeviceID: String? = nil,
        targetZoneID: String? = nil
    ) async throws -> AnnounceResponse {
        try await send(
            "/api/announce", method: "POST",
            body: AnnounceRequest(
                text: text, from: from,
                targetDeviceId: targetDeviceID, targetZoneId: targetZoneID
            )
        )
    }

    // MARK: - Reminders

    func reminders() async throws -> [Reminder] {
        let envelope: RemindersEnvelope = try await get("/api/reminders")
        return envelope.reminders
    }

    /// Natural language in ("remind Willoughby to read at 4pm tomorrow"),
    /// a scheduled reminder out. Needs ANTHROPIC_API_KEY on the server; without
    /// it the route answers 503 and we surface that as a plain message.
    func parseReminder(text: String) async throws -> ParseReminderResponse {
        try await send(
            "/api/reminders/parse", method: "POST",
            body: ParseReminderRequest(text: text)
        )
    }

    func createReminder(_ request: CreateReminderRequest) async throws -> Reminder {
        let envelope: ReminderEnvelope = try await send(
            "/api/reminders", method: "POST", body: request
        )
        return envelope.reminder
    }

    func setReminderEnabled(id: String, enabled: Bool) async throws -> Reminder {
        let envelope: ReminderEnvelope = try await send(
            "/api/reminders/\(id)", method: "PATCH",
            body: PatchReminderRequest(text: nil, enabled: enabled)
        )
        return envelope.reminder
    }

    func deleteReminder(id: String) async throws {
        try await fireAndForget("/api/reminders/\(id)", method: "DELETE")
    }

    // MARK: - Transport

    private func get<Response: Decodable>(_ path: String) async throws -> Response {
        try decode(try await perform(path, method: "GET", bodyData: nil))
    }

    private func send<Body: Encodable, Response: Decodable>(
        _ path: String,
        method: String,
        body: Body
    ) async throws -> Response {
        let data = try await perform(path, method: method, bodyData: try encoder.encode(body))
        return try decode(data)
    }

    /// For routes whose response body we don't care about (`{ok: true}`).
    private func fireAndForget(_ path: String, method: String) async throws {
        _ = try await perform(path, method: method, bodyData: nil)
    }

    private func fireAndForget<Body: Encodable>(
        _ path: String, method: String, body: Body
    ) async throws {
        _ = try await perform(path, method: method, bodyData: try encoder.encode(body))
    }

    private func decode<Response: Decodable>(_ data: Data) throws -> Response {
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }

    private func perform(_ path: String, method: String, bodyData: Data?) async throws -> Data {
        guard let url = URL(string: baseURL.absoluteString + path) else {
            throw APIError.unreachable("\(baseURL.absoluteString)\(path) isn't a valid URL.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bodyData {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = bodyData
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            throw APIError.unreachable(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.decoding("No HTTP response.")
        }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw APIError.unauthorized }
            let message = (try? decoder.decode(ServerErrorBody.self, from: data))?.message ?? ""
            throw APIError.server(status: http.statusCode, message: message)
        }
        return data
    }

    /// Prisma serialises dates as ISO-8601 *with* milliseconds
    /// (`2026-09-14T08:30:00.000Z`), which `.iso8601` rejects. Accept both.
    private static let isoWithFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain = ISO8601DateFormatter()

    private static func decodeISODate(_ decoder: Decoder) throws -> Date {
        let text = try decoder.singleValueContainer().decode(String.self)
        if let date = isoWithFraction.date(from: text) { return date }
        if let date = isoPlain.date(from: text) { return date }
        throw DecodingError.dataCorrupted(
            .init(codingPath: decoder.codingPath, debugDescription: "Bad date: \(text)")
        )
    }
}
