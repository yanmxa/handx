import SwiftUI

// MARK: - Tmux Controls View (Window Switch Strip + Prefix Key)
struct TmuxControlsView: View {
    @Environment(\.appState) private var appState
    let onSendKeys: (String) -> Void
    let onSwitchWindow: (Int) -> Void

    @State private var dragOffset: CGFloat = 0
    @State private var showWindowIndicator: Bool = false
    @State private var indicatedWindowIndex: Int = 0
    @State private var showPrefixMenu: Bool = false
    @State private var prefixActive: Bool = false
    @State private var showSessionMatrix: Bool = false

    private let feedbackGenerator = UIImpactFeedbackGenerator(style: .medium)

    var body: some View {
        ZStack {
            // Window indicator overlay
            if showWindowIndicator {
                windowIndicatorOverlay
                    .transition(.opacity.combined(with: .scale))
            }

            // Session matrix overlay
            if showSessionMatrix {
                sessionMatrixOverlay
                    .transition(.opacity)
            }

            // Controls at bottom
            VStack {
                Spacer()

                HStack(alignment: .bottom, spacing: 0) {
                    // Neural (Ω) Prefix Key
                    prefixKeyButton
                        .padding(.leading, 16)
                        .padding(.bottom, 8)

                    Spacer()

                    // Window switch strip (iOS home indicator style)
                    windowSwitchStrip
                        .padding(.trailing, 16)
                        .padding(.bottom, 8)
                }
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showWindowIndicator)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showSessionMatrix)
    }

    // MARK: - Prefix Key (Ω Button)
    private var prefixKeyButton: some View {
        Button {
            // Single tap: toggle prefix mode
            if !prefixActive {
                activatePrefix()
            } else {
                deactivatePrefix()
            }
        } label: {
            ZStack {
                // Outer glow when active
                if prefixActive {
                    Circle()
                        .fill(Color.cyan.opacity(0.2))
                        .frame(width: 60, height: 60)
                        .blur(radius: 10)
                }

                // Main button
                Circle()
                    .fill(
                        prefixActive ?
                            LinearGradient(
                                colors: [Color.cyan, Color.cyan.opacity(0.7)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ) :
                            LinearGradient(
                                colors: [Color.white.opacity(0.15), Color.white.opacity(0.1)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                    )
                    .frame(width: 48, height: 48)
                    .overlay(
                        Circle()
                            .stroke(
                                prefixActive ? Color.cyan : Color.white.opacity(0.2),
                                lineWidth: 1
                            )
                    )
                    .shadow(color: prefixActive ? .cyan.opacity(0.5) : .clear, radius: 10)

                // Ω Symbol
                Text("Ω")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(prefixActive ? .black : .white.opacity(0.8))
            }
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5)
                .onEnded { _ in
                    // Long press: show session matrix
                    HapticManager.shared.impact(.heavy)
                    withAnimation {
                        showSessionMatrix = true
                    }
                }
        )
    }

    // MARK: - Window Switch Strip
    private var windowSwitchStrip: some View {
        let windowCount = appState.selectedSession?.windows.count ?? 1
        let currentIndex = appState.selectedWindow?.index ?? 0

        return VStack(spacing: 6) {
            // Window dots indicator
            HStack(spacing: 6) {
                ForEach(0..<min(windowCount, 9), id: \.self) { index in
                    Circle()
                        .fill(index == currentIndex ? Color.cyan : Color.white.opacity(0.3))
                        .frame(width: 6, height: 6)
                }
            }

            // Swipe area (home indicator style)
            RoundedRectangle(cornerRadius: 3)
                .fill(Color.white.opacity(0.4))
                .frame(width: 100 + abs(dragOffset) * 0.3, height: 5)
                .offset(x: dragOffset * 0.2)
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            dragOffset = value.translation.width

                            // Calculate indicated window
                            let threshold: CGFloat = 60
                            let direction = dragOffset / threshold
                            let newIndex = currentIndex + Int(direction.rounded())
                            let clampedIndex = max(0, min(newIndex, windowCount - 1))

                            if clampedIndex != indicatedWindowIndex {
                                indicatedWindowIndex = clampedIndex
                                feedbackGenerator.impactOccurred()
                            }

                            if abs(dragOffset) > 30 && !showWindowIndicator {
                                withAnimation(.spring(response: 0.2)) {
                                    showWindowIndicator = true
                                }
                            }
                        }
                        .onEnded { value in
                            let threshold: CGFloat = 60

                            if abs(value.translation.width) > threshold {
                                // Switch window
                                let direction = value.translation.width > 0 ? -1 : 1
                                let newIndex = currentIndex + direction
                                let clampedIndex = max(0, min(newIndex, windowCount - 1))

                                if clampedIndex != currentIndex {
                                    onSwitchWindow(clampedIndex)
                                    HapticManager.shared.windowSwitch()
                                }
                            }

                            withAnimation(.spring(response: 0.3)) {
                                dragOffset = 0
                                showWindowIndicator = false
                            }
                        }
                )
        }
    }

