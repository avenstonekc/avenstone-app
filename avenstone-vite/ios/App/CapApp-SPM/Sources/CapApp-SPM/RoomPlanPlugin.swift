import Foundation
import Capacitor
import UIKit
import simd

#if canImport(RoomPlan)
import RoomPlan
#endif

@objc(RoomPlanPlugin)
public class RoomPlanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RoomPlanPlugin"
    public let jsName = "RoomPlanPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startMultiRoomScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportFloorPlan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startExteriorScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startInteriorHeightCapture", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var currentRoomName: String = "Room"

    @objc func isSupported(_ call: CAPPluginCall) {
        #if canImport(RoomPlan)
        if #available(iOS 16.0, *) {
            call.resolve(["supported": RoomCaptureSession.isSupported])
            return
        }
        #endif
        call.resolve(["supported": false])
    }

    @objc func startScan(_ call: CAPPluginCall) {
        #if canImport(RoomPlan)
        if #available(iOS 16.0, *) {
            guard RoomCaptureSession.isSupported else {
                call.reject("LiDAR scanning is not supported on this device")
                return
            }
            let roomName = call.getString("roomName") ?? "Room"
            self.currentRoomName = roomName
            self.pendingCall = call

            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                guard let viewController = self.bridge?.viewController else {
                    call.reject("No view controller available to present scanner")
                    self.pendingCall = nil
                    return
                }
                let scanVC = RoomPlanScanViewController()
                scanVC.roomName = roomName
                var capturedQuality: QualityResult? = nil
                scanVC.onQuality = { q in capturedQuality = q }
                scanVC.onComplete = { [weak self] result in
                    guard let self = self else { return }
                    DispatchQueue.main.async {
                        viewController.dismiss(animated: true) {
                            switch result {
                            case .success(let room):
                                var dict = self.roomToDict(room: room, name: self.currentRoomName)
                                if let q = capturedQuality {
                                    dict["qualityScore"] = q.score
                                    dict["qualityGrade"] = q.grade
                                    dict["qualityDeductions"] = q.deductions
                                }
                                self.pendingCall?.resolve(dict)
                            case .failure(let error):
                                self.pendingCall?.reject(error.localizedDescription)
                            }
                            self.pendingCall = nil
                        }
                    }
                }
                scanVC.modalPresentationStyle = .fullScreen
                viewController.present(scanVC, animated: true)
            }
            return
        }
        #endif
        call.reject("LiDAR scanning requires iOS 16 or later")
    }

    @objc func startExteriorScan(_ call: CAPPluginCall) {
        if #available(iOS 13.0, *) {
            self.pendingCall = call
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                guard let viewController = self.bridge?.viewController else {
                    call.reject("No view controller available")
                    self.pendingCall = nil
                    return
                }
                let vc = ExteriorScanViewController()
                vc.onComplete = { [weak self] result in
                    guard let self = self else { return }
                    DispatchQueue.main.async {
                        viewController.dismiss(animated: true) {
                            switch result {
                            case .success(let data):
                                self.pendingCall?.resolve(data)
                            case .failure(let error):
                                self.pendingCall?.reject(error.localizedDescription)
                            }
                            self.pendingCall = nil
                        }
                    }
                }
                vc.modalPresentationStyle = .fullScreen
                viewController.present(vc, animated: true)
            }
            return
        }
        call.reject("Exterior scan requires iOS 13 or later")
    }

    @objc func startInteriorHeightCapture(_ call: CAPPluginCall) {
        self.pendingCall = call
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let viewController = self.bridge?.viewController else {
                call.reject("No view controller available")
                self.pendingCall = nil
                return
            }
            let vc = InteriorHeightCaptureViewController()
            vc.onComplete = { [weak self] result in
                guard let self = self else { return }
                DispatchQueue.main.async {
                    viewController.dismiss(animated: true) {
                        switch result {
                        case .success(let data):
                            self.pendingCall?.resolve(data)
                        case .failure(let error):
                            self.pendingCall?.reject(error.localizedDescription)
                        }
                        self.pendingCall = nil
                    }
                }
            }
            vc.modalPresentationStyle = .fullScreen
            viewController.present(vc, animated: true)
        }
    }

    @objc func startMultiRoomScan(_ call: CAPPluginCall) {
        #if canImport(RoomPlan)
        if #available(iOS 17.0, *) {
            guard RoomCaptureSession.isSupported else {
                call.reject("LiDAR scanning is not supported on this device")
                return
            }
            self.pendingCall = call
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                guard let viewController = self.bridge?.viewController else {
                    call.reject("No view controller available")
                    self.pendingCall = nil
                    return
                }
                let vc = ContinuousRoomScanViewController()
                vc.onComplete = { [weak self] result in
                    guard let self = self else { return }
                    DispatchQueue.main.async {
                        viewController.dismiss(animated: true) {
                            switch result {
                            case .success(let rooms):
                                self.pendingCall?.resolve(["rooms": rooms])
                            case .failure(let error):
                                self.pendingCall?.reject(error.localizedDescription)
                            }
                            self.pendingCall = nil
                        }
                    }
                }
                vc.modalPresentationStyle = .fullScreen
                viewController.present(vc, animated: true)
            }
            return
        }
        #endif
        call.reject("Multi-room scanning requires iOS 17 or later")
    }

    @objc func exportFloorPlan(_ call: CAPPluginCall) {
        call.resolve([
            "imageBase64": NSNull(),
            "pdfBase64": NSNull()
        ])
    }

    #if canImport(RoomPlan)
    @available(iOS 16.0, *)
    private func roomToDict(room: CapturedRoom, name: String) -> [String: Any] {
        var minX: Float = .greatestFiniteMagnitude
        var maxX: Float = -.greatestFiniteMagnitude
        var minZ: Float = .greatestFiniteMagnitude
        var maxZ: Float = -.greatestFiniteMagnitude
        var maxY: Float = 0

        for wall in room.walls {
            let t = wall.transform
            let x = t.columns.3.x
            let z = t.columns.3.z
            minX = min(minX, x)
            maxX = max(maxX, x)
            minZ = min(minZ, z)
            maxZ = max(maxZ, z)
            maxY = max(maxY, wall.dimensions.y)
        }

        let metersToFeet: Float = 3.28084
        let widthMeters = max(maxX - minX, 0)
        let lengthMeters = max(maxZ - minZ, 0)
        let heightMeters = maxY

        let lengthFt = lengthMeters * metersToFeet
        let widthFt = widthMeters * metersToFeet
        let heightFt = heightMeters * metersToFeet
        let sqft = lengthFt * widthFt

        let fmt2 = { (v: Float) -> Double in Double(String(format: "%.2f", v)) ?? Double(v) }

        var wallSegments: [[String: Double]] = []
        for wall in room.walls {
            let t = wall.transform
            let cx = t.columns.3.x
            let cz = t.columns.3.z
            let halfW = wall.dimensions.x / 2.0
            let dx = t.columns.0.x
            let dz = t.columns.0.z
            let x1 = Double((cx + dx * halfW - minX) * metersToFeet)
            let z1 = Double((cz + dz * halfW - minZ) * metersToFeet)
            let x2 = Double((cx - dx * halfW - minX) * metersToFeet)
            let z2 = Double((cz - dz * halfW - minZ) * metersToFeet)
            wallSegments.append(["x1": x1, "z1": z1, "x2": x2, "z2": z2])
        }

        return [
            "name": name,
            "length": fmt2(lengthFt),
            "width": fmt2(widthFt),
            "height": fmt2(heightFt),
            "sqft": Int(sqft.rounded()),
            "doors": room.doors.count,
            "windows": room.windows.count,
            "wallSegments": wallSegments,
            "boundingBox": [
                "minX": Double(minX), "maxX": Double(maxX),
                "minZ": Double(minZ), "maxZ": Double(maxZ)
            ],
            "simulated": false
        ]
    }
    #else
    private func roomToDict(room: Any, name: String) -> [String: Any] {
        return ["name": name, "simulated": true]
    }
    #endif
}

