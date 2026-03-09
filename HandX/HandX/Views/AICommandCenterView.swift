import SwiftUI

// MARK: - AI Command Center View (NeuralTerminal)
struct AICommandCenterView: View {
    @Environment(\.appState) private var appState
    @Environment(\.colorScheme) private var colorScheme

    @State private var commandText: String = ""
    @State private var scrollProxy: ScrollViewProxy?
    @State private var showArtifactList: Bool = false
    @State private var selectedArtifact: DetectedArtifact? = nil
    @State private var headerVisible: Bool = true
    @State private var lastScrollOffset: CGFloat = 0
    @State private var cursorBlinkOpacity: Double = 1.0
    @FocusState private var isInputFocused: Bool

    private let patternDetector = SmartPatternDetector.shared
    private let ansiParser = ANSIParser()

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // OLED Black background
                Color.black.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Header (auto-hide on scroll)
                    if headerVisible {
                        neuralHeader
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }

                    // Window tabs
                    if let session = appState.selectedSession, session.windows.count > 1 {
                        windowTabsView(session: session)
                    }

                    // Main content area
                    ZStack(alignment: .topTrailing) {
                        // Terminal stream (bottom layer)
                        terminalStreamView(geometry: geometry)
                            .frame(maxHeight: .infinity)

                        // Artifact seed indicator (right side)
                        if !patternDetector.detectedArtifacts.isEmpty {
                            artifactSeedButton
                                .padding(.top, 20)
                                .padding(.trailing, 8)
                        }

                        // Task anchor (on scrollbar)
                        if let anchorLine = patternDetector.currentTaskAnchor {
                            taskAnchorButton(line: anchorLine)
                        }
                    }

                    // Action bubbles (when AI prompts for confirmation)
                    if shouldShowActionBubbles {
                        ActionBubblesView(
                            patternType: patternDetector.currentPattern,
                            onConfirm: { response in
                                sendCommand(response)
                            },
                            onDismiss: {
                                patternDetector.reset()
                            }
                        )
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Thinking indicator
                    if patternDetector.isAIThinking {
                        ThinkingIndicatorView()
                            .padding(.horizontal, 16)
                            .padding(.bottom, 8)
                            .transition(.opacity)
                    }

                    // Input area
                    neuralInputArea
                }

                // Tmux controls overlay
                TmuxControlsView(
                    onSendKeys: { keys in
                        Task { await appState.sendSpecialKey(keys) }
                    },
                    onSwitchWindow: { index in
                        if let session = appState.selectedSession,
                           index < session.windows.count {
                            let window = session.windows[index]
                            Task { await appState.selectWindow(window) }
                        }
                    }
                )

