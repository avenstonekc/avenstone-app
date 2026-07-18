import { useState, useEffect } from 'react';
import { sbAssembleScopeRisks, sbKeepScopeRisk, sbRemoveKeptRisk } from '../../../lib/supabase';
import { isMob } from '../../../lib/utils';

const NAV = 'var(--navy-900)';
const BORDER = 'var(--border)';
const LIKE = {
  low:    { bg: 'var(--green-bg)', color: 'var(--green-text-strong)' },
  medium: { bg: '#FEF3C7',         color: 'var(--amber-text-strong)' },
  high:   { bg: 'var(--red-bg)',   color: 'var(--red-text-strong)' },
};

// SCOPE_RISK B2.5 — deterministic risk suggestions the rep reviews BEFORE the draft.
// Nothing auto-attaches: the rep keeps each explicitly. Kept risks become job-scoped
// oh_shit_moments and flow to the proposal "Potential Considerations" section (B2.6).
export default function ScopeRiskReview({ job }) {
  const mob = isMob();
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [kept, setKept] = useState([]);
  const [edits, setEdits] = useState({});
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await sbAssembleScopeRisks(job.id);
    setCandidates(res.candidates || []);
    setKept(res.kept || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [job?.id]);

  const keep = async (c) => {
    setBusy(c.risk_key);
    const text = edits[c.risk_key] ?? c.consideration;
    const res = await sbKeepScopeRisk(job.id, { ...c, consideration: text });
    setBusy('');
    if (!res.error) {
      setKept((k) => [...k, res.data]);
      setCandidates((cs) => cs.filter((x) => x.risk_key !== c.risk_key));
    }
  };

  const dismiss = (c) => setCandidates((cs) => cs.filter((x) => x.risk_key !== c.risk_key));

  const remove = async (row) => {
    setBusy(row.id);
    const res = await sbRemoveKeptRisk(row.id);
    setBusy('');
    if (!res.error) setKept((k) => k.filter((x) => x.id !== row.id));
  };

  if (loading) return null;
  if (!candidates.length && !kept.length) return null;

  const card = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 16, overflow: 'hidden' };

  return (
    <div style={card}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#FAFAF8', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16, color: NAV }}>
          Scope risks — heads-up before you finalize
          {(candidates.length + kept.length) > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 13 }}> ({candidates.length} to review · {kept.length} kept)</span>}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ padding: mob ? 12 : 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Suggested from this job's scope. Keep the ones worth disclosing — they'll appear as
            <strong> Potential Considerations</strong> on the proposal. Nothing is added unless you keep it.
          </div>

          {/* Candidates */}
          {candidates.map((c) => {
            const lk = LIKE[c.likelihood] || LIKE.medium;
            return (
              <div key={c.risk_key} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: NAV, fontSize: 14 }}>{c.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '2px 7px', borderRadius: 6, background: lk.bg, color: lk.color }}>{c.likelihood}</span>
                  {c.source === 'session' && <span style={{ fontSize: 10, fontWeight: 700, color: '#1E40AF', background: '#DBEAFE', borderRadius: 6, padding: '2px 7px' }}>FROM VISIT</span>}
                  {c.is_draft && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', background: '#F3F4F6', borderRadius: 6, padding: '2px 7px' }}>DRAFT</span>}
                  {(c.cost_low || c.cost_high) && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>${Number(c.cost_low||0).toLocaleString()}–${Number(c.cost_high||0).toLocaleString()} if hit</span>}
                </div>
                <textarea
                  style={{ width: '100%', minHeight: 54, fontSize: 16, padding: 8, border: `1px solid ${BORDER}`, borderRadius: 8, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5, resize: 'vertical' }}
                  value={edits[c.risk_key] ?? c.consideration}
                  onChange={(e) => setEdits((m) => ({ ...m, [c.risk_key]: e.target.value }))}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-navy" style={{ minHeight: 40 }} disabled={busy === c.risk_key} onClick={() => keep(c)}>
                    {busy === c.risk_key ? 'Keeping…' : 'Keep'}
                  </button>
                  <button className="btn btn-ghost" style={{ minHeight: 40 }} onClick={() => dismiss(c)}>Dismiss</button>
                </div>
              </div>
            );
          })}

          {/* Kept */}
          {kept.length > 0 && (
            <div style={{ marginTop: candidates.length ? 12 : 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, marginBottom: 8 }}>Kept — will appear on the proposal</div>
              {kept.map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
                  <span style={{ color: '#15803d', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: NAV, fontSize: 13 }}>{r.condition}</div>
                    <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.5 }}>{r.how_to_present}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', minHeight: 32 }} disabled={busy === r.id} onClick={() => remove(r)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
