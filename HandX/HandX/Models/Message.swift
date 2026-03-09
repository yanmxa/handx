import Foundation

// MARK: - Message Types
enum MessageType: String, Codable {
    // Connection
    case connect = "connect"
    case connectAck = "connect_ack"
    case disconnect = "disconnect"

    // Session Management
    case listSessions = "list_sessions"
    case listSessionsResponse = "list_sessions_response"
    case createSession = "create_session"
    case createSessionResponse = "create_session_response"
    case deleteSession = "delete_session"
    case deleteSessionResponse = "delete_session_response"
    case renameSession = "rename_session"
    case renameSessionResponse = "rename_session_response"
    case switchSession = "switch_session"
    case switchSessionResponse = "switch_session_response"

    // Window Management
    case listWindows = "list_windows"
    case listWindowsResponse = "list_windows_response"
    case createWindow = "create_window"
    case createWindowResponse = "create_window_response"
    case closeWindow = "close_window"
    case closeWindowResponse = "close_window_response"
    case switchWindow = "switch_window"
    case switchWindowResponse = "switch_window_response"

    // Command Execution
    case executeCommand = "execute_command"
    case executeCommandResponse = "execute_command_response"
    case sendKeys = "send_keys"
    case sendKeysResponse = "send_keys_response"

    // Terminal Output
    case terminalOutput = "terminal_output"
    case captureOutput = "capture_output"
    case captureOutputResponse = "capture_output_response"

    // Error
    case error = "error"
}

// MARK: - Base Message
struct Message<T: Codable>: Codable {
    let id: String
    let type: MessageType
    let payload: T
    let timestamp: Int64
    var encrypted: Bool?

    init(type: MessageType, payload: T) {
        self.id = UUID().uuidString
        self.type = type
        self.payload = payload
        self.timestamp = Int64(Date().timeIntervalSince1970 * 1000)
        self.encrypted = false
    }
}

// MARK: - Raw Message (for decoding unknown payloads)
struct RawMessage: Codable {
    let id: String
    let type: MessageType
    let payload: [String: AnyCodable]?
    let timestamp: Int64
    var encrypted: Bool?
}

// MARK: - AnyCodable Helper
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dictionary = try? container.decode([String: AnyCodable].self) {
            value = dictionary.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dictionary as [String: Any]:
            try container.encode(dictionary.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }
}

// MARK: - Payload Types

// Connect
struct ConnectPayload: Codable {
    let clientType: String
    let version: String
    let token: String?

    enum CodingKeys: String, CodingKey {
        case clientType = "client_type"
        case version
        case token
    }

    init(token: String? = nil) {
        self.clientType = "ios"
        self.version = "1.0.0"
        self.token = token
    }
}

struct ConnectAckPayload: Codable {
    let success: Bool
    let serverVersion: String?
    let encryptionEnabled: Bool?
    let message: String?

    enum CodingKeys: String, CodingKey {
        case success
        case serverVersion = "server_version"
        case encryptionEnabled = "encryption_enabled"
        case message
    }
}

// Session
struct SessionPayload: Codable {
    let name: String?
    let sessionName: String?
    let newName: String?

    enum CodingKeys: String, CodingKey {
        case name
        case sessionName = "session_name"
        case newName = "new_name"
    }

    init(name: String? = nil, sessionName: String? = nil, newName: String? = nil) {
        self.name = name
        self.sessionName = sessionName
        self.newName = newName
    }
}

struct SessionsResponsePayload: Codable {
    let sessions: [TMuxSession]
}

struct SessionResponsePayload: Codable {
    let success: Bool
    let session: TMuxSession?
    let message: String?
}

// Window
struct WindowPayload: Codable {
    let sessionName: String
    let name: String?
    let windowIndex: Int?

    enum CodingKeys: String, CodingKey {
        case sessionName = "session_name"
        case name
        case windowIndex = "window_index"
    }

    init(sessionName: String, name: String? = nil, windowIndex: Int? = nil) {
        self.sessionName = sessionName
        self.name = name
        self.windowIndex = windowIndex
    }
}

struct WindowsResponsePayload: Codable {
    let windows: [TMuxWindow]
}

struct WindowResponsePayload: Codable {
    let success: Bool
    let window: TMuxWindow?
    let message: String?
}

// Command
struct ExecuteCommandPayload: Codable {
    let sessionName: String
    let command: String
    let windowIndex: Int?

    enum CodingKeys: String, CodingKey {
        case sessionName = "session_name"
        case command
        case windowIndex = "window_index"
    }

    init(sessionName: String, command: String, windowIndex: Int? = nil) {
        self.sessionName = sessionName
        self.command = command
        self.windowIndex = windowIndex
    }
}

struct ExecuteCommandResponsePayload: Codable {
    let success: Bool
    let message: String?
}

// Send Keys (for special keys like Ctrl-C, arrows, etc.)
struct SendKeysPayload: Codable {
    let sessionName: String
    let keys: String
    let windowIndex: Int?

    enum CodingKeys: String, CodingKey {
        case sessionName = "session_name"
        case keys
        case windowIndex = "window_index"
    }

    init(sessionName: String, keys: String, windowIndex: Int? = nil) {
        self.sessionName = sessionName
        self.keys = keys
        self.windowIndex = windowIndex
    }
}

struct SendKeysResponsePayload: Codable {
    let success: Bool
    let message: String?
}

// Output
struct CaptureOutputPayload: Codable {
    let sessionName: String
    let windowIndex: Int?

    enum CodingKeys: String, CodingKey {
        case sessionName = "session_name"
        case windowIndex = "window_index"
    }

    init(sessionName: String, windowIndex: Int? = nil) {
        self.sessionName = sessionName
        self.windowIndex = windowIndex
    }
}

struct CaptureOutputResponsePayload: Codable {
    let output: String
    let sequenceNumber: Int?

    enum CodingKeys: String, CodingKey {
        case output
        case sequenceNumber = "sequence_number"
    }
}

struct TerminalOutputPayload: Codable {
    let sessionName: String
    let output: String
    let sequenceNumber: Int

    enum CodingKeys: String, CodingKey {
        case sessionName = "session_name"
        case output
        case sequenceNumber = "sequence_number"
    }
}

// Error
struct ErrorPayload: Codable {
    let code: String
    let message: String
    let originalMessageId: String?

    enum CodingKeys: String, CodingKey {
        case code
        case message
        case originalMessageId = "original_message_id"
    }
}

// Empty payload for requests without data
struct EmptyPayload: Codable {}
