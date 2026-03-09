import SwiftUI

// MARK: - ANSI Parser
final class ANSIParser {
    // MARK: - Standard 16 Colors
    static let standardColors: [Color] = [
        Color(hex: "000000"), // 0: Black
        Color(hex: "CC0000"), // 1: Red
        Color(hex: "00CC00"), // 2: Green
        Color(hex: "CCCC00"), // 3: Yellow
        Color(hex: "0000CC"), // 4: Blue
        Color(hex: "CC00CC"), // 5: Magenta
        Color(hex: "00CCCC"), // 6: Cyan
        Color(hex: "CCCCCC"), // 7: White
        Color(hex: "666666"), // 8: Bright Black
        Color(hex: "FF0000"), // 9: Bright Red
        Color(hex: "00FF00"), // 10: Bright Green
        Color(hex: "FFFF00"), // 11: Bright Yellow
        Color(hex: "0000FF"), // 12: Bright Blue
        Color(hex: "FF00FF"), // 13: Bright Magenta
        Color(hex: "00FFFF"), // 14: Bright Cyan
        Color(hex: "FFFFFF"), // 15: Bright White
    ]

    // MARK: - Light Theme Colors
    static let lightColors: [Color] = [
        Color(hex: "000000"), // 0: Black
        Color(hex: "C91B00"), // 1: Red
        Color(hex: "00C200"), // 2: Green
        Color(hex: "C7C400"), // 3: Yellow
        Color(hex: "0225C7"), // 4: Blue
        Color(hex: "CA30C7"), // 5: Magenta
        Color(hex: "00C5C7"), // 6: Cyan
        Color(hex: "C7C7C7"), // 7: White
        Color(hex: "676767"), // 8: Bright Black
        Color(hex: "FF6D67"), // 9: Bright Red
        Color(hex: "5FF967"), // 10: Bright Green
        Color(hex: "FEFB67"), // 11: Bright Yellow
        Color(hex: "6871FF"), // 12: Bright Blue
        Color(hex: "FF76FF"), // 13: Bright Magenta
        Color(hex: "5FFDFF"), // 14: Bright Cyan
        Color(hex: "FEFFFF"), // 15: Bright White
    ]

    // MARK: - 256 Color Palette
    static func color256(_ code: Int) -> Color {
        if code < 16 {
            return standardColors[code]
        } else if code < 232 {
            // 216 colors: 6x6x6 cube
            let index = code - 16
            let b = index % 6
            let g = (index / 6) % 6
            let r = index / 36

            let red = r == 0 ? 0 : (r * 40 + 55)
            let green = g == 0 ? 0 : (g * 40 + 55)
            let blue = b == 0 ? 0 : (b * 40 + 55)

            return Color(
                red: Double(red) / 255.0,
                green: Double(green) / 255.0,
                blue: Double(blue) / 255.0
            )
        } else {
            // 24 grayscale colors
            let gray = (code - 232) * 10 + 8
            return Color(
                red: Double(gray) / 255.0,
                green: Double(gray) / 255.0,
                blue: Double(gray) / 255.0
            )
        }
    }

    // MARK: - Parse State
    private struct TextStyle {
        var foregroundColor: Color?
        var backgroundColor: Color?
        var bold: Bool = false
        var italic: Bool = false
        var underline: Bool = false
        var strikethrough: Bool = false
        var dim: Bool = false
        var inverse: Bool = false

        mutating func reset() {
            foregroundColor = nil
            backgroundColor = nil
            bold = false
            italic = false
            underline = false
            strikethrough = false
            dim = false
            inverse = false
        }
    }

