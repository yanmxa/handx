import SwiftUI

// MARK: - Simplified Quick Keys View
struct QuickKeysView: View {
    @Environment(\.appState) private var appState
    let onKeyPress: (String) -> Void
    let onHistorySelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Options group (for Claude Code multi-choice)
                optionButton("1", key: "1")
                optionButton("2", key: "2")
                optionButton("3", key: "3")

                divider

                // Navigation group
                keyButton("Tab", key: "Tab")
                keyButton("↑", key: "Up")
                keyButton("↓", key: "Down")

                divider

                // Control group
                keyButton("^C", key: "C-c")
                keyButton("Esc", key: "Escape")
                keyButton("Enter", key: "Enter", isPrimary: true)

                Spacer(minLength: 8)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Color.black.opacity(0.85))
    }

    // MARK: - Option Button (numbered)
    private func optionButton(_ label: String, key: String) -> some View {
        Button {
            HapticManager.shared.impact(.light)
            onKeyPress(key)
        } label: {
            Text(label)
                .font(.system(size: 16, weight: .semibold, design: .monospaced))
                .foregroundColor(.cyan)
                .frame(minWidth: 40, minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.cyan.opacity(0.15))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.cyan.opacity(0.3), lineWidth: 1)
                        )
                )
        }
        .buttonStyle(ScaleButtonStyle())
    }

    // MARK: - Key Button
    private func keyButton(_ label: String, key: String, isPrimary: Bool = false) -> some View {
        Button {
            HapticManager.shared.impact(.light)
            onKeyPress(key)
        } label: {
            Text(label)
                .font(.system(size: 16, weight: .medium, design: .monospaced))
                .foregroundColor(isPrimary ? .black : .white.opacity(0.9))
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(isPrimary ? Color.cyan : Color.white.opacity(0.15))
                )
        }
        .buttonStyle(ScaleButtonStyle())
    }

    // MARK: - Divider
    private var divider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.2))
            .frame(width: 1, height: 28)
            .padding(.horizontal, 4)
    }
}

// MARK: - Scale Button Style
struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Preview
#Preview {
    VStack {
        Spacer()
        QuickKeysView(
            onKeyPress: { _ in },
            onHistorySelect: { _ in }
        )
    }
    .background(Color.black)
}
