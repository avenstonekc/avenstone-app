import UIKit
import Capacitor
import CapApp_SPM

class AvenBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RoomPlanPlugin())
    }
}
