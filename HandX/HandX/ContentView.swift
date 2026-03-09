//
//  ContentView.swift
//  HandX
//
//  Created by Meng Yan on 2025/12/24.
//

import SwiftUI

// ContentView is replaced by MainView
// This file is kept for compatibility

struct ContentView: View {
    var body: some View {
        MainView()
            .environment(\.appState, AppState.shared)
    }
}

#Preview {
    ContentView()
        .preferredColorScheme(.dark)
}
