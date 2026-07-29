import { useState, useEffect, useRef } from 'react';
import { sbMyOpenEntry, sbMyEntriesToday, sbCrewJobs, sbClockIn, sbSwitchJob, sbClockOut } from '../../lib/supabase';
import { stampGPS } from '../../lib/gps';

// ─── CrewHomeScr (TIME_CLOCK_ARC S1) ──────────────────────────────────────────
// The crew member's ENTIRE app: clock in → (switch job)* → clock out, from a phone in a
// driveway. Big targets, two taps to punch. GPS is one-shot and NEVER blocks a punch.

const NAV = 'var(--navy-900)', GOLD = 'var(--gold-500)', BORDER = 'var(--border)';

const fmtClock = (iso) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
const two = (n) => String(n).padStart(2, '0');
const fmtElapsed = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${two(m)}:${two(sec)}`;
};
const fmtDur = (inIso, outIso) => {
  const ms = (new Date(outIso).getTime() - new Date(inIso).getTime());
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function CrewHomeScr({ profile, signOut }) {
  const [open, setOpen] = useState(null);       // current open time_entry (or null)
  const [today, setToday] = useState([]);        // today's entries
  const [jobs, setJobs] = useState([]);          // active jobs for the picker
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(null);    // null | 'in' | 'switch'
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [err, setErr] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const tickRef = useRef(null);

  const jobLabel = (id) => jobs.find(j => j.id === id)?.address || today.find(t => t.job_id === id && t.jobLabel)?.jobLabel || id;

  const refresh = async () => {
    const [o, t] = await Promise.all([sbMyOpenEntry(), sbMyEntriesToday()]);
    setOpen(o.ok ? o.data : null);
    setToday(t.ok ? t.data : []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  // live elapsed tick while clocked in
  useEffect(() => {
    if (open) { tickRef.current = setInterval(() => setNowTick(Date.now()), 1000); }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [open]);

  const openPicker = async (mode) => {
    setErr(''); setPicker(mode);
    if (!jobs.length) { const r = await sbCrewJobs(); if (r.ok) setJobs(r.data); }
  };

  // one-shot GPS, then punch. GPS failure → null coords, punch still proceeds.
  const withGps = async (fn) => {
    setBusy(true); setGpsBusy(true); setErr('');
    const g = await stampGPS().catch(() => null);
    setGpsBusy(false);
    const coords = { lat: g?.latitude ?? null, lng: g?.longitude ?? null };
    const res = await fn(coords);
    setBusy(false);
    if (res && res.ok === false) {
      setErr(res.error === 'already_clocked_in' ? 'You are already clocked in — switch or clock out.' : (res.error || 'Something went wrong'));
    }
    await refresh();
    return res;
  };

  const doClockIn = async (job) => { setPicker(null); await withGps((c) => sbClockIn(job.id, c)); };
  const doSwitch  = async (job) => { setPicker(null); await withGps((c) => sbSwitchJob(job.id, c)); };
  const doClockOut = async () => { await withGps(() => sbClockOut()); };

  const firstName = (profile?.full_name || 'there').split(' ')[0];

  if (loading) return <Shell><div style={{ textAlign: 'center', padding: 80, color: 'var(--text-subtle)' }}>Loading…</div></Shell>;

  return (
    <Shell>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Hi, {firstName}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-primary)' }}>Time Clock</div>
        </div>
        <button onClick={signOut} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '6px 14px', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', minHeight: 36 }}>Sign out</button>
      </div>

      {err && <div style={{ padding: '12px 14px', background: 'var(--red-bg)', color: 'var(--red-text)', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {/* Main state card */}
      {open ? (
        <div className="card" style={{ padding: 22, marginBottom: 18, textAlign: 'center', border: `2px solid ${GOLD}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--green-text)', textTransform: 'uppercase', marginBottom: 8 }}>● On the clock</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{jobLabel(open.job_id)}</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: NAV, fontVariantNumeric: 'tabular-nums', letterSpacing: 1, margin: '6px 0' }}>
            {fmtElapsed(nowTick - new Date(open.clock_in).getTime())}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 20 }}>since {fmtClock(open.clock_in)}{open.in_lat == null ? ' · no GPS' : ''}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => openPicker('switch')} disabled={busy} className="btn btn-navy" style={{ flex: 1, minHeight: 54, fontSize: 16, borderRadius: 12 }}>Switch Job</button>
            <button onClick={doClockOut} disabled={busy} style={{ flex: 1, minHeight: 54, fontSize: 16, borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font-body)', background: 'var(--red-bg)', color: 'var(--red-text)' }}>
              {busy ? (gpsBusy ? 'Locating…' : 'Saving…') : 'Clock Out'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 18 }}>
          <button onClick={() => openPicker('in')} disabled={busy} style={{ width: '100%', minHeight: 96, fontSize: 24, fontWeight: 800, borderRadius: 16, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', background: NAV, color: '#fff', boxShadow: '0 4px 20px rgba(10,31,68,0.25)' }}>
            {busy ? (gpsBusy ? 'Locating…' : 'Clocking in…') : 'Clock In'}
          </button>
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-subtle)', marginTop: 10 }}>You're clocked out.</div>
        </div>
      )}

      {/* Today strip */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: 8 }}>Today</div>
        {today.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '12px 0' }}>No punches yet today.</div>
        ) : today.map(t => (
          <div key={t.id} className="card" style={{ padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {jobLabel(t.job_id)}{t.source === 'switch' && <span style={{ fontSize: 10, color: 'var(--text-subtle)', marginLeft: 6 }}>↷ switch</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {fmtClock(t.clock_in)} – {t.clock_out ? fmtClock(t.clock_out) : 'now'}
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.clock_out ? NAV : 'var(--green-text)', whiteSpace: 'nowrap' }}>
              {t.clock_out ? fmtDur(t.clock_in, t.clock_out) : 'in progress'}
            </div>
          </div>
        ))}
      </div>

      {/* Job picker overlay */}
      {picker && (
        <div onClick={() => !busy && setPicker(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,31,68,0.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, maxHeight: '80vh', borderRadius: '18px 18px 0 0', padding: 18, overflowY: 'auto', animation: 'slideUp 0.25s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{picker === 'switch' ? 'Switch to job' : 'Pick a job'}</div>
              <button onClick={() => setPicker(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            </div>
            {jobs.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>No active jobs. Ask your manager to add one.</div>
            ) : jobs.map(j => (
              <button key={j.id} disabled={busy} onClick={() => picker === 'switch' ? doSwitch(j) : doClockIn(j)}
                style={{ width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 8, border: `1px solid ${BORDER}`, borderRadius: 12, background: 'var(--card-bg)', cursor: 'pointer', minHeight: 60 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{j.address || '(no address)'}</div>
                {j.client_name && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{j.client_name}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px calc(28px + env(safe-area-inset-bottom))' }}>{children}</div>
    </div>
  );
}