    // MARK: - Window Indicator Overlay
    private var windowIndicatorOverlay: some View {
        VStack(spacing: 16) {
            // Large window number
            Text("\(indicatedWindowIndex + 1)")
                .font(.system(size: 120, weight: .bold, design: .monospaced))
                .foregroundColor(.white.opacity(0.3))

            // Window name
            if let session = appState.selectedSession,
               indicatedWindowIndex < session.windows.count {
                let window = session.windows[indicatedWindowIndex]
                Text(window.name)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white.opacity(0.6))
            }
        }
    }

    // MARK: - Session Matrix Overlay
    private var sessionMatrixOverlay: some View {
        ZStack {
            // Backdrop
            Color.black.opacity(0.8)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation {
                        showSessionMatrix = false
                    }
                }

            // Session grid
            VStack(spacing: 24) {
                // Title
                HStack {
                    Image(systemName: "square.grid.3x3")
                        .font(.system(size: 20))
                        .foregroundColor(.cyan)
                    Text("Session Matrix")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                }

                // Sessions grid
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 16) {
                    ForEach(appState.sessions) { session in
                        sessionMatrixCell(session: session)
                    }
                }

                // Close button
                Button {
                    withAnimation {
                        showSessionMatrix = false
                    }
                } label: {
                    Text("Close")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.1))
                        .clipShape(Capsule())
                }
            }
            .padding(24)
        }
    }

    private func sessionMatrixCell(session: TMuxSession) -> some View {
        let isSelected = session.id == appState.selectedSession?.id

        return Button {
            Task { await appState.selectSession(session) }
            HapticManager.shared.selection()
            withAnimation {
                showSessionMatrix = false
            }
        } label: {
            VStack(spacing: 8) {
                // Terminal icon
                Image(systemName: "terminal")
                    .font(.system(size: 28))
                    .foregroundColor(isSelected ? .cyan : .white.opacity(0.7))

                // Session name
                Text(session.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(1)

                // Window count
                Text("\(session.windowCount) windows")
                    .font(.system(size: 10))
                    .foregroundColor(.white.opacity(0.5))
            }
            .frame(width: 100, height: 100)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSelected ? Color.cyan.opacity(0.2) : Color.white.opacity(0.1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isSelected ? Color.cyan : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Prefix Actions
    private func activatePrefix() {
        prefixActive = true
        HapticManager.shared.impact(.medium)

        // Send tmux prefix (Ctrl+B by default)
        onSendKeys("C-b")

        // Auto-deactivate after 2 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            deactivatePrefix()
        }
    }

    private func deactivatePrefix() {
        prefixActive = false
    }
}

// MARK: - Task Anchor View (Scroll marker)
struct TaskAnchorView: View {
    let lineNumber: Int
    let onTap: () -> Void

    @State private var isPulsing: Bool = false

    var body: some View {
        Button(action: onTap) {
            ZStack {
                // Pulse effect
                Circle()
                    .stroke(Color.cyan.opacity(0.5), lineWidth: 2)
                    .frame(width: 32, height: 32)
                    .scaleEffect(isPulsing ? 1.3 : 1.0)
                    .opacity(isPulsing ? 0 : 1)

                // Main circle
                Circle()
                    .fill(Color.cyan)
                    .frame(width: 24, height: 24)

                // Icon (Gemini star or Claude logo could go here)
                Image(systemName: "sparkle")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.black)
            }
        }
        .buttonStyle(.plain)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: false)) {
                isPulsing = true
            }
        }
    }
}

// MARK: - Quick Command Bar
struct QuickCommandBar: View {
    let commands: [QuickCommand]
    let onCommand: (String) -> Void

    struct QuickCommand: Identifiable {
        let id = UUID()
        let label: String
        let command: String
        let icon: String?
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(commands) { cmd in
                    Button {
                        onCommand(cmd.command)
                        HapticManager.shared.commandSent()
                    } label: {
                        HStack(spacing: 6) {
                            if let icon = cmd.icon {
                                Image(systemName: icon)
                                    .font(.system(size: 12))
                            }
                            Text(cmd.label)
                                .font(.system(size: 12, weight: .medium, design: .monospaced))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(Color.white.opacity(0.1))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
        }
    }
}

// MARK: - Preview
#Preview {
    ZStack {
        Color.black.ignoresSafeArea()

        TmuxControlsView(
            onSendKeys: { _ in },
            onSwitchWindow: { _ in }
        )
    }
}
