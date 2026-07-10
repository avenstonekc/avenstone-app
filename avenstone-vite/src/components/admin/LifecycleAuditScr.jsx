import { useState, useEffect } from 'react';
import { sb, AV_TENANT } from '../../lib/supabase';
import { compareStatus } from '../../lib/lifecycle';
import { sc, sl } from '../../lib/utils';

// Model B Phase 1 — shadow-comparison instrument panel (READ-ONLY).
// Compares each job's stored jobs.status against the status DERIVED from its
// job_phases rows. This is the arc's success meter: Phases 2-3 are done when
// this reads 100% AGREE. Nothing here writes — pure measurement.
export default function LifecycleAuditScr() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true); setErr('');
    const [{ data: jobs, error: je }, { data: phases, error: pe }] = await Promise.all([
      sb.from('jobs').select('id, address, status').eq('tenant_id', AV_TENANT),
      sb.from('job_phases').select('job_id, phase_name, phase_order, status').eq('tenant_id', AV_TENANT),
    ]);
    if (je || pe) { setErr((je || pe).message); setLoading(false); return; }
    const byJob = {};
    (phases || []).forEach(p => { (byJob[p.job_id] ||= []).push(p); });
    const computed = (jobs || []).map(j => {
      const jobPhases = byJob[j.id] || [];
      const { derived, agree, reason } = compareStatus(j.status, jobPhases, { onHold: j.status === 'on_hold' });
      return { id: j.id, address: j.address || '(no address)', stored: j.status, derived, agree, reason, phaseCount: jobPhases.length };
    }).sort((a, b) => (a.agree === b.agree ? 0 : a.agree ? 1 : -1)); // diverge first
    setRows(computed);
    setLoading(false);
  };

  const diverge = rows.filter(r => !r.agree).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: 'var(--navy-900)' }}>Lifecycle Audit</div>
          <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>Model B shadow — stored <code>jobs.status</code> vs status derived from <code>job_phases</code>. Read-only.</div>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading} style={{ fontSize: 12 }}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {!loading && !err && (
        <div className="card" style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 14, borderLeft: `4px solid ${diverge ? '#EF4444' : '#22c55e'}` }}>
          <div><div style={{ fontSize: 28, fontWeight: 800, color: diverge ? '#EF4444' : '#22c55e' }}>{diverge}</div><div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Diverging</div></div>
          <div><div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy-900)' }}>{rows.length - diverge}</div><div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Agreeing</div></div>
          <div><div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-subtle)' }}>{rows.length}</div><div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</div></div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-subtle)', maxWidth: 260 }}>
            {diverge === 0 ? '✓ Every job agrees — Model B rollup would be lossless.' : 'Divergence is expected in Phase 1 — the instrument, not a bug to fix.'}
          </div>
        </div>
      )}

      {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-subtle)' }}>Loading…</div>}
      {err && <div style={{ background: 'var(--red-bg, #FEE2E2)', border: '1px solid #FCA5A5', borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--red-text, #991B1B)' }}>{err}</div>}

      {!loading && !err && rows.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-subtle)' }}>No jobs found.</div>}

      {!loading && !err && rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr>
              <th>Property</th><th>jobs.status</th><th>Derived (phases)</th><th style={{ textAlign: 'right' }}>Match</th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const badge = st => <span className="badge" style={{ background: sc(st) + '15', color: sc(st) }}><span className="bdot" style={{ background: sc(st) }} />{sl(st)}</span>;
                return (
                  <tr key={r.id}>
                    <td><div className="cell-a">{r.address}</div>{r.phaseCount !== 10 && <div style={{ fontSize: 11, color: '#EF4444' }}>{r.phaseCount} phase rows (expected 10)</div>}</td>
                    <td>{badge(r.stored)}</td>
                    <td>{r.derived ? badge(r.derived) : <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>— {r.reason || 'not derivable'}</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: r.agree ? '#D1FAE5' : '#FEE2E2', color: r.agree ? '#065F46' : '#991B1B' }}>
                        {r.agree ? 'AGREE' : 'DIVERGE'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
