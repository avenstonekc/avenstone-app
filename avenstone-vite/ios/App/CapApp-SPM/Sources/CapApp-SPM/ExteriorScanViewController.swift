import ARKit
import SceneKit
import UIKit

class ExteriorScanViewController: UIViewController, ARSCNViewDelegate {

    var onComplete: ((Result<[String: Any], Error>) -> Void)?

    // AR state
    private var sceneView: ARSCNView!
    private var cornerAnchors: [ARAnchor] = []
    private var sphereNodes: [SCNNode] = []
    private var anchorIndexMap: [UUID: Int] = [:]
    private var lineNodes: [SCNNode] = []

    // Drag state
    private var dragNode: SCNNode?
    private var dragIndex: Int?
    private var panRecognizer: UIPanGestureRecognizer!

    private var didFinish = false

    // UI
    private var cancelButton: UIButton!
    private var undoButton: UIButton!
    private var resetButton: UIButton!
    private var doneButton: UIButton!
    private var statsLabel: UILabel!
    private var trackingLabel: UILabel!

    private let navyColor = UIColor(red: 10/255, green: 31/255, blue: 68/255, alpha: 1)
    private let goldColor = UIColor(red: 201/255, green: 168/255, blue: 76/255, alpha: 1)

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupARView()
        setupUI()
        setupGestures()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = .horizontal
        sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
    }

    // MARK: - Setup

    private func setupARView() {
        sceneView = ARSCNView(frame: view.bounds)
        sceneView.delegate = self
        sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        sceneView.scene = SCNScene()
        view.addSubview(sceneView)
    }

    private func setupUI() {
        // trackingLabel
        trackingLabel = UILabel()
        trackingLabel.translatesAutoresizingMaskIntoConstraints = false
        trackingLabel.textColor = .white
        trackingLabel.textAlignment = .center
        trackingLabel.font = UIFont.systemFont(ofSize: 14, weight: .medium)
        trackingLabel.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        trackingLabel.layer.cornerRadius = 8
        trackingLabel.layer.masksToBounds = true
        trackingLabel.text = "Initializing..."
        view.addSubview(trackingLabel)

        // statsLabel
        statsLabel = UILabel()
        statsLabel.translatesAutoresizingMaskIntoConstraints = false
        statsLabel.textColor = .white
        statsLabel.textAlignment = .center
        statsLabel.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
        statsLabel.backgroundColor = navyColor.withAlphaComponent(0.85)
        statsLabel.layer.cornerRadius = 10
        statsLabel.layer.masksToBounds = true
        statsLabel.text = "Tap to place first corner"
        view.addSubview(statsLabel)

        // cancelButton
        cancelButton = UIButton(type: .system)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .medium)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        view.addSubview(cancelButton)

        // undoButton
        undoButton = UIButton(type: .system)
        undoButton.translatesAutoresizingMaskIntoConstraints = false
        undoButton.setTitle("Undo", for: .normal)
        undoButton.setTitleColor(navyColor, for: .normal)
        undoButton.titleLabel?.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
        undoButton.backgroundColor = .white
        undoButton.layer.cornerRadius = 20
        undoButton.layer.masksToBounds = true
        undoButton.isEnabled = false
        undoButton.alpha = 0.5
        undoButton.addTarget(self, action: #selector(undoTapped), for: .touchUpInside)
        view.addSubview(undoButton)

        // doneButton
        doneButton = UIButton(type: .system)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.setTitle("Done", for: .normal)
        doneButton.setTitleColor(.black, for: .normal)
        doneButton.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .bold)
        doneButton.backgroundColor = goldColor
        doneButton.layer.cornerRadius = 24
        doneButton.layer.masksToBounds = true
        doneButton.isEnabled = false
        doneButton.alpha = 0.5
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        view.addSubview(doneButton)

        // resetButton
        resetButton = UIButton(type: .system)
        resetButton.translatesAutoresizingMaskIntoConstraints = false
        resetButton.setTitle("Reset", for: .normal)
        resetButton.setTitleColor(.white, for: .normal)
        resetButton.titleLabel?.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
        resetButton.backgroundColor = UIColor(red: 0.85, green: 0.25, blue: 0.25, alpha: 1)
        resetButton.layer.cornerRadius = 20
        resetButton.layer.masksToBounds = true
        resetButton.addTarget(self, action: #selector(resetTapped), for: .touchUpInside)
        view.addSubview(resetButton)

        let safeArea = view.safeAreaLayoutGuide

        NSLayoutConstraint.activate([
            // trackingLabel
            trackingLabel.topAnchor.constraint(equalTo: safeArea.topAnchor, constant: 16),
            trackingLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            trackingLabel.heightAnchor.constraint(equalToConstant: 32),
            trackingLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 180),

            // statsLabel
            statsLabel.topAnchor.constraint(equalTo: trackingLabel.bottomAnchor, constant: 10),
            statsLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            statsLabel.heightAnchor.constraint(equalToConstant: 36),
            statsLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 220),

            // cancelButton
            cancelButton.topAnchor.constraint(equalTo: safeArea.topAnchor, constant: 16),
            cancelButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            cancelButton.heightAnchor.constraint(equalToConstant: 36),

            // undoButton
            undoButton.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor, constant: -24),
            undoButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            undoButton.widthAnchor.constraint(equalToConstant: 80),
            undoButton.heightAnchor.constraint(equalToConstant: 40),

            // doneButton
            doneButton.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor, constant: -24),
            doneButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            doneButton.widthAnchor.constraint(equalToConstant: 140),
            doneButton.heightAnchor.constraint(equalToConstant: 48),

            // resetButton
            resetButton.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor, constant: -24),
            resetButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            resetButton.widthAnchor.constraint(equalToConstant: 80),
            resetButton.heightAnchor.constraint(equalToConstant: 40),
        ])
    }

    private func setupGestures() {
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        sceneView.addGestureRecognizer(tap)

        let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
        longPress.minimumPressDuration = 0.4
        sceneView.addGestureRecognizer(longPress)

        panRecognizer = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        panRecognizer.isEnabled = false
        sceneView.addGestureRecognizer(panRecognizer)
    }

    // MARK: - Gesture Handlers

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        guard !didFinish else { return }
        guard panRecognizer.isEnabled == false else { return }

        let loc = gesture.location(in: sceneView)
        guard let query = sceneView.raycastQuery(from: loc, allowing: .estimatedPlane, alignment: .horizontal) else { return }
        let results = sceneView.session.raycast(query)
        guard let hit = results.first else { return }

        let col = hit.worldTransform.columns.3
        _ = simd_make_float3(col.x, col.y, col.z)

        let anchor = ARAnchor(transform: hit.worldTransform)
        let index = cornerAnchors.count
        cornerAnchors.append(anchor)
        anchorIndexMap[anchor.identifier] = index
        sceneView.session.add(anchor: anchor)

        let sphere = makeSphereNode()
        sphere.simdWorldPosition = simd_make_float3(col.x, col.y, col.z)
        sceneView.scene.rootNode.addChildNode(sphere)
        sphereNodes.append(sphere)

        updateLines()
        updateStats()
        updateButtons()
    }

    private func makeSphereNode() -> SCNNode {
        let geometry = SCNSphere(radius: 0.05)
        let material = SCNMaterial()
        material.diffuse.contents = goldColor
        material.lightingModel = .constant
        geometry.materials = [material]
        let node = SCNNode(geometry: geometry)
        return node
    }

    @objc private func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
        let loc = gesture.location(in: sceneView)

        switch gesture.state {
        case .began:
            let hits = sceneView.hitTest(loc, options: [SCNHitTestOption.searchMode: SCNHitTestSearchMode.all.rawValue])
            for hit in hits {
                if let idx = sphereNodes.firstIndex(of: hit.node) {
                    dragNode = hit.node
                    dragIndex = idx
                    panRecognizer.isEnabled = true
                    break
                }
            }
        case .ended, .cancelled:
            finalizeOrCancelDrag()
        default:
            break
        }
    }

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard let node = dragNode, let idx = dragIndex, !didFinish else { return }

        let loc = gesture.location(in: sceneView)

        guard let query = sceneView.raycastQuery(from: loc, allowing: .estimatedPlane, alignment: .horizontal) else { return }
        let results = sceneView.session.raycast(query)
        guard let hit = results.first else { return }

        let col = hit.worldTransform.columns.3
        node.simdWorldPosition = simd_make_float3(col.x, col.y, col.z)

        updateLines()
        updateStats()

        if gesture.state == .ended {
            let oldAnchor = cornerAnchors[idx]
            sceneView.session.remove(anchor: oldAnchor)
            anchorIndexMap.removeValue(forKey: oldAnchor.identifier)

            let newAnchor = ARAnchor(transform: hit.worldTransform)
            cornerAnchors[idx] = newAnchor
            anchorIndexMap[newAnchor.identifier] = idx
            sceneView.session.add(anchor: newAnchor)

            finalizeOrCancelDrag()
        }
    }

    private func finalizeOrCancelDrag() {
        dragNode = nil
        dragIndex = nil
        panRecognizer.isEnabled = false
    }

    // MARK: - Lines

    private func updateLines() {
        for node in lineNodes {
            node.removeFromParentNode()
        }
        lineNodes.removeAll()

        let n = sphereNodes.count
        guard n >= 2 else { return }

        for i in 0..<n {
            let j = (i + 1) % n
            if j == 0 && n < 3 { continue }

            let posA = sphereNodes[i].simdWorldPosition
            let posB = sphereNodes[j].simdWorldPosition

            let dx = posB.x - posA.x
            let dy = posB.y - posA.y
            let dz = posB.z - posA.z
            let distance = sqrt(dx*dx + dy*dy + dz*dz)
            guard distance > 0.0001 else { continue }

            let cylinder = SCNCylinder(radius: 0.012, height: CGFloat(distance))
            let material = SCNMaterial()
            material.diffuse.contents = goldColor.withAlphaComponent(0.85)
            material.lightingModel = .constant
            cylinder.materials = [material]

            let lineNode = SCNNode(geometry: cylinder)

            let midX = (posA.x + posB.x) / 2
            let midY = (posA.y + posB.y) / 2
            let midZ = (posA.z + posB.z) / 2
            lineNode.simdWorldPosition = simd_make_float3(midX, midY, midZ)

            let up = SIMD3<Float>(0, 1, 0)
            let dir = simd_normalize(SIMD3<Float>(dx, dy, dz))
            let dotVal = simd_dot(up, dir)

            if abs(dotVal) < 0.9999 {
                let angle = acos(dotVal)
                let axis = simd_normalize(simd_cross(up, dir))
                lineNode.simdOrientation = simd_quatf(angle: angle, axis: axis)
            }

            sceneView.scene.rootNode.addChildNode(lineNode)
            lineNodes.append(lineNode)
        }
    }

    // MARK: - Measurements

    private func computeMeasurements() -> (perimeterFt: Double, areaSqft: Double) {
        let n = sphereNodes.count
        guard n >= 3 else { return (0, 0) }

        let metersToFeet = 3.28084
        let pts = sphereNodes.map { $0.simdWorldPosition }

        var perimeterMeters: Double = 0
        for i in 0..<n {
            let j = (i + 1) % n
            let dx = Double(pts[j].x - pts[i].x)
            let dz = Double(pts[j].z - pts[i].z)
            perimeterMeters += sqrt(dx*dx + dz*dz)
        }

        var shoelace: Double = 0
        for i in 0..<n {
            let j = (i + 1) % n
            shoelace += Double(pts[i].x) * Double(pts[j].z)
            shoelace -= Double(pts[j].x) * Double(pts[i].z)
        }
        let areaSqMeters = abs(shoelace) / 2
        let areaSqft = areaSqMeters * metersToFeet * metersToFeet
        let perimeterFt = perimeterMeters * metersToFeet

        return (perimeterFt, areaSqft)
    }

    // MARK: - UI Updates

    private func updateStats() {
        let n = sphereNodes.count
        if n == 0 {
            statsLabel.text = "Tap to place first corner"
        } else if n < 3 {
            let needed = 3 - n
            let cornerText = n == 1 ? "corner" : "corners"
            statsLabel.text = "\(n) \(cornerText) — need \(needed) more"
        } else {
            let (perim, area) = computeMeasurements()
            statsLabel.text = String(format: "%.0f sf  ·  %.0f ft perimeter", area, perim)
        }
    }

    private func updateButtons() {
        let n = sphereNodes.count
        if n >= 3 {
            doneButton.isEnabled = true
            doneButton.alpha = 1.0
        } else {
            doneButton.isEnabled = false
            doneButton.alpha = 0.5
        }

        if n > 0 {
            undoButton.isEnabled = true
            undoButton.alpha = 1.0
        } else {
            undoButton.isEnabled = false
            undoButton.alpha = 0.5
        }
    }

    // MARK: - Button Actions

    @objc private func doneTapped() {
        let n = sphereNodes.count
        guard !didFinish, n >= 3 else { return }
        didFinish = true

        let (perimFt, areaSqft) = computeMeasurements()

        let corners: [[String: Double]] = sphereNodes.map { node in
            ["x": Double(node.simdWorldPosition.x), "z": Double(node.simdWorldPosition.z)]
        }

        let result: [String: Any] = [
            "corners": corners,
            "perimeterFt": (perimFt * 10).rounded() / 10,
            "areaSqft": Int(areaSqft.rounded()),
            "simulated": false
        ]

        sceneView.session.pause()
        onComplete?(.success(result))
    }

    @objc private func undoTapped() {
        guard !sphereNodes.isEmpty else { return }

        let lastNode = sphereNodes.removeLast()
        lastNode.removeFromParentNode()

        let lastAnchor = cornerAnchors.removeLast()
        sceneView.session.remove(anchor: lastAnchor)
        anchorIndexMap.removeValue(forKey: lastAnchor.identifier)

        updateLines()
        updateStats()
        updateButtons()
    }

    @objc private func resetTapped() {
        for node in sphereNodes {
            node.removeFromParentNode()
        }
        for node in lineNodes {
            node.removeFromParentNode()
        }
        for anchor in cornerAnchors {
            sceneView.session.remove(anchor: anchor)
        }

        sphereNodes.removeAll()
        lineNodes.removeAll()
        cornerAnchors.removeAll()
        anchorIndexMap.removeAll()

        updateStats()
        updateButtons()
    }

    @objc private func cancelTapped() {
        guard !didFinish else { return }
        didFinish = true
        sceneView.session.pause()
        onComplete?(.failure(NSError(
            domain: "ExteriorScan",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Scan cancelled"]
        )))
    }

    // MARK: - ARSCNViewDelegate

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            switch frame.camera.trackingState {
            case .normal:
                self.trackingLabel.text = "Ready — tap to place corners"
                self.trackingLabel.backgroundColor = UIColor.black.withAlphaComponent(0.50)
            case .notAvailable:
                self.trackingLabel.text = "AR unavailable"
                self.trackingLabel.backgroundColor = UIColor(red: 0.8, green: 0.2, blue: 0.2, alpha: 0.9)
            case .limited(.initializing):
                self.trackingLabel.text = "Initializing..."
                self.trackingLabel.backgroundColor = UIColor(red: 0.7, green: 0.4, blue: 0.0, alpha: 0.9)
            case .limited(.excessiveMotion):
                self.trackingLabel.text = "Too much motion — slow down"
                self.trackingLabel.backgroundColor = UIColor(red: 0.7, green: 0.4, blue: 0.0, alpha: 0.9)
            case .limited(.insufficientFeatures):
                self.trackingLabel.text = "Point at a textured surface"
                self.trackingLabel.backgroundColor = UIColor(red: 0.7, green: 0.4, blue: 0.0, alpha: 0.9)
            case .limited(.relocalizing):
                self.trackingLabel.text = "Recovering tracking..."
                self.trackingLabel.backgroundColor = UIColor(red: 0.7, green: 0.4, blue: 0.0, alpha: 0.9)
            @unknown default:
                self.trackingLabel.text = "Limited tracking"
                self.trackingLabel.backgroundColor = UIColor(red: 0.7, green: 0.4, blue: 0.0, alpha: 0.9)
            }
        }
    }
}
