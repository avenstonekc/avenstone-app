import { useState, useEffect } from 'react';
import { GET_JOB_STATUS_URL, ANON_KEY } from '../../lib/supabase';
const SC = { lead: '#9CA3AF', active: '#C9A84C', complete: '#10B981', punch: '#3B82F6', cancelled: '#EF4444', on_hold: '#F97316' };
const SL = { lead: 'Lead', active: 'Active', complete: 'Complete', punch: 'Punch List', cancelled: 'Cancelled', on_hold: 'On Hold' };
const phSC = { complete: '#10B981', in_progress: '#C9A84C', not_started: '#E5E7EB' };

export default function StatusPage({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch(`${GET_JOB_STATUS_URL}?token=${encodeURIComponent(token)}`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    })
      .then(r => { clearTimeout(timer); if (!r.ok) throw new Error(`Project not found (${r.status})`); return r.json(); })
      .then(d => setData(d))
      .catch(e => { clearTimeout(timer); setErr(e.name === 'AbortError' ? 'Request timed out — please try again' : (e.message || 'Project not found')); });
  }, [token]);

  if (err) return (
    <div style={{ minHeight: '100dvh', background: '#0A1F44', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Avenstone Contracting</div>
      <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Project not found</div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>This link may be invalid or expired.</div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: '100dvh', background: '#0A1F44', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 3, textTransform: 'uppercase' }}>Loading</div>
    </div>
  );

  const total = data.phases.length;
  const done = data.phases.filter(p => p.status === 'complete').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const current = data.phases.find(p => p.status === 'in_progress') || data.phases.find(p => p.status !== 'complete' && p.status !== 'not_started');
  const statusColor = SC[data.status] || '#9CA3AF';

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#0A1F44', padding: '20px 24px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ fontSize: 10, color: '#C9A84C', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 2 }}>Avenstone Contracting</div>
          <div style={{ width: 28, height: 2, background: '#C9A84C', marginBottom: 16 }} />
          <div style={{ fontSize: 22, fontFamily: "'DM Serif Display',serif", color: '#fff', lineHeight: 1.3, marginBottom: 6 }}>{data.address}</div>
          {data.client_first_name && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{data.client_first_name}'s project</div>}
        </div>
      </div>
      <div style={{ flex: 1, padding: '24px 16px', maxWidth: 600, margin: '0 auto', width: '100%' }}>
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 11, background: statusColor + '18', color: statusColor, padding: '4px 12px', borderRadius: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{SL[data.status] || data.status}</span>
            {data.target_completion && <span style={{ fontSize: 12, color: '#9CA3AF' }}>Est. completion: <strong style={{ color: '#0A1F44' }}>{data.target_completion}</strong></span>}
          </div>
          {total > 0 && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Progress</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: '#F3F0EB', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#C9A84C', borderRadius: 4, transition: 'width 0.5s ease' }} />
            </div>
            {current && <div style={{ fontSize: 12, color: '#6B7280' }}>Current phase: <strong style={{ color: '#0A1F44' }}>{current.phase_name}</strong></div>}
          </>}
        </div>
        {total > 0 && (
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Project Phases</div>
            {data.phases.map((ph, i) => {
              const isDone = ph.status === 'complete';
              const isActive = ph.status === 'in_progress';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < data.phases.length - 1 ? 10 : 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: isDone ? '#10B981' : isActive ? '#C9A84C' : '#E5E7EB', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isDone && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                    {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: isDone ? '#9CA3AF' : isActive ? '#0A1F44' : '#6B7280', fontWeight: isActive ? 600 : 400, textDecoration: isDone ? 'line-through' : 'none' }}>{ph.name}</div>
                  </div>
                  {isDone && <span style={{ fontSize: 10, color: '#10B981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Done</span>}
                  {isActive && <span style={{ fontSize: 10, color: '#C9A84C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Active</span>}
                </div>
              );
            })}
          </div>
        )}
        {data.photos && data.photos.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Recent Photos</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {data.photos.map((p, i) => (
                <div key={i} style={{ aspectRatio: '4/3', borderRadius: 6, overflow: 'hidden', background: '#F3F0EB' }}>
                  <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Questions about your project?</div>
          <div style={{ fontSize: 12, color: '#0A1F44', fontWeight: 600 }}>Contact Avenstone Contracting · Kansas City, MO</div>
          <div style={{ fontSize: 10, color: '#C9A84C', marginTop: 12, letterSpacing: 2, textTransform: 'uppercase' }}>Powered by Avenstone</div>
        </div>
      </div>
    </div>
  );
}
