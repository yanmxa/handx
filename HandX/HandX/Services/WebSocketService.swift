import Foundation

// MARK: - WebSocket Service
@Observable
final class WebSocketService: NSObject {
    // MARK: - Properties
    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession?
    private var pingTimer: Timer?

    var connectionState: ConnectionState = .disconnected
    var serverVersion: String?

    private var serverInfo: ServerInfo?
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 5
    private var isManualDisconnect = false

    // Message handlers
    private var messageHandlers: [MessageType: [(Data) -> Void]] = [:]

    // Callbacks
    var onConnected: (() -> Void)?
    var onDisconnected: ((String?) -> Void)?
    var onError: ((Error) -> Void)?

    // MARK: - Singleton
    static let shared = WebSocketService()

    private override init() {
        super.init()
    }

    // MARK: - Connection
    func connect(to serverInfo: ServerInfo) async throws {
        guard let url = serverInfo.wsURL else {
            throw WebSocketError.invalidURL
        }

        self.serverInfo = serverInfo
        self.isManualDisconnect = false
        self.reconnectAttempts = 0

        await MainActor.run {
            self.connectionState = .connecting
        }

        // Create session
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 300
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)

        webSocketTask = session?.webSocketTask(with: url)
        webSocketTask?.resume()

        // Start receiving messages
        startReceiving()

        // Send connect message
        try await sendConnectMessage(token: serverInfo.token)

        // Start ping timer
        startPingTimer()
    }

    func disconnect() {
        isManualDisconnect = true
        stopPingTimer()
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        session?.invalidateAndCancel()
        session = nil

        Task { @MainActor in
            self.connectionState = .disconnected
            self.onDisconnected?(nil)
        }
    }

    // MARK: - Reconnection
    private func attemptReconnect() {
        guard !isManualDisconnect,
              reconnectAttempts < maxReconnectAttempts,
              let serverInfo = serverInfo else {
            Task { @MainActor in
                self.connectionState = .failed(error: "Max reconnection attempts reached")
            }
            return
        }

        reconnectAttempts += 1

        Task { @MainActor in
            self.connectionState = .reconnecting(attempt: self.reconnectAttempts)
        }

        // Exponential backoff: 2^attempt seconds (2, 4, 8, 16, 32)
        let delay = min(pow(2.0, Double(reconnectAttempts)), 32.0)

        Task {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

            do {
                try await self.connect(to: serverInfo)
            } catch {
                self.attemptReconnect()
            }
        }
    }

    // MARK: - Sending Messages
    func send<T: Codable>(_ type: MessageType, payload: T) async throws {
        let message = Message(type: type, payload: payload)
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(message)

        guard let webSocketTask = webSocketTask else {
            throw WebSocketError.notConnected
        }

        try await webSocketTask.send(.data(data))
    }

    func send(_ type: MessageType) async throws {
        try await send(type, payload: EmptyPayload())
    }

    private func sendConnectMessage(token: String?) async throws {
        let payload = ConnectPayload(token: token)
        try await send(.connect, payload: payload)
    }

    // MARK: - Receiving Messages
    private func startReceiving() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                self?.handleMessage(message)
                self?.startReceiving() // Continue receiving
            case .failure(let error):
                self?.handleError(error)
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .data(let data):
            processMessage(data)
        case .string(let text):
            if let data = text.data(using: .utf8) {
                processMessage(data)
            }
        @unknown default:
            break
        }
    }

    private func processMessage(_ data: Data) {
        let decoder = JSONDecoder()
        // Don't use convertFromSnakeCase - we use CodingKeys in models

        guard let rawMessage = try? decoder.decode(RawMessage.self, from: data) else {
            print("Failed to decode raw message")
            return
        }

        // Handle connect_ack
        if rawMessage.type == .connectAck {
            handleConnectAck(data)
            return
        }

        // Handle error
        if rawMessage.type == .error {
            handleErrorMessage(data)
            return
        }

        // Dispatch to registered handlers
        if let handlers = messageHandlers[rawMessage.type] {
            for handler in handlers {
                handler(data)
            }
        }
    }

    private func handleConnectAck(_ data: Data) {
        let decoder = JSONDecoder()

        if let message = try? decoder.decode(Message<ConnectAckPayload>.self, from: data) {
            let payload = message.payload
            if payload.success {
                Task { @MainActor in
                    self.serverVersion = payload.serverVersion
                    self.connectionState = .connected
                    self.reconnectAttempts = 0
                    self.onConnected?()
                }
            } else {
                Task { @MainActor in
                    self.connectionState = .failed(error: payload.message ?? "Connection rejected")
                }
            }
        }
    }

    private func handleErrorMessage(_ data: Data) {
        let decoder = JSONDecoder()

        if let message = try? decoder.decode(Message<ErrorPayload>.self, from: data) {
            let error = WebSocketError.serverError(message.payload.message)
            onError?(error)
        }
    }

    private func handleError(_ error: Error) {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled:
                // Intentional disconnect
                return
            case .timedOut, .networkConnectionLost, .notConnectedToInternet:
                attemptReconnect()
            default:
                break
            }
        }

        Task { @MainActor in
            self.connectionState = .failed(error: error.localizedDescription)
            self.onError?(error)
        }
    }

    // MARK: - Message Handlers Registration
    func on<T: Codable>(_ type: MessageType, handler: @escaping (Message<T>) -> Void) {
        let wrappedHandler: (Data) -> Void = { data in
            let decoder = JSONDecoder()
            // Don't use convertFromSnakeCase - we use CodingKeys in models
            do {
                let message = try decoder.decode(Message<T>.self, from: data)
                handler(message)
            } catch {
                print("Failed to decode message: \(error)")
                if let jsonString = String(data: data, encoding: .utf8) {
                    print("Raw JSON: \(jsonString.prefix(500))")
                }
            }
        }

        if messageHandlers[type] == nil {
            messageHandlers[type] = []
        }
        messageHandlers[type]?.append(wrappedHandler)
    }

    func off(_ type: MessageType) {
        messageHandlers[type] = nil
    }

    func removeAllHandlers() {
        messageHandlers.removeAll()
    }

    // MARK: - Ping/Pong
    private func startPingTimer() {
        stopPingTimer()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.sendPing()
        }
    }

    private func stopPingTimer() {
        pingTimer?.invalidate()
        pingTimer = nil
    }

    private func sendPing() {
        webSocketTask?.sendPing { [weak self] error in
            if let error = error {
                self?.handleError(error)
            }
        }
    }
}

// MARK: - URLSessionWebSocketDelegate
extension WebSocketService: URLSessionWebSocketDelegate {
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        // Connection opened
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        let reasonString = reason.flatMap { String(data: $0, encoding: .utf8) }

        Task { @MainActor in
            self.connectionState = .disconnected
            self.onDisconnected?(reasonString)
        }

        if !isManualDisconnect {
            attemptReconnect()
        }
    }
}

// MARK: - WebSocket Errors
enum WebSocketError: LocalizedError {
    case invalidURL
    case notConnected
    case encodingFailed
    case decodingFailed
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL"
        case .notConnected:
            return "Not connected to server"
        case .encodingFailed:
            return "Failed to encode message"
        case .decodingFailed:
            return "Failed to decode message"
        case .serverError(let message):
            return message
        }
    }
}
