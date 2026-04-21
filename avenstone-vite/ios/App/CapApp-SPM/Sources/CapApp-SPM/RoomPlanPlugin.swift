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
        // Phase 2 — multi-room merged floor plan export. Not implemented yet.
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

        // Use string formatting to avoid Float32 → Double precision garbage (e.g. 27.3 → 27.299999...)
        let fmt2 = { (v: Float) -> Double in Double(String(format: "%.2f", v)) ?? Double(v) }

        // Export each wall as a pair of endpoints, normalized to room origin, in feet.
        // This lets the PDF renderer draw the actual room shape instead of a bounding-box rectangle.
        var wallSegments: [[String: Double]] = []
        for wall in room.walls {
            let t = wall.transform
            let cx = t.columns.3.x
            let cz = t.columns.3.z
            let halfW = wall.dimensions.x / 2.0
            // Local X axis of the wall transform = wall direction in world space
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

        // Title label
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

        // Done button
        let doneButton = UIButton(type: .system)
        doneButton.setTitle("Done", for: .normal)
        doneButton.setTitleColor(.black, for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        doneButton.backgroundColor = UIColor(red: 201/255, green: 168/255, blue: 76/255, alpha: 1.0)
        doneButton.layer.cornerRadius = 24
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(doneButton)

        // Cancel button
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

    // RoomCaptureViewDelegate
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
// One persistent RoomCaptureSession scans multiple rooms in sequence.
// Each stop shows a naming overlay; RoomBuilder merges all rooms at the end.

#if canImport(RoomPlan)
@available(iOS 17.0, *)
class ContinuousRoomScanViewController: UIViewController, RoomCaptureViewDelegate {
    var onComplete: ((Result<[[String: Any]], Error>) -> Void)?

    private var roomCaptureView: RoomCaptureView!
    private let sessionConfig = RoomCaptureSession.Configuration()
    private var capturedDatas: [CapturedRoomData] = []
    private var capturedRooms: [CapturedRoom] = []
    private var roomNames: [String] = []
    private var pendingData: CapturedRoomData?
    private var pendingRoom: CapturedRoom?
    private var isCancelling = false

    // Scanning HUD
    private var roomCountLabel: UILabel!
    private var doneRoomButton: UIButton!

    // Naming overlay
    private var namingView: UIView!
    private var nameField: UITextField!
    private var scanNextBtn: UIButton!
    private var finishBtn: UIButton!
    private var buildingLabel: UILabel!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupCaptureView()
        setupScanHUD()
        setupNamingView()
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

        doneRoomButton = UIButton(type: .system)
        doneRoomButton.setTitle("Done With Room", for: .normal)
        doneRoomButton.setTitleColor(.black, for: .normal)
        doneRoomButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        doneRoomButton.backgroundColor = gold
        doneRoomButton.layer.cornerRadius = 24
        doneRoomButton.addTarget(self, action: #selector(doneRoomTapped), for: .touchUpInside)
        doneRoomButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(doneRoomButton)

        NSLayoutConstraint.activate([
            cancelBtn.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            cancelBtn.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            cancelBtn.heightAnchor.constraint(equalToConstant: 36),

            roomCountLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            roomCountLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            roomCountLabel.heightAnchor.constraint(equalToConstant: 36),
            roomCountLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 220),

            doneRoomButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            doneRoomButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            doneRoomButton.widthAnchor.constraint(equalToConstant: 200),
            doneRoomButton.heightAnchor.constraint(equalToConstant: 48),
        ])
    }

    private func setupNamingView() {
        let gold = UIColor(red: 201/255, green: 168/255, blue: 76/255, alpha: 1)
        let navyBg = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 0.97)

        namingView = UIView()
        namingView.backgroundColor = navyBg
        namingView.isHidden = true
        namingView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(namingView)

        let title = UILabel()
        title.text = "Name this room"
        title.textColor = gold
        title.font = .systemFont(ofSize: 22, weight: .bold)
        title.textAlignment = .center
        title.translatesAutoresizingMaskIntoConstraints = false

        nameField = UITextField()
        nameField.placeholder = "e.g. Master Bedroom"
        nameField.backgroundColor = UIColor(red: 1, green: 1, blue: 1, alpha: 1)
        nameField.textColor = UIColor(red: 0, green: 0, blue: 0, alpha: 1)
        nameField.tintColor = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 1)
        nameField.overrideUserInterfaceStyle = .light
        nameField.keyboardAppearance = .light
        nameField.layer.cornerRadius = 10
        nameField.font = .systemFont(ofSize: 17, weight: .regular)
        nameField.defaultTextAttributes = [
            .foregroundColor: UIColor(red: 0, green: 0, blue: 0, alpha: 1),
            .font: UIFont.systemFont(ofSize: 17, weight: .regular)
        ]
        nameField.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 0))
        nameField.leftViewMode = .always
        nameField.autocapitalizationType = .words
        nameField.returnKeyType = .done
        nameField.translatesAutoresizingMaskIntoConstraints = false

        scanNextBtn = UIButton(type: .system)
        scanNextBtn.setTitle("+ Scan Next Room", for: .normal)
        scanNextBtn.setTitleColor(.black, for: .normal)
        scanNextBtn.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        scanNextBtn.backgroundColor = gold
        scanNextBtn.layer.cornerRadius = 24
        scanNextBtn.addTarget(self, action: #selector(scanNextTapped), for: .touchUpInside)
        scanNextBtn.translatesAutoresizingMaskIntoConstraints = false

        finishBtn = UIButton(type: .system)
        finishBtn.setTitle("Complete — Build Floor Plan", for: .normal)
        finishBtn.setTitleColor(.white, for: .normal)
        finishBtn.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        finishBtn.backgroundColor = UIColor.white.withAlphaComponent(0.12)
        finishBtn.layer.cornerRadius = 24
        finishBtn.layer.borderWidth = 1
        finishBtn.layer.borderColor = UIColor.white.withAlphaComponent(0.3).cgColor
        finishBtn.addTarget(self, action: #selector(finishTapped), for: .touchUpInside)
        finishBtn.translatesAutoresizingMaskIntoConstraints = false

        buildingLabel = UILabel()
        buildingLabel.text = "Building floor plan..."
        buildingLabel.textColor = .white
        buildingLabel.font = .systemFont(ofSize: 16, weight: .medium)
        buildingLabel.textAlignment = .center
        buildingLabel.isHidden = true
        buildingLabel.translatesAutoresizingMaskIntoConstraints = false

        for sub in [title, nameField, scanNextBtn, finishBtn, buildingLabel] as [UIView] {
            namingView.addSubview(sub)
        }

        NSLayoutConstraint.activate([
            namingView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            namingView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            namingView.topAnchor.constraint(equalTo: view.topAnchor),
            namingView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            title.centerXAnchor.constraint(equalTo: namingView.centerXAnchor),
            title.centerYAnchor.constraint(equalTo: namingView.centerYAnchor, constant: -110),

            nameField.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 20),
            nameField.leadingAnchor.constraint(equalTo: namingView.leadingAnchor, constant: 32),
            nameField.trailingAnchor.constraint(equalTo: namingView.trailingAnchor, constant: -32),
            nameField.heightAnchor.constraint(equalToConstant: 50),

            scanNextBtn.topAnchor.constraint(equalTo: nameField.bottomAnchor, constant: 28),
            scanNextBtn.centerXAnchor.constraint(equalTo: namingView.centerXAnchor),
            scanNextBtn.widthAnchor.constraint(equalToConstant: 240),
            scanNextBtn.heightAnchor.constraint(equalToConstant: 50),

            finishBtn.topAnchor.constraint(equalTo: scanNextBtn.bottomAnchor, constant: 14),
            finishBtn.centerXAnchor.constraint(equalTo: namingView.centerXAnchor),
            finishBtn.widthAnchor.constraint(equalToConstant: 240),
            finishBtn.heightAnchor.constraint(equalToConstant: 50),

            buildingLabel.centerXAnchor.constraint(equalTo: namingView.centerXAnchor),
            buildingLabel.centerYAnchor.constraint(equalTo: namingView.centerYAnchor),
        ])
    }

    private func startNextScan() {
        namingView.isHidden = true
        doneRoomButton.isEnabled = true
        let n = capturedDatas.count + 1
        roomCountLabel.text = "Room \(n) — Scan the space"
        nameField.text = ""
        roomCaptureView.captureSession.run(configuration: sessionConfig)
    }

    @objc private func doneRoomTapped() {
        doneRoomButton.isEnabled = false
        roomCaptureView.captureSession.stop()
    }

    @objc private func scanNextTapped() {
        commitRoom()
        startNextScan()
    }

    @objc private func finishTapped() {
        commitRoom()
        buildStructure()
    }

    @objc private func cancelTapped() {
        guard !isCancelling else { return }
        isCancelling = true
        roomCaptureView.captureSession.stop()
        onComplete?(.failure(NSError(domain: "RoomPlan", code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Scan cancelled"])))
    }

    private func commitRoom() {
        nameField.resignFirstResponder()
        let raw = nameField.text?.trimmingCharacters(in: .whitespaces) ?? ""
        let n = capturedDatas.count + 1
        roomNames.append(raw.isEmpty ? "Room \(n)" : raw)
        if let d = pendingData { capturedDatas.append(d) }
        pendingData = nil
        if let r = pendingRoom { capturedRooms.append(r) }
        pendingRoom = nil
    }

    // MARK: - RoomCaptureViewDelegate

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        guard !isCancelling else { return false }
        pendingData = roomDataForProcessing
        DispatchQueue.main.async {
            self.namingView.isHidden = false
            self.nameField.textColor = UIColor(red: 0, green: 0, blue: 0, alpha: 1)
            self.nameField.backgroundColor = UIColor(red: 1, green: 1, blue: 1, alpha: 1)
            self.nameField.becomeFirstResponder()
        }
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard error == nil else { return }
        pendingRoom = processedResult
    }

    // MARK: - RoomBuilder

    private func buildStructure() {
        guard !capturedRooms.isEmpty else {
            onComplete?(.failure(NSError(domain: "RoomPlan", code: -2,
                userInfo: [NSLocalizedDescriptionKey: "No rooms scanned"])))
            return
        }
        DispatchQueue.main.async {
            self.scanNextBtn.isHidden = true
            self.finishBtn.isHidden = true
            self.nameField.isHidden = true
            self.buildingLabel.isHidden = false
        }
        Task {
            do {
                let builder = StructureBuilder(options: [])
                let structure = try await builder.capturedStructure(from: capturedRooms)
                let rooms = self.structureToRooms(structure)
                await MainActor.run {
                    self.onComplete?(.success(rooms))
                }
            } catch {
                await MainActor.run {
                    self.onComplete?(.failure(error))
                }
            }
        }
    }

    // MARK: - CapturedStructure → room dicts

    private func structureToRooms(_ structure: CapturedStructure) -> [[String: Any]] {
        let m2f: Float = 3.28084
        let fmt2 = { (v: Float) -> Double in Double(String(format: "%.2f", v)) ?? Double(v) }

        // Pass 1: global bounding box across all rooms
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

        // Pass 2: per-room dicts with local wall segments + world offset
        return structure.rooms.enumerated().map { (i, room) in
            let name = i < roomNames.count ? roomNames[i] : "Room \(i + 1)"
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

            let lFt = (maxZ - minZ) * m2f
            let wFt = (maxX - minX) * m2f
            let hFt = maxY * m2f

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
                // Normal (Z-axis) = swing direction in XZ plane
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

            return [
                "name": name,
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
            ]
        }
    }
}
#endif