#if canImport(RoomPlan)
@available(iOS 16.0, *)
class RoomPlanScanViewController: UIViewController, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
    var roomName: String = "Room"
    var onComplete: ((Result<CapturedRoom, Error>) -> Void)?

    private var roomCaptureView: RoomCaptureView!
    private let sessionConfig = RoomCaptureSession.Configuration()
    private var didFinish = false
    private var scanStartDate: Date?
    private var qualityTimer: Timer?
    private var qualityProgressView: UIProgressView!
    private var qualityLabel: UILabel!
    var onQuality: ((QualityResult) -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        roomCaptureView = RoomCaptureView(frame: view.bounds)
        roomCaptureView.captureSession.delegate = self
        roomCaptureView.delegate = self
        roomCaptureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(roomCaptureView)

        roomCaptureView.captureSession.run(configuration: sessionConfig)

        let titleLabel = UILabel()
        titleLabel.text = "Scanning: \(roomName)"
        titleLabel.textColor = .white
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        titleLabel.textAlignment = .center
        titleLabel.backgroundColor = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 0.85)
        titleLabel.layer.cornerRadius = 12
        titleLabel.clipsToBounds = true
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)

        let doneButton = UIButton(type: .system)
        doneButton.setTitle("Done", for: .normal)
        doneButton.setTitleColor(.black, for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        doneButton.backgroundColor = UIColor(red: 201/255, green: 168/255, blue: 76/255, alpha: 1.0)
        doneButton.layer.cornerRadius = 24
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(doneButton)

        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(cancelButton)

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            titleLabel.heightAnchor.constraint(equalToConstant: 36),
            titleLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 200),

            doneButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            doneButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            doneButton.widthAnchor.constraint(equalToConstant: 140),
            doneButton.heightAnchor.constraint(equalToConstant: 48),

            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            cancelButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            cancelButton.heightAnchor.constraint(equalToConstant: 36)
        ])
        setupQualityBar()
        scanStartDate = Date()
        startQualityTimer()
    }

    @objc private func doneTapped() {
        roomCaptureView.captureSession.stop()
    }

    @objc private func cancelTapped() {
        guard !didFinish else { return }
        didFinish = true
        stopQualityTimer()
        roomCaptureView.captureSession.stop()
        onComplete?(.failure(NSError(
            domain: "RoomPlan",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Scan cancelled"]
        )))
    }

    private func setupQualityBar() {
        qualityLabel = UILabel()
        qualityLabel.translatesAutoresizingMaskIntoConstraints = false
        qualityLabel.text = "Quality 20"
        qualityLabel.textColor = UIColor.white.withAlphaComponent(0.75)
        qualityLabel.font = UIFont.systemFont(ofSize: 11, weight: .medium)
        qualityLabel.textAlignment = .center
        view.addSubview(qualityLabel)

        qualityProgressView = UIProgressView(progressViewStyle: .bar)
        qualityProgressView.translatesAutoresizingMaskIntoConstraints = false
        qualityProgressView.progress = 0.2
        qualityProgressView.trackTintColor = UIColor.white.withAlphaComponent(0.2)
        qualityProgressView.progressTintColor = CaptureQualityTracker.colorForScore(20)
        qualityProgressView.layer.cornerRadius = 3
        qualityProgressView.clipsToBounds = true
        view.addSubview(qualityProgressView)

        NSLayoutConstraint.activate([
            qualityLabel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -82),
            qualityLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            qualityProgressView.bottomAnchor.constraint(equalTo: qualityLabel.topAnchor, constant: -4),
            qualityProgressView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            qualityProgressView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            qualityProgressView.heightAnchor.constraint(equalToConstant: 6),
        ])
    }

    private func startQualityTimer() {
        qualityTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            let elapsed = self.scanStartDate.map { Date().timeIntervalSince($0) } ?? 0
            let score = CaptureQualityTracker.liveInteriorScore(scanDurationSeconds: elapsed)
            DispatchQueue.main.async { self.updateQualityBar(score: score) }
        }
    }

    private func stopQualityTimer() {
        qualityTimer?.invalidate()
        qualityTimer = nil
    }

    private func updateQualityBar(score: Int) {
        qualityProgressView.setProgress(Float(score) / 100.0, animated: true)
        qualityProgressView.progressTintColor = CaptureQualityTracker.colorForScore(score)
        qualityLabel.text = "Quality \(score)"
    }

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard !didFinish else { return }
        didFinish = true
        stopQualityTimer()
        if let error = error {
            onComplete?(.failure(error))
        } else {
            let elapsed = scanStartDate.map { Date().timeIntervalSince($0) } ?? 0
            let quality = CaptureQualityTracker.scoreFromCapturedRoom(processedResult, scanDurationSeconds: elapsed)
            onQuality?(quality)
            onComplete?(.success(processedResult))
        }
    }
}
#endif

