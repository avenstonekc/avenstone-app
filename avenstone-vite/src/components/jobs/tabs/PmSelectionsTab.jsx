// SCOPE_TO_ESTIMATE Phase C2 — PM confirm surface (pmOnly JobDet tab). Lists is_selection
// fields for the job; client picks show "Client picked" with a Confirm button; a PM may override
// by tapping a different option (upserts + confirms in one write, superseding the client's pick).
// Confirmed rows render locked. Reuses ScopeOptionCards unmodified. project_type + room_id derive
// from the job's default room (as the client tab does).
import { useState, useEffect } from 'react';
import { sb, sbLoadScopeOptionData, sbLoadScopeAnswers, sbConfirmScopeAnswer, sbUpsertStaffSelection } from '../../../lib/supabase';
import { Ic } from '../../../lib/utils';
import ScopeOptionCards from './ScopeOptionCards';

const NAV = 'var(--navy-900)';
const GOLD = 'var(--gold-500)';
const BORDER = 'var(--border)';
const humanizeOpt = s => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function PmSelectionsTab({ job }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [fields, setFields] = useState([]);
  const [images, setImages] = useState({});
  const [answers, setAnswers] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const { data: rooms } = await sb.from('job_rooms').select('id, label').eq('job_id', job.id).order('created_at', { ascending: true }).limit(1);
      const room = rooms?.[0] || null;
      setRoomId(room?.id || null);
      const pt = (room?.label || '').toLowerCase();
      if (!pt) { setFields([]); setAnswers([]); setLoading(false); return; }
      const od = await sbLoadScopeOptionData(pt, { isSelection: true });
      setFields(od.fields || []); setImages(od.images || {});
      const a = await sbLoadScopeAnswers(job.id);
      setAnswers(a.ok ? a.data : []);
    } catch { setErr('Could not load selections.'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [job.id]);

  const byField = {};
  for (const a of answers) byField[a.field_key] = a;
  const confirmedCount = fields.filter(f => byField[f.field_key]?.status === 'confirmed').length;

  const confirmPick = async (f) => {
    const a = byField[f.field_key]; if (!a) return;
    setBusy(f.field_key); setErr(null);
    const r = await sbConfirmScopeAnswer(a.id);
    if (!r.ok) setErr('Confirm failed. Try again.'); else await load();
    setBusy(null);
  };
  const overridePick = async (f, opt) => {
    setBusy(f.field_key); setErr(null);
    const r = await sbUpsertStaffSelection(job.id, roomId, f.field_key, opt, opt);
    if (!r.ok) setErr('Save failed. Try again.'); else await load();
    setBusy(null);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)', fontSize: 13 }}>Loading selections…</div>;
  if (!fields.length) return <div className="empty">{Ic.check}<div className="empty-t">No selection fields for this job</div><div>Selections apply to bathroom, kitchen, and basement projects.</div></div>;

  const qOf = f => f.question || humanizeOpt(f.field_key);

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: NAV }}>Client Selections</div>
        <span style={{ fontSize: 12, fontWeight: 700, color: confirmedCount === fields.length ? 'var(--green-dot)' : GOLD }}>{confirmedCount} of {fields.length} confirmed</span>
      </div>
      {err && <div style={{ background: 'var(--red-bg)', color: 'var(--red-text-strong)', padding: '8px 12px', fontSize: 12, borderRadius: 6, marginBottom: 12 }}>{err}</div>}
      {fields.map(f => {
        const a = byField[f.field_key];
        const isConfirmed = a?.status === 'confirmed';
        const isClientProposed = a?.status === 'proposed' && a?.source === 'client_selected';
        return (
          <div key={f.field_key} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderLeft: `3px solid ${isConfirmed ? 'var(--green-dot)' : isClientProposed ? 'var(--amber-text)' : BORDER}`, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isConfirmed ? 4 : 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: NAV }}>{qOf(f)}</span>
              {isConfirmed && <span style={{ fontSize: 9, background: 'var(--green-bg)', color: 'var(--green-text-strong)', padding: '3px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Confirmed</span>}
              {isClientProposed && <span style={{ fontSize: 9, background: 'var(--amber-bg)', color: 'var(--amber-text-strong)', padding: '3px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Client picked</span>}
            </div>
            {isConfirmed ? (
              <div style={{ fontSize: 14, fontWeight: 700, color: NAV }}>{humanizeOpt(a.option_key || a.value)}</div>
            ) : (
              <>
                {isClientProposed && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Client picked: <strong style={{ color: NAV }}>{humanizeOpt(a.option_key || a.value)}</strong></span>
                    <button className="btn btn-navy" style={{ fontSize: 11, minHeight: 32, padding: '0 12px' }} disabled={busy === f.field_key} onClick={() => confirmPick(f)}>{busy === f.field_key ? '…' : 'Confirm this'}</button>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 6 }}>{isClientProposed ? '…or tap a different option to override & confirm:' : 'Tap an option to confirm:'}</div>
                <ScopeOptionCards openFieldKeys={[f.field_key]} fields={[{ field_key: f.field_key, question: '', options: f.options }]} images={images} disabled={busy === f.field_key} onPick={overridePick} size="lg" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
