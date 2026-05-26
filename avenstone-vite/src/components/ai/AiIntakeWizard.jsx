import { useState, useEffect } from 'react';
import LidarScanner from './LidarScanner';
import HeightCaptureStep from './HeightCaptureStep';
import { sb, AV_TENANT, sbSaveLidarScan, sbSaveJobLidarScan, sbUploadDoc, sbCreateFloorPlan } from '../../lib/supabase';
import { stampGPS } from '../../lib/gps';
import { buildFloorPlanPDF } from '../../lib/pdf';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';

export default function AiIntakeWizard({ profile, onClose, onJobCreated, jobId, job }) {
  const [rooms, setRooms] = useState([]);
  const [step, setStep] = useState('scan'); // 'scan' | 'height' | 'save'
  const [contacts, setContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [heightData, setHeightData] = useState(null); // { heightMeters, heightSource, heightPoints }

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

  function handleHeightConfirm(heightMeters, heightSource, heightPoints) {
    const hd = { heightMeters, heightSource, heightPoints };
    setHeightData(hd);
    if (jobId) { saveInterior(hd); } else { setStep('save'); }
  }

  async function saveInterior({ heightMeters, heightSource, heightPoints }) {
    setSaving(true);
    setSaveError(null);
    const totalSqft = rooms.reduce((sum, r) => sum + (r.sqft || 0), 0);
    const gps = await stampGPS();
    const { ok, error, data: savedScan } = await sbSaveJobLidarScan({
      jobId, rooms, totalSqft, captureMode: 'interior',
      heightMeters, heightSource, heightPoints,
      qualityScore: null, qualityGrade: null, qualityDeductions: null,
      gpsLatitude: gps?.latitude, gpsLongitude: gps?.longitude, gpsAccuracy: gps?.accuracy,
      editOverrides: null,
    });
    if (!ok) { setSaving(false); setSaveError(error || 'Save failed'); return; }

    // Auto-export PDF to Documents
    if (savedScan && job) {
      try {
        const doc = await buildFloorPlanPDF(savedScan, job);
        const blob = doc.output('blob');
        const date = new Date(savedScan.created_at).toISOString().slice(0, 10);
        const file = new File([blob], `floor-plan-${date}.pdf`, { type: 'application/pdf' });
        await sbUploadDoc(jobId, file, 'plan');
        await sbCreateFloorPlan({
          jobId,
          contactId: null,
          name: `Floor Plan — ${date}`,
          rawScan: savedScan,
          pdfBlob: blob,
        });
      } catch {
        // PDF export failure is non-fatal — scan is already saved
      }
    }

    setSaving(false);
    setSavedOk(true);
    setTimeout(onClose, 1400);
  }

  async function handleSave(contactId) {
    setSaving(true);
    setSaveError(null);
    const gps = await stampGPS();
    const hm = heightData?.heightMeters ?? null;
    const hs = heightData?.heightSource ?? null;
    const hp = heightData?.heightPoints ?? null;
    const totalSqft = rooms.reduce((sum, r) => sum + (r.sqft || 0), 0);
    const { error } = await sbSaveLidarScan({
      contactId, rooms, totalSqft, captureMode: 'interior',
      heightMeters: hm, heightSource: hs, heightPoints: hp,
      qualityScore: null, qualityGrade: null, qualityDeductions: null,
      gpsLatitude: gps?.latitude, gpsLongitude: gps?.longitude, gpsAccuracy: gps?.accuracy,
      editOverrides: null,
    });
    setSaving(false);
    if (error) { setSaveError(error || 'Save failed'); return; }
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
        flexShrink: 0, padding: 'calc(14px + env(safe-area-inset-top)) 18px 14px 18px', background: NAVY, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `3px solid ${GOLD}`,
      }}>
        <div>
          <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 20, margin: 0, lineHeight: 1.1 }}>
            {step === 'save' ? 'Save Floor Plan' : step === 'height' ? 'Capture Height' : 'Room Scanner'}
          </h2>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
            {step === 'save' ? 'Attach scan to a contact' : step === 'height' ? 'Required for paint, drywall, and siding estimates' : 'Scan rooms with LiDAR to capture real dimensions'}
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
          <LidarScanner rooms={rooms} onRoomsChange={setRooms} onDone={handleScanDone} />
        )}

        {step === 'height' && (
          <div>
            {saving && (
              <div style={{ textAlign: 'center', padding: '12px 0 0', color: '#888', fontFamily: '"DM Sans", sans-serif', fontSize: 14 }}>
                Saving...
              </div>
            )}
            {saveError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #EF4444', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#991B1B', fontFamily: '"DM Sans", sans-serif' }}>
                Save failed: {saveError}
              </div>
            )}
            {savedOk ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#22c55e', fontFamily: '"DM Sans", sans-serif', fontSize: 16, fontWeight: 600 }}>
                ✓ Saved
              </div>
            ) : (
              <HeightCaptureStep
                captureMode="interior"
                autoHeightFt={rooms.length > 0 ? Math.max(...rooms.map(r => r.height || 0)) || null : null}
                onConfirm={handleHeightConfirm}
              />
            )}
          </div>
        )}

        {step === 'save' && (
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            {/* Scan summary */}
            <div style={{
              background: '#fff', borderRadius: 10, padding: '16px 20px',
              marginBottom: 20, boxShadow: '0 1px 4px rgba(10,31,68,0.08)',
            }}>
              <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 16, color: NAVY, marginBottom: 10 }}>
                Scan Summary
              </div>
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
            </div>

            {saving && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#888', fontFamily: '"DM Sans", sans-serif', fontSize: 14 }}>
                Saving...
              </div>
            )}
            {saveError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #EF4444', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#991B1B', fontFamily: '"DM Sans", sans-serif' }}>
                Save failed: {saveError}
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
