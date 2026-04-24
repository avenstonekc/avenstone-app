// Centralized floor label mapping — used by pdf.js, lidar.js, and LidarScanner UI.
// Values match the `floor` integer stamped on room objects by RoomPlanPlugin.swift.
export const FLOOR_LABELS = {
  '-2': 'Sub-Basement',
  '-1': 'Basement',
  '0': '1st Floor',
  '1': '2nd Floor',
  '2': '3rd Floor',
  '3': '4th Floor',
};

export const floorLabel = (idx) => FLOOR_LABELS[String(idx)] || `Floor ${idx}`;
