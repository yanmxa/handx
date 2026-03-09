import SwiftUI

// MARK: - Settings View
struct SettingsView: View {
    @Environment(\.appState) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var fontSize: Double = ThemeManager.shared.fontSize
    @State private var selectedThemeId: String = ThemeManager.shared.terminalTheme.id
    @State private var showClearHistoryAlert: Bool = false
    @State private var showDisconnectAlert: Bool = false

    var body: some View {
        NavigationStack {
            List {
                // Appearance Section
                appearanceSection

                // Terminal Section
                terminalSection

                // Input Section
                inputSection

                // Connection Section
                connectionSection

                // About Section
                aboutSection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .alert("Clear Command History", isPresented: $showClearHistoryAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Clear", role: .destructive) {
                    appState.commandHistory = CommandHistory()
                }
            } message: {
                Text("This will permanently delete all command history.")
            }
            .alert("Disconnect", isPresented: $showDisconnectAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Disconnect", role: .destructive) {
                    appState.disconnect()
                }
            } message: {
                Text("Are you sure you want to disconnect from the server?")
            }
        }
    }

    // MARK: - Appearance Section
    private var appearanceSection: some View {
        Section {
            // Theme picker
            NavigationLink {
                ThemePickerView(selectedThemeId: $selectedThemeId)
            } label: {
                HStack {
                    Label("Theme", systemImage: "paintpalette")
                    Spacer()
                    Text(ThemeManager.shared.terminalTheme.name)
                        .foregroundStyle(.secondary)
                }
            }

            // Font size
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Font Size", systemImage: "textformat.size")
                    Spacer()
                    Text("\(Int(fontSize))pt")
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }

                Slider(value: $fontSize, in: 10...24, step: 1)
                    .onChange(of: fontSize) { _, newValue in
                        ThemeManager.shared.fontSize = newValue
                    }
            }
            .padding(.vertical, 4)
        } header: {
            Text("Appearance")
        } footer: {
            Text("You can also pinch-to-zoom in the terminal to adjust font size")
        }
    }

    // MARK: - Terminal Section
    private var terminalSection: some View {
        Section {
            // Line wrap toggle
            Toggle(isOn: Binding(
                get: { appState.wrapMode },
                set: { appState.wrapMode = $0 }
            )) {
                Label("Line Wrap", systemImage: "text.justify.left")
            }

            // Auto-hide header toggle
            Toggle(isOn: Binding(
                get: { appState.autoHideHeader },
                set: { appState.autoHideHeader = $0 }
            )) {
                Label("Auto-hide Header", systemImage: "arrow.up.and.down.text.horizontal")
            }

            // Scrollback lines
            Picker("Scrollback Lines", selection: Binding(
                get: { appState.scrollbackLines },
                set: { appState.scrollbackLines = $0 }
            )) {
                Text("1,000").tag(1000)
                Text("5,000").tag(5000)
                Text("10,000").tag(10000)
                Text("50,000").tag(50000)
            }

            // Clear history
            Button {
                showClearHistoryAlert = true
            } label: {
                HStack {
                    Label("Clear Command History", systemImage: "trash")
                    Spacer()
                    Text("\(appState.commandHistory.commands.count) commands")
                        .foregroundStyle(.secondary)
                }
            }
            .foregroundColor(.primary)
        } header: {
            Text("Terminal")
        } footer: {
            Text("Line wrap controls whether long lines wrap or scroll horizontally")
        }
    }

    // MARK: - Input Section
    private var inputSection: some View {
        Section {
            // Input type selector
            ForEach(MobileInputType.allCases, id: \.self) { type in
                inputTypeRow(type: type)
            }

            // Reset FAB position
            if appState.inputType == .floating {
                Button {
                    appState.fabPositionX = -1
                    appState.fabPositionY = -1
                    HapticManager.shared.notification(.success)
                } label: {
                    Label("Reset Button Position", systemImage: "arrow.counterclockwise")
                }
            }
        } header: {
            Text("Input Style")
        } footer: {
            if appState.inputType == .neural {
                Text("Neural Terminal is optimized for Claude Code and Gemini CLI with smart pattern detection")
            }
        }
    }

    private func inputTypeRow(type: MobileInputType) -> some View {
        let isSelected = appState.inputType == type

        return Button {
            appState.inputType = type
            HapticManager.shared.selection()
        } label: {
            HStack {
                Image(systemName: iconForType(type))
                    .foregroundColor(isSelected ? .cyan : .secondary)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 4) {
                    Text(type.displayName)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)

                    Text(type.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.cyan)
                }
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }

    private func iconForType(_ type: MobileInputType) -> String {
        switch type {
        case .inline:
            return "keyboard"
        case .floating:
            return "circle.circle"
        case .neural:
            return "brain"
        }
    }

    // MARK: - Connection Section
    private var connectionSection: some View {
        Section {
            // Connection status
            HStack {
                Label("Status", systemImage: "link")
                Spacer()
                HStack(spacing: 6) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                    Text(appState.connectionState.description)
                        .foregroundStyle(.secondary)
                }
            }

            // Server info
            if let server = appState.serverInfo {
                HStack {
                    Label("Server", systemImage: "server.rack")
                    Spacer()
                    Text(server.displayName)
                        .foregroundStyle(.secondary)
                }

                if let version = appState.serverVersion {
                    HStack {
                        Label("Version", systemImage: "info.circle")
                        Spacer()
                        Text(version)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Disconnect
            if appState.connectionState.isConnected {
                Button(role: .destructive) {
                    showDisconnectAlert = true
                } label: {
                    Label("Disconnect", systemImage: "xmark.circle")
                }
            }

            // Saved servers
            NavigationLink {
                SavedServersView()
            } label: {
                HStack {
                    Label("Saved Servers", systemImage: "clock.arrow.circlepath")
                    Spacer()
                    Text("\(appState.savedServers.count)")
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("Connection")
        }
    }

    private var statusColor: Color {
        switch appState.connectionState {
        case .connected: return .green
        case .connecting, .reconnecting: return .yellow
        case .disconnected, .failed: return .red
        }
    }

    // MARK: - About Section
    private var aboutSection: some View {
        Section {
            HStack {
                Label("Version", systemImage: "info.circle")
                Spacer()
                Text("1.0.0")
                    .foregroundStyle(.secondary)
            }

            Link(destination: URL(string: "https://github.com/yourusername/handx")!) {
                HStack {
                    Label("Source Code", systemImage: "chevron.left.forwardslash.chevron.right")
                    Spacer()
                    Image(systemName: "arrow.up.right.square")
                        .foregroundStyle(.secondary)
                }
            }
            .foregroundColor(.primary)

            NavigationLink {
                AcknowledgementsView()
            } label: {
                Label("Acknowledgements", systemImage: "heart")
            }
        } header: {
            Text("About")
        } footer: {
            Text("HandX - Remote Terminal for tmux")
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 20)
        }
    }
}

// MARK: - Theme Picker View
struct ThemePickerView: View {
    @Binding var selectedThemeId: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            ForEach(TerminalTheme.allThemes) { theme in
                Button {
                    selectedThemeId = theme.id
                    ThemeManager.shared.setTheme(theme)
                    HapticManager.shared.selection()
                } label: {
                    HStack {
                        // Theme preview
                        RoundedRectangle(cornerRadius: 8)
                            .fill(theme.background)
                            .frame(width: 60, height: 40)
                            .overlay(
                                Text("Aa")
                                    .font(.system(size: 14, design: .monospaced))
                                    .foregroundColor(theme.foreground)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                            )

                        Text(theme.name)
                            .foregroundColor(.primary)
                            .padding(.leading, 12)

                        Spacer()

                        if theme.id == selectedThemeId {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Theme")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Saved Servers View
struct SavedServersView: View {
    @Environment(\.appState) private var appState

    var body: some View {
        List {
            if appState.savedServers.isEmpty {
                ContentUnavailableView(
                    "No Saved Servers",
                    systemImage: "server.rack",
                    description: Text("Recently connected servers will appear here")
                )
            } else {
                ForEach(appState.savedServers, id: \.host) { server in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(server.displayName)
                                .font(.headline)
                            Text("\(server.host):\(server.port)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        if server.token != nil {
                            Image(systemName: "key.fill")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete(perform: deleteServers)
            }
        }
        .navigationTitle("Saved Servers")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !appState.savedServers.isEmpty {
                EditButton()
            }
        }
    }

    private func deleteServers(at offsets: IndexSet) {
        var servers = appState.savedServers
        servers.remove(atOffsets: offsets)
        appState.savedServers = servers
    }
}

// MARK: - Acknowledgements View
struct AcknowledgementsView: View {
    var body: some View {
        List {
            Section {
                Text("HandX is an open-source iOS app for remote tmux management.")
                    .font(.body)
            }

            Section("Technologies") {
                acknowledgementRow(name: "SwiftUI", description: "Apple's declarative UI framework")
                acknowledgementRow(name: "URLSession", description: "Native WebSocket support")
                acknowledgementRow(name: "AVFoundation", description: "QR code scanning")
            }

            Section("Special Thanks") {
                Text("The tmux community for creating an amazing terminal multiplexer.")
            }
        }
        .navigationTitle("Acknowledgements")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func acknowledgementRow(name: String, description: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(name)
                .font(.headline)
            Text(description)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    SettingsView()
}
