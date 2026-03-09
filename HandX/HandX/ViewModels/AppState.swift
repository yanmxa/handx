import SwiftUI

// MARK: - Input Mode
enum InputMode: String, CaseIterable {
    case hidden = "hidden"
    case fab = "fab"
    case fullInput = "fullInput"
    case quickKeys = "quickKeys"
}

// MARK: - Mobile Input Type Setting
enum MobileInputType: String, CaseIterable {
    case floating = "floating"
    case inline = "inline"
    case neural = "neural" // AI Command Center mode

    var displayName: String {
        switch self {
        case .floating: return "Floating Button"
        case .inline: return "Inline Input"
        case .neural: return "Neural Terminal"
        }
    }

    var description: String {
        switch self {
        case .floating:
            return "Draggable button that opens input panel"
        case .inline:
            return "Fixed input bar at bottom of screen"
        case .neural:
            return "AI Command Center with smart pattern detection"
        }
    }
}

// MARK: - App State
@Observable
final class AppState {
    // MARK: - Singleton
    static let shared = AppState()

    // MARK: - Connection
    var connectionState: ConnectionState = .disconnected
    var serverInfo: ServerInfo?
    var serverVersion: String?

    // MARK: - Sessions
    var sessions: [TMuxSession] = []
    var selectedSession: TMuxSession?
    var selectedWindow: TMuxWindow?

    // MARK: - Terminal
    var terminalOutput: String = ""
    var isLoadingOutput: Bool = false

    // MARK: - Input Mode
    var inputMode: InputMode = .fullInput
    var isSearchActive: Bool = false
    var searchQuery: String = ""
    var searchMatches: [Range<String.Index>] = []
    var currentSearchIndex: Int = 0

    // MARK: - Command History
    var commandHistory: CommandHistory = CommandHistory()

    // MARK: - Settings
    @ObservationIgnored
    @AppStorage("handx_font_size") var fontSize: Double = 14
    @ObservationIgnored
    @AppStorage("handx_scrollback_lines") var scrollbackLines: Int = 5000
    @ObservationIgnored
    @AppStorage("handx_theme_mode") var themeMode: String = "system"
    @ObservationIgnored
    @AppStorage("handx_wrap_mode") var wrapMode: Bool = true
    @ObservationIgnored
    @AppStorage("handx_input_type") var inputTypeRaw: String = "inline"
    @ObservationIgnored
    @AppStorage("handx_fab_position_x") var fabPositionX: Double = -1
    @ObservationIgnored
    @AppStorage("handx_fab_position_y") var fabPositionY: Double = -1
    @ObservationIgnored
    @AppStorage("handx_auto_hide_header") var autoHideHeader: Bool = true

    var inputType: MobileInputType {
        get { MobileInputType(rawValue: inputTypeRaw) ?? .inline }
        set { inputTypeRaw = newValue.rawValue }
    }

    // MARK: - Saved Servers
    @ObservationIgnored
    @AppStorage("handx_saved_servers") private var savedServersData: Data = Data()

    var savedServers: [ServerInfo] {
        get {
            (try? JSONDecoder().decode([ServerInfo].self, from: savedServersData)) ?? []
        }
        set {
            savedServersData = (try? JSONEncoder().encode(newValue)) ?? Data()
        }
    }

    // MARK: - WebSocket Service
    private let webSocket = WebSocketService.shared
    private var outputPollingTimer: Timer?
    private var sessionRefreshTimer: Timer?

    // MARK: - Init
    private init() {
        setupWebSocketHandlers()
    }

