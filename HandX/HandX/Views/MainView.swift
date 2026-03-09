import SwiftUI

// MARK: - Main View
struct MainView: View {
    @Environment(\.appState) private var appState
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selectedTab: Tab = .sessions
    @State private var showSettings: Bool = false

    enum Tab: String, CaseIterable {
        case connection = "Connection"
        case sessions = "Sessions"
        case terminal = "Terminal"

        var icon: String {
            switch self {
            case .connection: return "link"
            case .sessions: return "rectangle.stack"
            case .terminal: return "terminal"
            }
        }
    }

    var body: some View {
        Group {
            if appState.connectionState.isConnected {
                // Use iPad layout for regular size class (iPad)
                if horizontalSizeClass == .regular {
                    iPadLayoutView()
                } else {
                    connectedView
                }
            } else {
                ConnectionView()
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .onChange(of: appState.connectionState) { oldState, newState in
            // Switch to sessions tab when connected
            if newState.isConnected && !oldState.isConnected {
                selectedTab = .sessions
            }
        }
    }

    // MARK: - Connected View (iPhone)
    private var connectedView: some View {
        TabView(selection: $selectedTab) {
            // Sessions Tab
            NavigationStack {
                SessionListView()
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button {
                                showSettings = true
                            } label: {
                                Image(systemName: "gear")
                            }
                        }
                    }
            }
            .tabItem {
                Label("Sessions", systemImage: "rectangle.stack")
            }
            .tag(Tab.sessions)

            // Terminal Tab
            if appState.selectedSession != nil {
                // Use Neural Terminal or standard terminal based on setting
                Group {
                    if appState.inputType == .neural {
                        AICommandCenterView()
                    } else {
                        TerminalContainerView()
                    }
                }
                .tabItem {
                    Label("Terminal", systemImage: appState.inputType == .neural ? "brain" : "terminal")
                }
                .tag(Tab.terminal)
            }

            // Connection Tab (for reconnect/settings)
            NavigationStack {
                ConnectionView()
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button {
                                showSettings = true
                            } label: {
                                Image(systemName: "gear")
                            }
                        }
                    }
            }
            .tabItem {
                Label("Connect", systemImage: "link")
            }
            .tag(Tab.connection)
        }
        .tint(.blue)
    }
}

// MARK: - Terminal Container View
struct TerminalContainerView: View {
    @Environment(\.appState) private var appState
    @Environment(\.colorScheme) private var colorScheme

    @State private var commandText: String = ""
    @State private var scrollProxy: ScrollViewProxy?
    @State private var showSearch: Bool = false
    @State private var showFabInput: Bool = false
    @State private var showFabQuickKeys: Bool = false
    @State private var headerVisible: Bool = true
    @State private var lastScrollOffset: CGFloat = 0
    @State private var currentFontScale: CGFloat = 1.0
    @State private var fontSizeIndicatorOpacity: Double = 0
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

                    // Header (auto-hide on scroll)
                    if headerVisible || !appState.autoHideHeader {
                        terminalHeader
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }

                    // Window tabs
                    if let session = appState.selectedSession, session.windows.count > 1 {
                        windowTabsView(session: session)
                    }

                    // Terminal content with pinch-to-zoom
                    terminalContentView(geometry: geometry)
                        .frame(maxHeight: .infinity)

