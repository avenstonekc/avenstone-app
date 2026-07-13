// SCAN_INGEST v2 — the scan's own JSON is the portable artifact and the import contract.
// Export strips job-bound fields (job_id / tenant_id / created_by / id) and wraps the
// job_lidar_scans row in a versioned envelope; import maps it back to sbSaveJobLidarScan
// params, re-stamping the target job. A scan file re-entering the app behaves identically
// to a live capture (normalize + room link + measured answers + takeoff visibility all fire
// inside sbSaveJobLidarScan). No mystery-format parsing — the app's own JSON is the contract.

export const SCAN_ARTIFACT_FORMAT = 'avenstone-scan';
export const SCAN_ARTIFACT_VERSION = 1;

/**
 * Build the portable JSON artifact from a job_lidar_scans row.
 * Job-bound columns (id, job_id, tenant_id, created_by, created_at) are intentionally
 * omitted — they are re-stamped on import. `rooms` (with worldX/worldZ/floor/heights/
 * wallSegments/objects) and all quality/height/gps/outline fields round-trip verbatim.
 */
export function buildScanArtifact(scan) {
  return {
    format: SCAN_ARTIFACT_FORMAT,
    version: SCAN_ARTIFACT_VERSION,
    scan: {
      rooms: scan.rooms || [],
      total_sqft: scan.total_sqft ?? null,
      capture_mode: scan.capture_mode ?? 'interior',
      height_meters: scan.height_meters ?? null,
      height_source: scan.height_source ?? null,
      height_points: scan.height_points ?? null,
      gps_latitude: scan.gps_latitude ?? null,
      gps_longitude: scan.gps_longitude ?? null,
      gps_accuracy: scan.gps_accuracy ?? null,
      quality_score: scan.quality_score ?? null,
      quality_grade: scan.quality_grade ?? null,
      quality_deductions: scan.quality_deductions ?? null,
      outline_data: scan.outline_data ?? null,
      edit_overrides: scan.edit_overrides ?? null,
      // normalized_geometry is recomputed on import; kept here for round-trip fidelity/debug.
      normalized_geometry: scan.normalized_geometry ?? null,
    },
  };
}

/** True if a parsed object is a recognizable avenstone-scan artifact. */
export function isScanArtifact(obj) {
  return !!(obj && obj.format === SCAN_ARTIFACT_FORMAT && obj.scan && Array.isArray(obj.scan.rooms));
}

/**
 * Map a parsed artifact → sbSaveJobLidarScan params, re-stamping the target job.
 * tenant_id + created_by are re-stamped inside sbSaveJobLidarScan (AV_TENANT / AV_USER_ID).
 */
export function artifactToScanParams(artifact, jobId) {
  const s = (artifact && artifact.scan) || {};
  const rooms = s.rooms || [];
  return {
    jobId,
    rooms,
    totalSqft: s.total_sqft ?? rooms.reduce((a, r) => a + (r.sqft || 0), 0),
    captureMode: s.capture_mode ?? 'interior',
    heightMeters: s.height_meters ?? null,
    heightSource: s.height_source ?? null,
    heightPoints: s.height_points ?? null,
    gpsLatitude: s.gps_latitude ?? null,
    gpsLongitude: s.gps_longitude ?? null,
    gpsAccuracy: s.gps_accuracy ?? null,
    qualityScore: s.quality_score ?? null,
    qualityGrade: s.quality_grade ?? null,
    qualityDeductions: s.quality_deductions ?? null,
    outlineData: s.outline_data ?? null,
    editOverrides: s.edit_overrides ?? null,
  };
}

/**
 * Send a File out of the app: native share sheet where available (iOS WKWebView / mobile
 * Safari support Web Share Level 2 file sharing), else an anchor download (desktop).
 * @returns {Promise<{ok, method: 'share'|'download'|'cancelled'}>}
 */
export async function shareOrDownloadFile(file) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: file.name });
      return { ok: true, method: 'share' };
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: true, method: 'cancelled' };
    // otherwise fall through to download
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  return { ok: true, method: 'download' };
}
