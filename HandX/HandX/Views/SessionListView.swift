import SwiftUI

// MARK: - Session List View
struct SessionListView: View {
    @Environment(\.appState) private var appState
    @State private var showCreateSheet: Bool = false
    @State private var newSessionName: String = ""
    @State private var sessionToRename: TMuxSession?
    @State private var renameText: String = ""
    @State private var sessionToDelete: TMuxSession?
    @State private var isRefreshing: Bool = false
    @State private var refreshSuccess: Bool = false

    var body: some View {
        NavigationStack {
            Group {
                if appState.sessions.isEmpty {
                    emptyStateView
                } else {
                    sessionListView
                }
            }
            .navigationTitle("Sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .disabled(!appState.connectionState.isConnected)
                }

                ToolbarItem(placement: .topBarLeading) {
                    connectionStatusButton
                }
            }
            .refreshable {
                await performRefresh()
            }
            .sheet(isPresented: $showCreateSheet) {
                createSessionSheet
            }
            .sheet(item: $sessionToRename) { session in
                renameSessionSheet(session: session)
            }
            .confirmationDialog(
                "Delete Session",
                isPresented: .init(
                    get: { sessionToDelete != nil },
                    set: { if !$0 { sessionToDelete = nil } }
                ),
                presenting: sessionToDelete
            ) { session in
                Button("Delete \"\(session.name)\"", role: .destructive) {
                    deleteSession(session)
                }
            } message: { session in
                Text("This will permanently delete the session and all its windows.")
            }
            .onAppear {
                // Start auto-refresh when view appears
                appState.startSessionRefresh()
            }
            .onDisappear {
                // Stop auto-refresh when view disappears
                appState.stopSessionRefresh()
            }
        }
    }

    // MARK: - Pull to Refresh
    private func performRefresh() async {
        isRefreshing = true
        HapticManager.shared.impact(.light)

        await appState.fetchSessions()

        // Simulate slight delay for visual feedback
        try? await Task.sleep(nanoseconds: 300_000_000)

        refreshSuccess = true
        HapticManager.shared.notification(.success)

        // Reset after animation
        try? await Task.sleep(nanoseconds: 500_000_000)
        isRefreshing = false
        refreshSuccess = false
    }

    // MARK: - Empty State
    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "rectangle.stack.badge.plus")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)

            Text("No Sessions")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Create a new session to get started")
                .font(.body)
                .foregroundStyle(.secondary)

            Button {
                showCreateSheet = true
            } label: {
                HStack {
                    Image(systemName: "plus")
                    Text("Create Session")
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(Color.blue)
                .foregroundColor(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .disabled(!appState.connectionState.isConnected)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(UIColor.systemGroupedBackground))
    }

    // MARK: - Session List
    private var sessionListView: some View {
        List {
            ForEach(appState.sessions) { session in
                SessionCard(
                    session: session,
                    isSelected: session.id == appState.selectedSession?.id,
                    onSelect: { selectSession(session) },
                    onRename: { sessionToRename = session; renameText = session.name },
                    onDelete: { sessionToDelete = session }
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .background(Color(UIColor.systemGroupedBackground))
    }

    // MARK: - Connection Status Button
    private var connectionStatusButton: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)

            if let version = appState.serverVersion {
                Text("v\(version)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var statusColor: Color {
        switch appState.connectionState {
        case .connected:
            return .green
        case .connecting, .reconnecting:
            return .yellow
        case .disconnected, .failed:
            return .red
        }
    }

    // MARK: - Create Session Sheet
    private var createSessionSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Session Name", text: $newSessionName)
                        .autocorrectionDisabled()
                } header: {
                    Text("New Session")
                } footer: {
                    Text("Enter a unique name for the new tmux session")
                }
            }
            .navigationTitle("Create Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showCreateSheet = false
                        newSessionName = ""
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        createSession()
                    }
                    .disabled(newSessionName.isEmpty)
                }
            }
        }
        .presentationDetents([.height(200)])
    }

    // MARK: - Rename Session Sheet
    private func renameSessionSheet(session: TMuxSession) -> some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Session Name", text: $renameText)
                        .autocorrectionDisabled()
                } header: {
                    Text("Rename Session")
                } footer: {
                    Text("Current name: \(session.name)")
                }
            }
            .navigationTitle("Rename")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        sessionToRename = nil
                        renameText = ""
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        renameSession(session)
                    }
                    .disabled(renameText.isEmpty || renameText == session.name)
                }
            }
        }
        .presentationDetents([.height(200)])
    }

    // MARK: - Actions
    private func selectSession(_ session: TMuxSession) {
        HapticManager.shared.selection()
        Task {
            await appState.selectSession(session)
        }
    }

    private func createSession() {
        let name = newSessionName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }

        HapticManager.shared.impact(.light)
        Task {
            await appState.createSession(name: name)
        }

        showCreateSheet = false
        newSessionName = ""
    }

    private func renameSession(_ session: TMuxSession) {
        let name = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name != session.name else { return }

        HapticManager.shared.impact(.light)
        Task {
            await appState.renameSession(session, newName: name)
        }

        sessionToRename = nil
        renameText = ""
    }

    private func deleteSession(_ session: TMuxSession) {
        HapticManager.shared.notification(.warning)
        Task {
            await appState.deleteSession(session)
        }
        sessionToDelete = nil
    }
}

