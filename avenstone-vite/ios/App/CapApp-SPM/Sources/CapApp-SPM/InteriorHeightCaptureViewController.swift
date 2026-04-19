import ARKit
import SceneKit
import UIKit

class InteriorHeightCaptureViewController: UIViewController, ARSCNViewDelegate {
    var onComplete: ((Result<[String: Any], Error>) -> Void)?

    private var sceneView: ARSCNView!
    private var groundY: Float? = nil
    private var capturedPoints: [Double] = []
    private var floorDetectionTimer: Timer?

    private let navyColor = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 1)
    private let goldColor = UIColor(red: 201/255, green: 168/255, blue: 76/255, alpha: 1)

    private var cancelButton: UIButton!
    private var instructionLabel: UILabel!
    private var heightValueLabel: UILabel!
    private var retapButton: UIButton!
    private var confirmButton: UIButton!
    private var manualEntryButton: UIButton!
    private var manualHeightField: UITextField!
    private var crosshairView: UIView!
    private var statusPanel: UIView!

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupARView()
        setupUI()
        setupGestures()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.horizontal]
        sceneView.debugOptions = []
        sceneView.session.run(configuration)

        floorDetectionTimer = Timer.scheduledTimer(withTimeInterval: 4.0, repeats: false) { [weak self] _ in
            guard let self = self, self.groundY == nil else { return }
            self.groundY = -0.5
            DispatchQueue.main.async {
                self.instructionLabel.text = "Aim at ceiling and tap"
            }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
        floorDetectionTimer?.invalidate()
        floorDetectionTimer = nil
    }

    // MARK: - Setup

    private func setupARView() {
        sceneView = ARSCNView(frame: .zero)
        sceneView.delegate = self
        sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        sceneView.frame = view.bounds
        sceneView.scene = SCNScene()
        view.addSubview(sceneView)
    }

    private func setupUI() {
        // Cancel button
        cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = UIFont.systemFont(ofSize: 17)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        view.addSubview(cancelButton)

        // Instruction label
        instructionLabel = UILabel()
        instructionLabel.text = "Detecting floor..."
        instructionLabel.textColor = .white
        instructionLabel.font = UIFont.systemFont(ofSize: 15)
        instructionLabel.textAlignment = .center
        instructionLabel.numberOfLines = 2
        instructionLabel.backgroundColor = navyColor.withAlphaComponent(0.80)
        instructionLabel.layer.cornerRadius = 10
        instructionLabel.layer.masksToBounds = true
        instructionLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(instructionLabel)

        // Status panel
        statusPanel = UIView()
        statusPanel.backgroundColor = navyColor.withAlphaComponent(0.95)
        statusPanel.translatesAutoresizingMaskIntoConstraints = false
        let maskLayer = CAShapeLayer()
        statusPanel.layer.cornerRadius = 20
        statusPanel.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        statusPanel.layer.masksToBounds = true
        view.addSubview(statusPanel)

        // Height value label
        heightValueLabel = UILabel()
        heightValueLabel.text = "— ft"
        heightValueLabel.textColor = goldColor
        heightValueLabel.font = UIFont.boldSystemFont(ofSize: 40)
        heightValueLabel.textAlignment = .center
        heightValueLabel.translatesAutoresizingMaskIntoConstraints = false
        statusPanel.addSubview(heightValueLabel)

        // Manual entry button
        manualEntryButton = UIButton(type: .system)
        manualEntryButton.setTitle("Enter manually", for: .normal)
        manualEntryButton.setTitleColor(UIColor.white.withAlphaComponent(0.55), for: .normal)
        manualEntryButton.titleLabel?.font = UIFont.systemFont(ofSize: 13)
        manualEntryButton.translatesAutoresizingMaskIntoConstraints = false
        manualEntryButton.addTarget(self, action: #selector(showManualEntry), for: .touchUpInside)
        statusPanel.addSubview(manualEntryButton)

        // Manual height field
        manualHeightField = UITextField()
        manualHeightField.backgroundColor = .white
        manualHeightField.layer.cornerRadius = 8
        manualHeightField.layer.masksToBounds = true
        manualHeightField.keyboardType = .decimalPad
        manualHeightField.textAlignment = .center
        manualHeightField.placeholder = "Height in feet (e.g. 9.0)"
        manualHeightField.isHidden = true
        manualHeightField.translatesAutoresizingMaskIntoConstraints = false
        manualHeightField.addTarget(self, action: #selector(manualHeightChanged), for: .editingChanged)
        statusPanel.addSubview(manualHeightField)

        // Retap button
        retapButton = UIButton(type: .system)
        retapButton.setTitle("Re-tap", for: .normal)
        retapButton.setTitleColor(.white, for: .normal)
        retapButton.backgroundColor = UIColor.white.withAlphaComponent(0.18)
        retapButton.layer.cornerRadius = 18
        retapButton.layer.masksToBounds = true
        retapButton.isHidden = true
        retapButton.translatesAutoresizingMaskIntoConstraints = false
        retapButton.addTarget(self, action: #selector(retapTapped), for: .touchUpInside)
        statusPanel.addSubview(retapButton)

        // Confirm button
        confirmButton = UIButton(type: .system)
        confirmButton.setTitle("Confirm Height", for: .normal)
        confirmButton.setTitleColor(.black, for: .normal)
        confirmButton.titleLabel?.font = UIFont.boldSystemFont(ofSize: 17)
        confirmButton.backgroundColor = goldColor
        confirmButton.layer.cornerRadius = 24
        confirmButton.layer.masksToBounds = true
        confirmButton.isEnabled = false
        confirmButton.alpha = 0.5
        confirmButton.translatesAutoresizingMaskIntoConstraints = false
        confirmButton.addTarget(self, action: #selector(confirmTapped), for: .touchUpInside)
        statusPanel.addSubview(confirmButton)

        // Crosshair view
        crosshairView = UIView(frame: .zero)
        crosshairView.translatesAutoresizingMaskIntoConstraints = false
        crosshairView.isUserInteractionEnabled = false

        let horizontalBar = UIView()
        horizontalBar.backgroundColor = UIColor.white.withAlphaComponent(0.8)
        horizontalBar.translatesAutoresizingMaskIntoConstraints = false
        crosshairView.addSubview(horizontalBar)

        let verticalBar = UIView()
        verticalBar.backgroundColor = UIColor.white.withAlphaComponent(0.8)
        verticalBar.translatesAutoresizingMaskIntoConstraints = false
        crosshairView.addSubview(verticalBar)

        view.addSubview(crosshairView)

        // Crosshair sub-constraints
        NSLayoutConstraint.activate([
            horizontalBar.widthAnchor.constraint(equalToConstant: 44),
            horizontalBar.heightAnchor.constraint(equalToConstant: 2),
            horizontalBar.centerXAnchor.constraint(equalTo: crosshairView.centerXAnchor),
            horizontalBar.centerYAnchor.constraint(equalTo: crosshairView.centerYAnchor),

            verticalBar.widthAnchor.constraint(equalToConstant: 2),
            verticalBar.heightAnchor.constraint(equalToConstant: 44),
            verticalBar.centerXAnchor.constraint(equalTo: crosshairView.centerXAnchor),
            verticalBar.centerYAnchor.constraint(equalTo: crosshairView.centerYAnchor),
        ])

        // Main constraints
        NSLayoutConstraint.activate([
            // Cancel button
            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            cancelButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            cancelButton.heightAnchor.constraint(equalToConstant: 36),

            // Instruction label
            instructionLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 56),
            instructionLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            instructionLabel.heightAnchor.constraint(equalToConstant: 36),
            instructionLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 220),

            // Crosshair
            crosshairView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            crosshairView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            crosshairView.widthAnchor.constraint(equalToConstant: 44),
            crosshairView.heightAnchor.constraint(equalToConstant: 44),

            // Status panel
            statusPanel.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            statusPanel.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            statusPanel.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            statusPanel.heightAnchor.constraint(equalToConstant: 220),

            // Height value label
            heightValueLabel.topAnchor.constraint(equalTo: statusPanel.topAnchor, constant: 22),
            heightValueLabel.centerXAnchor.constraint(equalTo: statusPanel.centerXAnchor),

            // Manual entry button
            manualEntryButton.topAnchor.constraint(equalTo: heightValueLabel.bottomAnchor, constant: 8),
            manualEntryButton.centerXAnchor.constraint(equalTo: statusPanel.centerXAnchor),

            // Manual height field (same vertical as manualEntryButton)
            manualHeightField.topAnchor.constraint(equalTo: heightValueLabel.bottomAnchor, constant: 8),
            manualHeightField.centerXAnchor.constraint(equalTo: statusPanel.centerXAnchor),
            manualHeightField.widthAnchor.constraint(equalToConstant: 200),
            manualHeightField.heightAnchor.constraint(equalToConstant: 44),

            // Confirm button
            confirmButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            confirmButton.centerXAnchor.constraint(equalTo: statusPanel.centerXAnchor),
            confirmButton.widthAnchor.constraint(equalToConstant: 200),
            confirmButton.heightAnchor.constraint(equalToConstant: 48),

            // Retap button
            retapButton.centerYAnchor.constraint(equalTo: confirmButton.centerYAnchor),
            retapButton.leadingAnchor.constraint(equalTo: statusPanel.leadingAnchor, constant: 20),
            retapButton.widthAnchor.constraint(equalToConstant: 90),
            retapButton.heightAnchor.constraint(equalToConstant: 36),
        ])
    }

    private func setupGestures() {
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        sceneView.addGestureRecognizer(tapGesture)
    }

    // MARK: - Actions

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        let center = CGPoint(x: sceneView.bounds.midX, y: sceneView.bounds.midY)
        guard let query = sceneView.raycastQuery(from: center, allowing: .estimatedPlane, alignment: .any) else { return }
        let results = sceneView.session.raycast(query)
        guard let hit = results.first else {
            instructionLabel.text = "No surface detected — aim directly at ceiling"
            return
        }
        let hitY = Double(hit.worldTransform.columns.3.y)
        let gY = Double(groundY ?? 0)
        let heightM = hitY - gY
        guard heightM > 0.5 else {
            instructionLabel.text = "Point higher — aim at the ceiling"
            return
        }
        captureHeight(heightM)
    }

    private func captureHeight(_ heightM: Double) {
        capturedPoints.append(heightM)
        let maxH = capturedPoints.max()!
        let ft = maxH * 3.28084
        heightValueLabel.text = String(format: "%.1f ft", ft)
        instructionLabel.text = "Tap ceiling again to add a measurement, or confirm"
        retapButton.isHidden = false
        confirmButton.isEnabled = true
        confirmButton.alpha = 1.0
        manualEntryButton.isHidden = true
        manualHeightField.isHidden = true
        manualHeightField.resignFirstResponder()
    }

    @objc private func retapTapped() {
        instructionLabel.text = "Tap ceiling at the highest point"
    }

    @objc private func confirmTapped() {
        let heightM: Double
        let source: String
        if !capturedPoints.isEmpty {
            heightM = capturedPoints.max()!
            source = "auto"
        } else {
            guard let txt = manualHeightField.text, let ft = Double(txt), ft > 0 else { return }
            heightM = ft / 3.28084
            source = "manual"
        }
        sceneView.session.pause()
        onComplete?(.success([
            "heightMeters": (heightM * 100).rounded() / 100,
            "heightSource": source,
            "simulated": false,
        ]))
    }

    @objc private func showManualEntry() {
        manualEntryButton.isHidden = true
        manualHeightField.isHidden = false
        manualHeightField.becomeFirstResponder()
    }

    @objc private func manualHeightChanged() {
        guard let txt = manualHeightField.text, let ft = Double(txt), ft >= 1.5, ft <= 65 else {
            confirmButton.isEnabled = false
            confirmButton.alpha = 0.5
            return
        }
        heightValueLabel.text = String(format: "%.1f ft", ft)
        capturedPoints = [ft / 3.28084]
        confirmButton.isEnabled = true
        confirmButton.alpha = 1.0
    }

    @objc private func cancelTapped() {
        sceneView.session.pause()
        onComplete?(.failure(NSError(
            domain: "InteriorHeight",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Cancelled"]
        )))
    }

    // MARK: - ARSCNViewDelegate

    func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        for anchor in anchors {
            guard let plane = anchor as? ARPlaneAnchor, plane.alignment == .horizontal else { continue }
            let planeY = anchor.transform.columns.3.y
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                if self.groundY == nil || planeY < self.groundY! {
                    self.groundY = planeY
                    if self.capturedPoints.isEmpty {
                        self.instructionLabel.text = "Floor detected — aim at ceiling and tap"
                        self.instructionLabel.backgroundColor = self.navyColor.withAlphaComponent(0.80)
                    }
                    self.floorDetectionTimer?.invalidate()
                }
            }
        }
    }

    func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        guard capturedPoints.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            switch camera.trackingState {
            case .normal:
                if self.groundY != nil {
                    // Already showing "Floor detected — aim at ceiling and tap", do nothing
                    break
                } else {
                    self.instructionLabel.text = "Detecting floor..."
                }
            case .limited(let reason):
                switch reason {
                case .initializing:
                    self.instructionLabel.text = "Initializing AR..."
                case .relocalizing:
                    self.instructionLabel.text = "Relocalizing..."
                case .excessiveMotion:
                    self.instructionLabel.text = "Slow down — too much motion"
                case .insufficientFeatures:
                    self.instructionLabel.text = "Move to a better-lit area"
                @unknown default:
                    self.instructionLabel.text = "Limited tracking — move slowly"
                }
            case .notAvailable:
                self.instructionLabel.text = "AR tracking unavailable"
            }
        }
    }
}
