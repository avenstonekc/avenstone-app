import UIKit

#if canImport(RoomPlan)
import RoomPlan
#endif

struct QualityResult {
    let score: Int
    let grade: String
    let deductions: [String]
}

class CaptureQualityTracker {

    // MARK: - Interior (final — from CapturedRoom after processing)

    #if canImport(RoomPlan)
    @available(iOS 16.0, *)
    static func scoreFromCapturedRoom(_ room: CapturedRoom, scanDurationSeconds: Double) -> QualityResult {
        var score = 100
        var deductions: [String] = []

        let wallCount = room.walls.count
        if wallCount < 3 {
            score -= 25
            deductions.append("too_few_walls")
        } else if wallCount < 4 {
            score -= 10
            deductions.append("partial_walls")
        }

        if wallCount > 0 {
            let lowCount = room.walls.filter { $0.confidence == .low }.count
            if Double(lowCount) / Double(wallCount) > 0.5 {
                score -= 20
                deductions.append("low_confidence")
            }
        }

        if scanDurationSeconds < 10 {
            score -= 15
            deductions.append("scan_too_short")
        }

        if !room.walls.isEmpty {
            var minX = room.walls[0].transform.columns.3.x
            var maxX = minX
            var minZ = room.walls[0].transform.columns.3.z
            var maxZ = minZ
            for w in room.walls {
                let x = w.transform.columns.3.x
                let z = w.transform.columns.3.z
                minX = min(minX, x); maxX = max(maxX, x)
                minZ = min(minZ, z); maxZ = max(maxZ, z)
            }
            let areaSqft = Float(max(maxX - minX, 0) * max(maxZ - minZ, 0)) * 10.7639
            if areaSqft > 1 && areaSqft < 40 {
                score -= 10
                deductions.append("small_room")
            }
        }

        let clamped = max(0, min(100, score))
        return QualityResult(score: clamped, grade: gradeFromScore(clamped), deductions: deductions)
    }
    #endif

    // MARK: - Live interior estimate (duration-based, shown during scan)
    static func liveInteriorScore(scanDurationSeconds: Double) -> Int {
        if scanDurationSeconds < 5  { return 20 }
        if scanDurationSeconds < 15 { return 45 }
        if scanDurationSeconds < 30 { return 65 }
        if scanDurationSeconds < 60 { return 80 }
        return 90
    }

    // MARK: - Exterior (final — from corner data after confirming height)
    static func scoreFromExteriorResult(cornerCount: Int, perimeterFt: Double, hadLimitedTracking: Bool) -> QualityResult {
        var score = 100
        var deductions: [String] = []

        if cornerCount < 4 {
            score -= 30
            deductions.append("too_few_corners")
        }
        if perimeterFt > 0 && perimeterFt < 60 {
            score -= 15
            deductions.append("small_perimeter")
        }
        if hadLimitedTracking {
            score -= 20
            deductions.append("tracking_limited")
        }

        let clamped = max(0, min(100, score))
        return QualityResult(score: clamped, grade: gradeFromScore(clamped), deductions: deductions)
    }

    // MARK: - Live exterior estimate (shown during corner placement)
    static func liveExteriorScore(cornerCount: Int, hadLimitedTracking: Bool) -> Int {
        var score = 100
        if cornerCount < 4 { score -= 30 }
        if hadLimitedTracking { score -= 20 }
        return max(0, min(100, score))
    }

    // MARK: - Helpers
    static func gradeFromScore(_ score: Int) -> String {
        if score >= 90 { return "A" }
        if score >= 75 { return "B" }
        if score >= 60 { return "C" }
        return "D"
    }

    static func colorForScore(_ score: Int) -> UIColor {
        if score >= 75 { return UIColor(red: 34/255, green: 197/255, blue: 94/255, alpha: 1) }
        if score >= 60 { return UIColor(red: 245/255, green: 158/255, blue: 11/255, alpha: 1) }
        return UIColor(red: 239/255, green: 68/255, blue: 68/255, alpha: 1)
    }
}
