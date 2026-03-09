import SwiftUI

// MARK: - Terminal Theme
struct TerminalTheme: Identifiable, Equatable {
    let id: String
    let name: String
    let background: Color
    let foreground: Color
    let cursor: Color
    let selection: Color
    let colors: [Color] // 16 ANSI colors

    static let dark = TerminalTheme(
        id: "dark",
        name: "Dark",
        background: Color(hex: "0D0D0D"),
        foreground: Color(hex: "E5E5E5"),
        cursor: Color(hex: "FFFFFF"),
        selection: Color(hex: "3D4450"),
        colors: ANSIParser.standardColors
    )

    static let light = TerminalTheme(
        id: "light",
        name: "Light",
        background: Color(hex: "FFFFFF"),
        foreground: Color(hex: "1A1A1A"),
        cursor: Color(hex: "000000"),
        selection: Color(hex: "B4D5FE"),
        colors: ANSIParser.lightColors
    )

    static let solarizedDark = TerminalTheme(
        id: "solarized_dark",
        name: "Solarized Dark",
        background: Color(hex: "002B36"),
        foreground: Color(hex: "839496"),
        cursor: Color(hex: "93A1A1"),
        selection: Color(hex: "073642"),
        colors: [
            Color(hex: "073642"), // Black
            Color(hex: "DC322F"), // Red
            Color(hex: "859900"), // Green
            Color(hex: "B58900"), // Yellow
            Color(hex: "268BD2"), // Blue
            Color(hex: "D33682"), // Magenta
            Color(hex: "2AA198"), // Cyan
            Color(hex: "EEE8D5"), // White
            Color(hex: "002B36"), // Bright Black
            Color(hex: "CB4B16"), // Bright Red
            Color(hex: "586E75"), // Bright Green
            Color(hex: "657B83"), // Bright Yellow
            Color(hex: "839496"), // Bright Blue
            Color(hex: "6C71C4"), // Bright Magenta
            Color(hex: "93A1A1"), // Bright Cyan
            Color(hex: "FDF6E3"), // Bright White
        ]
    )

    static let dracula = TerminalTheme(
        id: "dracula",
        name: "Dracula",
        background: Color(hex: "282A36"),
        foreground: Color(hex: "F8F8F2"),
        cursor: Color(hex: "F8F8F2"),
        selection: Color(hex: "44475A"),
        colors: [
            Color(hex: "21222C"), // Black
            Color(hex: "FF5555"), // Red
            Color(hex: "50FA7B"), // Green
            Color(hex: "F1FA8C"), // Yellow
            Color(hex: "BD93F9"), // Blue
            Color(hex: "FF79C6"), // Magenta
            Color(hex: "8BE9FD"), // Cyan
            Color(hex: "F8F8F2"), // White
            Color(hex: "6272A4"), // Bright Black
            Color(hex: "FF6E6E"), // Bright Red
            Color(hex: "69FF94"), // Bright Green
            Color(hex: "FFFFA5"), // Bright Yellow
            Color(hex: "D6ACFF"), // Bright Blue
            Color(hex: "FF92DF"), // Bright Magenta
            Color(hex: "A4FFFF"), // Bright Cyan
            Color(hex: "FFFFFF"), // Bright White
        ]
    )

    static let nord = TerminalTheme(
        id: "nord",
        name: "Nord",
        background: Color(hex: "2E3440"),
        foreground: Color(hex: "D8DEE9"),
        cursor: Color(hex: "D8DEE9"),
        selection: Color(hex: "434C5E"),
        colors: [
            Color(hex: "3B4252"), // Black
            Color(hex: "BF616A"), // Red
            Color(hex: "A3BE8C"), // Green
            Color(hex: "EBCB8B"), // Yellow
            Color(hex: "81A1C1"), // Blue
            Color(hex: "B48EAD"), // Magenta
            Color(hex: "88C0D0"), // Cyan
            Color(hex: "E5E9F0"), // White
            Color(hex: "4C566A"), // Bright Black
            Color(hex: "BF616A"), // Bright Red
            Color(hex: "A3BE8C"), // Bright Green
            Color(hex: "EBCB8B"), // Bright Yellow
            Color(hex: "81A1C1"), // Bright Blue
            Color(hex: "B48EAD"), // Bright Magenta
            Color(hex: "8FBCBB"), // Bright Cyan
            Color(hex: "ECEFF4"), // Bright White
        ]
    )

    // OLED Black - True black for OLED power saving and immersion
    static let oledBlack = TerminalTheme(
        id: "oled_black",
        name: "OLED Black",
        background: Color(hex: "000000"),
        foreground: Color(hex: "E0E0E0"),
        cursor: Color(hex: "00FFFF"), // Cyan glow cursor
        selection: Color(hex: "1A3A4A"),
        colors: [
            Color(hex: "000000"), // Black
            Color(hex: "FF5555"), // Red
            Color(hex: "50FA7B"), // Green
            Color(hex: "F1FA8C"), // Yellow
            Color(hex: "00FFFF"), // Cyan (instead of blue for better contrast)
            Color(hex: "FF79C6"), // Magenta
            Color(hex: "8BE9FD"), // Cyan
            Color(hex: "F8F8F2"), // White
            Color(hex: "4D4D4D"), // Bright Black
            Color(hex: "FF6E6E"), // Bright Red
            Color(hex: "69FF94"), // Bright Green
            Color(hex: "FFFFA5"), // Bright Yellow
            Color(hex: "00FFFF"), // Bright Cyan
            Color(hex: "FF92DF"), // Bright Magenta
            Color(hex: "A4FFFF"), // Bright Cyan
            Color(hex: "FFFFFF"), // Bright White
        ]
    )

