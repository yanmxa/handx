import Foundation
import SwiftUI
import Combine

// MARK: - AI CLI Pattern Types
enum AIPatternType: Equatable {
    case none
    case yesNoPrompt(question: String)
    case multiChoicePrompt(options: [String])
    case codeBlock(language: String?, code: String)
    case diffBlock(additions: Int, deletions: Int, content: String)
    case taskProgress(description: String, startLine: Int)
    case toolExecution(tool: String, status: ToolStatus)
    case thinkingIndicator
    case errorMessage(message: String)

    enum ToolStatus: Equatable {
        case running
        case completed
        case failed
    }
}

// MARK: - Detected Artifact
struct DetectedArtifact: Identifiable, Equatable {
    let id = UUID()
    let type: ArtifactType
    let content: String
    let language: String?
    let lineRange: Range<Int>
    let timestamp: Date

    enum ArtifactType: Equatable {
        case code
        case diff
        case file
        case json
        case markdown
    }

    static func == (lhs: DetectedArtifact, rhs: DetectedArtifact) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Smart Pattern Detector
@Observable
final class SmartPatternDetector {
    static let shared = SmartPatternDetector()

    // MARK: - Published State
    var currentPattern: AIPatternType = .none
    var detectedArtifacts: [DetectedArtifact] = []
    var isAIThinking: Bool = false
    var currentTaskAnchor: Int? = nil // Line number where current task started

    // MARK: - Pattern Regex
    private let patterns: [String: NSRegularExpression] = {
        var dict: [String: NSRegularExpression] = [:]

        // Claude Code patterns
        dict["claude_yesno"] = try? NSRegularExpression(
            pattern: #"(?:Do you want to|Would you like to|Should I|Apply this|Proceed with).*\?\s*(?:\(y\/n\)|\[y\/n\]|yes\/no)"#,
            options: [.caseInsensitive]
        )

        // Gemini CLI patterns
        dict["gemini_confirm"] = try? NSRegularExpression(
            pattern: #"(?:Press Enter to|Confirm|Accept changes|Apply|Continue)\s*(?:\(yes\/no\)|\[Y\/n\])"#,
            options: [.caseInsensitive]
        )

        // Code block detection (markdown style)
        dict["code_block"] = try? NSRegularExpression(
            pattern: #"```(\w+)?\n([\s\S]*?)```"#,
            options: []
        )

        // Diff detection
        dict["diff_block"] = try? NSRegularExpression(
            pattern: #"(?:^|\n)(?:@@.*@@|[+-]{3}\s+\S+|diff --git)[\s\S]*?(?=\n(?![-+@])|$)"#,
            options: []
        )

        // Tool execution (Claude Code)
        dict["tool_start"] = try? NSRegularExpression(
            pattern: #"(?:Running|Executing|Using)\s+(?:tool\s+)?[`']?(\w+)[`']?"#,
            options: [.caseInsensitive]
        )

        // Thinking indicator
        dict["thinking"] = try? NSRegularExpression(
            pattern: #"(?:Thinking|Analyzing|Processing|Generating)\.{2,}"#,
            options: [.caseInsensitive]
        )

        // Error messages
        dict["error"] = try? NSRegularExpression(
            pattern: #"(?:Error|Failed|Exception|Traceback):\s*(.+)"#,
            options: [.caseInsensitive]
        )

        // Multi-choice prompt
        dict["multichoice"] = try? NSRegularExpression(
            pattern: #"\[(\d+)\]\s+(.+?)(?=\n\[|\n\s*$)"#,
            options: []
        )

        return dict
    }()

    private init() {}

    // MARK: - Analyze Output
    func analyzeOutput(_ output: String) {
        // Check for yes/no prompts (highest priority)
        if let yesNoPattern = detectYesNoPrompt(in: output) {
            currentPattern = yesNoPattern
            return
        }

        // Check for multi-choice prompts
        if let multiChoice = detectMultiChoice(in: output) {
            currentPattern = multiChoice
            return
        }

        // Check for thinking indicator
        if isThinking(in: output) {
            currentPattern = .thinkingIndicator
            isAIThinking = true
            return
        }

        // Check for errors
        if let error = detectError(in: output) {
            currentPattern = error
            return
        }

        // Check for tool execution
        if let tool = detectToolExecution(in: output) {
            currentPattern = tool
            return
        }

        // Default: no special pattern
        currentPattern = .none
        isAIThinking = false
    }

