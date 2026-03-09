import SwiftUI

// MARK: - Terminal Search View
struct TerminalSearchView: View {
    @Environment(\.appState) private var appState
    @Binding var isPresented: Bool
    @FocusState private var isSearchFocused: Bool

    @State private var searchText: String = ""

    var body: some View {
        HStack(spacing: 10) {
            // Search field
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                    .font(.system(size: 14))

                TextField("Search...", text: $searchText)
                    .font(.system(size: 14))
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($isSearchFocused)
                    .submitLabel(.search)
                    .onSubmit {
                        performSearch()
                    }
                    .onChange(of: searchText) { _, newValue in
                        appState.searchTerminalOutput(query: newValue)
                    }

                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                        appState.clearSearch()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                            .font(.system(size: 14))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(UIColor.tertiarySystemBackground))
            )

            // Match count & navigation
            if !appState.searchMatches.isEmpty {
                HStack(spacing: 4) {
                    Text("\(appState.currentSearchIndex + 1)/\(appState.searchMatches.count)")
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)
                        .frame(minWidth: 40)

                    Button {
                        appState.previousSearchMatch()
                        HapticManager.shared.selection()
                    } label: {
                        Image(systemName: "chevron.up")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.primary)
                            .frame(width: 28, height: 28)
                            .background(Color(UIColor.tertiarySystemBackground))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)

                    Button {
                        appState.nextSearchMatch()
                        HapticManager.shared.selection()
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.primary)
                            .frame(width: 28, height: 28)
                            .background(Color(UIColor.tertiarySystemBackground))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
            } else if !searchText.isEmpty {
                Text("No matches")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            // Close button
            Button {
                closeSearch()
            } label: {
                Text("Done")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.blue)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .onAppear {
            isSearchFocused = true
        }
    }

    private func performSearch() {
        appState.searchTerminalOutput(query: searchText)
    }

    private func closeSearch() {
        searchText = ""
        appState.clearSearch()
        isPresented = false
    }
}

// MARK: - Search Highlight Modifier
struct SearchHighlightModifier: ViewModifier {
    let text: String
    let searchQuery: String
    let matches: [Range<String.Index>]
    let currentIndex: Int
    let highlightColor: Color
    let currentMatchColor: Color

    func body(content: Content) -> some View {
        content
        // Note: Actual highlighting would require custom text rendering
        // This is a placeholder for the concept
    }
}

// MARK: - Highlighted Text View
struct HighlightedTextView: View {
    let text: String
    let searchQuery: String
    let matches: [Range<String.Index>]
    let currentIndex: Int
    let baseFont: Font
    let foregroundColor: Color
    let highlightColor: Color
    let currentHighlightColor: Color

    var body: some View {
        if searchQuery.isEmpty || matches.isEmpty {
            Text(text)
                .font(baseFont)
                .foregroundColor(foregroundColor)
        } else {
            highlightedText
        }
    }

    private var highlightedText: some View {
        var attributedString = AttributedString(text)

        // Apply highlights to all matches
        for (index, range) in matches.enumerated() {
            if let attrRange = Range(range, in: attributedString) {
                let bgColor = index == currentIndex ? currentHighlightColor : highlightColor
                attributedString[attrRange].backgroundColor = bgColor
                attributedString[attrRange].foregroundColor = .black
            }
        }

        return Text(attributedString)
            .font(baseFont)
            .foregroundColor(foregroundColor)
    }
}

// MARK: - Preview
#Preview {
    VStack {
        TerminalSearchView(isPresented: .constant(true))
        Spacer()
    }
}
