import LocalAuthentication
import Security
import Foundation

// MARK: - Biometric Service
final class BiometricService {
    static let shared = BiometricService()

    private let context = LAContext()

    private init() {}

    // MARK: - Biometric Availability
    enum BiometricType {
        case none
        case touchID
        case faceID
    }

    var biometricType: BiometricType {
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return .none
        }

        switch context.biometryType {
        case .faceID:
            return .faceID
        case .touchID:
            return .touchID
        case .opticID:
            return .faceID // Vision Pro - treat as Face ID
        case .none:
            return .none
        @unknown default:
            return .none
        }
    }

    var isBiometricAvailable: Bool {
        biometricType != .none
    }

    var biometricName: String {
        switch biometricType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .none: return "Biometrics"
        }
    }

    var biometricIcon: String {
        switch biometricType {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .none: return "lock"
        }
    }

    // MARK: - Authentication
    func authenticate(reason: String) async -> Result<Bool, Error> {
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"

        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            if let error = error {
                return .failure(error)
            }
            return .failure(BiometricError.notAvailable)
        }

        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
            return .success(success)
        } catch {
            return .failure(error)
        }
    }

    // MARK: - Keychain Operations
    func saveToKeychain(key: String, value: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw BiometricError.encodingError
        }

        // Delete existing item first
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "com.handx.servers"
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // Add new item with biometric protection
        let accessControl = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .biometryCurrentSet,
            nil
        )

        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "com.handx.servers",
            kSecValueData as String: data
        ]

        if let accessControl = accessControl {
            query[kSecAttrAccessControl as String] = accessControl
        }

        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            throw BiometricError.keychainError(status: status)
        }
    }

    func loadFromKeychain(key: String, reason: String) async throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "com.handx.servers",
            kSecReturnData as String: true,
            kSecUseOperationPrompt as String: reason
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            guard let data = result as? Data,
                  let value = String(data: data, encoding: .utf8) else {
                throw BiometricError.encodingError
            }
            return value

        case errSecItemNotFound:
            return nil

        case errSecUserCanceled:
            throw BiometricError.userCanceled

        case errSecAuthFailed:
            throw BiometricError.authenticationFailed

        default:
            throw BiometricError.keychainError(status: status)
        }
    }

    func deleteFromKeychain(key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "com.handx.servers"
        ]

        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw BiometricError.keychainError(status: status)
        }
    }

    // MARK: - Server Token Management
    func saveServerToken(serverKey: String, token: String) async throws {
        // Authenticate first
        let authResult = await authenticate(reason: "Save server token securely")

        switch authResult {
        case .success(true):
            try saveToKeychain(key: "token_\(serverKey)", value: token)
        case .success(false):
            throw BiometricError.authenticationFailed
        case .failure(let error):
            throw error
        }
    }

    func loadServerToken(serverKey: String) async throws -> String? {
        return try await loadFromKeychain(
            key: "token_\(serverKey)",
            reason: "Access saved server token"
        )
    }

    func deleteServerToken(serverKey: String) throws {
        try deleteFromKeychain(key: "token_\(serverKey)")
    }
}

// MARK: - Biometric Errors
enum BiometricError: LocalizedError {
    case notAvailable
    case userCanceled
    case authenticationFailed
    case encodingError
    case keychainError(status: OSStatus)

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "Biometric authentication is not available on this device"
        case .userCanceled:
            return "Authentication was canceled"
        case .authenticationFailed:
            return "Authentication failed"
        case .encodingError:
            return "Failed to encode/decode data"
        case .keychainError(let status):
            return "Keychain error: \(status)"
        }
    }
}
