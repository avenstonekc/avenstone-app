// captureHeight.js — unit conversion + validation for height captures

export const METERS_TO_FEET = 3.28084;
export const FEET_TO_METERS = 1 / 3.28084;

export const metersToFeet = (m) => Math.round(m * METERS_TO_FEET * 10) / 10;
export const feetToMeters = (ft) => Math.round((ft * FEET_TO_METERS) * 1000) / 1000;

// Valid range: 1.5 ft (crawl space) to 65 ft (5-story wall)
export const HEIGHT_MIN_M = 0.46;
export const HEIGHT_MAX_M = 20;

export function validateHeight(meters) {
  if (!meters || typeof meters !== 'number') return false;
  return meters >= HEIGHT_MIN_M && meters <= HEIGHT_MAX_M;
}

export function formatHeightFt(meters) {
  if (!meters) return null;
  return metersToFeet(meters);
}
