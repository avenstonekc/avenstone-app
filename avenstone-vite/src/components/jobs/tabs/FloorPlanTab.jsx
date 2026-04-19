import { useState, useEffect } from 'react';
import { sbGetJobLidarScans } from '../../../lib/supabase';
import AiIntakeWizard from '../../ai/AiIntakeWizard';

export default function FloorPlanTab({ job, profile }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);

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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                    {rooms.map((room, j) => (
                      <span
                        key={j}
                        style={{
                          backgroundColor: '#C9A84C',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: '500',
                          borderRadius: '20px',
                          padding: '4px 10px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {room.name} {formatSqft(room.sqft)} sf
                      </span>
                    ))}
                  </div>
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
    </div>
  );
}
