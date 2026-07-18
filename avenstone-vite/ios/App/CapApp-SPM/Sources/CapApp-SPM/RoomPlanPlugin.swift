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
                scanVC.onComplete = { [weak self] result in
                    guard let self = self else { return }
                    DispatchQueue.main.async {
                        viewController.dismiss(animated: true) {
                            switch result {
                            case .success(let room):
                                let dict = self.roomToDict(room: room, name: self.currentRoomName)
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
                let floorIndex = call.getInt("floorIndex") ?? 0
                let vc = ContinuousRoomScanViewController()
                vc.floorIndex = floorIndex
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

        var objectSegs: [[String: Any]] = []
        for obj in room.objects {
            guard obj.confidence != .low else { continue }
            guard let categoryStr = fixtureCategoryString(obj.category) else { continue }
            let ot = obj.transform
            let objW = Double(obj.dimensions.x * metersToFeet)
            let objH = Double(obj.dimensions.y * metersToFeet)
            let objD = Double(obj.dimensions.z * metersToFeet)
            guard objW >= 0.3 && objD >= 0.3 else { continue }
            objectSegs.append([
                "category": categoryStr,
                "width": objW,
                "height": objH,
                "depth": objD,
                "x": Double((ot.columns.3.x - minX) * metersToFeet),
                "z": Double((ot.columns.3.z - minZ) * metersToFeet),
                "rotationY": Double(atan2(ot.columns.2.x, ot.columns.2.z)),
                "confidence": obj.confidence == .high ? "high" : "medium",
            ])
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
            "objects": objectSegs,
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
// Returns a lowercase category string for fixtures we render, nil for furniture/unknown to skip.
private func fixtureCategoryString(_ category: CapturedRoom.Object.Category) -> String? {
    if category == .toilet       { return "toilet" }
    if category == .bathtub      { return "bathtub" }
    if category == .sink         { return "sink" }
    if category == .stove        { return "stove" }
    if category == .oven         { return "oven" }
    if category == .refrigerator { return "refrigerator" }
    if category == .dishwasher   { return "dishwasher" }
    if category == .washerDryer  { return "washerDryer" }
    if category == .storage      { return "storage" }
    return nil
}
#endif

#if canImport(RoomPlan)
@available(iOS 16.0, *)
class RoomPlanScanViewController: UIViewController, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
    var roomName: String = "Room"
    var onComplete: ((Result<CapturedRoom, Error>) -> Void)?

    private var roomCaptureView: RoomCaptureView!
    private let sessionConfig = RoomCaptureSession.Configuration()
    private var didFinish = false
    private var scanStartDate: Date?

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
        scanStartDate = Date()
    }

    @objc private func doneTapped() {
        roomCaptureView.captureSession.stop()
    }

    @objc private func cancelTapped() {
        guard !didFinish else { return }
        didFinish = true
        roomCaptureView.captureSession.stop()
        onComplete?(.failure(NSError(
            domain: "RoomPlan",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Scan cancelled"]
        )))
    }

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard !didFinish else { return }
        didFinish = true
        if let error = error {
            onComplete?(.failure(error))
        } else {
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
    var floorIndex: Int = 0

    private var roomCaptureView: RoomCaptureView!
    private let sessionConfig = RoomCaptureSession.Configuration()
    private var capturedRooms: [CapturedRoom] = []
    private var roomNames: [String] = []
    private var pickerCompletion: ((String) -> Void)?
    private var isFinishing = false
    private var isTransitioning = false
    private var isCancelling = false
    private var structuredRooms: [[String: Any]] = [] // DEAD CODE: showNamingScreen only

    // Scan HUD
    private var roomCountLabel: UILabel!
    private var nextRoomButton: UIButton!
    private var doneButton: UIButton!
    private var processingOverlay: UIView!
    private var nameFields: [UITextField] = [] // DEAD CODE: showNamingScreen only

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

    private var scanStartDate: Date?

    private func startNextScan() {
        let n = capturedRooms.count + 1
        roomCountLabel.text = "Room \(n) — Scan the space"
        nextRoomButton.isEnabled = true
        doneButton.isEnabled = true
        scanStartDate = Date()
        roomCaptureView.captureSession.run(configuration: sessionConfig)
    }

    @objc private func nextRoomTapped() {
        guard !isTransitioning && !isCancelling else { return }
        isTransitioning = true
        isFinishing = false
        nextRoomButton.isEnabled = false
        doneButton.isEnabled = false
        // pauseARSession: false keeps ARKit world coordinates alive so rooms merge spatially
        roomCaptureView.captureSession.stop(pauseARSession: false)
    }

    @objc private func doneScanningTapped() {
        guard !isTransitioning && !isCancelling else { return }
        isTransitioning = true
        isFinishing = true
        nextRoomButton.isEnabled = false
        doneButton.isEnabled = false
        roomCaptureView.captureSession.stop(pauseARSession: true)
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
        if let error = error {
            let nsErr = error as NSError
            if nsErr.domain == "com.apple.RoomPlan" && nsErr.code == 101 {
                // exceedSceneSizeLimit — finalize what we have
                DispatchQueue.main.async {
                    self.showSizeLimitAlert()
                }
                return false
            }
        }
        // Reject ghost callbacks that fire within 2s of run() on scan 2+
        guard let start = scanStartDate, Date().timeIntervalSince(start) >= 2.0 else { return false }
        return true
    }

    private func showSizeLimitAlert() {
        let alert = UIAlertController(
            title: "Floor Plan Too Large",
            message: "Finish this section and start a new scan for the remaining rooms.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Finish This Section", style: .default) { _ in
            self.isFinishing = true
            self.processingOverlay.isHidden = false
            self.buildStructure()
        })
        present(alert, animated: true)
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard !isCancelling else { return }
        capturedRooms.append(processedResult)
        isTransitioning = false
        DispatchQueue.main.async {
            guard !self.isCancelling else { return }
            // Always show picker — user names every room as they go, including the last one
            let roomNum = self.capturedRooms.count
            self.showRoomPicker(roomNumber: roomNum) { name in
                self.roomNames.append(name)
                if self.isFinishing {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        guard !self.isCancelling else { return }
                        self.processingOverlay.isHidden = false
                        self.buildStructure()
                    }
                } else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        guard !self.isCancelling else { return }
                        self.startNextScan()
                    }
                }
            }
        }
    }

    // MARK: - Room picker

    private func showRoomPicker(roomNumber: Int, then completion: @escaping (String) -> Void) {
        pickerCompletion = completion
        let navy = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 0.97)
        let gold = UIColor(red: 201/255, green: 168/255, blue: 76/255, alpha: 1)

        let overlay = UIView()
        overlay.tag = 9901
        overlay.backgroundColor = navy
        overlay.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(overlay)

        NSLayoutConstraint.activate([
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let titleLabel = UILabel()
        titleLabel.text = "Room \(roomNumber) — What did you scan?"
        titleLabel.textColor = gold
        titleLabel.font = .systemFont(ofSize: 22, weight: .bold)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(titleLabel)

        let subtitleLabel = UILabel()
        subtitleLabel.text = "Tap a type to continue"
        subtitleLabel.textColor = UIColor.white.withAlphaComponent(0.55)
        subtitleLabel.font = .systemFont(ofSize: 14)
        subtitleLabel.textAlignment = .center
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(subtitleLabel)

        let roomTypes = [
            "Bedroom", "Bathroom", "Kitchen", "Living Room",
            "Hallway", "Dining Room", "Office", "Laundry Room",
            "Basement", "Garage"
        ]

        let vStack = UIStackView()
        vStack.axis = .vertical
        vStack.spacing = 12
        vStack.distribution = .fillEqually
        vStack.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(vStack)

        for row in 0..<5 {
            let hStack = UIStackView()
            hStack.axis = .horizontal
            hStack.spacing = 12
            hStack.distribution = .fillEqually
            for col in 0..<2 {
                let index = row * 2 + col
                guard index < roomTypes.count else { continue }
                let btn = UIButton(type: .system)
                btn.setTitle(roomTypes[index], for: .normal)
                btn.setTitleColor(.white, for: .normal)
                btn.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
                btn.backgroundColor = UIColor.white.withAlphaComponent(0.1)
                btn.layer.cornerRadius = 14
                btn.layer.borderWidth = 1
                btn.layer.borderColor = UIColor.white.withAlphaComponent(0.25).cgColor
                btn.heightAnchor.constraint(equalToConstant: 54).isActive = true
                btn.addTarget(self, action: #selector(roomTypeTapped(_:)), for: .touchUpInside)
                hStack.addArrangedSubview(btn)
            }
            vStack.addArrangedSubview(hStack)
        }

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.topAnchor, constant: 48),
            titleLabel.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 24),
            titleLabel.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -24),
            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 10),
            subtitleLabel.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            vStack.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 36),
            vStack.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 24),
            vStack.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -24),
        ])
    }

    @objc private func roomTypeTapped(_ sender: UIButton) {
        guard let name = sender.titleLabel?.text else { return }
        view.viewWithTag(9901)?.removeFromSuperview()
        let completion = pickerCompletion
        pickerCompletion = nil
        completion?(name)
    }

    // MARK: - StructureBuilder

    // Build a polygon from all wall endpoints, sorted by angle from centroid.
    private func wallPolygon(_ room: CapturedRoom) -> [(Float, Float)] {
        var pts: [(Float, Float)] = []
        for wall in room.walls {
            let t = wall.transform
            let cx = t.columns.3.x, cz = t.columns.3.z
            let hw = wall.dimensions.x / 2.0
            let dx = t.columns.0.x, dz = t.columns.0.z
            pts.append((cx + dx * hw, cz + dz * hw))
            pts.append((cx - dx * hw, cz - dz * hw))
        }
        guard pts.count >= 3 else { return pts }
        let mcx = pts.reduce(0) { $0 + $1.0 } / Float(pts.count)
        let mcz = pts.reduce(0) { $0 + $1.1 } / Float(pts.count)
        return pts.sorted { atan2($0.1 - mcz, $0.0 - mcx) < atan2($1.1 - mcz, $1.0 - mcx) }
    }

    private func pointInPolygon(_ px: Float, _ pz: Float, _ poly: [(Float, Float)]) -> Bool {
        guard poly.count >= 3 else { return false }
        var inside = false
        var j = poly.count - 1
        for i in 0..<poly.count {
            let xi = poly[i].0, zi = poly[i].1, xj = poly[j].0, zj = poly[j].1
            if ((zi > pz) != (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
                inside = !inside
            }
            j = i
        }
        return inside
    }

    // DEAD CODE: kept for reference. Naming now happens inline at scan time via showRoomPicker.
    private func matchNamesToStructuredRooms(_ structure: CapturedStructure) -> [Int: String] {
        guard !roomNames.isEmpty, !structure.rooms.isEmpty else { return [:] }
        let capPolygons = capturedRooms.map { wallPolygon($0) }
        let strCentroids: [(Float, Float)] = structure.rooms.map { room in
            guard !room.walls.isEmpty else { return (0, 0) }
            let cx = room.walls.map { $0.transform.columns.3.x }.reduce(0, +) / Float(room.walls.count)
            let cz = room.walls.map { $0.transform.columns.3.z }.reduce(0, +) / Float(room.walls.count)
            return (cx, cz)
        }
        var nameMap = [Int: String]()
        var usedCap = Set<Int>()
        for (j, sc) in strCentroids.enumerated() {
            for (i, poly) in capPolygons.enumerated() {
                guard !usedCap.contains(i), i < roomNames.count else { continue }
                if pointInPolygon(sc.0, sc.1, poly) { nameMap[j] = roomNames[i]; usedCap.insert(i); break }
            }
        }
        let capCentroids: [(Float, Float)] = capturedRooms.map { room in
            guard !room.walls.isEmpty else { return (0, 0) }
            let cx = room.walls.map { $0.transform.columns.3.x }.reduce(0, +) / Float(room.walls.count)
            let cz = room.walls.map { $0.transform.columns.3.z }.reduce(0, +) / Float(room.walls.count)
            return (cx, cz)
        }
        for (j, sc) in strCentroids.enumerated() {
            guard nameMap[j] == nil else { continue }
            var bestDist = Float.greatestFiniteMagnitude; var bestI = -1
            for (i, cc) in capCentroids.enumerated() {
                guard !usedCap.contains(i), i < roomNames.count else { continue }
                let d = (sc.0-cc.0)*(sc.0-cc.0) + (sc.1-cc.1)*(sc.1-cc.1)
                if d < bestDist { bestDist = d; bestI = i }
            }
            if bestI >= 0 { print("[LIDAR_WARN] room \(j) matched by centroid fallback (polygon miss)"); nameMap[j] = roomNames[bestI]; usedCap.insert(bestI) }
        }
        return nameMap
    }

    private func matchNamesByArea(_ structure: CapturedStructure) -> [Int: (String, Int)] {
        guard !roomNames.isEmpty, !structure.rooms.isEmpty else { return [:] }
        let m2ft2: Float = 10.764

        // NAMES-ONLY re-association. LOCKED SPATIAL-ALIGNMENT RULE (CLAUDE.md): this must never read
        // or write worldX/worldZ or any emitted geometry. It only decides which captured NAME maps to
        // which rebuilt room. The centroids below are derived read-only from wall transforms purely to
        // break area ties — no position/geometry value that leaves this function is touched.
        // Bounding box → (area in sf, center) in one pass, for a captured or rebuilt room.
        func bbox(_ room: CapturedRoom) -> (area: Float, cx: Float, cz: Float) {
            var minX: Float = .greatestFiniteMagnitude, maxX: Float = -.greatestFiniteMagnitude
            var minZ: Float = .greatestFiniteMagnitude, maxZ: Float = -.greatestFiniteMagnitude
            for wall in room.walls {
                let t = wall.transform
                let cx = t.columns.3.x, cz = t.columns.3.z
                let hw = wall.dimensions.x / 2.0
                let dx = t.columns.0.x, dz = t.columns.0.z
                minX = min(minX, cx + dx*hw, cx - dx*hw)
                maxX = max(maxX, cx + dx*hw, cx - dx*hw)
                minZ = min(minZ, cz + dz*hw, cz - dz*hw)
                maxZ = max(maxZ, cz + dz*hw, cz - dz*hw)
            }
            if minX == .greatestFiniteMagnitude { return (0, 0, 0) }
            return ((maxX - minX) * (maxZ - minZ) * m2ft2, (minX + maxX) / 2, (minZ + maxZ) / 2)
        }

        let capturedInfo = capturedRooms.map(bbox)
        let rebuiltInfo = structure.rooms.map(bbox)

        // Area stays the PRIMARY match. Failure mode being fixed: two rebuilt rooms of near-identical
        // area could swap names under pure area-greedy (rebuilt[0] grabs the globally-closest area,
        // which is not necessarily its own physical room). Fix: when several unused captured rooms tie
        // on area (within areaTolSf of the best delta), pick the one whose centroid is nearest the
        // rebuilt room — the same physical room. Only near-ties are affected; a lone best match is
        // chosen exactly as before.
        let areaTolSf: Float = 20.0

        var nameMap: [Int: (String, Int)] = [:]
        var usedCap = Set<Int>()

        for (j, reb) in rebuiltInfo.enumerated() {
            // Smallest area delta among still-unused captured rooms.
            var bestDelta: Float = .greatestFiniteMagnitude
            for (i, cap) in capturedInfo.enumerated() {
                guard !usedCap.contains(i), i < roomNames.count else { continue }
                let delta = abs(cap.area - reb.area)
                if delta < bestDelta { bestDelta = delta }
            }
            if bestDelta == .greatestFiniteMagnitude { continue } // no unused captured rooms remain

            // Among captured rooms whose area delta is within the tie band, choose the nearest centroid.
            // The best-area room is always inside the band, so a non-tie collapses to the old behavior.
            var bestI = -1
            var bestDist: Float = .greatestFiniteMagnitude
            var tiedCount = 0
            for (i, cap) in capturedInfo.enumerated() {
                guard !usedCap.contains(i), i < roomNames.count else { continue }
                guard abs(cap.area - reb.area) <= bestDelta + areaTolSf else { continue }
                tiedCount += 1
                let d = (reb.cx - cap.cx)*(reb.cx - cap.cx) + (reb.cz - cap.cz)*(reb.cz - cap.cz)
                if d < bestDist { bestDist = d; bestI = i }
            }
            if bestI >= 0 {
                nameMap[j] = (roomNames[bestI], bestI)
                usedCap.insert(bestI)
                let tb = tiedCount > 1 ? " [centroid tiebreak over \(tiedCount) area-ties]" : ""
                print("[LIDAR_NAME] rebuilt[\(j)] (area \(Int(reb.area))sf) → captured[\(bestI)] '\(roomNames[bestI])' (area \(Int(capturedInfo[bestI].area))sf)\(tb)")
            }
        }
        return nameMap
    }

    private func buildStructure() {
        print("[LIDAR_NAME] buildStructure starting — \(capturedRooms.count) captured rooms, names: \(roomNames)")
        guard !capturedRooms.isEmpty else {
            onComplete?(.failure(NSError(domain: "RoomPlan", code: -2,
                userInfo: [NSLocalizedDescriptionKey: "No rooms scanned"])))
            return
        }
        Task {
            do {
                let builder = StructureBuilder(options: [])
                let structure = try await builder.capturedStructure(from: capturedRooms)
                let nameMap = self.matchNamesByArea(structure)
                var rooms = self.structureToRooms(structure, nameMap: nameMap)
                rooms.sort { (a, b) -> Bool in
                    let aIdx = (a["scanIndex"] as? Int) ?? Int.max
                    let bIdx = (b["scanIndex"] as? Int) ?? Int.max
                    return aIdx < bIdx
                }
                await MainActor.run {
                    self.processingOverlay.isHidden = true
                    self.onComplete?(.success(rooms))
                }
            } catch {
                print("[LIDAR_NAME] StructureBuilder failed (\(error.localizedDescription)), using fallbackRooms")
                let rooms = self.fallbackRooms()
                await MainActor.run {
                    self.processingOverlay.isHidden = true
                    self.onComplete?(.success(rooms))
                }
            }
        }
    }

    // MARK: - Naming screen (DEAD CODE: kept for reference. Naming now happens inline at scan time via showRoomPicker.)

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
        titleLabel.text = "Confirm Room Names"
        titleLabel.textColor = gold
        titleLabel.font = .systemFont(ofSize: 24, weight: .bold)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(titleLabel)

        let subtitleLabel = UILabel()
        subtitleLabel.text = "Confirm names — tap to edit if needed"
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

            let segs = room["wallSegments"] as? [[String: Double]] ?? []
            let thumb = makeRoomThumbnail(wallSegments: segs)
            contentView.addSubview(thumb)

            let rowLabel = UILabel()
            rowLabel.text = "ROOM \(i + 1)"
            rowLabel.textColor = UIColor.white.withAlphaComponent(0.5)
            rowLabel.font = .systemFont(ofSize: 11, weight: .semibold)
            rowLabel.translatesAutoresizingMaskIntoConstraints = false
            contentView.addSubview(rowLabel)

            let field = UITextField()
            field.placeholder = hint
            if let matched = structuredRooms[i]["name"] as? String, !matched.hasPrefix("Room ") {
                field.text = matched
            }
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

            let spacing: CGFloat = i == 0 ? 28 : 18
            NSLayoutConstraint.activate([
                thumb.topAnchor.constraint(equalTo: prevView.bottomAnchor, constant: spacing),
                thumb.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 28),
                thumb.widthAnchor.constraint(equalToConstant: 52),
                thumb.heightAnchor.constraint(equalToConstant: 52),

                rowLabel.topAnchor.constraint(equalTo: thumb.topAnchor),
                rowLabel.leadingAnchor.constraint(equalTo: thumb.trailingAnchor, constant: 12),
                rowLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -28),

                field.topAnchor.constraint(equalTo: rowLabel.bottomAnchor, constant: 6),
                field.leadingAnchor.constraint(equalTo: thumb.trailingAnchor, constant: 12),
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

    private func makeRoomThumbnail(wallSegments: [[String: Double]], size: CGFloat = 52) -> UIView {
        let navy = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 1)

        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.backgroundColor = .white
        container.layer.cornerRadius = 6
        container.clipsToBounds = true

        guard !wallSegments.isEmpty else {
            let dash = UILabel()
            dash.text = "—"
            dash.textColor = UIColor(white: 0.75, alpha: 1)
            dash.font = .systemFont(ofSize: 18)
            dash.textAlignment = .center
            dash.translatesAutoresizingMaskIntoConstraints = false
            container.addSubview(dash)
            NSLayoutConstraint.activate([
                dash.centerXAnchor.constraint(equalTo: container.centerXAnchor),
                dash.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            ])
            return container
        }

        var minX = Double.greatestFiniteMagnitude, maxX = -Double.greatestFiniteMagnitude
        var minZ = Double.greatestFiniteMagnitude, maxZ = -Double.greatestFiniteMagnitude
        for seg in wallSegments {
            let x1 = seg["x1"] ?? 0, z1 = seg["z1"] ?? 0
            let x2 = seg["x2"] ?? 0, z2 = seg["z2"] ?? 0
            minX = min(minX, min(x1, x2)); maxX = max(maxX, max(x1, x2))
            minZ = min(minZ, min(z1, z2)); maxZ = max(maxZ, max(z1, z2))
        }

        let pad: CGFloat = 4
        let rangeX = maxX - minX
        let rangeZ = maxZ - minZ
        let drawSize = size - pad * 2
        let maxRange = max(rangeX, rangeZ)
        let scale: CGFloat = maxRange > 0 ? drawSize / CGFloat(maxRange) : 1
        let offsetX = pad + (drawSize - CGFloat(rangeX) * scale) / 2
        let offsetZ = pad + (drawSize - CGFloat(rangeZ) * scale) / 2

        for seg in wallSegments {
            let x1 = seg["x1"] ?? 0, z1 = seg["z1"] ?? 0
            let x2 = seg["x2"] ?? 0, z2 = seg["z2"] ?? 0
            let p1 = CGPoint(x: offsetX + CGFloat(x1 - minX) * scale,
                             y: offsetZ + CGFloat(z1 - minZ) * scale)
            let p2 = CGPoint(x: offsetX + CGFloat(x2 - minX) * scale,
                             y: offsetZ + CGFloat(z2 - minZ) * scale)
            let path = UIBezierPath()
            path.move(to: p1)
            path.addLine(to: p2)
            let shapeLayer = CAShapeLayer()
            shapeLayer.path = path.cgPath
            shapeLayer.strokeColor = navy.cgColor
            shapeLayer.lineWidth = 1.5
            shapeLayer.fillColor = UIColor.clear.cgColor
            container.layer.addSublayer(shapeLayer)
        }

        return container
    }

    // MARK: - Data conversion

    private func structureToRooms(_ structure: CapturedStructure, nameMap: [Int: (String, Int)] = [:]) -> [[String: Any]] {
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

            var objectSegs: [[String: Any]] = []
            for obj in room.objects {
                guard obj.confidence != .low else { continue }
                guard let categoryStr = fixtureCategoryString(obj.category) else { continue }
                let ot = obj.transform
                let oW = Double(obj.dimensions.x * m2f)
                let oH = Double(obj.dimensions.y * m2f)
                let oD = Double(obj.dimensions.z * m2f)
                guard oW >= 0.3 && oD >= 0.3 else { continue }
                objectSegs.append([
                    "category": categoryStr,
                    "width": oW,
                    "height": oH,
                    "depth": oD,
                    "x": Double((ot.columns.3.x - minX) * m2f),
                    "z": Double((ot.columns.3.z - minZ) * m2f),
                    "rotationY": Double(atan2(ot.columns.2.x, ot.columns.2.z)),
                    "confidence": obj.confidence == .high ? "high" : "medium",
                ])
            }

            let lFt = (maxZ - minZ) * m2f
            let wFt = (maxX - minX) * m2f
            let hFt = maxY * m2f
            return [
                "name": nameMap[i]?.0 ?? "Room \(i + 1)",
                "scanIndex": nameMap[i]?.1 ?? i,
                "length": fmt2(lFt), "width": fmt2(wFt), "height": fmt2(hFt),
                "sqft": Int((lFt * wFt).rounded()),
                "doors": room.doors.count, "windows": room.windows.count,
                "wallSegments": wallSegs,
                "doorSegments": doorSegs,
                "windowSegments": windowSegs,
                "openingSegments": openingSegs,
                "objects": objectSegs,
                "worldX": Double((minX - gMinX) * m2f),
                "worldZ": Double((minZ - gMinZ) * m2f),
                "floor": self.floorIndex,
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

        // Global bbox across all captured rooms for worldX/worldZ (spatial positioning in PDF)
        var gMinX: Float = .greatestFiniteMagnitude
        var gMinZ: Float = .greatestFiniteMagnitude
        for room in capturedRooms {
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
                return ["name": i < roomNames.count ? roomNames[i] : "Room \(i+1)",
                        "wallSegments": [] as [[String: Double]], "doorSegments": [] as [[String: Any]],
                        "windowSegments": [] as [[String: Double]], "openingSegments": [] as [[String: Double]],
                        "objects": [] as [[String: Any]],
                        "doors": 0, "windows": 0, "sqft": 0,
                        "floor": self.floorIndex, "simulated": false] as [String: Any]
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

            var doorSegs: [[String: Any]] = []
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

            var objectSegs: [[String: Any]] = []
            for obj in room.objects {
                guard obj.confidence != .low else { continue }
                guard let categoryStr = fixtureCategoryString(obj.category) else { continue }
                let ot = obj.transform
                let oW = Double(obj.dimensions.x * m2f)
                let oH = Double(obj.dimensions.y * m2f)
                let oD = Double(obj.dimensions.z * m2f)
                guard oW >= 0.3 && oD >= 0.3 else { continue }
                objectSegs.append([
                    "category": categoryStr,
                    "width": oW, "height": oH, "depth": oD,
                    "x": Double((ot.columns.3.x - minX) * m2f),
                    "z": Double((ot.columns.3.z - minZ) * m2f),
                    "rotationY": Double(atan2(ot.columns.2.x, ot.columns.2.z)),
                    "confidence": obj.confidence == .high ? "high" : "medium",
                ])
            }

            let lFt = (maxZ - minZ) * m2f
            let wFt = (maxX - minX) * m2f
            let hFt = maxY * m2f
            return [
                "name": i < roomNames.count ? roomNames[i] : "Room \(i+1)",
                "length": fmt2(lFt), "width": fmt2(wFt), "height": fmt2(hFt),
                "sqft": Int((lFt * wFt).rounded()),
                "doors": room.doors.count, "windows": room.windows.count,
                "wallSegments": wallSegs,
                "doorSegments": doorSegs,
                "windowSegments": windowSegs,
                "openingSegments": openingSegs,
                "objects": objectSegs,
                "worldX": Double((minX - gMinX) * m2f),
                "worldZ": Double((minZ - gMinZ) * m2f),
                "floor": self.floorIndex,
                "simulated": false,
            ] as [String: Any]
        }
    }
}
#endif