                    // Input area (inline mode)
                    if appState.inputType == .inline {
                        inputAreaView
                    }
                }

                // Floating Input Button (FAB mode)
                if appState.inputType == .floating {
                    FloatingInputView(
                        showFullInput: $showFabInput,
                        showQuickKeys: $showFabQuickKeys,
                        onExecuteCommand: { cmd in
                            Task { await appState.executeCommand(cmd) }
                        },
                        onSendKey: { key in
                            Task { await appState.sendSpecialKey(key) }
                        }
                    )
                }

                // Font size indicator overlay
                if fontSizeIndicatorOpacity > 0 {
                    fontSizeIndicator
                        .opacity(fontSizeIndicatorOpacity)
                        .animation(.easeInOut(duration: 0.2), value: fontSizeIndicatorOpacity)
                }
            }
            .animation(.spring(duration: 0.25), value: headerVisible)
            .animation(.spring(duration: 0.25), value: showSearch)
        }
    }

    // MARK: - Terminal Header
    private var terminalHeader: some View {
        HStack(spacing: 12) {
            // Session info
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
                refreshOutput()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 16))
                    .foregroundColor(ThemeManager.shared.terminalTheme.foreground.opacity(0.7))
            }

            // New window button
            Button {
                createNewWindow()
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
            selectWindow(window)
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
                closeWindow(window)
            } label: {
                Label("Close", systemImage: "xmark")
            }
        }
    }

    // MARK: - Terminal Content with Pinch-to-Zoom
    private func terminalContentView(geometry: GeometryProxy) -> some View {
        ScrollViewReader { proxy in
            ScrollView(appState.wrapMode ? .vertical : [.horizontal, .vertical]) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    Text(parsedOutput)
                        .font(.system(size: effectiveFontSize, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: appState.wrapMode ? .infinity : nil, alignment: .leading)
                        .padding(10)
                        .id("bottom")
                        .background(
                            GeometryReader { geo -> Color in
                                DispatchQueue.main.async {
                                    handleScrollOffset(geo.frame(in: .named("scroll")).minY)
                                }
                                return Color.clear
                            }
                        )
                }
            }
            .coordinateSpace(name: "scroll")
            .onAppear { scrollProxy = proxy }
            .onChange(of: appState.terminalOutput) { _, _ in
                scrollToBottom()
            }
            .gesture(
                MagnificationGesture()
                    .onChanged { scale in
                        currentFontScale = scale
                        fontSizeIndicatorOpacity = 1.0
                    }
                    .onEnded { scale in
                        applyFontScaling(scale)
                        withAnimation(.easeOut(duration: 0.5).delay(0.5)) {
                            fontSizeIndicatorOpacity = 0
                        }
                    }
            )
        }
        .background(ThemeManager.shared.terminalTheme.background)
    }

    private var effectiveFontSize: CGFloat {
        let baseSize = ThemeManager.shared.fontSize
        let scaledSize = baseSize * currentFontScale
        return min(max(scaledSize, 10), 24)
    }

    private func applyFontScaling(_ scale: CGFloat) {
        let newSize = ThemeManager.shared.fontSize * scale
        let clampedSize = min(max(newSize, 10), 24)

        if clampedSize <= 10 || clampedSize >= 24 {
            HapticManager.shared.notification(.warning)
        } else {
            HapticManager.shared.impact(.light)
        }

        ThemeManager.shared.fontSize = clampedSize
        currentFontScale = 1.0
    }

    // MARK: - Font Size Indicator
    private var fontSizeIndicator: some View {
        VStack {
            Text("\(Int(effectiveFontSize))pt")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.black.opacity(0.8))
                )
        }
    }

    // MARK: - Auto-hide Header on Scroll
    private func handleScrollOffset(_ offset: CGFloat) {
        guard appState.autoHideHeader else {
            headerVisible = true
            return
        }

        let scrollThreshold: CGFloat = 20

        if offset > lastScrollOffset + scrollThreshold {
            // Scrolling up - show header
            if !headerVisible {
                withAnimation(.spring(duration: 0.25)) {
                    headerVisible = true
                }
            }
        } else if offset < lastScrollOffset - scrollThreshold {
            // Scrolling down - hide header
            if headerVisible && offset < -50 {
                withAnimation(.spring(duration: 0.25)) {
                    headerVisible = false
                }
            }
        }

        // Always show at top
        if offset > -10 {
            headerVisible = true
        }

        lastScrollOffset = offset
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

    // MARK: - Input Area (Inline Mode)
    private var inputAreaView: some View {
        VStack(spacing: 0) {
            // Unified quick keys
            QuickKeysView(
                onKeyPress: { key in
                    if key == "Enter" {
                        executeCommand()
                    } else {
                        Task { await appState.sendSpecialKey(key) }
                    }
                },
                onHistorySelect: { cmd in
                    commandText = cmd
                }
            )

            // Command input
            HStack(spacing: 12) {
                // Prompt
                Text("$")
                    .font(.system(size: 16, weight: .bold, design: .monospaced))
                    .foregroundColor(.green)

                // Input field
                TextField("command", text: $commandText)
                    .font(.system(size: 15, design: .monospaced))
                    .foregroundColor(.white)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($isInputFocused)
                    .submitLabel(.send)
                    .onSubmit { executeCommand() }

                // Send button (enlarged for better touch target)
                Button(action: executeCommand) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 36))
                        .foregroundColor(commandText.isEmpty ? .gray : .blue)
                }
                .disabled(commandText.isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.black.opacity(0.9))
        }
    }

    // MARK: - Actions
    private func executeCommand() {
        guard !commandText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        HapticManager.shared.impact(.light)
        let cmd = commandText
        commandText = ""
        Task { await appState.executeCommand(cmd) }
    }

    private func selectWindow(_ window: TMuxWindow) {
        HapticManager.shared.selection()
        Task { await appState.selectWindow(window) }
    }

    private func createNewWindow() {
        HapticManager.shared.impact(.light)
        Task { await appState.createWindow() }
    }

    private func closeWindow(_ window: TMuxWindow) {
        HapticManager.shared.notification(.warning)
        Task { await appState.closeWindow(window) }
    }

    private func refreshOutput() {
        HapticManager.shared.impact(.light)
        Task { await appState.captureOutput() }
    }
}

#Preview {
    MainView()
}
