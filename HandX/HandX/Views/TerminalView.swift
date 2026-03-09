import SwiftUI

// MARK: - Terminal View
struct TerminalView: View {
    @Environment(\.appState) private var appState
    @Environment(\.colorScheme) private var colorScheme

    @State private var commandText: String = ""
    @State private var showWindowPicker: Bool = false
    @State private var isKeyboardVisible: Bool = false
    @State private var scrollProxy: ScrollViewProxy?
    @FocusState private var isInputFocused: Bool

    private let ansiParser = ANSIParser()

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Terminal background
                ThemeManager.shared.terminalTheme.background
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    // Header with session/window info
                    terminalHeader

                    // Window tabs
                    if let session = appState.selectedSession, session.windows.count > 1 {
                        windowTabs(session: session)
                    }

                    // Terminal output
                    terminalOutput
                        .frame(maxHeight: .infinity)

                    // Command input
                    commandInputView
                }
            }
        }
        .navigationBarHidden(true)
        .onAppear {
            setupKeyboardNotifications()
        }
    }

    // MARK: - Terminal Header
    private var terminalHeader: some View {
        HStack(spacing: 12) {
            // Back button (placeholder for navigation)
            Button {
                // Navigate back to session list
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white)
            }

            // Session name
            VStack(alignment: .leading, spacing: 2) {
                Text(appState.selectedSession?.name ?? "No Session")
                    .font(.headline)
                    .foregroundColor(.white)

                if let window = appState.selectedWindow {
                    Text("Window: \(window.name)")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                }
            }

            Spacer()

            // Loading indicator
            if appState.isLoadingOutput {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(0.8)
            }

            // New window button
            Button {
                createWindow()
            } label: {
                Image(systemName: "plus.square")
                    .font(.system(size: 20))
                    .foregroundColor(.white)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.black.opacity(0.3))
    }

    // MARK: - Window Tabs
    private func windowTabs(session: TMuxSession) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(session.windows) { window in
                    windowTab(window: window)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(Color.black.opacity(0.2))
    }

    private func windowTab(window: TMuxWindow) -> some View {
        let isSelected = window.id == appState.selectedWindow?.id

        return Button {
            selectWindow(window)
        } label: {
            HStack(spacing: 6) {
                Text("\(window.index)")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundColor(isSelected ? .white : .white.opacity(0.6))
                    .frame(width: 18, height: 18)
                    .background(isSelected ? Color.blue : Color.white.opacity(0.2))
                    .clipShape(Circle())

                Text(window.name)
                    .font(.caption)
                    .foregroundColor(isSelected ? .white : .white.opacity(0.7))
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isSelected ? Color.blue.opacity(0.3) : Color.clear)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(isSelected ? Color.blue : Color.white.opacity(0.2), lineWidth: 1)
            )
        }
        .contextMenu {
            Button(role: .destructive) {
                closeWindow(window)
            } label: {
                Label("Close Window", systemImage: "xmark")
            }
        }
    }

    // MARK: - Terminal Output
    private var terminalOutput: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(parsedOutput)
                        .font(ThemeManager.shared.terminalFont)
                        .foregroundColor(ThemeManager.shared.terminalTheme.foreground)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .id("terminalOutput")
                }
            }
            .background(ThemeManager.shared.terminalTheme.background)
            .onAppear {
                scrollProxy = proxy
            }
            .onChange(of: appState.terminalOutput) { _, _ in
                scrollToBottom()
            }
        }
    }

    private var parsedOutput: AttributedString {
        ansiParser.parse(appState.terminalOutput, isDarkMode: colorScheme == .dark)
    }

    private func scrollToBottom() {
        withAnimation(.easeOut(duration: 0.2)) {
            scrollProxy?.scrollTo("terminalOutput", anchor: .bottom)
        }
    }

    // MARK: - Command Input
    private var commandInputView: some View {
        VStack(spacing: 0) {
            // Quick action bar
            quickActionBar

            // Input field
            HStack(spacing: 12) {
                // Prompt
                Text("$")
                    .font(.system(size: 16, weight: .bold, design: .monospaced))
                    .foregroundColor(.green)

                // Text field
                TextField("Enter command...", text: $commandText)
                    .font(.system(size: 15, design: .monospaced))
                    .foregroundColor(.white)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($isInputFocused)
                    .submitLabel(.send)
                    .onSubmit {
                        executeCommand()
                    }

                // Send button
                Button {
                    executeCommand()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(commandText.isEmpty ? .gray : .blue)
                }
                .disabled(commandText.isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.black.opacity(0.8))
        }
    }

    // MARK: - Quick Action Bar
    private var quickActionBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Common keys
                ForEach(quickKeys, id: \.self) { key in
                    quickKeyButton(key)
                }

                Divider()
                    .frame(height: 24)
                    .background(Color.white.opacity(0.3))

                // History
                if !appState.commandHistory.isEmpty {
                    Menu {
                        ForEach(appState.commandHistory.commands.prefix(10), id: \.self) { cmd in
                            Button(cmd) {
                                commandText = cmd
                            }
                        }
                    } label: {
                        quickKeyLabel("History", icon: "clock.arrow.circlepath")
                    }
                }

                // Clear
                Button {
                    sendSpecialKey("clear")
                } label: {
                    quickKeyLabel("Clear", icon: "trash")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Color.black.opacity(0.6))
    }

    private var quickKeys: [String] {
        ["Tab", "Ctrl+C", "Ctrl+D", "Ctrl+Z", "Esc", "↑", "↓"]
    }

    private func quickKeyButton(_ key: String) -> some View {
        Button {
            handleQuickKey(key)
        } label: {
            Text(key)
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundColor(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.white.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }

    private func quickKeyLabel(_ text: String, icon: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10))
            Text(text)
                .font(.system(size: 12, weight: .medium))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    // MARK: - Actions
    private func executeCommand() {
        let cmd = commandText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cmd.isEmpty else { return }

        HapticManager.shared.impact(.light)
        Task {
            await appState.executeCommand(cmd)
        }
        commandText = ""
    }

    private func handleQuickKey(_ key: String) {
        HapticManager.shared.impact(.light)

        switch key {
        case "Tab":
            sendSpecialKey("Tab")
        case "Ctrl+C":
            sendSpecialKey("C-c")
        case "Ctrl+D":
            sendSpecialKey("C-d")
        case "Ctrl+Z":
            sendSpecialKey("C-z")
        case "Esc":
            sendSpecialKey("Escape")
        case "↑":
            sendSpecialKey("Up")
        case "↓":
            sendSpecialKey("Down")
        default:
            break
        }
    }

    private func sendSpecialKey(_ key: String) {
        Task {
            await appState.executeCommand(key)
        }
    }

    private func selectWindow(_ window: TMuxWindow) {
        HapticManager.shared.selection()
        Task {
            await appState.selectWindow(window)
        }
    }

    private func createWindow() {
        HapticManager.shared.impact(.light)
        Task {
            await appState.createWindow()
        }
    }

    private func closeWindow(_ window: TMuxWindow) {
        HapticManager.shared.notification(.warning)
        Task {
            await appState.closeWindow(window)
        }
    }

    // MARK: - Keyboard Handling
    private func setupKeyboardNotifications() {
        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillShowNotification,
            object: nil,
            queue: .main
        ) { _ in
            isKeyboardVisible = true
        }

        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillHideNotification,
            object: nil,
            queue: .main
        ) { _ in
            isKeyboardVisible = false
        }
    }
}

// MARK: - Preview
#Preview {
    TerminalView()
}
