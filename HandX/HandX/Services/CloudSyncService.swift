import Foundation
import Combine

// MARK: - Cloud Sync Service
final class CloudSyncService: ObservableObject {
    static let shared = CloudSyncService()

    // MARK: - Published Properties
    @Published var isSyncing: Bool = false
    @Published var lastSyncDate: Date?
    @Published var syncError: Error?

    // MARK: - Private Properties
    private let ubiquitousStore = NSUbiquitousKeyValueStore.default
    private var cancellables = Set<AnyCancellable>()

    // Keys for cloud storage
    private enum Keys {
        static let savedServers = "handx_cloud_servers"
        static let commandHistory = "handx_cloud_history"
        static let lastSyncDate = "handx_cloud_last_sync"
    }

    private init() {
        setupNotifications()
    }

    // MARK: - Availability
    var isCloudAvailable: Bool {
        FileManager.default.ubiquityIdentityToken != nil
    }

    // MARK: - Setup
    private func setupNotifications() {
        // Listen for changes from iCloud
        NotificationCenter.default.publisher(for: NSUbiquitousKeyValueStore.didChangeExternallyNotification)
            .sink { [weak self] notification in
                self?.handleExternalChange(notification)
            }
            .store(in: &cancellables)

        // Initial sync
        ubiquitousStore.synchronize()
    }

    // MARK: - Handle External Changes
    private func handleExternalChange(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let changeReason = userInfo[NSUbiquitousKeyValueStoreChangeReasonKey] as? Int else {
            return
        }

        switch changeReason {
        case NSUbiquitousKeyValueStoreServerChange:
            // Data changed on server
            DispatchQueue.main.async {
                self.lastSyncDate = Date()
            }

        case NSUbiquitousKeyValueStoreInitialSyncChange:
            // Initial sync completed
            DispatchQueue.main.async {
                self.lastSyncDate = Date()
            }

        case NSUbiquitousKeyValueStoreQuotaViolationChange:
            // Quota exceeded
            DispatchQueue.main.async {
                self.syncError = CloudSyncError.quotaExceeded
            }

        case NSUbiquitousKeyValueStoreAccountChange:
            // Account changed
            DispatchQueue.main.async {
                self.syncError = CloudSyncError.accountChanged
            }

        default:
            break
        }
    }

    // MARK: - Sync Servers
    func syncServers(_ servers: [ServerInfo]) async throws {
        guard isCloudAvailable else {
            throw CloudSyncError.cloudNotAvailable
        }

        isSyncing = true
        defer { isSyncing = false }

        do {
            let data = try JSONEncoder().encode(servers)
            ubiquitousStore.set(data, forKey: Keys.savedServers)
            ubiquitousStore.set(Date().timeIntervalSince1970, forKey: Keys.lastSyncDate)
            ubiquitousStore.synchronize()

            lastSyncDate = Date()
            syncError = nil
        } catch {
            syncError = error
            throw error
        }
    }

    func loadServersFromCloud() async throws -> [ServerInfo]? {
        guard isCloudAvailable else {
            throw CloudSyncError.cloudNotAvailable
        }

        isSyncing = true
        defer { isSyncing = false }

        ubiquitousStore.synchronize()

        guard let data = ubiquitousStore.data(forKey: Keys.savedServers) else {
            return nil
        }

        do {
            let servers = try JSONDecoder().decode([ServerInfo].self, from: data)
            lastSyncDate = Date()
            syncError = nil
            return servers
        } catch {
            syncError = error
            throw error
        }
    }

    // MARK: - Sync Command History
    func syncCommandHistory(_ history: CommandHistory) async throws {
        guard isCloudAvailable else {
            throw CloudSyncError.cloudNotAvailable
        }

        isSyncing = true
        defer { isSyncing = false }

        do {
            let data = try JSONEncoder().encode(history)
            ubiquitousStore.set(data, forKey: Keys.commandHistory)
            ubiquitousStore.synchronize()

            lastSyncDate = Date()
            syncError = nil
        } catch {
            syncError = error
            throw error
        }
    }

    func loadCommandHistoryFromCloud() async throws -> CommandHistory? {
        guard isCloudAvailable else {
            throw CloudSyncError.cloudNotAvailable
        }

        isSyncing = true
        defer { isSyncing = false }

        ubiquitousStore.synchronize()

        guard let data = ubiquitousStore.data(forKey: Keys.commandHistory) else {
            return nil
        }

        do {
            let history = try JSONDecoder().decode(CommandHistory.self, from: data)
            lastSyncDate = Date()
            syncError = nil
            return history
        } catch {
            syncError = error
            throw error
        }
    }

    // MARK: - Merge Servers
    func mergeServers(local: [ServerInfo], cloud: [ServerInfo]) -> [ServerInfo] {
        var merged: [ServerInfo] = local

        for cloudServer in cloud {
            // Check if server already exists locally (by host and port)
            if !merged.contains(where: { $0.host == cloudServer.host && $0.port == cloudServer.port }) {
                merged.append(cloudServer)
            }
        }

        return merged
    }

    // MARK: - Clear Cloud Data
    func clearCloudData() async {
        ubiquitousStore.removeObject(forKey: Keys.savedServers)
        ubiquitousStore.removeObject(forKey: Keys.commandHistory)
        ubiquitousStore.removeObject(forKey: Keys.lastSyncDate)
        ubiquitousStore.synchronize()

        await MainActor.run {
            lastSyncDate = nil
            syncError = nil
        }
    }
}

// MARK: - Cloud Sync Errors
enum CloudSyncError: LocalizedError {
    case cloudNotAvailable
    case quotaExceeded
    case accountChanged
    case syncFailed

    var errorDescription: String? {
        switch self {
        case .cloudNotAvailable:
            return "iCloud is not available. Please sign in to iCloud in Settings."
        case .quotaExceeded:
            return "iCloud storage quota exceeded. Please free up space."
        case .accountChanged:
            return "iCloud account has changed. Please sync again."
        case .syncFailed:
            return "Failed to sync with iCloud. Please try again later."
        }
    }
}
