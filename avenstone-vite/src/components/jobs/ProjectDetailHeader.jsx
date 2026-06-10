import { useState, useEffect } from 'react';
import { sbLoadProjectDetail } from '../../lib/supabase.js';
import { f$, isMob } from '../../lib/utils.jsx';

const NAVY  = 'var(--navy-900)';
const GOLD  = 'var(--gold-500)';
const CREAM = 'var(--bg)';
const WHITE = '#FFFFFF';
const BORDER = 'var(--border)';

// Phase chip grammar: complete=muted+check, active=gold pill navy text, future=ghost outline
const PHASE_STYLE = {
  complete:    { bg: 'transparent',     color: 'var(--text-subtle)',         border: 'transparent',        check: true  },
  in_progress: { bg: GOLD,              color: NAVY,                         border: GOLD,                 check: false },
  delayed:     { bg: 'var(--red-bg)',   color: 'var(--red-text-strong)',     border: 'var(--red-text)',    check: false },
  not_started: { bg: 'transparent',     color: 'var(--text-subtle)',         border: 'var(--border)',      check: false },
};

function fShort(n) {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

function fDateShort(str) {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── KPI tile ─────────────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, mob }) {
  return (
    <div style={{
      background: WHITE, borderRadius: 10,
      borderLeft: `3px solid ${GOLD}`,
      padding: mob ? '10px 12px' : '12px 16px',
      flex: mob ? '0 0 140px' : '1 1 0',
      minWidth: mob ? 140 : 0,
      boxShadow: '0 1px 4px rgba(10,31,68,0.06)',
      border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${GOLD}`,
    }}>
      <div style={{
        fontSize: 10, color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif',
        fontWeight: 600, letterSpacing: '0.08em', marginBottom: 5,
      }}>{label}</div>
      <div style={{
        fontSize: mob ? 17 : 22, fontFamily: 'DM Serif Display, serif',
        color: NAVY, fontWeight: 400, lineHeight: 1.1,
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'DM Sans, sans-serif' }}>
          {sub}
        </div>
      )}
    </div>
  );
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

  const cv       = Number(job?.contract_value || 0) + Number(job?.co_total || 0);
  const paid     = detail?.paid_to_date || 0;
  const remaining = Math.max(0, cv - paid);
  const paidPct  = cv > 0 ? Math.round((paid / cv) * 100) : 0;
  const pct      = Number(job?.phase_pct_complete || 0);

  const nextMil = detail?.next_milestone;
  const nextMilLabel = nextMil?.title
    ? (nextMil.title.length > 18 ? nextMil.title.substring(0, 16) + '…' : nextMil.title)
    : '—';

  const kpis = [
    { label: 'CONTRACT VALUE',  value: fShort(cv),        sub: null },
    { label: 'PAID TO DATE',    value: fShort(paid),      sub: cv > 0 ? `${paidPct}% collected` : null },
    { label: 'REMAINING',       value: fShort(remaining), sub: null },
    { label: 'NEXT MILESTONE',  value: nextMilLabel,      sub: nextMil?.scheduled_date ? fDateShort(nextMil.scheduled_date) : null },
  ];

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

      {/* KPI tiles */}
      <div style={{
        display: 'flex', gap: 8,
        padding: mob ? '10px 14px 8px' : '12px 20px 10px',
        overflowX: mob ? 'auto' : 'visible',
        flexWrap: mob ? 'nowrap' : 'nowrap',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        {kpis.map((k, i) => (
          <KpiTile key={i} label={k.label} value={k.value} sub={k.sub} mob={mob} />
        ))}
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