                // Floating artifact card
                if let artifact = selectedArtifact {
                    VStack {
                        ArtifactCardView(
                            artifact: artifact,
                            onTap: {
                                // Show full screen
                            },
                            onDismiss: {
                                selectedArtifact = nil
                            }
                        )
                        .padding(.horizontal, 16)
                        .padding(.top, 100)

                        Spacer()
                    }
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .trailing).combined(with: .opacity)
                    ))
                }

                // Artifact list sheet
                if showArtifactList {
                    artifactListOverlay
                        .transition(.move(edge: .trailing))
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: headerVisible)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: shouldShowActionBubbles)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: patternDetector.isAIThinking)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: selectedArtifact != nil)
            .onChange(of: appState.terminalOutput) { _, newOutput in
                // Analyze output for patterns
                patternDetector.analyzeOutput(newOutput)
                patternDetector.extractArtifacts(from: newOutput)
            }
        }
        .sheet(item: $selectedArtifact) { artifact in
            ArtifactFullScreenView(artifact: artifact)
        }
    }

    // MARK: - Neural Header
    private var neuralHeader: some View {
        HStack(spacing: 12) {
            // AI Status indicator
            HStack(spacing: 8) {
                // Pulsing dot
                Circle()
                    .fill(Color.cyan)
                    .frame(width: 8, height: 8)
                    .shadow(color: .cyan.opacity(0.8), radius: 4)
                    .opacity(cursorBlinkOpacity)
                    .onAppear {
                        withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                            cursorBlinkOpacity = 0.3
                        }
                    }

                VStack(alignment: .leading, spacing: 2) {
                    Text(appState.selectedSession?.name ?? "Neural Terminal")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)

                    if let window = appState.selectedWindow {
                        Text("[\(window.index)] \(window.name)")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.cyan.opacity(0.7))
                    }
                }
            }

            Spacer()

            // Search button
            Button {
                appState.isSearchActive.toggle()
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16))
                    .foregroundColor(.white.opacity(0.7))
            }

            // Loading indicator
            if appState.isLoadingOutput {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .cyan))
                    .scaleEffect(0.7)
            }

            // More button
            Menu {
                Button {
                    Task { await appState.captureOutput() }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }

                Button {
                    appState.terminalOutput = ""
                } label: {
                    Label("Clear", systemImage: "trash")
                }

                Divider()

                Button {
                    Task { await appState.createWindow() }
                } label: {
                    Label("New Window", systemImage: "plus.rectangle")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.system(size: 18))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(
            LinearGradient(
                colors: [Color.black, Color.black.opacity(0.95)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    // MARK: - Window Tabs
    private func windowTabsView(session: TMuxSession) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(session.windows) { window in
                    windowTab(window: window)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .background(Color.black.opacity(0.9))
    }

    private func windowTab(window: TMuxWindow) -> some View {
        let isSelected = window.id == appState.selectedWindow?.id

        return Button {
            Task { await appState.selectWindow(window) }
            HapticManager.shared.windowSwitch()
        } label: {
            HStack(spacing: 4) {
                Text("\(window.index)")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundColor(isSelected ? .black : .cyan)
                    .frame(width: 18, height: 18)
                    .background(
                        Circle()
                            .fill(isSelected ? Color.cyan : Color.cyan.opacity(0.2))
                    )

                Text(window.name)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(isSelected ? .white : .white.opacity(0.6))
                    .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isSelected ? Color.white.opacity(0.1) : Color.clear)
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

    // MARK: - Terminal Stream (The Stream Layer)
    private func terminalStreamView(geometry: GeometryProxy) -> some View {
        ScrollViewReader { proxy in
            ScrollView(appState.wrapMode ? .vertical : [.horizontal, .vertical]) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    Text(parsedOutput)
                        .font(.system(size: ThemeManager.shared.fontSize, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: appState.wrapMode ? .infinity : nil, alignment: .leading)
                        .padding(12)
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
        }
        .background(Color.black)
    }

    private var parsedOutput: AttributedString {
        ansiParser.parse(appState.terminalOutput, isDarkMode: true)
    }

    private func scrollToBottom() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeOut(duration: 0.15)) {
                scrollProxy?.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    private func handleScrollOffset(_ offset: CGFloat) {
        guard appState.autoHideHeader else {
            headerVisible = true
            return
        }

        let scrollThreshold: CGFloat = 20

        if offset > lastScrollOffset + scrollThreshold {
            if !headerVisible {
                headerVisible = true
            }
        } else if offset < lastScrollOffset - scrollThreshold {
            if headerVisible && offset < -50 {
                headerVisible = false
            }
        }

        if offset > -10 {
            headerVisible = true
        }

        lastScrollOffset = offset
    }

    // MARK: - Artifact Seed Button
    private var artifactSeedButton: some View {
        ArtifactSeedView(count: patternDetector.detectedArtifacts.count) {
            if let first = patternDetector.detectedArtifacts.first {
                selectedArtifact = first
            }
            HapticManager.shared.impact(.medium)
        }
    }

    // MARK: - Task Anchor Button
    private func taskAnchorButton(line: Int) -> some View {
        VStack {
            Spacer()
            TaskAnchorView(lineNumber: line) {
                // Scroll to anchor line
                // Would need line-based scrolling implementation
                HapticManager.shared.impact(.medium)
            }
            .padding(.trailing, 8)
            Spacer()
        }
    }

    // MARK: - Artifact List Overlay
    private var artifactListOverlay: some View {
        ZStack(alignment: .trailing) {
            Color.black.opacity(0.5)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation {
                        showArtifactList = false
                    }
                }

            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("Code Artifacts")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)

                    Spacer()

                    Button {
                        withAnimation {
                            showArtifactList = false
                        }
                    } label: {
                        Image(systemName: "xmark")
                            .foregroundColor(.white.opacity(0.7))
                    }
                }
                .padding()
                .background(Color.black)

                // Artifact list
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(patternDetector.detectedArtifacts) { artifact in
                            artifactListRow(artifact: artifact)
                        }
                    }
                    .padding()
                }
            }
            .frame(width: UIScreen.main.bounds.width * 0.85)
            .background(.ultraThinMaterial)
        }
    }

    private func artifactListRow(artifact: DetectedArtifact) -> some View {
        Button {
            selectedArtifact = artifact
            showArtifactList = false
        } label: {
            HStack {
                Image(systemName: "chevron.left.forwardslash.chevron.right")
                    .foregroundColor(.cyan)

                VStack(alignment: .leading, spacing: 4) {
                    Text(artifact.language?.capitalized ?? "Code")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white)

                    Text("\(artifact.content.prefix(50))...")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.white.opacity(0.6))
                        .lineLimit(1)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .foregroundColor(.white.opacity(0.3))
            }
            .padding(12)
            .background(Color.white.opacity(0.1))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Neural Input Area
    private var neuralInputArea: some View {
        VStack(spacing: 0) {
            // Unified quick keys bar
            QuickKeysView(
                onKeyPress: { key in
                    if key == "Enter" {
                        sendCommand("")
                    } else if key.hasPrefix("C-") || key == "Escape" {
                        Task { await appState.sendSpecialKey(key) }
                    } else {
                        // Send as text input (1, 2, 3, Tab, Up, Down)
                        Task { await appState.sendSpecialKey(key) }
                    }
                },
                onHistorySelect: { cmd in
                    commandText = cmd
                }
            )

            // Main input
            HStack(spacing: 12) {
                // Neural prompt indicator
                Text("λ")
                    .font(.system(size: 18, weight: .bold, design: .monospaced))
                    .foregroundColor(.cyan)
                    .shadow(color: .cyan.opacity(0.5), radius: 4)

                // Input field
                TextField("", text: $commandText, prompt: Text("command...").foregroundColor(.white.opacity(0.3)))
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
                        .foregroundColor(commandText.isEmpty ? .white.opacity(0.2) : .cyan)
                        .shadow(color: commandText.isEmpty ? .clear : .cyan.opacity(0.5), radius: 6)
                }
                .disabled(commandText.isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.black)
        }
    }

    // MARK: - Computed Properties
    private var shouldShowActionBubbles: Bool {
        switch patternDetector.currentPattern {
        case .yesNoPrompt, .multiChoicePrompt, .toolExecution, .errorMessage:
            return true
        default:
            return false
        }
    }

    // MARK: - Actions
    private func executeCommand() {
        guard !commandText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        HapticManager.shared.commandSent()
        let cmd = commandText
        commandText = ""
        Task { await appState.executeCommand(cmd) }
    }

    private func sendCommand(_ command: String) {
        HapticManager.shared.commandSent()
        Task { await appState.executeCommand(command) }
    }
}

// MARK: - Preview
#Preview {
    AICommandCenterView()
}
