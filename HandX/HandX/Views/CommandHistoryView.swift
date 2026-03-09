import SwiftUI

// MARK: - Command History Sheet View
struct CommandHistoryView: View {
    @Environment(\.appState) private var appState
    @Environment(\.dismiss) private var dismiss

    @Binding var selectedCommand: String
    @State private var searchText: String = ""
    @State private var previewCommand: String? = nil

    var filteredCommands: [String] {
        if searchText.isEmpty {
            return appState.commandHistory.commands
        }
        return appState.commandHistory.commands.filter {
            $0.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if appState.commandHistory.isEmpty {
                    emptyStateView
                } else {
                    commandListView
                }
            }
            .navigationTitle("Command History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .topBarLeading) {
                    if !appState.commandHistory.isEmpty {
                        EditButton()
                    }
                }
            }
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Filter commands")
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .sheet(item: Binding(
            get: { previewCommand.map { PreviewItem(command: $0) } },
            set: { previewCommand = $0?.command }
        )) { item in
            commandPreviewSheet(command: item.command)
        }
    }

    // MARK: - Empty State
    private var emptyStateView: some View {
        ContentUnavailableView(
            "No Command History",
            systemImage: "clock.arrow.circlepath",
            description: Text("Commands you execute will appear here")
        )
    }

    // MARK: - Command List
    private var commandListView: some View {
        List {
            ForEach(filteredCommands, id: \.self) { command in
                commandRow(command: command)
            }
            .onDelete(perform: deleteCommands)
        }
        .listStyle(.plain)
    }

    private func commandRow(command: String) -> some View {
        Button {
            selectCommand(command)
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(command)
                        .font(.system(size: 14, design: .monospaced))
                        .foregroundColor(.primary)
                        .lineLimit(2)

                    // Show truncation indicator for long commands
                    if command.count > 50 {
                        Text("Tap to insert, hold to preview")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                selectCommand(command)
            } label: {
                Label("Insert", systemImage: "text.insert")
            }

            Button {
                previewCommand = command
            } label: {
                Label("Preview", systemImage: "eye")
            }

            Button {
                UIPasteboard.general.string = command
                HapticManager.shared.notification(.success)
            } label: {
                Label("Copy", systemImage: "doc.on.doc")
            }

            Divider()

            Button(role: .destructive) {
                deleteCommand(command)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5)
                .onEnded { _ in
                    previewCommand = command
                    HapticManager.shared.impact(.medium)
                }
        )
    }

    // MARK: - Command Preview Sheet
    private func commandPreviewSheet(command: String) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Full command display
                    Text(command)
                        .font(.system(size: 14, design: .monospaced))
                        .textSelection(.enabled)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(UIColor.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                    // Actions
                    HStack(spacing: 12) {
                        Button {
                            selectCommand(command)
                            previewCommand = nil
                        } label: {
                            Label("Insert", systemImage: "text.insert")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)

                        Button {
                            UIPasteboard.general.string = command
                            HapticManager.shared.notification(.success)
                        } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding()
            }
            .navigationTitle("Command Preview")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        previewCommand = nil
                    }
                }
            }
        }
        .presentationDetents([.height(250)])
    }

    // MARK: - Actions
    private func selectCommand(_ command: String) {
        selectedCommand = command
        HapticManager.shared.selection()
        dismiss()
    }

    private func deleteCommand(_ command: String) {
        appState.commandHistory.commands.removeAll { $0 == command }
        HapticManager.shared.notification(.warning)
    }

    private func deleteCommands(at offsets: IndexSet) {
        // Get the actual commands to delete based on filtered list
        let commandsToDelete = offsets.map { filteredCommands[$0] }
        appState.commandHistory.commands.removeAll { commandsToDelete.contains($0) }
        HapticManager.shared.notification(.warning)
    }
}

// MARK: - Preview Item
struct PreviewItem: Identifiable {
    let id = UUID()
    let command: String
}

// MARK: - Preview
#Preview {
    CommandHistoryView(selectedCommand: .constant(""))
}
