import SwiftUI
import AVFoundation

// MARK: - Connection View
struct ConnectionView: View {
    @Environment(\.appState) private var appState
    @Environment(\.colorScheme) private var colorScheme

    @State private var host: String = ""
    @State private var port: String = "8080"
    @State private var token: String = ""
    @State private var showScanner: Bool = false
    @State private var showError: Bool = false
    @State private var errorMessage: String = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Logo and Title
                    headerSection

                    // Connection Status
                    if appState.connectionState != .disconnected {
                        connectionStatusCard
                    }

                    // Manual Input
                    manualInputSection

                    // QR Scanner Button
                    scannerButton

                    // Recent Servers
                    if !appState.savedServers.isEmpty {
                        recentServersSection
                    }

                    Spacer(minLength: 40)
                }
                .padding()
            }
            .background(Color(UIColor.systemGroupedBackground))
            .navigationTitle("Connect")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showScanner) {
                QRScannerView { result in
                    handleQRScanResult(result)
                }
            }
            .alert("Connection Error", isPresented: $showError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(errorMessage)
            }
        }
    }

    // MARK: - Header Section
    private var headerSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "terminal.fill")
                .font(.system(size: 60))
                .foregroundStyle(.blue)
                .symbolEffect(.pulse, options: .repeating)

            Text("HandX")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Connect to your tmux server")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 20)
    }

    // MARK: - Connection Status Card
    private var connectionStatusCard: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(statusColor)
                .frame(width: 12, height: 12)
                .overlay {
                    if case .connecting = appState.connectionState {
                        Circle()
                            .stroke(statusColor, lineWidth: 2)
                            .scaleEffect(1.5)
                            .opacity(0)
                            .animation(.easeOut(duration: 1).repeatForever(autoreverses: false), value: appState.connectionState)
                    }
                }

            VStack(alignment: .leading, spacing: 2) {
                Text(appState.connectionState.description)
                    .font(.headline)

                if let serverInfo = appState.serverInfo {
                    Text(serverInfo.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if appState.connectionState.isConnected {
                Button("Disconnect") {
                    appState.disconnect()
                }
                .buttonStyle(.bordered)
                .tint(.red)
            }
        }
        .padding()
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
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

    // MARK: - Manual Input Section
    private var manualInputSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Server Details")
                .font(.headline)

            VStack(spacing: 12) {
                // Host
                HStack {
                    Image(systemName: "server.rack")
                        .foregroundStyle(.secondary)
                        .frame(width: 24)

                    TextField("Host (e.g., 192.168.1.100)", text: $host)
                        .textContentType(.URL)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }
                .padding()
                .background(Color(UIColor.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))

                // Port
                HStack {
                    Image(systemName: "number")
                        .foregroundStyle(.secondary)
                        .frame(width: 24)

                    TextField("Port", text: $port)
                        .keyboardType(.numberPad)
                }
                .padding()
                .background(Color(UIColor.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))

                // Token (optional)
                HStack {
                    Image(systemName: "key.fill")
                        .foregroundStyle(.secondary)
                        .frame(width: 24)

                    SecureField("Token (optional)", text: $token)
                        .textContentType(.password)
                }
                .padding()
                .background(Color(UIColor.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            // Connect Button
            Button {
                connect()
            } label: {
                HStack {
                    if case .connecting = appState.connectionState {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "link")
                    }
                    Text("Connect")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(canConnect ? Color.blue : Color.gray)
                .foregroundColor(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(!canConnect)
        }
    }

    private var canConnect: Bool {
        !host.isEmpty && !port.isEmpty &&
        appState.connectionState != .connecting
    }

    // MARK: - Scanner Button
    private var scannerButton: some View {
        VStack(spacing: 12) {
            HStack {
                Rectangle()
                    .fill(Color.secondary.opacity(0.3))
                    .frame(height: 1)
                Text("OR")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Rectangle()
                    .fill(Color.secondary.opacity(0.3))
                    .frame(height: 1)
            }

            Button {
                showScanner = true
            } label: {
                HStack {
                    Image(systemName: "qrcode.viewfinder")
                    Text("Scan QR Code")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(UIColor.secondarySystemGroupedBackground))
                .foregroundColor(.primary)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.blue, lineWidth: 1)
                )
            }
        }
    }

    // MARK: - Recent Servers Section
    private var recentServersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recent Servers")
                    .font(.headline)
                Spacer()
                Button("Clear") {
                    appState.savedServers = []
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            ForEach(appState.savedServers, id: \.host) { server in
                Button {
                    connectToServer(server)
                } label: {
                    HStack {
                        Image(systemName: "clock.arrow.circlepath")
                            .foregroundStyle(.secondary)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(server.displayName)
                                .font(.body)
                            Text("\(server.host):\(server.port)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .padding()
                    .background(Color(UIColor.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Actions
    private func connect() {
        guard let portInt = Int(port) else {
            errorMessage = "Invalid port number"
            showError = true
            return
        }

        let server = ServerInfo(
            host: host,
            port: portInt,
            token: token.isEmpty ? nil : token
        )

        connectToServer(server)
    }

    private func connectToServer(_ server: ServerInfo) {
        HapticManager.shared.impact(.light)
        Task {
            await appState.connect(to: server)
        }
    }

    private func handleQRScanResult(_ result: String) {
        showScanner = false

        guard let server = ServerInfo(urlString: result) else {
            errorMessage = "Invalid QR code format"
            showError = true
            return
        }

        host = server.host
        port = String(server.port)
        token = server.token ?? ""

        // Auto-connect
        connectToServer(server)
    }
}

// MARK: - QR Scanner View
struct QRScannerView: UIViewControllerRepresentable {
    let onResult: (String) -> Void

    func makeUIViewController(context: Context) -> QRScannerViewController {
        let controller = QRScannerViewController()
        controller.onResult = onResult
        return controller
    }

    func updateUIViewController(_ uiViewController: QRScannerViewController, context: Context) {}
}

class QRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var captureSession: AVCaptureSession!
    var previewLayer: AVCaptureVideoPreviewLayer!
    var onResult: ((String) -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .black

        captureSession = AVCaptureSession()

        guard let videoCaptureDevice = AVCaptureDevice.default(for: .video) else {
            showNoCameraAlert()
            return
        }

        let videoInput: AVCaptureDeviceInput

        do {
            videoInput = try AVCaptureDeviceInput(device: videoCaptureDevice)
        } catch {
            showNoCameraAlert()
            return
        }

        if captureSession.canAddInput(videoInput) {
            captureSession.addInput(videoInput)
        } else {
            showNoCameraAlert()
            return
        }

        let metadataOutput = AVCaptureMetadataOutput()

        if captureSession.canAddOutput(metadataOutput) {
            captureSession.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            metadataOutput.metadataObjectTypes = [.qr]
        } else {
            showNoCameraAlert()
            return
        }

        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.frame = view.layer.bounds
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)

        // Add scan frame overlay
        addScanOverlay()

        // Add close button
        addCloseButton()

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.captureSession.startRunning()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)

        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }

    private func addScanOverlay() {
        let overlayView = UIView(frame: view.bounds)
        overlayView.backgroundColor = UIColor.black.withAlphaComponent(0.5)

        // Cut out center square
        let scanRect = CGRect(
            x: (view.bounds.width - 250) / 2,
            y: (view.bounds.height - 250) / 2,
            width: 250,
            height: 250
        )

        let path = UIBezierPath(rect: view.bounds)
        path.append(UIBezierPath(roundedRect: scanRect, cornerRadius: 12).reversing())

        let maskLayer = CAShapeLayer()
        maskLayer.path = path.cgPath
        overlayView.layer.mask = maskLayer

        view.addSubview(overlayView)

        // Add corner brackets
        let cornerLength: CGFloat = 30
        let lineWidth: CGFloat = 4
        let cornerColor = UIColor.white

        let corners: [(CGPoint, CGPoint, CGPoint)] = [
            // Top-left
            (CGPoint(x: scanRect.minX, y: scanRect.minY + cornerLength),
             CGPoint(x: scanRect.minX, y: scanRect.minY),
             CGPoint(x: scanRect.minX + cornerLength, y: scanRect.minY)),
            // Top-right
            (CGPoint(x: scanRect.maxX - cornerLength, y: scanRect.minY),
             CGPoint(x: scanRect.maxX, y: scanRect.minY),
             CGPoint(x: scanRect.maxX, y: scanRect.minY + cornerLength)),
            // Bottom-left
            (CGPoint(x: scanRect.minX, y: scanRect.maxY - cornerLength),
             CGPoint(x: scanRect.minX, y: scanRect.maxY),
             CGPoint(x: scanRect.minX + cornerLength, y: scanRect.maxY)),
            // Bottom-right
            (CGPoint(x: scanRect.maxX - cornerLength, y: scanRect.maxY),
             CGPoint(x: scanRect.maxX, y: scanRect.maxY),
             CGPoint(x: scanRect.maxX, y: scanRect.maxY - cornerLength)),
        ]

        for (start, corner, end) in corners {
            let cornerPath = UIBezierPath()
            cornerPath.move(to: start)
            cornerPath.addLine(to: corner)
            cornerPath.addLine(to: end)

            let layer = CAShapeLayer()
            layer.path = cornerPath.cgPath
            layer.strokeColor = cornerColor.cgColor
            layer.fillColor = UIColor.clear.cgColor
            layer.lineWidth = lineWidth
            layer.lineCap = .round
            layer.lineJoin = .round

            view.layer.addSublayer(layer)
        }

        // Add instruction label
        let label = UILabel()
        label.text = "Scan QR code from terminal"
        label.textColor = .white
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.textAlignment = .center
        label.frame = CGRect(
            x: 20,
            y: scanRect.maxY + 30,
            width: view.bounds.width - 40,
            height: 30
        )
        view.addSubview(label)
    }

    private func addCloseButton() {
        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: "xmark.circle.fill"), for: .normal)
        button.tintColor = .white
        button.frame = CGRect(x: 20, y: 60, width: 44, height: 44)
        button.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        view.addSubview(button)
    }

    @objc private func closeTapped() {
        dismiss(animated: true)
    }

    private func showNoCameraAlert() {
        let alert = UIAlertController(
            title: "Camera Not Available",
            message: "QR scanning requires camera access.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
            self?.dismiss(animated: true)
        })
        present(alert, animated: true)
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        captureSession.stopRunning()

        if let metadataObject = metadataObjects.first {
            guard let readableObject = metadataObject as? AVMetadataMachineReadableCodeObject else { return }
            guard let stringValue = readableObject.stringValue else { return }

            AudioServicesPlaySystemSound(SystemSoundID(kSystemSoundID_Vibrate))
            onResult?(stringValue)
            dismiss(animated: true)
        }
    }

    override var prefersStatusBarHidden: Bool {
        true
    }
}

#Preview {
    ConnectionView()
}
