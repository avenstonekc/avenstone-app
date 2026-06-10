import { useState, useEffect } from 'react';
import { sbLoadTenantReviews } from '../../lib/supabase';
import { f$, sc, sl, isMob, Ic } from '../../lib/utils';

export default function DashScr({ nav, jobs, profile }) {
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const active = jobs.filter(j => !['complete', 'on_hold'].includes(j.status)).length;
  const bids = jobs.filter(j => j.status === 'proposal').length;
  const signed = jobs.filter(j => j.status === 'contract').length;
  const pipeline = jobs.filter(j => j.status === 'proposal').reduce((a, j) => a + Number(j.contract_value || 0), 0);
  const mob = isMob();
  const [reviews, setReviews] = useState([]);

  useEffect(() => { sbLoadTenantReviews().then(setReviews); }, []);

  const avgScore = key => reviews.length ? +(reviews.reduce((a, r) => a + (r[key] || 0), 0) / reviews.length).toFixed(1) : null;
  const recRate = reviews.length ? Math.round(reviews.filter(r => r.would_recommend).length / reviews.length * 100) : null;

  const ACard = ({ ic, title, sub, page, badge }) => (
    <div
      onClick={() => nav(page)}
      style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '20px', cursor: 'pointer', transition: 'box-shadow 0.15s,transform 0.15s', position: 'relative' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(10,31,68,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      {badge > 0 && <div style={{ position: 'absolute', top: 16, right: 16, background: 'var(--gold-500)', color: 'var(--navy-900)', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{badge}</div>}
      <div style={{ width: 36, height: 36, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: 'var(--navy-900)' }}>{Ic[ic] || Ic.grid}</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: 'var(--navy-900)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{ padding: mob ? '16px' : '32px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: 'var(--navy-900)', marginBottom: 4 }}>Good {greet}, {profile?.full_name?.split(' ')[0] || 'there'}.</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>{today}</div>
        </div>

        <div className="stat-grid">
          {[
            ['Active Projects', active, '', 'jobs'],
            ['Pipeline', f$(pipeline), 'gold', 'pipeline'],
            ['Signed This Month', signed, '', 'jobs'],
            ['Bids Outstanding', bids, '', 'pipeline'],
          ].map(([lb, v, cls, pg]) => (
            <div key={lb} className="stat" onClick={() => nav(pg)}
              style={{ cursor: 'pointer', transition: 'box-shadow 0.15s,transform 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(10,31,68,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
            >
              <div className="stat-lbl">{lb}</div>
              <div className={`stat-val${cls ? ' ' + cls : ''}`}>{v}</div>
            </div>
          ))}
        </div>

        <div className="sec-hd"><h2>Quick Start</h2></div>
        <div className="act-grid" style={{ display: 'grid', gap: 16, marginBottom: 28 }}>
          <ACard ic="home" title="Projects" sub={`${jobs.length} total`} page="jobs" badge={active} />
        </div>

        {jobs.length > 0 && (
          <div>
            <div className="sec-hd"><h2>Recent Projects</h2></div>
            <div className="card">
              <table className="tbl">
                <thead><tr><th>Property</th><th>Status</th><th>Value</th></tr></thead>
                <tbody>
                  {jobs.slice(0, 5).map(j => {
                    const rev = Number(j.contract_value || 0) + Number(j.co_total || 0);
                    return (
                      <tr key={j.id} onClick={() => nav('jobs')} style={{ cursor: 'pointer' }}>
                        <td>
                          <div className="cell-a">{j.address}</div>
                          {j.client_name && <div className="cell-b">{j.client_name}</div>}
                        </td>
                        <td>
                          <span className="badge" style={{ background: sc(j.status) + '15', color: sc(j.status) }}>
                            <span className="bdot" style={{ background: sc(j.status) }} />{sl(j.status)}
                          </span>
                        </td>
                        <td>
                          {rev > 0
                            ? <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>{f$(rev)}</span>
                            : <span style={{ color: 'var(--text-subtle)', fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reviews.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div className="sec-hd"><h2>Client Reviews <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-subtle)' }}>({reviews.length} total)</span></h2></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
              {[['Quality', avgScore('rating_quality')], ['Communication', avgScore('rating_communication')], ['Timeliness', avgScore('rating_timeliness')]].map(([lb, v]) => (
                <div key={lb} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '16px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{lb}</div>
                  <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: 'var(--navy-900)', marginBottom: 4 }}>{v ?? '-'}</div>
                  <div style={{ fontSize: 18, color: 'var(--gold-500)' }}>{v ? [1, 2, 3, 4, 5].map(s => <span key={s} style={{ opacity: v >= s ? 1 : 0.25 }}>★</span>) : '-'}</div>
                </div>
              ))}
              <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '16px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Recommend</div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: recRate >= 80 ? 'var(--green-dot)' : 'var(--navy-900)', marginBottom: 4 }}>{recRate !== null ? `${recRate}%` : '-'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{reviews.filter(r => r.would_recommend).length} of {reviews.length}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reviews.slice(0, 3).map(r => (
                <div key={r.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: r.review_text ? 8 : 0 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)' }}>{r.client_name || r.client_email || 'Client'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{r.created_at?.slice(0, 10)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: 'var(--gold-500)' }}>{'★'.repeat(Math.round((r.rating_quality + r.rating_communication + r.rating_timeliness) / 3))}</span>
                      {r.would_recommend && <span style={{ fontSize: 11, background: 'var(--green-bg)', color: 'var(--green-text-strong)', padding: '2px 8px', fontWeight: 600 }}>Recommends</span>}
                    </div>
                  </div>
                  {r.review_text && <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', borderTop: '1px solid #F3F0EB', paddingTop: 8 }}>"{r.review_text}"</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
