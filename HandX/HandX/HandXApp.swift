//
//  HandXApp.swift
//  HandX
//
//  Created by Meng Yan on 2025/12/24.
//

import SwiftUI

@main
struct HandXApp: App {
    // Global app state
    @State private var appState = AppState.shared
    @FocusedValue(\.terminalCommands) private var terminalCommands

    var body: some Scene {
        WindowGroup {
            MainView()
                .environment(\.appState, appState)
                .preferredColorScheme(.dark) // Default to dark mode for terminal
        }
        .commands {
            // MARK: - Terminal Commands
            CommandMenu("Terminal") {
                // New Window (Cmd+N)
                Button("New Window") {
                    Task { await appState.createWindow() }
                }
                .keyboardShortcut("n", modifiers: .command)

                // Close Window (Cmd+W)
                Button("Close Window") {
                    if let window = appState.selectedWindow {
                        Task { await appState.closeWindow(window) }
                    }
                }
                .keyboardShortcut("w", modifiers: .command)
                .disabled(appState.selectedWindow == nil)

                Divider()

                // Clear Terminal (Cmd+K)
                Button("Clear Terminal") {
                    appState.terminalOutput = ""
                }
                .keyboardShortcut("k", modifiers: .command)

                // Search (Cmd+F)
                Button("Search") {
                    appState.isSearchActive.toggle()
                }
                .keyboardShortcut("f", modifiers: .command)

                Divider()

                // Refresh Output (Cmd+R)
                Button("Refresh Output") {
                    Task { await appState.captureOutput() }
                }
                .keyboardShortcut("r", modifiers: .command)
            }

            // MARK: - Window Switching Commands
            CommandMenu("Windows") {
                // New Session (Cmd+T)
                Button("New Session") {
                    // This triggers the new session sheet
                    Task { await appState.createSession(name: "New Session") }
                }
                .keyboardShortcut("t", modifiers: .command)

                Divider()

                // Window switching (Cmd+1-9)
                ForEach(1...9, id: \.self) { index in
                    Button("Switch to Window \(index)") {
                        switchToWindow(index: index - 1)
                    }
                    .keyboardShortcut(KeyEquivalent(Character("\(index)")), modifiers: .command)
                }
            }

            // MARK: - Settings Commands
            CommandGroup(replacing: .appSettings) {
                Button("Settings...") {
                    // Settings handled via sheet in MainView
                }
                .keyboardShortcut(",", modifiers: .command)
            }
        }
    }

    private func switchToWindow(index: Int) {
        guard let session = appState.selectedSession else { return }
        if index < session.windows.count {
            let window = session.windows[index]
            Task { await appState.selectWindow(window) }
        }
    }
}
