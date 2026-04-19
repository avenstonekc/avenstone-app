/**
 * captureQuality.js — Quality score display helpers for post-capture report.
 * Deduction keys must match the strings emitted by CaptureQualityTracker.swift.
 */

export const DEDUCTION_MESSAGES = {
  too_few_walls:   'Less than 3 walls detected — consider re-scanning the room',
  partial_walls:   'Only 3 walls detected — room may be missing a wall',
  low_confidence:  'Many wall surfaces had low detection confidence',
  missing_ceiling: 'Ceiling surface not detected',
  scan_too_short:  'Scan was under 10 seconds — walk the full room slowly',
  small_room:      'Detected area under 40 sq ft — verify scan coverage',
  too_few_corners: 'Fewer than 4 corners placed — exterior outline may be incomplete',
  small_perimeter: 'Perimeter under 60 ft — verify all corners were placed',
  tracking_limited:'AR tracking was unstable during parts of the scan',
};

export function gradeColor(score) {
  if (score >= 75) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#EF4444';
}

export function gradeBg(score) {
  if (score >= 75) return '#D1FAE5';
  if (score >= 60) return '#FEF3C7';
  return '#FEE2E2';
}

export function gradeLabel(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}