    // MARK: - Parse
    func parse(_ text: String, isDarkMode: Bool = true) -> AttributedString {
        var result = AttributedString()
        var currentStyle = TextStyle()
        var currentText = ""

        let colors = isDarkMode ? Self.standardColors : Self.lightColors
        let defaultForeground = isDarkMode ? Color.white : Color.black

        // ANSI escape sequence regex: ESC [ ... m
        let pattern = "\u{001B}\\[([0-9;]*)m"
        let regex = try? NSRegularExpression(pattern: pattern, options: [])

        var searchRange = text.startIndex..<text.endIndex
        var lastEnd = text.startIndex

        while let match = regex?.firstMatch(
            in: text,
            options: [],
            range: NSRange(searchRange, in: text)
        ) {
            guard let matchRange = Range(match.range, in: text),
                  let codesRange = Range(match.range(at: 1), in: text) else {
                break
            }

            // Append text before this escape sequence
            let textBefore = String(text[lastEnd..<matchRange.lowerBound])
            if !textBefore.isEmpty {
                result += createAttributedString(textBefore, style: currentStyle, defaultForeground: defaultForeground)
            }

            // Parse codes
            let codesString = String(text[codesRange])
            let codes = codesString.split(separator: ";").compactMap { Int($0) }

            // Apply codes to style
            var i = 0
            while i < codes.count {
                let code = codes[i]

                switch code {
                case 0:
                    currentStyle.reset()
                case 1:
                    currentStyle.bold = true
                case 2:
                    currentStyle.dim = true
                case 3:
                    currentStyle.italic = true
                case 4:
                    currentStyle.underline = true
                case 7:
                    currentStyle.inverse = true
                case 9:
                    currentStyle.strikethrough = true
                case 22:
                    currentStyle.bold = false
                    currentStyle.dim = false
                case 23:
                    currentStyle.italic = false
                case 24:
                    currentStyle.underline = false
                case 27:
                    currentStyle.inverse = false
                case 29:
                    currentStyle.strikethrough = false
                case 30...37:
                    currentStyle.foregroundColor = colors[code - 30]
                case 38:
                    // Extended foreground color
                    if i + 1 < codes.count {
                        if codes[i + 1] == 5 && i + 2 < codes.count {
                            // 256 color
                            currentStyle.foregroundColor = Self.color256(codes[i + 2])
                            i += 2
                        } else if codes[i + 1] == 2 && i + 4 < codes.count {
                            // RGB color
                            currentStyle.foregroundColor = Color(
                                red: Double(codes[i + 2]) / 255.0,
                                green: Double(codes[i + 3]) / 255.0,
                                blue: Double(codes[i + 4]) / 255.0
                            )
                            i += 4
                        }
                    }
                case 39:
                    currentStyle.foregroundColor = nil
                case 40...47:
                    currentStyle.backgroundColor = colors[code - 40]
                case 48:
                    // Extended background color
                    if i + 1 < codes.count {
                        if codes[i + 1] == 5 && i + 2 < codes.count {
                            // 256 color
                            currentStyle.backgroundColor = Self.color256(codes[i + 2])
                            i += 2
                        } else if codes[i + 1] == 2 && i + 4 < codes.count {
                            // RGB color
                            currentStyle.backgroundColor = Color(
                                red: Double(codes[i + 2]) / 255.0,
                                green: Double(codes[i + 3]) / 255.0,
                                blue: Double(codes[i + 4]) / 255.0
                            )
                            i += 4
                        }
                    }
                case 49:
                    currentStyle.backgroundColor = nil
                case 90...97:
                    currentStyle.foregroundColor = colors[code - 90 + 8]
                case 100...107:
                    currentStyle.backgroundColor = colors[code - 100 + 8]
                default:
                    break
                }

                i += 1
            }

            lastEnd = matchRange.upperBound
            searchRange = lastEnd..<text.endIndex
        }

        // Append remaining text
        let remainingText = String(text[lastEnd...])
        if !remainingText.isEmpty {
            result += createAttributedString(remainingText, style: currentStyle, defaultForeground: defaultForeground)
        }

        return result
    }

    private func createAttributedString(_ text: String, style: TextStyle, defaultForeground: Color) -> AttributedString {
        var attrString = AttributedString(text)

        // Foreground color
        var fg: Color = style.foregroundColor ?? defaultForeground
        var bg: Color? = style.backgroundColor

        // Handle inverse
        if style.inverse {
            let tempFg = fg
            fg = bg ?? defaultForeground
            bg = tempFg
        }

        // Handle dim
        if style.dim {
            fg = fg.opacity(0.5)
        }

        attrString.foregroundColor = fg

        if let bg = bg {
            attrString.backgroundColor = bg
        }

        // Font traits
        if style.bold || style.italic {
            if style.bold && style.italic {
                attrString.font = .system(.body, design: .monospaced).bold().italic()
            } else if style.bold {
                attrString.font = .system(.body, design: .monospaced).bold()
            } else {
                attrString.font = .system(.body, design: .monospaced).italic()
            }
        }

        if style.underline {
            attrString.underlineStyle = .single
        }

        if style.strikethrough {
            attrString.strikethroughStyle = .single
        }

        return attrString
    }

    // MARK: - Strip ANSI
    static func stripANSI(_ text: String) -> String {
        let pattern = "\u{001B}\\[[0-9;]*m"
        return text.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
    }
}

// MARK: - Color Extension
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }

    var hexString: String {
        guard let components = UIColor(self).cgColor.components else {
            return "000000"
        }
        let r = Int(components[0] * 255)
        let g = Int(components[1] * 255)
        let b = Int(components[2] * 255)
        return String(format: "%02X%02X%02X", r, g, b)
    }
}
