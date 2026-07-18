import { useState } from 'react';
import {
  sbComposeRecap, sbUpdateRecap, sbConfirmMeasurement, sbUpdatePhotoCaption,
  sbSendRecap, sbLoadConsultationPhotos,
} from '../../../lib/supabase';
import { buildRecapPDF } from '../../../lib/recapPdf';
import { isMob } from '../../../lib/utils';

const NAV = 'var(--navy-900)';
const BORDER = 'var(--border)';

// CONSULTATION_MODE Slice 3 — rep reviews + edits the scope-only recap, confirms
// measurements, tweaks captions, then generates the branded PDF and emails the client.
export default function RecapPanel({ job, sessionId, unresolvedGaps = [], onComposed }) {
  const mob = isMob();
  const [busy, setBusy] = useState(false);
  const [composed, setComposed] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  const [recap, setRecap] = useState(null);
  const [summary, setSummary] = useState('');
  const [discussed, setDiscussed] = useState('');
  const [basis, setBasis] = useState('');
  const [open, setOpen] = useState('');
  const [measurements, setMeasurements] = useState([]);
  const [photos, setPhotos] = useState([]);

  const linesToArr = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const arrToLines = (a) => (a || []).join('\n');

  const compose = async () => {
    setBusy(true); setErr('');
    const res = await sbComposeRecap(sessionId, job.id, unresolvedGaps);
    if (res.error) { setErr(`Compose failed: ${res.error}`); setBusy(false); return; }
    onComposed?.(res.oh_shit_moments || []);
    const r = res.recap || {};
    setRecap(r);
    setSummary(r.summary || '');
    setDiscussed(arrToLines(r.discussed_items));
    setBasis(arrToLines(r.scope_basis));
    setOpen(arrToLines(r.open_items));
    setMeasurements(res.measurements || []);
    // Sign photo URLs for preview + PDF (compose returns rows without signed URLs).
    setPhotos(await sbLoadConsultationPhotos(sessionId));
    setComposed(true);
    setBusy(false);
  };

  const persistEdits = async () => {
    if (!recap?.id) return;
    await sbUpdateRecap(recap.id, {
      summary,
      discussed_items: linesToArr(discussed),
      scope_basis: linesToArr(basis),
      open_items: linesToArr(open),
    });
  };

  const toggleConfirm = async (m) => {
    const next = !m.confirmed_by_rep;
    setMeasurements((prev) => prev.map((x) => (x.id === m.id ? { ...x, confirmed_by_rep: next } : x)));
    await sbConfirmMeasurement(m.id, next);
  };

  const editCaption = async (p, caption) => {
    setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, caption, caption_source: 'manual' } : x)));
    await sbUpdatePhotoCaption(p.id, caption);
  };

  const buildDoc = async () => {
    await persistEdits();
    return buildRecapPDF({
      job,
      recap: { summary, discussed_items: linesToArr(discussed), scope_basis: linesToArr(basis), open_items: linesToArr(open) },
      measurements,
      photos,
    });
  };

  const downloadPdf = async () => {
    setBusy(true); setErr('');
    try {
      const doc = await buildDoc();
      doc.save(`Consultation Recap — ${job.address || 'Project'}.pdf`);
    } catch (e) { setErr(`PDF failed: ${e.message}`); }
    setBusy(false);
  };

  const sendToClient = async () => {
    if (!job.client_email) { setErr('No client email on this job — add one in the Info tab first.'); return; }
    setBusy(true); setErr('');
    try {
      const doc = await buildDoc();
      const b64 = doc.output('datauristring').split(',')[1];
      const res = await sbSendRecap({ recap, job, measurements, photos, pdfBase64: b64 });
      if (res.error) { setErr(`Send failed: ${res.error}`); }
      else setSent(true);
    } catch (e) { setErr(`Send failed: ${e.message}`); }
    setBusy(false);
  };

  const box = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: mob ? '14px 16px' : '18px 22px' };
  const label = { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, marginBottom: 6 };
  const ta = { width: '100%', minHeight: 64, fontSize: 16, padding: 10, border: `1px solid ${BORDER}`, borderRadius: 8, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5, resize: 'vertical' };

  if (!composed) {
    return (
      <div style={box}>
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: NAV, marginBottom: 6 }}>Client recap</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 14 }}>
          Compose a scope-only recap of this visit — discussed items, photos with captions, measurements,
          and what the bid is based on. You review and edit before it emails to the client. No prices.
        </div>
        {err && <div style={{ color: '#EF4444', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button className="btn btn-gold" style={{ minHeight: 48, fontSize: 15 }} disabled={busy} onClick={compose}>
          {busy ? 'Composing…' : 'Compose Recap'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={box}>
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: NAV, marginBottom: 12 }}>
          Review recap <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>— edit anything, then send</span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={label}>Summary</div>
          <textarea style={ta} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={label}>What we discussed (one per line)</div>
          <textarea style={ta} value={discussed} onChange={(e) => setDiscussed(e.target.value)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={label}>What the bid is based on (one per line)</div>
          <textarea style={ta} value={basis} onChange={(e) => setBasis(e.target.value)} />
        </div>
        <div>
          <div style={label}>Still to confirm (one per line)</div>
          <textarea style={ta} value={open} onChange={(e) => setOpen(e.target.value)} />
        </div>
      </div>

      {measurements.length > 0 && (
        <div style={box}>
          <div style={{ ...label, marginBottom: 10 }}>Measurements — confirm each</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {measurements.map((m) => (
              <label key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!m.confirmed_by_rep} onChange={() => toggleConfirm(m)} style={{ width: 18, height: 18, marginTop: 2, accentColor: '#C9A84C', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: NAV }}>
                    {m.trade} {m.source === 'inline' && <span style={{ fontSize: 10, color: '#92400E', background: '#FEF3C7', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>SPOKEN</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#4B5563' }}>
                    {Object.entries(m.fields || {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('  ·  ')}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div style={box}>
          <div style={{ ...label, marginBottom: 10 }}>Photos — captions from what you said</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {photos.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {p.url && <img src={p.url} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${BORDER}` }} />}
                <input
                  className="finp"
                  style={{ flex: 1 }}
                  placeholder="Caption…"
                  defaultValue={p.caption || ''}
                  onBlur={(e) => editCaption(p, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <div style={{ color: '#EF4444', fontSize: 13 }}>{err}</div>}
      {sent && <div style={{ color: '#15803d', fontSize: 14, fontWeight: 600 }}>✓ Recap emailed to {job.client_email}</div>}

      <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', gap: 10 }}>
        <button className="btn btn-gold" style={{ flex: 1, minHeight: 48, fontSize: 15 }} disabled={busy || sent} onClick={sendToClient}>
          {sent ? '✓ Sent' : busy ? 'Working…' : 'Generate PDF & Email to Client →'}
        </button>
        <button className="btn btn-ghost" style={{ minWidth: mob ? 'auto' : 140, minHeight: 48 }} disabled={busy} onClick={downloadPdf}>
          Download PDF
        </button>
      </div>
    </div>
  );
}
