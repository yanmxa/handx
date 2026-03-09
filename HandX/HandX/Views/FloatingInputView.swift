import SwiftUI

// MARK: - Floating Action Button (FAB) for Terminal Input
struct FloatingInputView: View {
    @Environment(\.appState) private var appState
    @Binding var showFullInput: Bool
    @Binding var showQuickKeys: Bool

    let onExecuteCommand: (String) -> Void
    let onSendKey: (String) -> Void

    @State private var position: CGPoint = .zero
    @State private var dragOffset: CGSize = .zero
    @State private var isDragging: Bool = false
    @State private var isLongPressing: Bool = false
    @State private var commandText: String = ""
    @GestureState private var longPressState: Bool = false

    private let fabSize: CGFloat = 56
    private let longPressThreshold: TimeInterval = 0.4

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Quick Keys Panel (shown on long press or toggle)
                if showQuickKeys {
                    quickKeysPanel
                        .position(quickKeysPanelPosition(in: geometry))
                        .transition(.scale.combined(with: .opacity))
                }

                // Full Input Panel
                if showFullInput {
                    fullInputPanel
                        .position(x: geometry.size.width / 2, y: geometry.size.height - 120)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // FAB Button
                fabButton
                    .position(fabPosition(in: geometry))
                    .offset(dragOffset)
                    .gesture(dragGesture(in: geometry))
                    .simultaneousGesture(longPressGesture)
            }
            .onAppear {
                initializePosition(in: geometry)
            }
        }
    }

    // MARK: - FAB Button
    private var fabButton: some View {
        Button {
            if !isDragging {
                withAnimation(.spring(duration: 0.25)) {
                    showFullInput.toggle()
                    if showFullInput {
                        showQuickKeys = false
                    }
                }
                HapticManager.shared.impact(.medium)
            }
        } label: {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.blue, Color.blue.opacity(0.8)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: fabSize, height: fabSize)
                    .shadow(color: .black.opacity(0.3), radius: 8, x: 0, y: 4)

                Image(systemName: showFullInput ? "xmark" : "keyboard")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.white)
                    .rotationEffect(.degrees(showFullInput ? 180 : 0))
            }
            .scaleEffect(isDragging ? 1.1 : (longPressState ? 1.05 : 1.0))
            .animation(.spring(duration: 0.2), value: isDragging)
            .animation(.spring(duration: 0.2), value: longPressState)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Quick Keys Panel
    private var quickKeysPanel: some View {
        VStack(spacing: 8) {
            // Top row: Window numbers (if multiple windows)
            if let session = appState.selectedSession, session.windows.count > 1 {
                HStack(spacing: 6) {
                    ForEach(session.windows.prefix(9)) { window in
                        windowButton(window: window)
                    }
                }
            }

            // Row 1: Basic controls
            HStack(spacing: 6) {
                quickKeyButton("Esc", key: "Escape")
                quickKeyButton("Tab", key: "Tab")
                quickKeyButton("Enter", key: "Enter")
                quickKeyButton("Close", icon: "xmark", action: {
                    withAnimation(.spring(duration: 0.25)) {
                        showQuickKeys = false
                    }
                })
            }

            // Row 2: Control keys
            HStack(spacing: 6) {
                quickKeyButton("^C", key: "C-c")
                quickKeyButton("^D", key: "C-d")
                quickKeyButton("^Z", key: "C-z")
                quickKeyButton("^L", key: "C-l")
            }

            // Row 3: Arrow keys
            HStack(spacing: 6) {
                quickKeyButton("", key: "Up", icon: "arrow.up")
                quickKeyButton("", key: "Down", icon: "arrow.down")
                quickKeyButton("", key: "Left", icon: "arrow.left")
                quickKeyButton("", key: "Right", icon: "arrow.right")
            }

            // Row 4: Navigation
            HStack(spacing: 6) {
                quickKeyButton("Home", key: "Home")
                quickKeyButton("End", key: "End")
                quickKeyButton("PgUp", key: "PageUp")
                quickKeyButton("PgDn", key: "PageDown")
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.2), radius: 12, x: 0, y: 4)
        )
    }

    private func windowButton(window: TMuxWindow) -> some View {
        let isSelected = window.id == appState.selectedWindow?.id

        return Button {
            HapticManager.shared.selection()
            Task { await appState.selectWindow(window) }
        } label: {
            Text("\(window.index)")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(isSelected ? .white : .primary)
                .frame(width: 32, height: 32)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(isSelected ? Color.blue : Color.secondary.opacity(0.2))
                )
        }
        .buttonStyle(.plain)
    }

    private func quickKeyButton(_ label: String, key: String? = nil, icon: String? = nil, action: (() -> Void)? = nil) -> some View {
        Button {
            HapticManager.shared.impact(.light)
            if let action = action {
                action()
            } else if let key = key {
                onSendKey(key)
            }
        } label: {
            HStack(spacing: 3) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 12, weight: .medium))
                }
                if !label.isEmpty {
                    Text(label)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                }
            }
            .foregroundColor(.primary)
            .frame(minWidth: 40, minHeight: 32)
            .padding(.horizontal, 6)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.secondary.opacity(0.15))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Full Input Panel
    private var fullInputPanel: some View {
        VStack(spacing: 0) {
            // Quick keys row
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(["Tab", "Esc", "^C", "^D", "^Z", "^L"], id: \.self) { key in
                        Button {
                            HapticManager.shared.impact(.light)
                            let keyValue = keyMapping(for: key)
                            onSendKey(keyValue)
                        } label: {
                            Text(key)
                                .font(.system(size: 11, weight: .medium, design: .monospaced))
                                .foregroundColor(.white.opacity(0.9))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.white.opacity(0.15))
                                .clipShape(RoundedRectangle(cornerRadius: 5))
                        }
                    }

                    Divider().frame(height: 20).background(Color.white.opacity(0.3))

                    ForEach(["", "", "", ""], id: \.self) { arrow in
                        Button {
                            HapticManager.shared.impact(.light)
                            let keyValue = arrowMapping(for: arrow)
                            onSendKey(keyValue)
                        } label: {
                            Text(arrow)
                                .font(.system(size: 13))
                                .foregroundColor(.white.opacity(0.9))
                                .frame(width: 32, height: 28)
                                .background(Color.white.opacity(0.15))
                                .clipShape(RoundedRectangle(cornerRadius: 5))
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .background(Color.black.opacity(0.7))

            // Input row
            HStack(spacing: 12) {
                Text("$")
                    .font(.system(size: 16, weight: .bold, design: .monospaced))
                    .foregroundColor(.green)

                TextField("", text: $commandText, prompt: Text("command...").foregroundColor(.gray))
                    .font(.system(size: 15, design: .monospaced))
                    .foregroundColor(.white)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .submitLabel(.send)
                    .onSubmit { executeCommand() }

                Button {
                    executeCommand()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(commandText.isEmpty ? .gray.opacity(0.5) : .blue)
                }
                .disabled(commandText.isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.black.opacity(0.9))
        }
        .frame(maxWidth: UIScreen.main.bounds.width - 40)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.3), radius: 12, x: 0, y: 4)
    }

    // MARK: - Helper Methods
    private func keyMapping(for key: String) -> String {
        switch key {
        case "Tab": return "Tab"
        case "Esc": return "Escape"
        case "^C": return "C-c"
        case "^D": return "C-d"
        case "^Z": return "C-z"
        case "^L": return "C-l"
        default: return key
        }
    }

    private func arrowMapping(for arrow: String) -> String {
        switch arrow {
        case "": return "Up"
        case "": return "Down"
        case "": return "Left"
        case "": return "Right"
        default: return arrow
        }
    }

    private func executeCommand() {
        guard !commandText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        HapticManager.shared.impact(.light)
        let cmd = commandText
        commandText = ""
        onExecuteCommand(cmd)
    }

    // MARK: - Position Management
    private func initializePosition(in geometry: GeometryProxy) {
        if appState.fabPositionX < 0 || appState.fabPositionY < 0 {
            // Default position: bottom right
            position = CGPoint(
                x: geometry.size.width - fabSize - 20,
                y: geometry.size.height - fabSize - 120
            )
        } else {
            position = CGPoint(x: appState.fabPositionX, y: appState.fabPositionY)
        }
    }

    private func fabPosition(in geometry: GeometryProxy) -> CGPoint {
        if position == .zero {
            return CGPoint(
                x: geometry.size.width - fabSize - 20,
                y: geometry.size.height - fabSize - 120
            )
        }
        return position
    }

    private func quickKeysPanelPosition(in geometry: GeometryProxy) -> CGPoint {
        let fabPos = fabPosition(in: geometry)
        // Position above the FAB
        return CGPoint(
            x: min(max(fabPos.x, 120), geometry.size.width - 120),
            y: fabPos.y - 180
        )
    }

    // MARK: - Gestures
    private var longPressGesture: some Gesture {
        LongPressGesture(minimumDuration: longPressThreshold)
            .updating($longPressState) { value, state, _ in
                state = value
            }
            .onEnded { _ in
                withAnimation(.spring(duration: 0.25)) {
                    showQuickKeys.toggle()
                    showFullInput = false
                }
                HapticManager.shared.impact(.medium)
            }
    }

    private func dragGesture(in geometry: GeometryProxy) -> some Gesture {
        DragGesture()
            .onChanged { value in
                isDragging = true
                dragOffset = value.translation
            }
            .onEnded { value in
                isDragging = false

                // Calculate new position with bounds checking
                let newX = position.x + value.translation.width
                let newY = position.y + value.translation.height

                let padding: CGFloat = 10
                let clampedX = min(max(newX, fabSize / 2 + padding), geometry.size.width - fabSize / 2 - padding)
                let clampedY = min(max(newY, fabSize / 2 + padding), geometry.size.height - fabSize / 2 - padding)

                withAnimation(.spring(duration: 0.3)) {
                    position = CGPoint(x: clampedX, y: clampedY)
                    dragOffset = .zero
                }

                // Save position
                appState.fabPositionX = clampedX
                appState.fabPositionY = clampedY

                HapticManager.shared.impact(.light)
            }
    }
}

// MARK: - Preview
#Preview {
    ZStack {
        Color.black.ignoresSafeArea()

        FloatingInputView(
            showFullInput: .constant(false),
            showQuickKeys: .constant(false),
            onExecuteCommand: { _ in },
            onSendKey: { _ in }
        )
    }
}