// MARK: - Session Card Component
struct SessionCard: View {
    let session: TMuxSession
    let isSelected: Bool
    let onSelect: () -> Void
    let onRename: () -> Void
    let onDelete: () -> Void

    @State private var isPressed: Bool = false
    @State private var appearScale: CGFloat = 0.9
    @State private var appearOpacity: Double = 0

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                onSelect()
            }
        }) {
            HStack(spacing: 14) {
                // Icon with pulse animation for attached sessions
                ZStack {
                    // Pulse ring for attached sessions
                    if session.attached {
                        Circle()
                            .stroke(Color.green.opacity(0.3), lineWidth: 2)
                            .frame(width: 50, height: 50)
                            .scaleEffect(isSelected ? 1.2 : 1.0)
                            .opacity(isSelected ? 0.5 : 0)
                            .animation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true), value: isSelected)
                    }

                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSelected ? Color.blue : Color.secondary.opacity(0.2))
                        .frame(width: 44, height: 44)

                    Image(systemName: "terminal")
                        .font(.system(size: 20))
                        .foregroundColor(isSelected ? .white : .primary)
                        .symbolEffect(.bounce, value: isSelected)
                }

                // Info
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.name)
                        .font(.headline)
                        .foregroundColor(.primary)

                    HStack(spacing: 8) {
                        Label("\(session.windowCount)", systemImage: "square.on.square")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        if session.attached {
                            HStack(spacing: 3) {
                                Circle()
                                    .fill(Color.green)
                                    .frame(width: 6, height: 6)
                                Text("attached")
                                    .font(.caption2)
                            }
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.green.opacity(0.15))
                            .foregroundColor(.green)
                            .clipShape(Capsule())
                        }

                        Text(session.formattedCreatedDate)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }

                Spacer()

                // Selection indicator with animation
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.blue)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(UIColor.secondarySystemGroupedBackground))
                    .shadow(
                        color: isSelected ? .blue.opacity(0.25) : .black.opacity(0.05),
                        radius: isSelected ? 8 : 4,
                        x: 0,
                        y: isSelected ? 4 : 2
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 2)
            )
            .scaleEffect(isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: isPressed)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                onRename()
            } label: {
                Label("Rename", systemImage: "pencil")
            }

            Button(role: .destructive) {
                onDelete()
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !isPressed {
                        isPressed = true
                    }
                }
                .onEnded { _ in
                    isPressed = false
                }
        )
        .scaleEffect(appearScale)
        .opacity(appearOpacity)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7).delay(Double.random(in: 0...0.1))) {
                appearScale = 1.0
                appearOpacity = 1.0
            }
        }
    }
}

#Preview {
    SessionListView()
}