    // Neural - Cyberpunk-inspired theme for AI CLI
    static let neural = TerminalTheme(
        id: "neural",
        name: "Neural",
        background: Color(hex: "0A0E14"),
        foreground: Color(hex: "B3B1AD"),
        cursor: Color(hex: "00FFFF"),
        selection: Color(hex: "1A2634"),
        colors: [
            Color(hex: "0A0E14"), // Black
            Color(hex: "FF3333"), // Red
            Color(hex: "00FF9F"), // Matrix Green
            Color(hex: "FFB454"), // Orange-Yellow
            Color(hex: "00BFFF"), // Deep Sky Blue
            Color(hex: "FF00FF"), // Magenta
            Color(hex: "00FFFF"), // Cyan
            Color(hex: "FFFFFF"), // White
            Color(hex: "3D4F5F"), // Bright Black
            Color(hex: "FF6666"), // Bright Red
            Color(hex: "00FFAA"), // Bright Green
            Color(hex: "FFD700"), // Gold
            Color(hex: "59C2FF"), // Bright Blue
            Color(hex: "FF79C6"), // Bright Magenta
            Color(hex: "95E6CB"), // Bright Cyan
            Color(hex: "FFFFFF"), // Bright White
        ]
    )

    static let allThemes: [TerminalTheme] = [dark, light, solarizedDark, dracula, nord, oledBlack, neural]
}

// MARK: - App Theme
struct AppTheme {
    // Primary colors
    static let primary = Color.blue
    static let secondary = Color.gray

    // Status colors
    static let success = Color.green
    static let warning = Color.yellow
    static let error = Color.red

    // Background colors
    static let backgroundPrimary = Color(UIColor.systemBackground)
    static let backgroundSecondary = Color(UIColor.secondarySystemBackground)
    static let backgroundTertiary = Color(UIColor.tertiarySystemBackground)

    // Text colors
    static let textPrimary = Color(UIColor.label)
    static let textSecondary = Color(UIColor.secondaryLabel)
    static let textTertiary = Color(UIColor.tertiaryLabel)

    // Borders
    static let border = Color(UIColor.separator)
    static let borderLight = Color(UIColor.opaqueSeparator)
}

// MARK: - Theme Manager
@Observable
final class ThemeManager {
    static let shared = ThemeManager()

    var terminalTheme: TerminalTheme = .dark
    var fontSize: CGFloat = 14
    var lineHeight: CGFloat = 1.2

    @ObservationIgnored
    @AppStorage("handx_terminal_theme") private var themeId: String = "dark"

    private init() {
        // Load saved theme
        if let theme = TerminalTheme.allThemes.first(where: { $0.id == themeId }) {
            terminalTheme = theme
        }
    }

    func setTheme(_ theme: TerminalTheme) {
        terminalTheme = theme
        themeId = theme.id
    }

    var terminalFont: Font {
        .system(size: fontSize, weight: .regular, design: .monospaced)
    }

    var terminalUIFont: UIFont {
        UIFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)
    }
}

// MARK: - Haptic Feedback
final class HapticManager {
    static let shared = HapticManager()

    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let impactHeavy = UIImpactFeedbackGenerator(style: .heavy)
    private let impactSoft = UIImpactFeedbackGenerator(style: .soft)
    private let impactRigid = UIImpactFeedbackGenerator(style: .rigid)
    private let notificationGenerator = UINotificationFeedbackGenerator()
    private let selectionGenerator = UISelectionFeedbackGenerator()

    private init() {
        // Prepare generators
        impactLight.prepare()
        impactMedium.prepare()
        impactHeavy.prepare()
        impactSoft.prepare()
        impactRigid.prepare()
        notificationGenerator.prepare()
        selectionGenerator.prepare()
    }

    func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) {
        switch style {
        case .light:
            impactLight.impactOccurred()
        case .medium:
            impactMedium.impactOccurred()
        case .heavy:
            impactHeavy.impactOccurred()
        case .soft:
            impactSoft.impactOccurred()
        case .rigid:
            impactRigid.impactOccurred()
        @unknown default:
            impactMedium.impactOccurred()
        }
    }

    func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        notificationGenerator.notificationOccurred(type)
    }

    func selection() {
        selectionGenerator.selectionChanged()
    }

    // MARK: - Custom Haptic Patterns

    /// Triple tap pattern for connection success
    func connectionSuccess() {
        Task { @MainActor in
            impactLight.impactOccurred()
            try? await Task.sleep(nanoseconds: 80_000_000)
            impactLight.impactOccurred()
            try? await Task.sleep(nanoseconds: 80_000_000)
            impactLight.impactOccurred()
        }
    }

    /// Warning pattern for errors
    func warningPattern() {
        Task { @MainActor in
            impactHeavy.impactOccurred()
            try? await Task.sleep(nanoseconds: 100_000_000)
            impactMedium.impactOccurred()
        }
    }

    /// Soft feedback for window/tab switch
    func windowSwitch() {
        impactSoft.impactOccurred()
    }

    /// Command sent feedback
    func commandSent() {
        impactLight.impactOccurred(intensity: 0.6)
    }

    /// Scroll boundary feedback
    func scrollBoundary() {
        impactRigid.impactOccurred(intensity: 0.4)
    }
}
