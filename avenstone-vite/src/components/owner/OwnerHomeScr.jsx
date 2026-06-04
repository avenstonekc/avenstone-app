import { useState, useEffect } from 'react';
import { sbLoadOwnerDashboard } from '../../lib/supabase.js';
import { f$, isMob, Ic } from '../../lib/utils.jsx';
import logo from '../../assets/logo.png';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const WHITE = '#FFFFFF';
const BORDER = '#E8E4DC';

const card = {
  background: WHITE,
  borderRadius: 12,
  padding: '16px 20px',
  boxShadow: '0 1px 6px rgba(10,31,68,0.07)',
  border: `1px solid ${BORDER}`,
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseMonth(str) {
  const [, m] = str.split('-');
  return MONTHS[parseInt(m, 10) - 1] || str;
}

function fShort(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatToday() {
  const d = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function StatusPill({ status }) {
  const map = {
    contract: { bg: '#FEF3C7', color: '#92400E', label: 'CONTRACT' },
    in_progress: { bg: '#D1FAE5', color: '#065F46', label: 'IN PROGRESS' },
    final_touches: { bg: '#DBEAFE', color: '#1E40AF', label: 'FINAL TOUCHES' },
    lead: { bg: '#F3F4F6', color: '#374151', label: 'LEAD' },
  };
  const s = map[status] || { bg: '#F3F4F6', color: '#374151', label: (status || '').toUpperCase() };
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      fontSize: 10,
      fontWeight: 700,
      fontFamily: 'DM Sans, sans-serif',
      padding: '2px 7px',
      borderRadius: 20,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>{s.label}</span>
  );
}

function KpiCard({ label, value, trend }) {
  return (
    <div style={{
      ...card,
      borderLeft: `3px solid ${GOLD}`,
      minWidth: 150,
      flex: '1 0 150px',
    }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontFamily: 'DM Serif Display, serif', color: NAVY, fontWeight: 400, lineHeight: 1.1 }}>{value}</div>
      {trend !== undefined && trend !== null && (
        <div style={{
          marginTop: 6,
          fontSize: 12,
          fontFamily: 'DM Sans, sans-serif',
          fontWeight: 600,
          color: trend >= 0 ? '#059669' : '#DC2626',
        }}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs prior 30d
        </div>
      )}
    </div>
  );
}

function RevenueChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }}>
        No revenue data yet
      </div>
    );
  }

  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  const N = data.length;

  const pts = data.map((d, i) => {
    const x = N === 1 ? 250 : (i / (N - 1)) * 490 + 5;
    const y = 95 - (d.revenue / maxRev) * 85;
    return { x, y, revenue: d.revenue };
  });

  const areaPath = `M${pts[0].x},95 L${pts[0].x},${pts[0].y} ${pts.slice(1).map(p => `L${p.x},${p.y}`).join(' ')} L${pts[pts.length - 1].x},95 Z`;
  const linePath = `M${pts[0].x},${pts[0].y} ${pts.slice(1).map(p => `L${p.x},${p.y}`).join(' ')}`;

  const yLabels = [0, Math.round(maxRev / 2), maxRev];

  const last = data[data.length - 1];
  const net = (last.revenue || 0) - (last.costs || 0);
  const lastLabel = parseMonth(last.month);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'DM Sans, sans-serif', width: 36 }}>{fShort(maxRev)}</div>
        <div style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 36, paddingRight: 4 }}>
          {[maxRev, Math.round(maxRev / 2), 0].map((v, i) => (
            <div key={i} style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'DM Sans, sans-serif', textAlign: 'right' }}>{fShort(v)}</div>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, height: 100 }}>
          <svg viewBox="0 0 500 100" preserveAspectRatio="none" style={{ width: '100%', height: 100 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NAVY} stopOpacity="0.18" />
                <stop offset="100%" stopColor={NAVY} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#areaGrad)" />
            <path d={linePath} fill="none" stroke={NAVY} strokeWidth="2" />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="4" fill={WHITE} stroke={NAVY} strokeWidth="2" />
            ))}
          </svg>
        </div>
      </div>
      <div style={{ display: 'flex', marginLeft: 40 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#6B7280', fontFamily: 'DM Sans, sans-serif' }}>
            {parseMonth(d.month)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {[
          { label: `Revenue ${lastLabel}`, val: f$(last.revenue), color: NAVY },
          { label: `Costs ${lastLabel}`, val: f$(last.costs), color: '#6B7280' },
          { label: `Net ${lastLabel}`, val: f$(net), color: net >= 0 ? '#059669' : '#DC2626' },
        ].map((chip, i) => (
          <div key={i} style={{ background: CREAM, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontFamily: 'DM Sans, sans-serif' }}>
            <span style={{ color: '#9CA3AF' }}>{chip.label}: </span>
            <span style={{ color: chip.color, fontWeight: 600 }}>{chip.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OwnerHomeScr({ profile, onOpenJob, setPendingAction }) {
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const wide = window.innerWidth >= 900;

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  useEffect(() => {
    if (!profile?.tenant_id) return;
    sbLoadOwnerDashboard(profile.tenant_id)
      .then(r => { if (r.ok) setDash(r.data); else setErr(r.error); })
      .finally(() => setLoading(false));
  }, [profile?.tenant_id]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: '#9CA3AF', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
      Loading dashboard…
    </div>
  );
  if (err) return (
    <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 16px', borderRadius: 8, fontSize: 13, margin: 16 }}>{err}</div>
  );

  const kpis = dash?.kpis || {};
  const monthlyRevenue = dash?.monthlyRevenue || [];
  const activeJobs = dash?.activeJobs || [];
  const health = dash?.health || {};
  const ai = dash?.aiInsights || {};

  const displayedJobs = activeJobs.slice(0, 6);
  const hasMore = activeJobs.length > 6;

  return (
    <div style={{ background: CREAM, minHeight: '100vh', padding: wide ? '24px 32px' : '16px', fontFamily: 'DM Sans, sans-serif' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: NAVY }}>{getGreeting()}, {firstName}</span>
          <span style={{ background: GOLD, color: WHITE, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.05em' }}>OWNER</span>
        </div>
        <span style={{ fontSize: 13, color: '#6B7280' }}>{formatToday()}</span>
      </div>

      <div style={{ display: 'flex', gap: 12, overflowX: wide ? 'visible' : 'auto', flexWrap: wide ? 'wrap' : 'nowrap', marginBottom: 20, paddingBottom: wide ? 0 : 4 }}>
        <KpiCard label="PIPELINE VALUE" value={f$(kpis.pipelineValue)} />
        <KpiCard label="OPEN RECEIVABLES" value={f$(kpis.openReceivables)} />
        <KpiCard label="GROSS PROFIT MTD" value={f$(kpis.grossProfitMtd)} />
        <KpiCard label="COLLECTED MTD" value={f$(kpis.collectedMtd)} trend={kpis.collectedTrend ?? undefined} />
      </div>

      <div style={{ display: 'flex', gap: 16, flexDirection: wide ? 'row' : 'column', marginBottom: 20 }}>
        <div style={{ ...card, flex: wide ? '0 0 60%' : '1 1 auto' }}>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16, color: NAVY, marginBottom: 16 }}>Revenue (last 6 months)</div>
          <RevenueChart data={monthlyRevenue} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexDirection: wide ? 'row' : 'column' }}>

        <div style={{ ...card, flex: wide ? '0 0 55%' : '1 1 auto' }}>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 15, color: NAVY, marginBottom: 14 }}>Active Projects</div>
          {displayedJobs.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No active projects</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayedJobs.map(job => (
                <div
                  key={job.id}
                  onClick={() => onOpenJob && onOpenJob(job.id)}
                  style={{ cursor: 'pointer', padding: '10px 12px', background: CREAM, borderRadius: 8, border: `1px solid ${BORDER}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: NAVY, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(job.address || '').substring(0, 30)}{(job.address || '').length > 30 ? '…' : ''}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {job.contract_value > 0 && (
                        <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>{f$(job.contract_value)}</span>
                      )}
                      <StatusPill status={job.status} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: '#E5E7EB', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${job.phase_pct_complete || 0}%`, height: '100%', background: NAVY, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{job.phase_pct_complete || 0}% complete</span>
                  </div>
                </div>
              ))}
              {hasMore && (
                <div style={{ textAlign: 'right', fontSize: 12, color: GOLD, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>View all →</div>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ ...card }}>
            <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 15, color: NAVY, marginBottom: 12 }}>
              <span style={{ color: GOLD, marginRight: 6 }}>✦</span>Aven AI Insights
            </div>
            {(ai.walkthroughsPending > 0 || ai.jobsBehind > 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ai.walkthroughsPending > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#D97706', fontSize: 13, fontWeight: 500 }}>
                    <span>⚠</span>
                    <span>{ai.walkthroughsPending} walkthrough{ai.walkthroughsPending !== 1 ? 's' : ''} need completion</span>
                  </div>
                )}
                {ai.jobsBehind > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#DC2626', fontSize: 13, fontWeight: 500 }}>
                    <span>⚠</span>
                    <span>{ai.jobsBehind} project{ai.jobsBehind !== 1 ? 's' : ''} behind schedule</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: '#059669', fontSize: 13, fontWeight: 500 }}>✓ All clear — no alerts today</div>
            )}
          </div>

          <div style={{ ...card }}>
            <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 15, color: NAVY, marginBottom: 14 }}>Company Health</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Active Projects', val: health.activeProjects ?? 0, danger: false },
                { label: 'New Leads', val: health.newLeads ?? 0, danger: false },
                { label: 'Jobs Behind', val: health.jobsBehind ?? 0, danger: (health.jobsBehind || 0) > 0 },
              ].map((chip, i) => (
                <div key={i} style={{ background: CREAM, borderRadius: 8, padding: '10px 8px', textAlign: 'center', border: `1px solid ${BORDER}` }}>
                  <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: chip.danger ? '#DC2626' : NAVY, lineHeight: 1.1 }}>{chip.val}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{chip.label}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