    // MARK: - Extract Artifacts
    func extractArtifacts(from output: String) {
        var newArtifacts: [DetectedArtifact] = []

        // Extract code blocks
        if let codePattern = patterns["code_block"] {
            let matches = codePattern.matches(
                in: output,
                range: NSRange(output.startIndex..., in: output)
            )

            for match in matches {
                if match.numberOfRanges >= 3,
                   let codeRange = Range(match.range(at: 2), in: output) {
                    let language = match.numberOfRanges > 1 ?
                        Range(match.range(at: 1), in: output).map { String(output[$0]) } : nil

                    let code = String(output[codeRange])
                    if code.count > 50 { // Only track significant code blocks
                        let artifact = DetectedArtifact(
                            type: .code,
                            content: code,
                            language: language,
                            lineRange: 0..<0, // Would need line calculation
                            timestamp: Date()
                        )
                        newArtifacts.append(artifact)
                    }
                }
            }
        }

        // Extract diffs
        if let diffPattern = patterns["diff_block"] {
            let matches = diffPattern.matches(
                in: output,
                range: NSRange(output.startIndex..., in: output)
            )

            for match in matches {
                if let diffRange = Range(match.range, in: output) {
                    let diff = String(output[diffRange])
                    if diff.count > 20 {
                        let artifact = DetectedArtifact(
                            type: .diff,
                            content: diff,
                            language: "diff",
                            lineRange: 0..<0,
                            timestamp: Date()
                        )
                        newArtifacts.append(artifact)
                    }
                }
            }
        }

        // Update artifacts (keep recent ones)
        detectedArtifacts = (newArtifacts + detectedArtifacts).prefix(10).map { $0 }
    }

    // MARK: - Pattern Detection Helpers
    private func detectYesNoPrompt(in output: String) -> AIPatternType? {
        // Check last few lines for prompt
        let lines = output.components(separatedBy: .newlines)
        let recentLines = lines.suffix(5).joined(separator: "\n")

        // Claude Code style
        if let pattern = patterns["claude_yesno"],
           let match = pattern.firstMatch(in: recentLines, range: NSRange(recentLines.startIndex..., in: recentLines)) {
            if let range = Range(match.range, in: recentLines) {
                return .yesNoPrompt(question: String(recentLines[range]))
            }
        }

        // Gemini CLI style
        if let pattern = patterns["gemini_confirm"],
           let match = pattern.firstMatch(in: recentLines, range: NSRange(recentLines.startIndex..., in: recentLines)) {
            if let range = Range(match.range, in: recentLines) {
                return .yesNoPrompt(question: String(recentLines[range]))
            }
        }

        // Simple y/n check at end of output
        let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasSuffix("(y/n)") || trimmed.hasSuffix("[y/n]") ||
           trimmed.hasSuffix("[Y/n]") || trimmed.hasSuffix("[yes/no]") {
            // Extract the question
            let lastLine = lines.last ?? ""
            return .yesNoPrompt(question: lastLine)
        }

        return nil
    }

    private func detectMultiChoice(in output: String) -> AIPatternType? {
        guard let pattern = patterns["multichoice"] else { return nil }

        let lines = output.components(separatedBy: .newlines)
        let recentLines = lines.suffix(15).joined(separator: "\n")

        let matches = pattern.matches(
            in: recentLines,
            range: NSRange(recentLines.startIndex..., in: recentLines)
        )

        if matches.count >= 2 {
            var options: [String] = []
            for match in matches {
                if match.numberOfRanges >= 3,
                   let optionRange = Range(match.range(at: 2), in: recentLines) {
                    options.append(String(recentLines[optionRange]))
                }
            }
            return .multiChoicePrompt(options: options)
        }

        return nil
    }

    private func isThinking(in output: String) -> Bool {
        guard let pattern = patterns["thinking"] else { return false }

        let lines = output.components(separatedBy: .newlines)
        let lastLine = lines.last ?? ""

        return pattern.firstMatch(
            in: lastLine,
            range: NSRange(lastLine.startIndex..., in: lastLine)
        ) != nil
    }

    private func detectError(in output: String) -> AIPatternType? {
        guard let pattern = patterns["error"] else { return nil }

        let lines = output.components(separatedBy: .newlines)
        let recentLines = lines.suffix(3).joined(separator: "\n")

        if let match = pattern.firstMatch(
            in: recentLines,
            range: NSRange(recentLines.startIndex..., in: recentLines)
        ) {
            if match.numberOfRanges >= 2,
               let msgRange = Range(match.range(at: 1), in: recentLines) {
                return .errorMessage(message: String(recentLines[msgRange]))
            }
        }

        return nil
    }

    private func detectToolExecution(in output: String) -> AIPatternType? {
        guard let pattern = patterns["tool_start"] else { return nil }

        let lines = output.components(separatedBy: .newlines)
        let recentLines = lines.suffix(3).joined(separator: "\n")

        if let match = pattern.firstMatch(
            in: recentLines,
            range: NSRange(recentLines.startIndex..., in: recentLines)
        ) {
            if match.numberOfRanges >= 2,
               let toolRange = Range(match.range(at: 1), in: recentLines) {
                let toolName = String(recentLines[toolRange])
                return .toolExecution(tool: toolName, status: .running)
            }
        }

        return nil
    }

    // MARK: - Task Anchor Management
    func setTaskAnchor(at line: Int) {
        currentTaskAnchor = line
    }

    func clearTaskAnchor() {
        currentTaskAnchor = nil
    }

    // MARK: - Reset
    func reset() {
        currentPattern = .none
        detectedArtifacts = []
        isAIThinking = false
        currentTaskAnchor = nil
    }
}
