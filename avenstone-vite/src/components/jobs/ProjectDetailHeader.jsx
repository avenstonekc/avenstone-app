import { useState, useEffect } from 'react';
import { sbLoadProjectDetail } from '../../lib/supabase.js';
import { isMob } from '../../lib/utils.jsx';

const NAVY  = 'var(--navy-900)';
const GOLD  = 'var(--gold-500)';
const CREAM = 'var(--bg)';
const BORDER = 'var(--border)';

// Phase chip grammar: complete=muted+check, active=gold pill navy text, future=ghost outline
const PHASE_STYLE = {
  complete:    { bg: 'transparent',     color: 'var(--text-subtle)',         border: 'transparent',        check: true  },
  in_progress: { bg: GOLD,              color: NAVY,                         border: GOLD,                 check: false },
  delayed:     { bg: 'var(--red-bg)',   color: 'var(--red-text-strong)',     border: 'var(--red-text)',    check: false },
  not_started: { bg: 'transparent',     color: 'var(--text-subtle)',         border: 'var(--border)',      check: false },
};

function fDateShort(str) {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── Main header component ─────────────────────────────────────────────────────
export default function ProjectDetailHeader({ job }) {
  const mob = isMob();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!job?.id) return;
    setLoading(true);
    sbLoadProjectDetail(job.id, job.assigned_pm || null).then(r => {
      if (r.ok) setDetail(r.data);
      setLoading(false);
    });
  }, [job?.id, job?.assigned_pm]);

  const pct   = Number(job?.phase_pct_complete || 0);

  // Next Milestone is the only non-financial summary retained in the header.
  // Financial KPI tiles (contract value / paid / remaining / flip ARV set) were
  // removed by owner decision — money lives in the Financials tab only.
  const nextMil = detail?.next_milestone;
  const nextMilLabel = nextMil?.title
    ? (nextMil.title.length > 18 ? nextMil.title.substring(0, 16) + '…' : nextMil.title)
    : '—';

  const phases   = detail?.phases || [];
  const pmP      = detail?.pm_profile || null;

  return (
    <div style={{ background: CREAM, borderBottom: `2px solid ${BORDER}`, flexShrink: 0 }}>

      {/* Progress hero row */}
      <div style={{
        padding: mob ? '10px 14px 8px' : '12px 20px 10px',
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontFamily: 'DM Serif Display, serif', fontSize: mob ? 28 : 36,
              color: NAVY, fontWeight: 400, lineHeight: 1,
            }}>{pct}%</span>
            <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif' }}>
              overall progress
            </span>
          </div>
          <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%', background: NAVY, borderRadius: 3,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
        {/* Next Milestone — non-financial; shares the progress row */}
        {nextMil && (
          <div style={{
            flexShrink: 0, textAlign: 'right',
            borderLeft: `1px solid ${BORDER}`, paddingLeft: mob ? 10 : 14,
          }}>
            <div style={{
              fontSize: 10, color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif',
              fontWeight: 600, letterSpacing: '0.08em', marginBottom: 3,
            }}>NEXT MILESTONE</div>
            <div style={{
              fontSize: mob ? 14 : 16, fontFamily: 'DM Sans, sans-serif',
              color: NAVY, fontWeight: 600, lineHeight: 1.1,
            }}>{nextMilLabel}</div>
            {nextMil.scheduled_date && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'DM Sans, sans-serif' }}>
                {fDateShort(nextMil.scheduled_date)}
              </div>
            )}
          </div>
        )}
        {/* PM contact (right side of progress row on desktop) */}
        {!mob && pmP && (pmP.phone || pmP.email) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif' }}>PM</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{pmP.full_name}</span>
            {pmP.phone && (
              <a href={`tel:${pmP.phone}`} style={{
                background: '#D1FAE5', color: '#065F46', borderRadius: 6,
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                textDecoration: 'none', fontFamily: 'DM Sans, sans-serif',
              }}>📞 Call</a>
            )}
            {pmP.email && (
              <a href={`mailto:${pmP.email}`} style={{
                background: '#EFF6FF', color: '#1D4ED8', borderRadius: 6,
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                textDecoration: 'none', fontFamily: 'DM Sans, sans-serif',
              }}>✉ Email</a>
            )}
          </div>
        )}
      </div>

      {/* Phase strip */}
      {(loading || phases.length > 0) && (
        <div style={{
          padding: mob ? '8px 14px 10px' : '10px 20px 12px',
          overflowX: 'auto',
        }}>
          {loading ? (
            <div style={{ height: 26, background: '#E5E7EB', borderRadius: 20, width: 260 }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {phases.map((ph, i) => {
                const s = PHASE_STYLE[ph.status] || PHASE_STYLE.not_started;
                const isActive = ph.status === 'in_progress' || ph.status === 'delayed';
                return (
                  <div key={ph.id} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: s.bg, color: s.color,
                      borderRadius: 20, padding: '3px 10px',
                      fontSize: 11, fontFamily: 'DM Sans, sans-serif',
                      fontWeight: isActive ? 700 : 400,
                      border: `1.5px solid ${s.border}`,
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {s.check
                        ? <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green-dot)', flexShrink: 0 }}>&#x2713;</span>
                        : ph.status !== 'not_started' && (
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block', flexShrink: 0, opacity: 0.7 }} />
                        )
                      }
                      {ph.phase_name}
                    </div>
                    {i < phases.length - 1 && (
                      <span style={{ color: '#D1D5DB', fontSize: 10, padding: '0 2px', flexShrink: 0 }}>›</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PM contact bar — mobile only */}
      {mob && pmP && (pmP.phone || pmP.email) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px 10px', borderTop: `1px solid ${BORDER}`,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif' }}>PM:</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: NAVY, flex: 1 }}>{pmP.full_name}</span>
          {pmP.phone && (
            <a href={`tel:${pmP.phone}`} style={{
              background: '#D1FAE5', color: '#065F46', borderRadius: 6,
              padding: '5px 12px', fontSize: 11, fontWeight: 600,
              textDecoration: 'none',
            }}>📞 Call</a>
          )}
          {pmP.email && (
            <a href={`mailto:${pmP.email}`} style={{
              background: '#EFF6FF', color: '#1D4ED8', borderRadius: 6,
              padding: '5px 12px', fontSize: 11, fontWeight: 600,
              textDecoration: 'none',
            }}>✉ Email</a>
          )}
        </div>
      )}
    </div>
  );
}
