import { useState, useEffect } from 'react';
import { sbLoadOwnerDashboard } from '../../lib/supabase.js';
import { isMob } from '../../lib/utils.jsx';

const NAVY  = '#0A1F44';
const GOLD  = '#C9A84C';
const CREAM = '#F7F5F0';
const WHITE = '#FFFFFF';
const BORDER = '#E8E4DC';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parseMonth(s) { const [,m] = s.split('-'); return MONTHS[parseInt(m,10)-1] || s; }

function fShort(n) {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `$${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v/1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}
function f$(n) {
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0}).format(n||0);
}

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function formatToday() {
  const d = new Date();
  return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ── Status pill ───────────────────────────────────────────────────────────────
const STATUS_CFG = {
  in_progress:   { label: 'In Progress',   bg: '#D1FAE5', color: '#065F46' },
  contract:      { label: 'Contract',      bg: '#FEF3C7', color: '#92400E' },
  final_touches: { label: 'Final Touches', bg: '#DBEAFE', color: '#1E40AF' },
  complete:      { label: 'Complete',      bg: NAVY,       color: WHITE },
  lead:          { label: 'Lead',          bg: '#F3F4F6', color: '#6B7280' },
  proposal:      { label: 'Proposal',      bg: '#EFF6FF', color: '#1D4ED8' },
};
function StatusPill({ status }) {
  const s = STATUS_CFG[status] || { label: (status||'').replace(/_/g,' '), bg: '#F3F4F6', color: '#6B7280' };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700,
      padding: '3px 8px', borderRadius: 20, letterSpacing: '0.05em', textTransform: 'uppercase',
      whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif' }}>{s.label}</span>
  );
}

// ── Job thumbnail ─────────────────────────────────────────────────────────────
function JobThumb({ url, size = 44 }) {
  const [err, setErr] = useState(false);
  if (url && !err) return (
    <img src={url} onError={() => setErr(true)} alt=""
      style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
  );
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1v-9.5z"
          stroke={GOLD} strokeWidth="1.5" fill="none"/>
        <path d="M9 21V12h6v9" stroke={GOLD} strokeWidth="1.5"/>
      </svg>
    </div>
  );
}

// ── Revenue chart ─────────────────────────────────────────────────────────────
function RevenueChart({ data, mob }) {
  if (!data?.length) return (
    <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#9CA3AF', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>No revenue data yet</div>
  );
  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  const N = data.length;
  const W = 1000; const H = mob ? 90 : 120;
  const PAD = 20; // padding so edge dots never clip
  const pts = data.map((d, i) => ({
    x: N === 1 ? W / 2 : PAD + (i / (N - 1)) * (W - PAD * 2),
    y: H - 10 - (d.revenue / maxRev) * (H - 20),
    revenue: d.revenue,
  }));

  // Smooth bezier curve through points
  function smoothLine(p) {
    if (p.length < 2) return `M${p[0].x},${p[0].y}`;
    let d = `M${p[0].x},${p[0].y}`;
    for (let i = 0; i < p.length - 1; i++) {
      const tension = 0.35;
      const cp1x = p[i].x + (p[i+1].x - p[i].x) * tension;
      const cp2x = p[i+1].x - (p[i+1].x - p[i].x) * tension;
      d += ` C${cp1x},${p[i].y} ${cp2x},${p[i+1].y} ${p[i+1].x},${p[i+1].y}`;
    }
    return d;
  }

  const line = smoothLine(pts);
  const area = `${line} L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`;
  const last = data[data.length-1];
  const net = (last.revenue||0)-(last.costs||0);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          width: 36, paddingRight: 4, paddingTop: 2, paddingBottom: 2 }}>
          {[maxRev, Math.round(maxRev/2), 0].map((v,i) => (
            <div key={i} style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'right',
              fontFamily: 'DM Sans, sans-serif' }}>{fShort(v)}</div>
          ))}
        </div>
        <div style={{ flex: 1, height: H }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" overflow="visible"
            style={{ width: '100%', height: H, display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NAVY} stopOpacity="0.15" />
                <stop offset="100%" stopColor={NAVY} stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#rg)" />
            <path d={line} fill="none" stroke={NAVY} strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {pts.map((p,i) => (
              <circle key={i} cx={p.x} cy={p.y} r="6" fill={WHITE} stroke={NAVY}
                strokeWidth="3" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        </div>
      </div>
      <div style={{ display: 'flex', marginLeft: 36, marginTop: 4 }}>
        {data.map((d,i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11,
            color: '#9CA3AF', fontFamily: 'DM Sans, sans-serif' }}>{parseMonth(d.month)}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {[
          { label: `Rev ${parseMonth(last.month)}`, val: f$(last.revenue), color: NAVY },
          { label: `Costs`,                          val: f$(last.costs),   color: '#6B7280' },
          { label: `Net`,                            val: f$(net),           color: net >= 0 ? '#059669' : '#DC2626' },
        ].map((c,i) => (
          <div key={i} style={{ background: CREAM, borderRadius: 6, padding: '4px 10px',
            fontSize: 12, fontFamily: 'DM Sans, sans-serif', border: `1px solid ${BORDER}` }}>
            <span style={{ color: '#9CA3AF' }}>{c.label}: </span>
            <span style={{ color: c.color, fontWeight: 600 }}>{c.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function OwnerHomeScr({ profile, onOpenJob, onNavigate, onOpenWalkthrough, setPendingAction }) {
  const mob = isMob();
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [walkExpanded, setWalkExpanded] = useState(false);
  const [err, setErr] = useState(null);

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  useEffect(() => {
    if (!profile?.tenant_id) return;
    sbLoadOwnerDashboard(profile.tenant_id)
      .then(r => { if (r.ok) setDash(r.data); else setErr(r.error); })
      .finally(() => setLoading(false));
  }, [profile?.tenant_id]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: NAVY, display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13,
      fontFamily: 'DM Sans, sans-serif' }}>
      Loading dashboard…
    </div>
  );
  if (err) return (
    <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 16px',
      borderRadius: 8, fontSize: 13, margin: 16 }}>{err}</div>
  );

  const kpis       = dash?.kpis || {};
  const revenue    = dash?.monthlyRevenue || [];
  const activeJobs = dash?.activeJobs || [];
  const health     = dash?.health || {};
  const ai         = dash?.aiInsights || {};
  const displayed  = activeJobs.slice(0, 6);

  const KPI_TILES = [
    { label: 'PIPELINE VALUE',    value: fShort(kpis.pipelineValue),    sub: null },
    { label: 'OPEN RECEIVABLES',  value: fShort(kpis.openReceivables),  sub: null },
    { label: 'GROSS PROFIT MTD',  value: fShort(kpis.grossProfitMtd),   sub: null },
    { label: 'COLLECTED MTD',     value: fShort(kpis.collectedMtd),
      sub: kpis.collectedTrend != null
        ? { text: `${kpis.collectedTrend >= 0 ? '↑' : '↓'} ${Math.abs(kpis.collectedTrend)}% vs prior 30d`,
            color: kpis.collectedTrend >= 0 ? '#4ADE80' : '#F87171' }
        : null },
  ];

  return (
    <div style={{ background: CREAM, minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>

      {/* ── DARK HERO SECTION ─────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(160deg, #0d2458 0%, ${NAVY} 60%, #071630 100%)`,
        padding: mob ? '20px 16px 24px' : '28px 32px 32px',
      }}>
        {/* Greeting row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: mob ? 20 : 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'DM Serif Display, serif',
              fontSize: mob ? 22 : 28, color: WHITE, fontWeight: 400 }}>
              {getGreeting()}, {firstName}
            </span>
            <span style={{ background: GOLD, color: NAVY, fontSize: 9, fontWeight: 800,
              padding: '3px 8px', borderRadius: 20, letterSpacing: '0.08em' }}>OWNER</span>
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)',
            fontFamily: 'DM Sans, sans-serif' }}>{formatToday()}</span>
        </div>

        {/* KPI tiles on dark */}
        <div style={{ display: 'flex', gap: 10, flexWrap: mob ? 'wrap' : 'nowrap' }}>
          {KPI_TILES.map((k, i) => (
            <div key={i} style={{
              flex: mob ? '1 1 calc(50% - 5px)' : '1 1 0',
              minWidth: 0,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderLeft: `3px solid ${GOLD}`,
              borderRadius: 12,
              padding: mob ? '12px 14px' : '16px 18px',
            }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)',
                fontWeight: 600, letterSpacing: '0.08em', marginBottom: 8,
                fontFamily: 'DM Sans, sans-serif' }}>{k.label}</div>
              <div style={{ fontSize: mob ? 20 : 26, fontFamily: 'DM Serif Display, serif',
                color: WHITE, fontWeight: 400, lineHeight: 1 }}>{k.value}</div>
              {k.sub && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600,
                  color: k.sub.color, fontFamily: 'DM Sans, sans-serif' }}>{k.sub.text}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── CONTENT SECTION ───────────────────────────────────────────── */}
      <div style={{ padding: mob ? '16px' : '24px 32px' }}>
        <div style={{ display: 'flex', gap: 16, flexDirection: mob ? 'column' : 'row' }}>

          {/* ── Active Projects ──────────────────────────────────────── */}
          <div style={{ flex: mob ? '1 1 auto' : '0 0 58%',
            background: WHITE, borderRadius: 14, border: `1px solid ${BORDER}`,
            boxShadow: '0 2px 12px rgba(10,31,68,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16, color: NAVY }}>
                Active Projects
              </span>
              <span
                onClick={() => onNavigate?.('projects')}
                style={{ fontSize: 12, color: GOLD, fontWeight: 600, cursor: 'pointer' }}>
                View all →
              </span>
            </div>
            {displayed.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center',
                color: '#9CA3AF', fontSize: 13 }}>No active projects</div>
            ) : (
              <div>
                {displayed.map((job, i) => {
                  const addr = job.address || '';
                  const comma = addr.indexOf(',');
                  const street = comma >= 0 ? addr.substring(0, comma) : addr;
                  const city   = comma >= 0 ? addr.substring(comma + 1).trim() : '';
                  return (
                    <div
                      key={job.id}
                      onClick={() => onOpenJob?.(job.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 20px',
                        borderBottom: i < displayed.length - 1 ? `1px solid ${BORDER}` : 'none',
                        cursor: 'pointer', transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = CREAM}
                      onMouseLeave={e => e.currentTarget.style.background = WHITE}
                    >
                      {/* Thumbnail */}
                      <JobThumb url={job.thumbnail_url} size={44} />

                      {/* Address + progress */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                          justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: NAVY,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {street}
                            </div>
                            {city && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{city}</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            {job.contract_value > 0 && (
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                                {fShort(job.contract_value)}
                              </span>
                            )}
                            <StatusPill status={job.status} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 3, background: '#E5E7EB',
                            borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${job.phase_pct_complete || 0}%`,
                              height: '100%', background: NAVY, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 11, color: '#9CA3AF',
                            whiteSpace: 'nowrap' }}>{job.phase_pct_complete || 0}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right column ─────────────────────────────────────────── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* AI Insights */}
            <div style={{
              background: `linear-gradient(135deg, #0d2458 0%, ${NAVY} 100%)`,
              borderRadius: 14, padding: '16px 18px',
              boxShadow: '0 2px 16px rgba(10,31,68,0.18)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 16, color: GOLD }}>✦</span>
                <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 15,
                  color: WHITE, fontWeight: 400 }}>Aven AI Insights</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* ── Walkthroughs — expandable list ── */}
                {ai.walkthroughsPending > 0 && (() => {
                  const wt = ai.walkthroughTodos || [];
                  return (
                    <div>
                      <div onClick={() => setWalkExpanded(v => !v)} style={{ display: 'flex',
                        alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        background: 'rgba(217,119,6,0.15)', borderRadius: walkExpanded ? '8px 8px 0 0' : 8,
                        padding: '9px 12px', border: '1px solid rgba(217,119,6,0.3)',
                        borderBottom: walkExpanded ? 'none' : '1px solid rgba(217,119,6,0.3)',
                        cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(217,119,6,0.25)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(217,119,6,0.15)'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13 }}>⚠</span>
                          <span style={{ fontSize: 13, color: '#FCD34D', fontWeight: 500 }}>
                            {ai.walkthroughsPending} walkthrough{ai.walkthroughsPending !== 1 ? 's' : ''} need completion
                          </span>
                        </div>
                        <span style={{ color: '#FCD34D', fontSize: 12,
                          transform: walkExpanded ? 'rotate(90deg)' : 'none',
                          display: 'inline-block', transition: 'transform 0.15s' }}>›</span>
                      </div>
                      {walkExpanded && wt.length > 0 && (
                        <div style={{ background: 'rgba(217,119,6,0.08)',
                          border: '1px solid rgba(217,119,6,0.3)', borderTop: 'none',
                          borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                          {wt.map((w, i) => {
                            const jobMatch = activeJobs.find(j => j.id === w.job_id);
                            const addr = jobMatch?.address || w.job_id?.substring(0, 8) + '…';
                            const street = addr.indexOf(',') >= 0 ? addr.substring(0, addr.indexOf(',')) : addr;
                            return (
                              <div key={w.id}
                                onClick={() => onOpenWalkthrough?.(w.job_id, w.work_type, w.id)}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '9px 12px', cursor: 'pointer',
                                  borderTop: i > 0 ? '1px solid rgba(217,119,6,0.15)' : 'none',
                                  transition: 'background 0.1s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#FCD34D',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {w.work_type}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                                    {street}
                                  </div>
                                </div>
                                <span style={{ color: '#FCD34D', fontSize: 12, fontWeight: 700,
                                  flexShrink: 0, marginLeft: 8 }}>Start →</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Projects behind — navigates to Projects */}
                {ai.jobsBehind > 0 && (
                  <div onClick={() => onNavigate?.('projects')} style={{ display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    background: 'rgba(239,68,68,0.15)', borderRadius: 8, padding: '9px 12px',
                    border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.25)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13 }}>⚠</span>
                      <span style={{ fontSize: 13, color: '#FCA5A5', fontWeight: 500 }}>
                        {ai.jobsBehind} project{ai.jobsBehind !== 1 ? 's' : ''} behind schedule
                      </span>
                    </div>
                    <span style={{ color: '#FCA5A5', fontSize: 12, opacity: 0.7 }}>→</span>
                  </div>
                )}

                {/* Open to-dos — navigates to To-dos page */}
                {ai.openTodos > 0 && (
                  <div onClick={() => onNavigate?.('todos')} style={{ display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    background: 'rgba(201,168,76,0.12)', borderRadius: 8, padding: '9px 12px',
                    border: '1px solid rgba(201,168,76,0.25)', cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,168,76,0.22)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(201,168,76,0.12)'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13 }}>✓</span>
                      <span style={{ fontSize: 13, color: GOLD, fontWeight: 500 }}>
                        {ai.openTodos} open to-do{ai.openTodos !== 1 ? 's' : ''} pending
                      </span>
                    </div>
                    <span style={{ color: GOLD, fontSize: 12, opacity: 0.7 }}>→</span>
                  </div>
                )}

                {/* All-clear */}
                {!ai.walkthroughsPending && !ai.jobsBehind && !ai.openTodos && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(34,197,94,0.12)', borderRadius: 8, padding: '10px 12px' }}>
                    <span style={{ fontSize: 14 }}>✓</span>
                    <span style={{ fontSize: 13, color: '#86EFAC', fontWeight: 500 }}>
                      All clear — no alerts today
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Company Health */}
            <div style={{ background: WHITE, borderRadius: 14, padding: '16px 18px',
              border: `1px solid ${BORDER}`, boxShadow: '0 2px 8px rgba(10,31,68,0.05)' }}>
              <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 15,
                color: NAVY, marginBottom: 14 }}>Company Health</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { label: 'Active',    val: health.activeProjects ?? 0, danger: false },
                  { label: 'New Leads', val: health.newLeads ?? 0,       danger: false },
                  { label: 'Behind',    val: health.jobsBehind ?? 0,     danger: (health.jobsBehind||0) > 0 },
                ].map((c, i) => (
                  <div key={i} style={{ background: CREAM, borderRadius: 10, padding: '12px 8px',
                    textAlign: 'center', border: `1px solid ${BORDER}` }}>
                    <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 28,
                      color: c.danger ? '#EF4444' : NAVY, lineHeight: 1 }}>{c.val}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 5,
                      fontFamily: 'DM Sans, sans-serif' }}>{c.label}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── Revenue chart ─────────────────────────────────────────── */}
        <div style={{ background: WHITE, borderRadius: 14, padding: '16px 20px',
          border: `1px solid ${BORDER}`, boxShadow: '0 2px 8px rgba(10,31,68,0.05)',
          marginTop: 16 }}>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16,
            color: NAVY, marginBottom: 14 }}>Revenue (last 6 months)</div>
          <RevenueChart data={revenue} mob={mob} />
        </div>
      </div>
    </div>
  );
}