// ─── ContinuousRoomScanViewController (iOS 17+) ──────────────────────────────
// Phase 2: scan rooms one at a time, restart immediately between rooms so
// ARKit maintains spatial tracking. Naming happens after all scanning is done.

#if canImport(RoomPlan)
@available(iOS 17.0, *)
class ContinuousRoomScanViewController: UIViewController, RoomCaptureViewDelegate {
    var onComplete: ((Result<[[String: Any]], Error>) -> Void)?

    private var roomCaptureView: RoomCaptureView!
    private let sessionConfig = RoomCaptureSession.Configuration()
    private var capturedRooms: [CapturedRoom] = []
    private var isFinishing = false
    private var isTransitioning = false
    private var isCancelling = false
    private var structuredRooms: [[String: Any]] = []

    // Scan HUD
    private var roomCountLabel: UILabel!
    private var nextRoomButton: UIButton!
    private var doneButton: UIButton!
    private var processingOverlay: UIView!
    private var nameFields: [UITextField] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupCaptureView()
        setupScanHUD()
        setupProcessingOverlay()
        startNextScan()
    }

    private func setupCaptureView() {
        roomCaptureView = RoomCaptureView(frame: view.bounds)
        roomCaptureView.delegate = self
        roomCaptureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(roomCaptureView)
    }

    private func setupScanHUD() {
        let gold = UIColor(red: 201/255, green: 168/255, blue: 76/255, alpha: 1)
        let navy = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 0.88)

        let cancelBtn = UIButton(type: .system)
        cancelBtn.setTitle("Cancel", for: .normal)
        cancelBtn.setTitleColor(.white, for: .normal)
        cancelBtn.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        cancelBtn.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        cancelBtn.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(cancelBtn)

        roomCountLabel = UILabel()
        roomCountLabel.text = "Room 1 — Scan the space"
        roomCountLabel.textColor = .white
        roomCountLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        roomCountLabel.textAlignment = .center
        roomCountLabel.backgroundColor = navy
        roomCountLabel.layer.cornerRadius = 12
        roomCountLabel.clipsToBounds = true
        roomCountLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(roomCountLabel)

        nextRoomButton = UIButton(type: .system)
        nextRoomButton.setTitle("Next Room →", for: .normal)
        nextRoomButton.setTitleColor(.black, for: .normal)
        nextRoomButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        nextRoomButton.backgroundColor = gold
        nextRoomButton.layer.cornerRadius = 24
        nextRoomButton.addTarget(self, action: #selector(nextRoomTapped), for: .touchUpInside)
        nextRoomButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(nextRoomButton)

        doneButton = UIButton(type: .system)
        doneButton.setTitle("Done Scanning", for: .normal)
        doneButton.setTitleColor(.white, for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        doneButton.backgroundColor = UIColor.white.withAlphaComponent(0.12)
        doneButton.layer.cornerRadius = 24
        doneButton.layer.borderWidth = 1
        doneButton.layer.borderColor = UIColor.white.withAlphaComponent(0.4).cgColor
        doneButton.addTarget(self, action: #selector(doneScanningTapped), for: .touchUpInside)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(doneButton)

        NSLayoutConstraint.activate([
            cancelBtn.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            cancelBtn.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            cancelBtn.heightAnchor.constraint(equalToConstant: 36),

            roomCountLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            roomCountLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            roomCountLabel.heightAnchor.constraint(equalToConstant: 36),
            roomCountLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 220),

            nextRoomButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            nextRoomButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            nextRoomButton.widthAnchor.constraint(equalToConstant: 200),
            nextRoomButton.heightAnchor.constraint(equalToConstant: 48),

            doneButton.bottomAnchor.constraint(equalTo: nextRoomButton.topAnchor, constant: -12),
            doneButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            doneButton.widthAnchor.constraint(equalToConstant: 200),
            doneButton.heightAnchor.constraint(equalToConstant: 48),
        ])
    }

    private func setupProcessingOverlay() {
        let navy = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 0.97)
        processingOverlay = UIView()
        processingOverlay.backgroundColor = navy
        processingOverlay.isHidden = true
        processingOverlay.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(processingOverlay)

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.color = UIColor(red: 201/255, green: 168/255, blue: 76/255, alpha: 1)
        spinner.startAnimating()
        spinner.translatesAutoresizingMaskIntoConstraints = false
        processingOverlay.addSubview(spinner)

        let label = UILabel()
        label.text = "Building floor plan..."
        label.textColor = .white
        label.font = .systemFont(ofSize: 17, weight: .medium)
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        processingOverlay.addSubview(label)

        NSLayoutConstraint.activate([
            processingOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            processingOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            processingOverlay.topAnchor.constraint(equalTo: view.topAnchor),
            processingOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            spinner.centerXAnchor.constraint(equalTo: processingOverlay.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: processingOverlay.centerYAnchor, constant: -20),
            label.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 16),
            label.centerXAnchor.constraint(equalTo: processingOverlay.centerXAnchor),
        ])
    }

    private func startNextScan() {
        let n = capturedRooms.count + 1
        roomCountLabel.text = "Room \(n) — Scan the space"
        nextRoomButton.isEnabled = true
        doneButton.isEnabled = true
        roomCaptureView.captureSession.run(configuration: sessionConfig)
    }

    @objc private func nextRoomTapped() {
        guard !isTransitioning && !isCancelling else { return }
        isTransitioning = true
        isFinishing = false
        nextRoomButton.isEnabled = false
        doneButton.isEnabled = false
        roomCaptureView.captureSession.stop()
    }

    @objc private func doneScanningTapped() {
        guard !isTransitioning && !isCancelling else { return }
        isTransitioning = true
        isFinishing = true
        nextRoomButton.isEnabled = false
        doneButton.isEnabled = false
        roomCaptureView.captureSession.stop()
    }

    @objc private func cancelTapped() {
        guard !isCancelling else { return }
        isCancelling = true
        roomCaptureView.captureSession.stop()
        onComplete?(.failure(NSError(domain: "RoomPlan", code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Scan cancelled"])))
    }

    // MARK: - RoomCaptureViewDelegate

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        guard !isCancelling else { return false }
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard !isCancelling else { return }
        capturedRooms.append(processedResult)
        isTransitioning = false
        // Small delay lets the camera pipeline fully tear down before restarting
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            guard !self.isCancelling else { return }
            if self.isFinishing {
                self.processingOverlay.isHidden = false
                self.buildStructure()
            } else {
                self.startNextScan()
            }
        }
    }

    // MARK: - StructureBuilder

    private func buildStructure() {
        guard !capturedRooms.isEmpty else {
            onComplete?(.failure(NSError(domain: "RoomPlan", code: -2,
                userInfo: [NSLocalizedDescriptionKey: "No rooms scanned"])))
            return
        }
        Task {
            do {
                let builder = StructureBuilder(options: [])
                let structure = try await builder.capturedStructure(from: capturedRooms)
                let rooms = self.structureToRooms(structure)
                await MainActor.run { self.showNamingScreen(rooms) }
            } catch {
                // StructureBuilder failed — fall back to individual room data (packing layout in PDF)
                let rooms = self.fallbackRooms()
                await MainActor.run { self.showNamingScreen(rooms) }
            }
        }
    }

    // MARK: - Naming screen

    private func showNamingScreen(_ rooms: [[String: Any]]) {
        structuredRooms = rooms
        processingOverlay.isHidden = true

        let gold = UIColor(red: 201/255, green: 168/255, blue: 76/255, alpha: 1)
        let navy = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 1)
        let navyBg = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 0.97)

        let overlay = UIView()
        overlay.backgroundColor = navyBg
        overlay.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(overlay)

        let scrollView = UIScrollView()
        scrollView.keyboardDismissMode = .interactive
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(scrollView)

        let contentView = UIView()
        contentView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentView)

        let titleLabel = UILabel()
        titleLabel.text = "Name Your Rooms"
        titleLabel.textColor = gold
        titleLabel.font = .systemFont(ofSize: 24, weight: .bold)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(titleLabel)

        let subtitleLabel = UILabel()
        subtitleLabel.text = "\(rooms.count) room\(rooms.count == 1 ? "" : "s") scanned"
        subtitleLabel.textColor = UIColor.white.withAlphaComponent(0.65)
        subtitleLabel.font = .systemFont(ofSize: 14)
        subtitleLabel.textAlignment = .center
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(subtitleLabel)

        nameFields = []
        var prevView: UIView = subtitleLabel

        for (i, room) in rooms.enumerated() {
            let sqft = room["sqft"] as? Int ?? 0
            let hint = sqft > 0 ? "~\(sqft) sf — e.g. Bedroom, Kitchen..." : "e.g. Hallway, Bathroom..."

            let rowLabel = UILabel()
            rowLabel.text = "ROOM \(i + 1)"
            rowLabel.textColor = UIColor.white.withAlphaComponent(0.5)
            rowLabel.font = .systemFont(ofSize: 11, weight: .semibold)
            rowLabel.translatesAutoresizingMaskIntoConstraints = false
            contentView.addSubview(rowLabel)

            let field = UITextField()
            field.placeholder = hint
            field.backgroundColor = UIColor(red: 1, green: 1, blue: 1, alpha: 1)
            field.textColor = UIColor(red: 0, green: 0, blue: 0, alpha: 1)
            field.defaultTextAttributes = [
                .foregroundColor: UIColor(red: 0, green: 0, blue: 0, alpha: 1),
                .font: UIFont.systemFont(ofSize: 16)
            ]
            field.tintColor = navy
            field.overrideUserInterfaceStyle = .light
            field.keyboardAppearance = .light
            field.layer.cornerRadius = 10
            field.font = .systemFont(ofSize: 16)
            field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 0))
            field.leftViewMode = .always
            field.autocapitalizationType = .words
            field.returnKeyType = i < rooms.count - 1 ? .next : .done
            field.tag = i
            field.translatesAutoresizingMaskIntoConstraints = false
            contentView.addSubview(field)
            nameFields.append(field)

            NSLayoutConstraint.activate([
                rowLabel.topAnchor.constraint(equalTo: prevView.bottomAnchor, constant: i == 0 ? 28 : 18),
                rowLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 28),
                field.topAnchor.constraint(equalTo: rowLabel.bottomAnchor, constant: 6),
                field.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 28),
                field.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -28),
                field.heightAnchor.constraint(equalToConstant: 50),
            ])
            prevView = field
        }

        let completeBtn = UIButton(type: .system)
        completeBtn.setTitle("Complete — Build Floor Plan", for: .normal)
        completeBtn.setTitleColor(.black, for: .normal)
        completeBtn.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        completeBtn.backgroundColor = gold
        completeBtn.layer.cornerRadius = 26
        completeBtn.addTarget(self, action: #selector(completeTapped), for: .touchUpInside)
        completeBtn.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(completeBtn)

        NSLayoutConstraint.activate([
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            scrollView.leadingAnchor.constraint(equalTo: overlay.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: overlay.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.bottomAnchor),

            contentView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentView.widthAnchor.constraint(equalTo: scrollView.widthAnchor),

            titleLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 44),
            titleLabel.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            subtitleLabel.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),

            completeBtn.topAnchor.constraint(equalTo: prevView.bottomAnchor, constant: 36),
            completeBtn.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            completeBtn.widthAnchor.constraint(equalToConstant: 260),
            completeBtn.heightAnchor.constraint(equalToConstant: 52),
            completeBtn.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -48),
        ])

        nameFields.first?.becomeFirstResponder()
    }

    @objc private func completeTapped() {
        var rooms = structuredRooms
        for (i, field) in nameFields.enumerated() {
            let name = field.text?.trimmingCharacters(in: .whitespaces) ?? ""
            if i < rooms.count {
                rooms[i]["name"] = name.isEmpty ? "Room \(i + 1)" : name
            }
        }
        onComplete?(.success(rooms))
    }

    // MARK: - Data conversion

    private func structureToRooms(_ structure: CapturedStructure) -> [[String: Any]] {
        let m2f: Float = 3.28084
        let fmt2 = { (v: Float) -> Double in Double(String(format: "%.2f", v)) ?? Double(v) }

        var gMinX: Float = .greatestFiniteMagnitude
        var gMinZ: Float = .greatestFiniteMagnitude
        for room in structure.rooms {
            for wall in room.walls {
                let t = wall.transform
                let cx = t.columns.3.x, cz = t.columns.3.z
                let hw = wall.dimensions.x / 2.0
                let dx = t.columns.0.x, dz = t.columns.0.z
                gMinX = min(gMinX, min(cx + dx * hw, cx - dx * hw))
                gMinZ = min(gMinZ, min(cz + dz * hw, cz - dz * hw))
            }
        }
        if gMinX == .greatestFiniteMagnitude { gMinX = 0 }
        if gMinZ == .greatestFiniteMagnitude { gMinZ = 0 }

        var result: [[String: Any]] = structure.rooms.enumerated().map { (i, room) in
            var minX: Float = .greatestFiniteMagnitude, maxX: Float = -.greatestFiniteMagnitude
            var minZ: Float = .greatestFiniteMagnitude, maxZ: Float = -.greatestFiniteMagnitude
            var maxY: Float = 0
            for wall in room.walls {
                let t = wall.transform
                let cx = t.columns.3.x, cz = t.columns.3.z
                let hw = wall.dimensions.x / 2.0
                let dx = t.columns.0.x, dz = t.columns.0.z
                minX = min(minX, min(cx + dx * hw, cx - dx * hw))
                maxX = max(maxX, max(cx + dx * hw, cx - dx * hw))
                minZ = min(minZ, min(cz + dz * hw, cz - dz * hw))
                maxZ = max(maxZ, max(cz + dz * hw, cz - dz * hw))
                maxY = max(maxY, wall.dimensions.y)
            }
            if minX == .greatestFiniteMagnitude { minX = gMinX; maxX = gMinX }
            if minZ == .greatestFiniteMagnitude { minZ = gMinZ; maxZ = gMinZ }

            var wallSegs: [[String: Double]] = []
            for wall in room.walls {
                let t = wall.transform
                let cx = t.columns.3.x, cz = t.columns.3.z
                let hw = wall.dimensions.x / 2.0
                let dx = t.columns.0.x, dz = t.columns.0.z
                wallSegs.append([
                    "x1": Double((cx + dx * hw - minX) * m2f),
                    "z1": Double((cz + dz * hw - minZ) * m2f),
                    "x2": Double((cx - dx * hw - minX) * m2f),
                    "z2": Double((cz - dz * hw - minZ) * m2f),
                ])
            }

            var doorSegs: [[String: Double]] = []
            for door in room.doors {
                let t = door.transform
                let cx = t.columns.3.x, cz = t.columns.3.z
                let hw = door.dimensions.x / 2.0
                let dx = t.columns.0.x, dz = t.columns.0.z
                let nx = t.columns.2.x, nz = t.columns.2.z
                doorSegs.append([
                    "x1": Double((cx + dx * hw - minX) * m2f),
                    "z1": Double((cz + dz * hw - minZ) * m2f),
                    "x2": Double((cx - dx * hw - minX) * m2f),
                    "z2": Double((cz - dz * hw - minZ) * m2f),
                    "nx": Double(nx), "nz": Double(nz),
                    "width": Double(door.dimensions.x * m2f),
                ])
            }

            var windowSegs: [[String: Double]] = []
            for window in room.windows {
                let t = window.transform
                let cx = t.columns.3.x, cz = t.columns.3.z
                let hw = window.dimensions.x / 2.0
                let dx = t.columns.0.x, dz = t.columns.0.z
                windowSegs.append([
                    "x1": Double((cx + dx * hw - minX) * m2f),
                    "z1": Double((cz + dz * hw - minZ) * m2f),
                    "x2": Double((cx - dx * hw - minX) * m2f),
                    "z2": Double((cz - dz * hw - minZ) * m2f),
                ])
            }

            var openingSegs: [[String: Double]] = []
            for opening in room.openings {
                let t = opening.transform
                let cx = t.columns.3.x, cz = t.columns.3.z
                let hw = opening.dimensions.x / 2.0
                let dx = t.columns.0.x, dz = t.columns.0.z
                openingSegs.append([
                    "x1": Double((cx + dx * hw - minX) * m2f),
                    "z1": Double((cz + dz * hw - minZ) * m2f),
                    "x2": Double((cx - dx * hw - minX) * m2f),
                    "z2": Double((cz - dz * hw - minZ) * m2f),
                ])
            }

            let lFt = (maxZ - minZ) * m2f
            let wFt = (maxX - minX) * m2f
            let hFt = maxY * m2f
            return [
                "name": "Room \(i + 1)",
                "length": fmt2(lFt), "width": fmt2(wFt), "height": fmt2(hFt),
                "sqft": Int((lFt * wFt).rounded()),
                "doors": room.doors.count, "windows": room.windows.count,
                "wallSegments": wallSegs,
                "doorSegments": doorSegs,
                "windowSegments": windowSegs,
                "openingSegments": openingSegs,
                "worldX": Double((minX - gMinX) * m2f),
                "worldZ": Double((minZ - gMinZ) * m2f),
                "simulated": false,
            ] as [String: Any]
        }

        // If StructureBuilder returned fewer rooms than scanned, append fallback data
        if result.count < capturedRooms.count {
            let fallbacks = fallbackRooms()
            for j in result.count..<min(fallbacks.count, capturedRooms.count) {
                result.append(fallbacks[j])
            }
        }
        return result
    }

    private func fallbackRooms() -> [[String: Any]] {
        let m2f: Float = 3.28084
        let fmt2 = { (v: Float) -> Double in Double(String(format: "%.2f", v)) ?? Double(v) }
        return capturedRooms.enumerated().map { (i, room) in
            var minX: Float = .greatestFiniteMagnitude, maxX: Float = -.greatestFiniteMagnitude
            var minZ: Float = .greatestFiniteMagnitude, maxZ: Float = -.greatestFiniteMagnitude
            var maxY: Float = 0
            for wall in room.walls {
                let t = wall.transform
                let cx = t.columns.3.x, cz = t.columns.3.z
                let hw = wall.dimensions.x / 2.0
                let dx = t.columns.0.x, dz = t.columns.0.z
                minX = min(minX, min(cx + dx * hw, cx - dx * hw))
                maxX = max(maxX, max(cx + dx * hw, cx - dx * hw))
                minZ = min(minZ, min(cz + dz * hw, cz - dz * hw))
                maxZ = max(maxZ, max(cz + dz * hw, cz - dz * hw))
                maxY = max(maxY, wall.dimensions.y)
            }
            guard minX != .greatestFiniteMagnitude else {
                return ["name": "Room \(i+1)", "wallSegments": [] as [[String: Double]], "sqft": 0, "simulated": false] as [String: Any]
            }
            var wallSegs: [[String: Double]] = []
            for wall in room.walls {
                let t = wall.transform
                let cx = t.columns.3.x, cz = t.columns.3.z
                let hw = wall.dimensions.x / 2.0
                let dx = t.columns.0.x, dz = t.columns.0.z
                wallSegs.append([
                    "x1": Double((cx + dx * hw - minX) * m2f),
                    "z1": Double((cz + dz * hw - minZ) * m2f),
                    "x2": Double((cx - dx * hw - minX) * m2f),
                    "z2": Double((cz - dz * hw - minZ) * m2f),
                ])
            }
            let lFt = (maxZ - minZ) * m2f
            let wFt = (maxX - minX) * m2f
            let hFt = maxY * m2f
            return [
                "name": "Room \(i+1)",
                "length": fmt2(lFt), "width": fmt2(wFt), "height": fmt2(hFt),
                "sqft": Int((lFt * wFt).rounded()),
                "wallSegments": wallSegs,
                "simulated": false,
                // No worldX/worldZ → packing layout in PDF
            ] as [String: Any]
        }
    }
}
#endif
