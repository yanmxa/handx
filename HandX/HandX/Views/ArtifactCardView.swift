import SwiftUI

// MARK: - Artifact Card View (Floating Code/Diff Cards)
struct ArtifactCardView: View {
    let artifact: DetectedArtifact
    let onTap: () -> Void
    let onDismiss: () -> Void

    @State private var isExpanded: Bool = false
    @State private var appearOffset: CGFloat = 100
    @State private var appearOpacity: Double = 0

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                // Type icon
                artifactIcon
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(accentColor)

                Text(artifactTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                // Language badge
                if let language = artifact.language {
                    Text(language.uppercased())
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(accentColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(accentColor.opacity(0.2))
                        .clipShape(Capsule())
                }

                // Expand button
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        isExpanded.toggle()
                    }
                    HapticManager.shared.impact(.light)
                } label: {
                    Image(systemName: isExpanded ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                        .frame(width: 28, height: 28)
                        .background(Color.white.opacity(0.1))
                        .clipShape(Circle())
                }

                // Dismiss button
                Button {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        appearOffset = 100
                        appearOpacity = 0
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        onDismiss()
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white.opacity(0.5))
                        .frame(width: 24, height: 24)
                        .background(Color.white.opacity(0.1))
                        .clipShape(Circle())
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            Divider()
                .background(Color.white.opacity(0.1))

            // Code preview
            ScrollView(isExpanded ? [.horizontal, .vertical] : .vertical, showsIndicators: false) {
                Text(artifact.content)
                    .font(.system(size: isExpanded ? 12 : 11, design: .monospaced))
                    .foregroundColor(.white.opacity(0.9))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
            }
            .frame(maxHeight: isExpanded ? 300 : 120)

            Divider()
                .background(Color.white.opacity(0.1))

            // Actions
            HStack(spacing: 12) {
                // Copy button
                Button {
                    UIPasteboard.general.string = artifact.content
                    HapticManager.shared.notification(.success)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 12))
                        Text("Copy")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.15))
                    .clipShape(Capsule())
                }

                // Full screen button
                Button {
                    onTap()
                    HapticManager.shared.impact(.medium)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.forward.square")
                            .font(.system(size: 12))
                        Text("Full Screen")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.black)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(accentColor)
                    .clipShape(Capsule())
                }

                Spacer()

                // Time badge
                Text(timeAgo)
                    .font(.system(size: 10))
                    .foregroundColor(.white.opacity(0.4))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.black.opacity(0.6))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(
                    LinearGradient(
                        colors: [accentColor.opacity(0.5), accentColor.opacity(0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .shadow(color: accentColor.opacity(0.2), radius: 20, x: 0, y: 10)
        .offset(x: appearOffset)
        .opacity(appearOpacity)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                appearOffset = 0
                appearOpacity = 1
            }
        }
    }

    // MARK: - Computed Properties
    private var artifactIcon: Image {
        switch artifact.type {
        case .code:
            return Image(systemName: "chevron.left.forwardslash.chevron.right")
        case .diff:
            return Image(systemName: "plus.forwardslash.minus")
        case .file:
            return Image(systemName: "doc.text")
        case .json:
            return Image(systemName: "curlybraces")
        case .markdown:
            return Image(systemName: "text.alignleft")
        }
    }

    private var artifactTitle: String {
        switch artifact.type {
        case .code:
            return "Code Block"
        case .diff:
            return "File Changes"
        case .file:
            return "File"
        case .json:
            return "JSON"
        case .markdown:
            return "Markdown"
        }
    }

    private var accentColor: Color {
        switch artifact.type {
        case .code:
            return Color(hex: "00FFFF") // Cyan
        case .diff:
            return Color(hex: "50FA7B") // Green
        case .file:
            return Color(hex: "BD93F9") // Purple
        case .json:
            return Color(hex: "FFB86C") // Orange
        case .markdown:
            return Color(hex: "8BE9FD") // Light cyan
        }
    }

    private var timeAgo: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: artifact.timestamp, relativeTo: Date())
    }
}

// MARK: - Artifact Full Screen View
struct ArtifactFullScreenView: View {
    let artifact: DetectedArtifact
    @Environment(\.dismiss) private var dismiss
    @State private var fontSize: CGFloat = 14
    @State private var showCopiedToast: Bool = false

    var body: some View {
        NavigationStack {
            ZStack {
                // Background
                Color.black.ignoresSafeArea()

                // Content
                ScrollView([.horizontal, .vertical], showsIndicators: true) {
                    Text(artifact.content)
                        .font(.system(size: fontSize, design: .monospaced))
                        .foregroundColor(.white)
                        .textSelection(.enabled)
                        .padding()
                        .frame(minWidth: UIScreen.main.bounds.width, alignment: .leading)
                }
                .gesture(
                    MagnificationGesture()
                        .onChanged { scale in
                            let newSize = 14 * scale
                            fontSize = min(max(newSize, 10), 28)
                        }
                )

                // Copied toast
                if showCopiedToast {
                    VStack {
                        Spacer()
                        Text("Copied to clipboard")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 12)
                            .background(Color.green.opacity(0.9))
                            .clipShape(Capsule())
                            .padding(.bottom, 100)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    .animation(.spring(response: 0.3), value: showCopiedToast)
                }
            }
            .navigationTitle(artifact.language?.capitalized ?? "Code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        UIPasteboard.general.string = artifact.content
                        HapticManager.shared.notification(.success)
                        showCopiedToast = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            showCopiedToast = false
                        }
                    } label: {
                        Image(systemName: "doc.on.doc")
                    }
                }
            }
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }
}

// MARK: - Artifact Seed Icon (Mini indicator)
struct ArtifactSeedView: View {
    let count: Int
    let onTap: () -> Void

    @State private var isPulsing: Bool = false

    var body: some View {
        Button(action: onTap) {
            ZStack {
                // Pulse ring
                Circle()
                    .stroke(Color.cyan.opacity(0.3), lineWidth: 2)
                    .frame(width: 44, height: 44)
                    .scaleEffect(isPulsing ? 1.3 : 1.0)
                    .opacity(isPulsing ? 0 : 0.8)

                // Main circle
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.cyan, Color.cyan.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 36, height: 36)
                    .shadow(color: .cyan.opacity(0.5), radius: 8, x: 0, y: 0)

                // Icon
                Image(systemName: "chevron.left.forwardslash.chevron.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.black)

                // Count badge
                if count > 1 {
                    Text("\(count)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(4)
                        .background(Color.red)
                        .clipShape(Circle())
                        .offset(x: 14, y: -14)
                }
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

// MARK: - Preview
#Preview {
    ZStack {
        Color.black.ignoresSafeArea()

        VStack {
            Spacer()

            ArtifactCardView(
                artifact: DetectedArtifact(
                    type: .code,
                    content: """
                    func calculateSum(_ numbers: [Int]) -> Int {
                        return numbers.reduce(0, +)
                    }

                    let result = calculateSum([1, 2, 3, 4, 5])
                    print("Sum: \\(result)")
                    """,
                    language: "swift",
                    lineRange: 0..<10,
                    timestamp: Date()
                ),
                onTap: {},
                onDismiss: {}
            )
            .padding()

            Spacer()
        }
    }
}
