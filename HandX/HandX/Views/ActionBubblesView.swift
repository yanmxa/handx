import SwiftUI

// MARK: - Action Bubbles View (Smart Confirmation Buttons)
struct ActionBubblesView: View {
    let patternType: AIPatternType
    let onConfirm: (String) -> Void
    let onDismiss: () -> Void

    @State private var appearScale: CGFloat = 0.8
    @State private var appearOpacity: Double = 0
    @State private var selectedOption: String? = nil

    var body: some View {
        VStack(spacing: 12) {
            // Question/Context
            if let question = extractQuestion() {
                Text(question)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.8))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .padding(.horizontal, 20)
            }

            // Action buttons based on pattern type
            switch patternType {
            case .yesNoPrompt:
                yesNoButtons

            case .multiChoicePrompt(let options):
                multiChoiceButtons(options: options)

            case .toolExecution(let tool, let status):
                toolExecutionView(tool: tool, status: status)

            case .errorMessage(let message):
                errorView(message: message)

            default:
                EmptyView()
            }
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(.ultraThinMaterial)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color.black.opacity(0.7))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: -10)
        .scaleEffect(appearScale)
        .opacity(appearOpacity)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                appearScale = 1.0
                appearOpacity = 1.0
            }
            HapticManager.shared.notification(.warning)
        }
    }

    // MARK: - Yes/No Buttons
    private var yesNoButtons: some View {
        HStack(spacing: 16) {
            // REJECT Button
            ActionBubbleButton(
                title: "REJECT",
                icon: "xmark",
                style: .destructive,
                isSelected: selectedOption == "n"
            ) {
                selectedOption = "n"
                sendResponse("n")
            }

            // APPLY Button
            ActionBubbleButton(
                title: "APPLY",
                icon: "checkmark",
                style: .primary,
                isSelected: selectedOption == "y"
            ) {
                selectedOption = "y"
                sendResponse("y")
            }
        }
    }

    // MARK: - Multi-Choice Buttons
    private func multiChoiceButtons(options: [String]) -> some View {
        VStack(spacing: 8) {
            ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                multiChoiceButtonRow(index: index, option: option)
            }
        }
    }

    @ViewBuilder
    private func multiChoiceButtonRow(index: Int, option: String) -> some View {
        let optionKey = "\(index + 1)"
        let isSelected = selectedOption == optionKey
        let bgColor: Color = isSelected ? Color.cyan.opacity(0.2) : Color.white.opacity(0.1)
        let borderColor: Color = isSelected ? Color.cyan : Color.clear

        Button {
            selectedOption = optionKey
            sendResponse(optionKey)
        } label: {
            HStack {
                Text("[\(optionKey)]")
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundColor(.cyan)
                    .frame(width: 30)

                Text(option)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(1)

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.cyan)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(bgColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(borderColor, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Tool Execution View
    private func toolExecutionView(tool: String, status: AIPatternType.ToolStatus) -> some View {
        HStack(spacing: 12) {
            // Status indicator
            Group {
                switch status {
                case .running:
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .cyan))
                        .scaleEffect(0.8)
                case .completed:
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                case .failed:
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.red)
                }
            }
            .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(statusText(for: status))
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.6))

                Text(tool)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white)
            }

            Spacer()

            // Dismiss button
            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white.opacity(0.5))
                    .frame(width: 28, height: 28)
                    .background(Color.white.opacity(0.1))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Error View
    private func errorView(message: String) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.red)
                Text("Error")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.red)
            }

            Text(message)
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(.white.opacity(0.8))
                .multilineTextAlignment(.center)
                .lineLimit(3)

            Button {
                onDismiss()
            } label: {
                Text("Dismiss")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.15))
                    .clipShape(Capsule())
            }
        }
    }

    // MARK: - Helpers
    private func extractQuestion() -> String? {
        switch patternType {
        case .yesNoPrompt(let question):
            // Clean up the question
            return question
                .replacingOccurrences(of: "(y/n)", with: "")
                .replacingOccurrences(of: "[y/n]", with: "")
                .replacingOccurrences(of: "[Y/n]", with: "")
                .trimmingCharacters(in: .whitespaces)
        case .multiChoicePrompt:
            return "Select an option:"
        default:
            return nil
        }
    }

    private func statusText(for status: AIPatternType.ToolStatus) -> String {
        switch status {
        case .running: return "Running tool..."
        case .completed: return "Tool completed"
        case .failed: return "Tool failed"
        }
    }

    private func sendResponse(_ response: String) {
        HapticManager.shared.connectionSuccess()

        // Animate out then send
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            appearScale = 0.9
            appearOpacity = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            onConfirm(response)
        }
    }
}

