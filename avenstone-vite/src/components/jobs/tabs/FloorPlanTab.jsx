import { useState, useEffect } from 'react';
import { sbGetJobLidarScans, sbUploadDoc, sbUpdateScanOverrides, sbLoadFloorPlansForJob } from '../../../lib/supabase';
import { buildFloorPlanPDF } from '../../../lib/pdf';
import { buildScanArtifact, shareOrDownloadFile } from '../../../lib/scanArtifact';
import AiIntakeWizard from '../../ai/AiIntakeWizard';
import FloorPlanCanvas from '../../ai/FloorPlanCanvas';
import FloorPlanEditorScr from '../../floorPlan/FloorPlanEditorScr';

export default function FloorPlanTab({ job, profile }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [exportedIds, setExportedIds] = useState(new Set());
  const [exportingJsonId, setExportingJsonId] = useState(null);

  const loadScans = async () => {
    setLoading(true);
    const data = await sbGetJobLidarScans(job.id);
    setScans(data || []);
    setLoading(false);
  };

  const loadPlans = async () => {
    setPlansLoading(true);
    const { ok, data } = await sbLoadFloorPlansForJob(job.id);
    setPlans(ok ? (data || []) : []);
    setPlansLoading(false);
  };

  useEffect(() => {
    loadScans();
    loadPlans();
  }, [job.id]);

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatSqft = (n) => Number(n).toLocaleString();

  const handleExportPDF = async (scan) => {
    setExportingId(scan.id);
    try {
      const doc = await buildFloorPlanPDF(scan, job);
      const blob = doc.output('blob');
      const date = new Date(scan.created_at || scan.scanned_at).toISOString().slice(0, 10);
      const filename = `floor-plan-${date}.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });
      await sbUploadDoc(job.id, file, 'plan');
      setExportedIds(prev => new Set(prev).add(scan.id));
    } finally {
      setExportingId(null);
    }
  };

  // SCAN_INGEST v2 — export the scan's own JSON (the portable artifact + import contract),
  // alongside the human-readable PDF. Share sheet on device, download on desktop.
  const handleExportJson = async (scan) => {
    setExportingJsonId(scan.id);
    try {
      const artifact = buildScanArtifact(scan);
      const date = new Date(scan.created_at || scan.scanned_at).toISOString().slice(0, 10);
      const file = new File([JSON.stringify(artifact, null, 2)], `avenstone-scan-${date}.json`, { type: 'application/json' });
      await shareOrDownloadFile(file);
    } finally {
      setExportingJsonId(null);
    }
  };

  const statusBadge = (status) => {
    const map = { draft: ['#6B7280', '#F3F4F6'], sent: ['#16a34a', '#D1FAE5'] };
    const [color, bg] = map[status] || map.draft;
    return (
      <span style={{ fontSize: '11px', fontWeight: '600', color, background: bg, borderRadius: '20px', padding: '2px 8px', textTransform: 'capitalize', letterSpacing: '0.3px' }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '20px', color: '#0A1F44', margin: 0 }}>
          Floor Plans
        </h2>
        <button className="btn btn-gold" onClick={() => setShowScanner(true)}>
          New Scan
        </button>
      </div>

      {/* Saved Plans */}
      <p style={{ fontSize: '11px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 10px' }}>
        Saved Plans
      </p>
      {plansLoading ? (
        <p style={{ color: '#999', fontSize: '14px', marginBottom: '24px' }}>Loading…</p>
      ) : plans.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '24px', marginBottom: '24px' }}>
          <p style={{ fontSize: '14px', color: '#888', margin: 0 }}>No saved plans yet — complete a scan to create one</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          {plans.map(plan => (
            <div key={plan.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: '0 0 4px', fontFamily: "'DM Serif Display', serif", fontSize: '15px', color: '#0A1F44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {plan.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {statusBadge(plan.status)}
                  <span style={{ fontSize: '12px', color: '#999' }}>v{plan.current_pdf_version}</span>
                  <span style={{ fontSize: '12px', color: '#999' }}>·</span>
                  <span style={{ fontSize: '12px', color: '#999' }}>{formatDate(plan.updated_at)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                <button
                  className="btn btn-gold"
                  style={{ fontSize: '12px', padding: '4px 12px', height: '28px', display: 'flex', alignItems: 'center' }}
                  onClick={() => setEditingPlanId(plan.id)}
                >
                  Edit
                </button>
                {plan.current_pdf_url ? (
                  <a
                    href={plan.current_pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost"
                    style={{ fontSize: '12px', padding: '4px 12px', height: '28px', display: 'flex', alignItems: 'center' }}
                  >
                    Download
                  </a>
                ) : (
                  <span style={{ fontSize: '12px', color: '#bbb' }}>No PDF</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Scan History */}
      <p style={{ fontSize: '11px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 10px' }}>
        Scan History
      </p>
      {loading ? (
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      ) : scans.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: '18px', color: '#0A1F44', margin: '0 0 8px' }}>
            No floor plans yet
          </p>
          <p style={{ fontSize: '14px', color: '#888', margin: 0 }}>
            Tap New Scan to capture this property with LiDAR
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {scans.map((scan, i) => {
            const isExterior = scan.capture_mode === 'exterior';
            const rooms = scan.rooms || [];
            const totalSqft = rooms.reduce((sum, r) => sum + (r.sqft || 0), 0) || scan.total_sqft || 0;

            if (isExterior) {
              return (
                <div key={scan.id || i} className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: '16px', color: '#0A1F44' }}>
                      {formatDate(scan.created_at || scan.scanned_at)}
                    </span>
                    <span style={{ fontSize: '12px', color: '#888' }}>Legacy scan · {formatSqft(totalSqft)} sf</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={scan.id || i} className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: '16px', color: '#0A1F44' }}>
                      {formatDate(scan.created_at || scan.scanned_at)}
                    </span>
                    {scan.height_meters == null && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: '600', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Height missing
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '13px', color: '#666' }}>
                    {formatSqft(totalSqft)} sf
                  </span>
                </div>
                {rooms.length > 0 && (
                  <>
                    <FloorPlanCanvas rooms={rooms} compact={rooms.length < 3} />
                    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '12px', padding: '4px 12px', height: '28px' }}
                        disabled={exportingJsonId === scan.id}
                        onClick={() => handleExportJson(scan)}
                        title="Export the scan data as a file you can re-import into any job"
                      >
                        {exportingJsonId === scan.id ? 'Exporting…' : 'Export data'}
                      </button>
                      {exportedIds.has(scan.id) ? (
                        <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: '600', display: 'flex', alignItems: 'center' }}>
                          ✓ Saved to Documents
                        </span>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '12px', padding: '4px 12px', height: '28px' }}
                          disabled={exportingId === scan.id}
                          onClick={() => handleExportPDF(scan)}
                        >
                          {exportingId === scan.id ? 'Exporting…' : 'Export PDF'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showScanner && (
        <AiIntakeWizard
          profile={profile}
          jobId={job.id}
          job={job}
          onClose={() => { setShowScanner(false); loadScans(); loadPlans(); }}
        />
      )}

      {editingPlanId && (
        <FloorPlanEditorScr
          floorPlanId={editingPlanId}
          onBack={() => setEditingPlanId(null)}
        />
      )}

    </div>
  );
}
