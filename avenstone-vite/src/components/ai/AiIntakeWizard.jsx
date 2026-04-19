import { useState, useEffect } from 'react';
import LidarScanner from './LidarScanner';
import HeightCaptureStep from './HeightCaptureStep';
import CaptureQualityReport from './CaptureQualityReport';
import { sb, AV_TENANT, sbSaveLidarScan, sbSaveJobLidarScan } from '../../lib/supabase';
import { stampGPS } from '../../lib/gps';
import { metersToFeet } from '../../lib/captureHeight';
import { gradeLabel } from '../../lib/captureQuality';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';

export default function AiIntakeWizard({ profile, onClose, onJobCreated, jobId }) {
  const [rooms, setRooms] = useState([]);
  const [step, setStep] = useState('scan'); // 'scan' | 'height' | 'report' | 'save'
  const [contacts, setContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [exteriorResult, setExteriorResult] = useState(null);
  const [heightData, setHeightData] = useState(null); // { heightMeters, heightSource, heightPoints }
  const [qualityData, setQualityData] = useState(null); // { score, grade, deductions, rooms }

  useEffect(() => {
    sb.from('contacts')
      .select('id, first_name, last_name, phone, email')
      .eq('tenant_id', AV_TENANT)
      .order('first_name', { ascending: true })
      .then(({ data }) => setContacts(data || []));
  }, []);

  function handleScanDone() {
    if (rooms.length === 0) { onClose(); return; }
    setStep('height');
  }

  function handleExteriorCapture(result) {
    setExteriorResult(result);
    setStep('height');
  }

  function computeQualityData() {
    if (exteriorResult) {
      const score = exteriorResult.qualityScore ?? 70;
      return {
        score,
        grade: exteriorResult.qualityGrade ?? gradeLabel(score),
        deductions: exteriorResult.qualityDeductions ?? [],
        rooms: [],
      };
    }
    const scored = rooms.filter(r => r.qualityScore != null);
    const avgScore = scored.length > 0
      ? Math.round(scored.reduce((s, r) => s + r.qualityScore, 0) / scored.length)
      : 70;
    const deductions = [...new Set(scored.flatMap(r => r.qualityDeductions ?? []))];
    return {
      score: avgScore,
      grade: gradeLabel(avgScore),
      deductions,
      rooms: rooms.map(r => ({ name: r.name, sqft: r.sqft, score: r.qualityScore, grade: r.qualityGrade })),
    };
  }

  function handleHeightConfirm(heightMeters, heightSource, heightPoints) {
    setHeightData({ heightMeters, heightSource, heightPoints });
    setQualityData(computeQualityData());
    setStep('report');
  }

  async function handleReportAccept() {
    const hd = heightData;
    const qd = qualityData;
    if (exteriorResult) {
      if (jobId) {
        await saveExterior({ ...hd, qualityScore: qd?.score, qualityGrade: qd?.grade, qualityDeductions: qd?.deductions });
      } else {
        setStep('save');
      }
    } else {
      if (jobId) {
        await saveInterior({ ...hd, qualityScore: qd?.score, qualityGrade: qd?.grade, qualityDeductions: qd?.deductions });
      } else {
        setStep('save');
      }
    }
  }

  function handleReportRescan() {
    setRooms([]);
    setExteriorResult(null);
    setHeightData(null);
    setQualityData(null);
    setStep('scan');
  }

  async function saveInterior({ heightMeters, heightSource, heightPoints, qualityScore, qualityGrade, qualityDeductions }) {
    setSaving(true);
    const totalSqft = rooms.reduce((sum, r) => sum + (r.sqft || 0), 0);
    const gps = await stampGPS();
    await sbSaveJobLidarScan({
      jobId, rooms, totalSqft, captureMode: 'interior',
      heightMeters, heightSource, heightPoints,
      qualityScore: qualityScore ?? qualityData?.score ?? null,
      qualityGrade: qualityGrade ?? qualityData?.grade ?? null,
      qualityDeductions: qualityDeductions ?? qualityData?.deductions ?? null,
      gpsLatitude: gps?.latitude, gpsLongitude: gps?.longitude, gpsAccuracy: gps?.accuracy,
    });
    setSaving(false);
    setSavedOk(true);
    setTimeout(onClose, 1400);
  }

  async function saveExterior({ heightMeters, heightSource, heightPoints, qualityScore, qualityGrade, qualityDeductions }) {
    setSaving(true);
    const ext = exteriorResult;
    const gps = await stampGPS();
    await sbSaveJobLidarScan({
      jobId, rooms: [], totalSqft: ext.areaSqft, captureMode: 'exterior',
      outlineData: { corners: ext.corners, perimeterFt: ext.perimeterFt, areaSqft: ext.areaSqft },
      heightMeters, heightSource, heightPoints,
      qualityScore: qualityScore ?? qualityData?.score ?? null,
      qualityGrade: qualityGrade ?? qualityData?.grade ?? null,
      qualityDeductions: qualityDeductions ?? qualityData?.deductions ?? null,
      gpsLatitude: gps?.latitude, gpsLongitude: gps?.longitude, gpsAccuracy: gps?.accuracy,
    });
    setSaving(false);
    setSavedOk(true);
    setTimeout(onClose, 1400);
  }

  async function handleSave(contactId) {
    setSaving(true);
    const gps = await stampGPS();
    const hm = heightData?.heightMeters ?? null;
    const hs = heightData?.heightSource ?? null;
    const hp = heightData?.heightPoints ?? null;
    const qs = qualityData?.score ?? null;
    const qg = qualityData?.grade ?? null;
    const qd = qualityData?.deductions ?? null;
    if (exteriorResult) {
      await sbSaveLidarScan({
        contactId, rooms: [], totalSqft: exteriorResult.areaSqft,
        captureMode: 'exterior',
        outlineData: { corners: exteriorResult.corners, perimeterFt: exteriorResult.perimeterFt, areaSqft: exteriorResult.areaSqft },
        heightMeters: hm, heightSource: hs, heightPoints: hp,
        qualityScore: qs, qualityGrade: qg, qualityDeductions: qd,
        gpsLatitude: gps?.latitude, gpsLongitude: gps?.longitude, gpsAccuracy: gps?.accuracy,
      });
    } else {
      const totalSqft = rooms.reduce((sum, r) => sum + (r.sqft || 0), 0);
      await sbSaveLidarScan({
        contactId, rooms, totalSqft, captureMode: 'interior',
        heightMeters: hm, heightSource: hs, heightPoints: hp,
        qualityScore: qs, qualityGrade: qg, qualityDeductions: qd,
        gpsLatitude: gps?.latitude, gpsLongitude: gps?.longitude, gpsAccuracy: gps?.accuracy,
      });
    }
    setSaving(false);
    setSavedOk(true);
    setTimeout(onClose, 1400);
  }

  const filtered = contacts.filter(c => {
    const q = contactSearch.toLowerCase();
    if (!q) return true;
    return [c.first_name, c.last_name, c.email, c.phone]
      .some(v => v && v.toLowerCase().includes(q));
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Room Scanner"
      style={{
        position: 'fixed', inset: 0, background: CREAM,
        zIndex: 2000, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '14px 18px', background: NAVY, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `3px solid ${GOLD}`,
      }}>
        <div>
          <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 20, margin: 0, lineHeight: 1.1 }}>
            {step === 'save' ? 'Save Floor Plan' : step === 'height' ? 'Capture Height' : step === 'report' ? 'Scan Quality' : 'Room Scanner'}
          </h2>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
            {step === 'save' ? 'Attach scan to a contact' : step === 'height' ? 'Required for paint, drywall, and siding estimates' : step === 'report' ? 'Review before saving' : 'Scan rooms with LiDAR to capture real dimensions'}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', fontSize: 22, width: 38, height: 38, borderRadius: 8,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
        >×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px', WebkitOverflowScrolling: 'touch' }}>
        {step === 'scan' && (
          <LidarScanner rooms={rooms} onRoomsChange={setRooms} onDone={handleScanDone} onExteriorCapture={handleExteriorCapture} />
        )}

        {step === 'height' && (
          <HeightCaptureStep
            captureMode={exteriorResult ? 'exterior' : 'interior'}
            autoHeightFt={
              exteriorResult
                ? (exteriorResult.heightMeters ? metersToFeet(exteriorResult.heightMeters) : null)
                : (rooms.length > 0 ? Math.max(...rooms.map(r => r.height || 0)) || null : null)
            }
            onConfirm={handleHeightConfirm}
          />
        )}

        {step === 'report' && qualityData && (
          <CaptureQualityReport
            captureMode={exteriorResult ? 'exterior' : 'interior'}
            qualityData={qualityData}
            onAccept={handleReportAccept}
            onRescan={handleReportRescan}
          />
        )}

        {step === 'save' && (
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            {/* Scan summary */}
            <div style={{
              background: '#fff', borderRadius: 10, padding: '16px 20px',
              marginBottom: 20, boxShadow: '0 1px 4px rgba(10,31,68,0.08)',
            }}>
              <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 16, color: NAVY, marginBottom: 10 }}>
                {exteriorResult ? 'Exterior Scan' : 'Scan Summary'}
              </div>
              {exteriorResult ? (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 14px', fontSize: 13 }}>
                    <span style={{ color: '#777' }}>Area </span>
                    <span style={{ fontWeight: 700, color: NAVY }}>{exteriorResult.areaSqft.toLocaleString()} sf</span>
                  </div>
                  <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 14px', fontSize: 13 }}>
                    <span style={{ color: '#777' }}>Perimeter </span>
                    <span style={{ fontWeight: 700, color: NAVY }}>{exteriorResult.perimeterFt} ft</span>
                  </div>
                  <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 14px', fontSize: 13 }}>
                    <span style={{ color: '#777' }}>Corners </span>
                    <span style={{ fontWeight: 700, color: NAVY }}>{exteriorResult.corners.length}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {rooms.map((r, i) => (
                      <div key={i} style={{
                        background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8,
                        padding: '6px 12px', fontSize: 13,
                      }}>
                        <span style={{ fontWeight: 600, color: NAVY }}>{r.name}</span>
                        <span style={{ color: '#777', marginLeft: 6 }}>{r.sqft} sf</span>
                      </div>
                    ))}
                  </div>
                  <div style={{
                    marginTop: 12, display: 'inline-block', background: GOLD, color: '#fff',
                    borderRadius: 16, padding: '4px 14px', fontSize: 13, fontWeight: 700,
                  }}>
                    Total: {rooms.reduce((s, r) => s + (r.sqft || 0), 0).toLocaleString()} sf
                  </div>
                </>
              )}
            </div>

            {saving && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#888', fontFamily: '"DM Sans", sans-serif', fontSize: 14 }}>
                Saving...
              </div>
            )}
            {savedOk ? (
              <div style={{
                textAlign: 'center', padding: '32px 0',
                color: '#22c55e', fontFamily: '"DM Sans", sans-serif', fontSize: 16, fontWeight: 600,
              }}>
                ✓ Saved to contact
              </div>
            ) : (
              <>
                <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 16, color: NAVY, marginBottom: 10 }}>
                  Attach to Contact
                </div>
                <input
                  className="finp"
                  placeholder="Search contacts..."
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12 }}
                />
                {filtered.length === 0 ? (
                  <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                    No contacts found.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                    {filtered.slice(0, 20).map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleSave(c.id)}
                        disabled={saving}
                        style={{
                          background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8,
                          padding: '12px 16px', cursor: saving ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          textAlign: 'left', opacity: saving ? 0.6 : 1,
                          transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={e => { if (!saving) e.currentTarget.style.borderColor = GOLD; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: NAVY, fontSize: 14 }}>
                            {c.first_name} {c.last_name}
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                            {c.phone || c.email || '—'}
                          </div>
                        </div>
                        <span style={{ color: GOLD, fontSize: 18 }}>→</span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={onClose}
                  style={{
                    background: 'none', border: 'none', color: '#9CA3AF',
                    fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                    padding: '8px 0', display: 'block', margin: '0 auto',
                  }}
                >
                  Skip — don't save
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
