import SwiftUI

// MARK: - iPad Layout View
struct iPadLayoutView: View {
    @Environment(\.appState) private var appState
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var showSettings: Bool = false

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            // Sidebar: Sessions list
            sidebarContent
                .navigationTitle("Sessions")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gear")
                        }
                    }
                }
        } detail: {
            // Detail: Terminal view
            if appState.selectedSession != nil {
                iPadTerminalView()
            } else {
                noSessionSelectedView
            }
        }
        .navigationSplitViewStyle(.balanced)
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
    }

    // MARK: - Sidebar Content
    private var sidebarContent: some View {
        List(selection: Binding(
            get: { appState.selectedSession?.id },
            set: { id in
                if let session = appState.sessions.first(where: { $0.id == id }) {
                    Task { await appState.selectSession(session) }
                }
            }
        )) {
            // Connection status section
            Section("Connection") {
                HStack {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                    Text(appState.connectionState.description)
                        .font(.subheadline)
                    Spacer()
                    if let version = appState.serverVersion {
                        Text("v\(version)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Sessions section
            Section("Sessions (\(appState.sessions.count))") {
                ForEach(appState.sessions) { session in
                    sessionRow(session: session)
                        .tag(session.id)
                }
            }

            // Actions section
            Section {
                Button {
                    // Create new session
                } label: {
                    Label("New Session", systemImage: "plus")
                }
            }
        }
        .listStyle(.sidebar)
        .refreshable {
            await appState.fetchSessions()
        }
    }

    private func sessionRow(session: TMuxSession) -> some View {
        let isSelected = session.id == appState.selectedSession?.id

        return HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(session.name)
                    .font(.headline)

                HStack(spacing: 8) {
                    Label("\(session.windowCount)", systemImage: "square.on.square")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if session.attached {
                        Text("attached")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.green.opacity(0.2))
                            .foregroundColor(.green)
                            .clipShape(Capsule())
                    }
                }
            }

            Spacer()

            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.blue)
            }
        }
        .contentShape(Rectangle())
        .contextMenu {
            Button {
                // Rename session
            } label: {
                Label("Rename", systemImage: "pencil")
            }

            Button(role: .destructive) {
                Task { await appState.deleteSession(session) }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private var statusColor: Color {
        switch appState.connectionState {
        case .connected: return .green
        case .connecting, .reconnecting: return .yellow
        case .disconnected, .failed: return .red
        }
    }

    // MARK: - No Session Selected View
    private var noSessionSelectedView: some View {
        ContentUnavailableView(
            "No Session Selected",
            systemImage: "terminal",
            description: Text("Select a session from the sidebar to view terminal output")
        )
    }
}

// MARK: - iPad Terminal View
struct iPadTerminalView: View {
    @Environment(\.appState) private var appState
    @Environment(\.colorScheme) private var colorScheme

    @State private var commandText: String = ""
    @State private var scrollProxy: ScrollViewProxy?
    @State private var showSearch: Bool = false
    @State private var showHistory: Bool = false
    @FocusState private var isInputFocused: Bool

    private let ansiParser = ANSIParser()

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                ThemeManager.shared.terminalTheme.background
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search bar (if visible)
                    if showSearch {
                        TerminalSearchView(isPresented: $showSearch)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }

                    // Header
                    terminalHeader

                    // Window tabs
                    if let session = appState.selectedSession, session.windows.count > 1 {
                        windowTabsView(session: session)
                    }

                    // Terminal content
                    terminalContentView
                        .frame(maxHeight: .infinity)

                    // Input area
                    inputAreaView
                }
            }
        }
        .sheet(isPresented: $showHistory) {
            CommandHistoryView(selectedCommand: $commandText)
        }
        .focusedSceneValue(\.terminalCommands, TerminalCommands(
            newWindow: { Task { await appState.createWindow() } },
            closeWindow: { if let window = appState.selectedWindow { Task { await appState.closeWindow(window) } } },
            clearOutput: { appState.terminalOutput = "" },
            toggleSearch: { withAnimation { showSearch.toggle() } },
            switchToWindow: { index in
                if let session = appState.selectedSession,
                   let window = session.windows.first(where: { $0.index == index }) {
                    Task { await appState.selectWindow(window) }
                }
            }
        ))
    }

    // MARK: - Terminal Header
    private var terminalHeader: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(appState.selectedSession?.name ?? "No Session")
                    .font(.headline)
                    .foregroundColor(ThemeManager.shared.terminalTheme.foreground)

                if let window = appState.selectedWindow {
                    Text("[\(window.index)] \(window.name)")
                        .font(.caption)
                        .foregroundColor(ThemeManager.shared.terminalTheme.foreground.opacity(0.7))
                }
            }

            Spacer()

            // Search button
            Button {
                withAnimation(.spring(duration: 0.25)) {
                    showSearch.toggle()
                }
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16))
                    .foregroundColor(ThemeManager.shared.terminalTheme.foreground.opacity(0.7))
            }

            // Status indicator
            if appState.isLoadingOutput {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: ThemeManager.shared.terminalTheme.foreground))
                    .scaleEffect(0.7)
            }

            // Refresh button
            Button {
                Task { await appState.captureOutput() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 16))
                    .foregroundColor(ThemeManager.shared.terminalTheme.foreground.opacity(0.7))
            }

            // New window button
            Button {
                Task { await appState.createWindow() }
            } label: {
                Image(systemName: "plus.rectangle")
                    .font(.system(size: 16))
                    .foregroundColor(ThemeManager.shared.terminalTheme.foreground.opacity(0.7))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(ThemeManager.shared.terminalTheme.background.opacity(0.95))
    }

    // MARK: - Window Tabs
    private func windowTabsView(session: TMuxSession) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(session.windows) { window in
                    windowTab(window: window)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .background(ThemeManager.shared.terminalTheme.background.opacity(0.8))
    }

    private func windowTab(window: TMuxWindow) -> some View {
        let isSelected = window.id == appState.selectedWindow?.id
        let theme = ThemeManager.shared.terminalTheme

        return Button {
            Task { await appState.selectWindow(window) }
            HapticManager.shared.selection()
        } label: {
            HStack(spacing: 5) {
                Text("\(window.index):")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))

                Text(window.name)
                    .font(.system(size: 11, design: .monospaced))
                    .lineLimit(1)
            }
            .foregroundColor(isSelected ? .white : theme.foreground.opacity(0.7))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isSelected ? Color.blue : Color.white.opacity(0.1))
            )
        }
        .contextMenu {
            Button(role: .destructive) {
                Task { await appState.closeWindow(window) }
            } label: {
                Label("Close", systemImage: "xmark")
            }
        }
    }

    // MARK: - Terminal Content
    private var terminalContentView: some View {
        ScrollViewReader { proxy in
            ScrollView(appState.wrapMode ? .vertical : [.horizontal, .vertical]) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    Text(parsedOutput)
                        .font(.system(size: ThemeManager.shared.fontSize, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: appState.wrapMode ? .infinity : nil, alignment: .leading)
                        .padding(10)
                        .id("bottom")
                }
            }
            .onAppear { scrollProxy = proxy }
            .onChange(of: appState.terminalOutput) { _, _ in
                scrollToBottom()
            }
        }
        .background(ThemeManager.shared.terminalTheme.background)
    }

    private var parsedOutput: AttributedString {
        ansiParser.parse(appState.terminalOutput, isDarkMode: colorScheme == .dark)
    }

    private func scrollToBottom() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeOut(duration: 0.15)) {
                scrollProxy?.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    // MARK: - Input Area
    private var inputAreaView: some View {
        VStack(spacing: 0) {
            // Quick keys
            QuickKeysView(
                onKeyPress: { key in
                    Task { await appState.sendSpecialKey(key) }
                },
                onHistorySelect: { cmd in
                    commandText = cmd
                }
            )

            // Command input
            HStack(spacing: 10) {
                Text("$")
                    .font(.system(size: 15, weight: .bold, design: .monospaced))
                    .foregroundColor(.green)

                TextField("command", text: $commandText)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(.white)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($isInputFocused)
                    .submitLabel(.send)
                    .onSubmit { executeCommand() }

                // History button
                Button {
                    showHistory = true
                } label: {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 18))
                        .foregroundColor(.white.opacity(0.7))
                }

                // Send button
                Button(action: executeCommand) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 26))
                        .foregroundColor(commandText.isEmpty ? .gray : .blue)
                }
                .disabled(commandText.isEmpty)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.black.opacity(0.9))
        }
    }

    private func executeCommand() {
        guard !commandText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        HapticManager.shared.impact(.light)
        let cmd = commandText
        commandText = ""
        Task { await appState.executeCommand(cmd) }
    }
}

// MARK: - Terminal Commands (for keyboard shortcuts)
struct TerminalCommands {
    var newWindow: () -> Void = {}
    var closeWindow: () -> Void = {}
    var clearOutput: () -> Void = {}
    var toggleSearch: () -> Void = {}
    var switchToWindow: (Int) -> Void = { _ in }
}

// MARK: - Focused Value Key
struct TerminalCommandsKey: FocusedValueKey {
    typealias Value = TerminalCommands
}

extension FocusedValues {
    var terminalCommands: TerminalCommands? {
        get { self[TerminalCommandsKey.self] }
        set { self[TerminalCommandsKey.self] = newValue }
    }
}

// MARK: - Preview
#Preview {
    iPadLayoutView()
}