    // MARK: - Session Auto-Refresh
    func startSessionRefresh() {
        stopSessionRefresh()
        sessionRefreshTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.fetchSessions()
            }
        }
    }

    func stopSessionRefresh() {
        sessionRefreshTimer?.invalidate()
        sessionRefreshTimer = nil
    }

    // MARK: - WebSocket Handlers
    private func setupWebSocketHandlers() {
        webSocket.onConnected = { [weak self] in
            Task { @MainActor in
                self?.connectionState = .connected
                self?.serverVersion = self?.webSocket.serverVersion
                await self?.fetchSessions()
            }
        }

        webSocket.onDisconnected = { [weak self] reason in
            Task { @MainActor in
                self?.connectionState = .disconnected
                self?.stopOutputPolling()
            }
        }

        webSocket.onError = { [weak self] error in
            Task { @MainActor in
                self?.connectionState = .failed(error: error.localizedDescription)
            }
        }

        // Register message handlers
        webSocket.on(.listSessionsResponse) { [weak self] (message: Message<SessionsResponsePayload>) in
            Task { @MainActor in
                self?.sessions = message.payload.sessions
                // Auto-select first session if none selected
                if self?.selectedSession == nil, let first = message.payload.sessions.first {
                    await self?.selectSession(first)
                }
            }
        }

        webSocket.on(.listWindowsResponse) { [weak self] (message: Message<WindowsResponsePayload>) in
            Task { @MainActor in
                if let sessionIndex = self?.sessions.firstIndex(where: { $0.id == self?.selectedSession?.id }) {
                    self?.sessions[sessionIndex].windows = message.payload.windows
                    self?.selectedSession?.windows = message.payload.windows
                    // Auto-select active window
                    if let activeWindow = message.payload.windows.first(where: { $0.active }) {
                        self?.selectedWindow = activeWindow
                    } else if let firstWindow = message.payload.windows.first {
                        self?.selectedWindow = firstWindow
                    }
                }
            }
        }

        webSocket.on(.captureOutputResponse) { [weak self] (message: Message<CaptureOutputResponsePayload>) in
            Task { @MainActor in
                self?.terminalOutput = message.payload.output
                self?.isLoadingOutput = false
            }
        }

        webSocket.on(.createSessionResponse) { [weak self] (message: Message<SessionResponsePayload>) in
            Task { @MainActor in
                if message.payload.success {
                    await self?.fetchSessions()
                }
            }
        }

        webSocket.on(.deleteSessionResponse) { [weak self] (message: Message<SessionResponsePayload>) in
            Task { @MainActor in
                if message.payload.success {
                    await self?.fetchSessions()
                }
            }
        }
    }

    // MARK: - Connection
    func connect(to server: ServerInfo) async {
        serverInfo = server
        connectionState = .connecting

        // Save to recent servers
        var servers = savedServers
        servers.removeAll { $0.host == server.host && $0.port == server.port }
        servers.insert(server, at: 0)
        if servers.count > 10 {
            servers = Array(servers.prefix(10))
        }
        savedServers = servers

        do {
            try await webSocket.connect(to: server)
        } catch {
            connectionState = .failed(error: error.localizedDescription)
        }
    }

    func disconnect() {
        webSocket.disconnect()
        stopOutputPolling()
        stopSessionRefresh()
        sessions = []
        selectedSession = nil
        selectedWindow = nil
        terminalOutput = ""
    }

    // MARK: - Send Special Key
    func sendSpecialKey(_ key: String) async {
        guard let session = selectedSession else { return }

        do {
            try await webSocket.send(.sendKeys, payload: SendKeysPayload(
                sessionName: session.name,
                keys: key,
                windowIndex: selectedWindow?.index
            ))

            // Small delay then capture output
            try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
            await captureOutput()
        } catch {
            // Handle error
        }
    }

    // MARK: - Terminal Search
    func searchTerminalOutput(query: String) {
        searchQuery = query
        searchMatches = []
        currentSearchIndex = 0

        guard !query.isEmpty else { return }

        var ranges: [Range<String.Index>] = []
        var searchStart = terminalOutput.startIndex

        while let range = terminalOutput.range(of: query, options: .caseInsensitive, range: searchStart..<terminalOutput.endIndex) {
            ranges.append(range)
            searchStart = range.upperBound
        }

        searchMatches = ranges
    }

    func nextSearchMatch() {
        guard !searchMatches.isEmpty else { return }
        currentSearchIndex = (currentSearchIndex + 1) % searchMatches.count
    }

    func previousSearchMatch() {
        guard !searchMatches.isEmpty else { return }
        currentSearchIndex = currentSearchIndex > 0 ? currentSearchIndex - 1 : searchMatches.count - 1
    }

    func clearSearch() {
        isSearchActive = false
        searchQuery = ""
        searchMatches = []
        currentSearchIndex = 0
    }

    // MARK: - Sessions
    func fetchSessions() async {
        do {
            try await webSocket.send(.listSessions)
        } catch {
            // Handle error
        }
    }

    func selectSession(_ session: TMuxSession) async {
        selectedSession = session
        selectedWindow = session.activeWindow ?? session.windows.first
        terminalOutput = ""

        // Fetch windows for this session
        do {
            try await webSocket.send(.listWindows, payload: WindowPayload(sessionName: session.name))
        } catch {
            // Handle error
        }

        // Start output polling
        startOutputPolling()
    }

    func createSession(name: String) async {
        do {
            try await webSocket.send(.createSession, payload: SessionPayload(name: name))
        } catch {
            // Handle error
        }
    }

    func deleteSession(_ session: TMuxSession) async {
        do {
            try await webSocket.send(.deleteSession, payload: SessionPayload(sessionName: session.name))
            if selectedSession?.id == session.id {
                selectedSession = nil
                selectedWindow = nil
                terminalOutput = ""
            }
        } catch {
            // Handle error
        }
    }

    func renameSession(_ session: TMuxSession, newName: String) async {
        do {
            try await webSocket.send(.renameSession, payload: SessionPayload(sessionName: session.name, newName: newName))
            await fetchSessions()
        } catch {
            // Handle error
        }
    }

    // MARK: - Windows
    func selectWindow(_ window: TMuxWindow) async {
        guard let session = selectedSession else { return }

        selectedWindow = window
        terminalOutput = ""

        do {
            try await webSocket.send(.switchWindow, payload: WindowPayload(sessionName: session.name, windowIndex: window.index))
            startOutputPolling()
        } catch {
            // Handle error
        }
    }

    func createWindow(name: String? = nil) async {
        guard let session = selectedSession else { return }

        do {
            try await webSocket.send(.createWindow, payload: WindowPayload(sessionName: session.name, name: name))
            try await webSocket.send(.listWindows, payload: WindowPayload(sessionName: session.name))
        } catch {
            // Handle error
        }
    }

    func closeWindow(_ window: TMuxWindow) async {
        guard let session = selectedSession else { return }

        do {
            try await webSocket.send(.closeWindow, payload: WindowPayload(sessionName: session.name, windowIndex: window.index))
            try await webSocket.send(.listWindows, payload: WindowPayload(sessionName: session.name))
        } catch {
            // Handle error
        }
    }

    // MARK: - Commands
    func executeCommand(_ command: String) async {
        guard let session = selectedSession else { return }

        // Add to history
        if !command.isEmpty {
            commandHistory.add(command)
        }

        do {
            try await webSocket.send(.executeCommand, payload: ExecuteCommandPayload(
                sessionName: session.name,
                command: command,
                windowIndex: selectedWindow?.index
            ))

            // Immediate output capture after command
            try? await Task.sleep(nanoseconds: 300_000_000) // 300ms delay
            await captureOutput()
        } catch {
            // Handle error
        }
    }

    // MARK: - Output Polling
    func captureOutput() async {
        guard let session = selectedSession else { return }

        isLoadingOutput = true

        do {
            try await webSocket.send(.captureOutput, payload: CaptureOutputPayload(
                sessionName: session.name,
                windowIndex: selectedWindow?.index
            ))
        } catch {
            isLoadingOutput = false
        }
    }

    private func startOutputPolling() {
        stopOutputPolling()

        outputPollingTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                await self?.captureOutput()
            }
        }

        // Initial capture
        Task {
            await captureOutput()
        }
    }

    private func stopOutputPolling() {
        outputPollingTimer?.invalidate()
        outputPollingTimer = nil
    }
}

// MARK: - Environment Key
struct AppStateKey: EnvironmentKey {
    static let defaultValue = AppState.shared
}

extension EnvironmentValues {
    var appState: AppState {
        get { self[AppStateKey.self] }
        set { self[AppStateKey.self] = newValue }
    }
}