// MARK: - Action Bubble Button
struct ActionBubbleButton: View {
    let title: String
    let icon: String
    let style: ButtonStyle
    let isSelected: Bool
    let action: () -> Void

    @State private var isPressed: Bool = false

    enum ButtonStyle {
        case primary
        case destructive
        case secondary
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .bold))

                Text(title)
                    .font(.system(size: 16, weight: .bold))
            }
            .foregroundColor(foregroundColor)
            .frame(minWidth: 120)
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
            .background(
                ZStack {
                    // Glow effect
                    if style == .primary {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(glowColor.opacity(0.3))
                            .blur(radius: 8)
                            .offset(y: 4)
                    }

                    // Main background
                    RoundedRectangle(cornerRadius: 14)
                        .fill(
                            LinearGradient(
                                colors: gradientColors,
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(borderColor, lineWidth: 1)
            )
            .scaleEffect(isPressed ? 0.95 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: isPressed)
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }

    private var foregroundColor: Color {
        switch style {
        case .primary:
            return .black
        case .destructive:
            return .white
        case .secondary:
            return .white
        }
    }

    private var gradientColors: [Color] {
        switch style {
        case .primary:
            return [Color(hex: "00FFFF"), Color(hex: "00D4AA")]
        case .destructive:
            return [Color(hex: "FF4444"), Color(hex: "CC0000")]
        case .secondary:
            return [Color.white.opacity(0.2), Color.white.opacity(0.1)]
        }
    }

    private var glowColor: Color {
        switch style {
        case .primary:
            return Color(hex: "00FFFF")
        case .destructive:
            return Color(hex: "FF4444")
        case .secondary:
            return .clear
        }
    }

    private var borderColor: Color {
        switch style {
        case .primary:
            return Color(hex: "00FFFF").opacity(0.5)
        case .destructive:
            return Color(hex: "FF4444").opacity(0.5)
        case .secondary:
            return Color.white.opacity(0.2)
        }
    }
}

// MARK: - Thinking Indicator View
struct ThinkingIndicatorView: View {
    @State private var dotOffset: CGFloat = 0
    @State private var glowOpacity: Double = 0.3

    var body: some View {
        HStack(spacing: 12) {
            // AI thinking animation
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Color.cyan)
                        .frame(width: 8, height: 8)
                        .offset(y: index == Int(dotOffset) ? -4 : 0)
                        .animation(
                            .easeInOut(duration: 0.4)
                                .repeatForever()
                                .delay(Double(index) * 0.15),
                            value: dotOffset
                        )
                }
            }

            Text("AI is thinking...")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white.opacity(0.7))

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.cyan.opacity(0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.cyan.opacity(glowOpacity), lineWidth: 1)
                )
        )
        .onAppear {
            withAnimation(.linear(duration: 0.6).repeatForever(autoreverses: false)) {
                dotOffset = 3
            }
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                glowOpacity = 0.8
            }
        }
    }
}

// MARK: - Preview
#Preview {
    ZStack {
        Color.black.ignoresSafeArea()

        VStack(spacing: 40) {
            ActionBubblesView(
                patternType: .yesNoPrompt(question: "Would you like to apply this change? (y/n)"),
                onConfirm: { _ in },
                onDismiss: {}
            )
            .padding(.horizontal)

            ThinkingIndicatorView()
                .padding(.horizontal)
        }
    }
}
