import { useState, useEffect } from 'react';
import { sbGetJobLidarScans, sbUploadDoc, sbUpdateScanOverrides } from '../../../lib/supabase';
import { buildFloorPlanPDF } from '../../../lib/pdf';
import AiIntakeWizard from '../../ai/AiIntakeWizard';
import FloorPlanCanvas from '../../ai/FloorPlanCanvas';
import FloorPlanEditor from '../../ai/FloorPlanEditor';

export default function FloorPlanTab({ job, profile }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [exportingId, setExportingId] = useState(null);
  const [exportedIds, setExportedIds] = useState(new Set());
  const [editingScan, setEditingScan] = useState(null);

  const loadScans = async () => {
    setLoading(true);
    const data = await sbGetJobLidarScans(job.id);
    setScans(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadScans();
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
      const doc = buildFloorPlanPDF(scan, job);
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
            const outline = scan.outline_data || {};
            const totalSqft = isExterior
              ? (outline.areaSqft || scan.total_sqft || 0)
              : rooms.reduce((sum, r) => sum + (r.sqft || 0), 0);
            return (
              <div key={scan.id || i} className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: '16px', color: '#0A1F44' }}>
                      {formatDate(scan.created_at || scan.scanned_at)}
                    </span>
                    {isExterior && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: '600', color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Exterior
                      </span>
                    )}
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
                {isExterior ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                    {outline.perimeterFt && (
                      <span style={{ backgroundColor: '#0A1F44', color: '#fff', fontSize: '12px', fontWeight: '500', borderRadius: '20px', padding: '4px 10px' }}>
                        {outline.perimeterFt} ft perimeter
                      </span>
                    )}
                    {outline.corners && (
                      <span style={{ backgroundColor: '#E8E4DC', color: '#555', fontSize: '12px', fontWeight: '500', borderRadius: '20px', padding: '4px 10px' }}>
                        {outline.corners.length} corners
                      </span>
                    )}
                  </div>
                ) : rooms.length > 0 && (
                  <>
                    <FloorPlanCanvas rooms={rooms} compact={rooms.length < 3} />
                    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '12px', padding: '4px 12px', height: '28px' }}
                        onClick={() => setEditingScan(scan)}
                      >
                        Edit
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
          onClose={() => { setShowScanner(false); loadScans(); }}
        />
      )}

      {editingScan && (
        <FloorPlanEditor
          rooms={editingScan.rooms || []}
          initialOverrides={editingScan.edit_overrides || null}
          onCancel={() => setEditingScan(null)}
          onSave={async (ov) => {
            await sbUpdateScanOverrides(editingScan.id, true, ov);
            setEditingScan(null);
            loadScans();
          }}
        />
      )}
    </div>
  );
}
