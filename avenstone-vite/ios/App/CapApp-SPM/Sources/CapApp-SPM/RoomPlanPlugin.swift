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

        return [
            "name": name,
            "length": Double((lengthFt * 10).rounded() / 10),
            "width": Double((widthFt * 10).rounded() / 10),
            "height": Double((heightFt * 10).rounded() / 10),
            "sqft": Int(sqft.rounded()),
            "doors": room.doors.count,
            "windows": room.windows.count,
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
