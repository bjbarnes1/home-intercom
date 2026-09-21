import Foundation

enum APIError: LocalizedError, Equatable {
    /// No session, or it expired — the UI should bounce to Login.
    case unauthorized
    /// The login itself was rejected. Distinct from `unauthorized` because
    /// "your session has expired" is nonsense on a sign-in screen: there is no
    /// session yet, and the real problem is the email or the password.
    case invalidCredentials(host: String)
    /// The route isn't there. Nearly always means the server is running an
    /// older deployment than this build of the app expects — a bare "404" sends
    /// you looking at the app when the answer is on the server.
    case featureNotDeployed(path: String, host: String)
    /// The server answered, but not happily. `message` is already human-readable.
    case server(status: Int, message: String)
    /// Couldn't reach the server at all (wrong URL, no network, server down).
    case unreachable(String)
    /// The server answered with something we couldn't parse.
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Your session has expired. Sign in again."
        case let .invalidCredentials(host):
            return "That email and password don't match an account on \(host). "
                + "Check the address — it may not be the one you use elsewhere."
        case let .featureNotDeployed(path, host):
            return "\(host) doesn't have \(path) — it's running an older deployment "
                + "than this app. Deploy the current code, or point Settings → Server "
                + "somewhere that has it."
        case let .server(status, message):
            return message.isEmpty ? "The server returned an error (\(status))." : message
        case let .unreachable(detail):
            return "Can't reach the intercom server. \(detail)"
        case let .decoding(detail):
            return "Unexpected response from the server. \(detail)"
        }
    }
}

/// The server's error bodies are either `{"error": "text"}` or, for schema
/// failures, `{"error": {formErrors: [...], fieldErrors: {...}}}` from zod.
/// Flatten both into one sentence.
struct ServerErrorBody: Decodable {
    let message: String

    private enum CodingKeys: String, CodingKey { case error }

    private struct ZodFlattened: Decodable {
        let formErrors: [String]?
        let fieldErrors: [String: [String]]?
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let text = try? container.decode(String.self, forKey: .error) {
            message = text
            return
        }
        if let zod = try? container.decode(ZodFlattened.self, forKey: .error) {
            var parts = zod.formErrors ?? []
            for (field, errors) in (zod.fieldErrors ?? [:]).sorted(by: { $0.key < $1.key }) {
                parts.append("\(field): \(errors.joined(separator: ", "))")
            }
            message = parts.joined(separator: " · ")
            return
        }
        message = ""
    }
}
