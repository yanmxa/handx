import SwiftUI

// MARK: - Command Input View (Standalone)
struct CommandInputView: View {
    @Binding var text: String
    let onSubmit: () -> Void
    let onSpecialKey: (String) -> Void

    @FocusState private var isFocused: Bool
    @State private var showQuickKeys: Bool = true

    var body: some View {
        VStack(spacing: 0) {
            // Quick keys (expandable)
            if showQuickKeys {
                QuickKeysBar(onKeyPress: onSpecialKey)
            }

            // Main input area
            HStack(spacing: 12) {
                // Toggle quick keys
                Button {
                    withAnimation(.spring(duration: 0.25)) {
                        showQuickKeys.toggle()
                    }
                } label: {
                    Image(systemName: showQuickKeys ? "keyboard.chevron.compact.down" : "keyboard")
                        .font(.system(size: 18))
                        .foregroundColor(.white.opacity(0.7))
                }

                // Prompt indicator
                Text("$")
                    .font(.system(size: 16, weight: .bold, design: .monospaced))
                    .foregroundColor(.green)

                // Input field
                TextField("", text: $text, prompt: Text("Enter command...").foregroundColor(.gray))
                    .font(.system(size: 15, design: .monospaced))
                    .foregroundColor(.white)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($isFocused)
                    .submitLabel(.send)
                    .onSubmit(onSubmit)

                // Send button
                Button(action: onSubmit) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .foregroundColor(text.isEmpty ? .gray.opacity(0.5) : .blue)
                        .symbolEffect(.bounce, value: text.isEmpty)
                }
                .disabled(text.isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: [Color.black.opacity(0.9), Color.black.opacity(0.95)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
    }
}

// MARK: - Quick Keys Bar
struct QuickKeysBar: View {
    let onKeyPress: (String) -> Void

    private let keyGroups: [[QuickKey]] = [
        [
            QuickKey(label: "Tab", value: "Tab"),
            QuickKey(label: "Esc", value: "Escape"),
        ],
        [
            QuickKey(label: "Ctrl+C", value: "C-c"),
            QuickKey(label: "Ctrl+D", value: "C-d"),
            QuickKey(label: "Ctrl+Z", value: "C-z"),
            QuickKey(label: "Ctrl+L", value: "C-l"),
        ],
        [
            QuickKey(label: "↑", value: "Up"),
            QuickKey(label: "↓", value: "Down"),
            QuickKey(label: "←", value: "Left"),
            QuickKey(label: "→", value: "Right"),
        ],
    ]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(keyGroups.enumerated()), id: \.offset) { groupIndex, group in
                    if groupIndex > 0 {
                        Divider()
                            .frame(height: 20)
                            .background(Color.white.opacity(0.2))
                            .padding(.horizontal, 4)
                    }

                    ForEach(group) { key in
                        QuickKeyButton(key: key, onPress: onKeyPress)
                    }
                }

                Spacer(minLength: 8)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .background(Color.black.opacity(0.7))
    }
}

// MARK: - Quick Key Model
struct QuickKey: Identifiable {
    let id = UUID()
    let label: String
    let value: String
    var icon: String? = nil
}

// MARK: - Quick Key Button
struct QuickKeyButton: View {
    let key: QuickKey
    let onPress: (String) -> Void

    @State private var isPressed: Bool = false

    var body: some View {
        Button {
            HapticManager.shared.impact(.light)
            onPress(key.value)
        } label: {
            HStack(spacing: 4) {
                if let icon = key.icon {
                    Image(systemName: icon)
                        .font(.system(size: 10))
                }
                Text(key.label)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isPressed ? Color.white.opacity(0.3) : Color.white.opacity(0.15))
            )
            .scaleEffect(isPressed ? 0.95 : 1.0)
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    withAnimation(.easeOut(duration: 0.1)) { isPressed = true }
                }
                .onEnded { _ in
                    withAnimation(.easeOut(duration: 0.1)) { isPressed = false }
                }
        )
    }
}

// MARK: - Extended Command Input with History
struct ExtendedCommandInput: View {
    @Binding var text: String
    let history: [String]
    let onSubmit: () -> Void
    let onSpecialKey: (String) -> Void

    @State private var historyIndex: Int = -1
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // History picker (when focused and has history)
            if isFocused && !history.isEmpty {
                historyPicker
            }

            // Quick keys
            QuickKeysBar(onKeyPress: onSpecialKey)

            // Input
            HStack(spacing: 12) {
                Text("$")
                    .font(.system(size: 16, weight: .bold, design: .monospaced))
                    .foregroundColor(.green)

                TextField("", text: $text, prompt: Text("command...").foregroundColor(.gray))
                    .font(.system(size: 15, design: .monospaced))
                    .foregroundColor(.white)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($isFocused)
                    .submitLabel(.send)
                    .onSubmit(onSubmit)

                Button(action: onSubmit) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .foregroundColor(text.isEmpty ? .gray.opacity(0.5) : .blue)
                }
                .disabled(text.isEmpty)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color.black.opacity(0.95))
        }
    }

    private var historyPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(history.prefix(8), id: \.self) { cmd in
                    Button {
                        text = cmd
                        HapticManager.shared.selection()
                    } label: {
                        Text(cmd)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(.white.opacity(0.8))
                            .lineLimit(1)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.white.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Color.black.opacity(0.6))
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

// MARK: - Preview
#Preview {
    VStack {
        Spacer()
        CommandInputView(
            text: .constant("ls -la"),
            onSubmit: {},
            onSpecialKey: { _ in }
        )
    }
    .background(Color.black)
}
