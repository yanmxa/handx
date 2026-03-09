import Foundation

// MARK: - TMux Session
struct TMuxSession: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    var windows: [TMuxWindow]
    let createdAt: Int64
    var attached: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case windows
        case createdAt = "created_at"
        case attached
    }

    var windowCount: Int {
        windows.count
    }

    var activeWindow: TMuxWindow? {
        windows.first { $0.active }
    }

    var createdDate: Date {
        Date(timeIntervalSince1970: TimeInterval(createdAt) / 1000)
    }

    var formattedCreatedDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: createdDate, relativeTo: Date())
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: TMuxSession, rhs: TMuxSession) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - TMux Window
struct TMuxWindow: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let index: Int
    var active: Bool
    let paneId: String

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case index
        case active
        case paneId = "pane_id"
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: TMuxWindow, rhs: TMuxWindow) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Connection State
enum ConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting(attempt: Int)
    case failed(error: String)

    var description: String {
        switch self {
        case .disconnected:
            return "Disconnected"
        case .connecting:
            return "Connecting..."
        case .connected:
            return "Connected"
        case .reconnecting(let attempt):
            return "Reconnecting (\(attempt))..."
        case .failed(let error):
            return "Failed: \(error)"
        }
    }

    var isConnected: Bool {
        if case .connected = self {
            return true
        }
        return false
    }

    var statusColor: String {
        switch self {
        case .connected:
            return "green"
        case .connecting, .reconnecting:
            return "yellow"
        case .disconnected, .failed:
            return "red"
        }
    }
}

// MARK: - Server Info
struct ServerInfo: Codable {
    var host: String
    var port: Int
    var token: String?
    var name: String?

    var wsURL: URL? {
        var urlString = "ws://\(host):\(port)/ws"
        if let token = token {
            urlString += "?token=\(token)"
        }
        return URL(string: urlString)
    }

    var displayName: String {
        name ?? "\(host):\(port)"
    }

    init(host: String, port: Int = 8080, token: String? = nil, name: String? = nil) {
        self.host = host
        self.port = port
        self.token = token
        self.name = name
    }

    init?(urlString: String) {
        guard let url = URL(string: urlString),
              let host = url.host else {
            return nil
        }

        self.host = host
        self.port = url.port ?? 8080
        self.name = nil

        // Parse token from query parameters
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let queryItems = components.queryItems {
            self.token = queryItems.first(where: { $0.name == "token" })?.value
        } else {
            self.token = nil
        }
    }
}

// MARK: - Command History
struct CommandHistory: Codable {
    var commands: [String]
    let maxCount: Int

    init(maxCount: Int = 100) {
        self.commands = []
        self.maxCount = maxCount
    }

    mutating func add(_ command: String) {
        // Remove if already exists (move to front)
        commands.removeAll { $0 == command }
        commands.insert(command, at: 0)

        // Trim to max count
        if commands.count > maxCount {
            commands = Array(commands.prefix(maxCount))
        }
    }

    var isEmpty: Bool {
        commands.isEmpty
    }
}
