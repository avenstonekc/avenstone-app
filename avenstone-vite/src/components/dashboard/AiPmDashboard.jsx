import { useState, useEffect } from 'react';
import { sb, AV_TENANT, sbCountRecentFailedIntents } from '../../lib/supabase';
import { isMob } from '../../lib/utils';

const PM_TYPES = ['contract_unsigned','payment_overdue','phase_starting_soon','no_daily_log','co_pending_approval','job_stale'];

const ALERT_CONFIG = {
  contract_unsigned:   { label: 'Contract Unsigned',    color: '#ef4444', bg: '#FEE2E2', level: 'high' },
  payment_overdue:     { label: 'Payment Overdue',      color: '#ef4444', bg: '#FEE2E2', level: 'high' },
  phase_starting_soon: { label: 'Phase Starting Soon',  color: '#f59e0b', bg: '#FEF3C7', level: 'medium' },
  no_daily_log:        { label: 'No Daily Log',         color: '#f59e0b', bg: '#FEF3C7', level: 'medium' },
  co_pending_approval: { label: 'CO Pending Approval',  color: '#f59e0b', bg: '#FEF3C7', level: 'medium' },
  job_stale:           { label: 'Job Stale 14+ Days',   color: '#6B7280', bg: '#F3F4F6', level: 'low' },
};

export default function AiPmDashboard({ profile }) {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [failedIntents, setFailedIntents] = useState({ total: 0, byKind: {}, byUser: {} });
  const [showFailedBreakdown, setShowFailedBreakdown] = useState(false);
  const mob = isMob();

  useEffect(() => {
    const load = async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: notifData }, { data: jobData }] = await Promise.all([
        sb.from('notifications')
          .select('*')
          .eq('tenant_id', AV_TENANT)
          .in('type', PM_TYPES)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(200),
        sb.from('jobs')
          .select('id, address, status')
          .eq('tenant_id', AV_TENANT)
          .not('status', 'in', '("complete","on_hold")')
      ]);

      setAlerts(notifData || []);
      setJobs(jobData || []);
      const fi = await sbCountRecentFailedIntents(7);
      setFailedIntents(fi);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, fontFamily: 'DM Sans, sans-serif', color: '#6B7280' }}>
        Loading alerts...
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div style={{ padding: mob ? 14 : 24 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: '#0A1F44', margin: 0 }}>PM Alert Dashboard</h1>
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>Last 30 days · Owner view</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 15, color: '#22c55e', fontWeight: 600, margin: 0 }}>All jobs healthy — no alerts fired in 30 days</p>
        </div>
      </div>
    );
  }

  const jobMap = {};
  jobs.forEach(j => { jobMap[j.id] = j; });

  const highAlerts = alerts.filter(a => ['contract_unsigned','payment_overdue'].includes(a.type));
  const uniqueJobIds = new Set(alerts.map(a => a.job_id).filter(Boolean));

  const countByType = {};
  const lastFiredByType = {};
  PM_TYPES.forEach(t => { countByType[t] = 0; lastFiredByType[t] = null; });
  alerts.forEach(a => {
    if (countByType[a.type] !== undefined) {
      countByType[a.type]++;
      if (!lastFiredByType[a.type] || a.created_at > lastFiredByType[a.type]) {
        lastFiredByType[a.type] = a.created_at;
      }
    }
  });

  const sortedTypes = [...PM_TYPES].sort((a, b) => countByType[b] - countByType[a]);

  const recent50 = alerts.slice(0, 50);

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const fiTotal = failedIntents.total;
  const fiColor = fiTotal === 0 ? '#22c55e' : fiTotal <= 5 ? '#0A1F44' : '#f59e0b';
  const fiLabel = fiTotal === 0 ? '✓ None' : String(fiTotal);

  const statCards = [
    { label: 'Total Alerts', value: alerts.length },
    { label: 'High Priority', value: highAlerts.length },
    { label: 'Jobs Affected', value: uniqueJobIds.size },
  ];

  return (
    <div style={{ padding: mob ? 14 : 24, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 24, color: '#0A1F44', margin: 0 }}>PM Alert Dashboard</h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>Last 30 days · Owner view</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {statCards.map(sc => (
          <div key={sc.label} className="card" style={{ flex: '1 1 140px', minWidth: 120, padding: '14px 16px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#0A1F44', lineHeight: 1 }}>{sc.value}</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{sc.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: '14px 16px', marginBottom: 24, borderLeft: `4px solid ${fiColor}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>Failed saves (7 days)</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Silent write failures captured as Resume todos</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: fiColor }}>{fiLabel}</span>
            {fiTotal > 0 && (
              <button onClick={() => setShowFailedBreakdown(v => !v)} style={{ background: 'none', border: '1px solid #E8E4DC', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: '#6B7280', padding: '3px 8px' }}>
                {showFailedBreakdown ? 'Hide' : 'By kind ▾'}
              </button>
            )}
          </div>
        </div>
        {showFailedBreakdown && fiTotal > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(failedIntents.byKind).map(([kind, count]) => (
              <span key={kind} style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 4, fontSize: 11, fontWeight: 600, color: '#92400e', padding: '3px 8px' }}>
                {kind.replace(/_/g, ' ')}: {count}
              </span>
            ))}
          </div>
        )}
      </div>

      <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 17, color: '#0A1F44', marginBottom: 12 }}>Alert Breakdown</h2>
      <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 28 }}>
        {sortedTypes.map(type => {
          const cfg = ALERT_CONFIG[type];
          const count = countByType[type];
          const last = lastFiredByType[type];
          return (
            <div key={type} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderLeft: `4px solid ${cfg.color}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{cfg.label}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Last fired: {last ? fmtDate(last) : 'Never'}</div>
              </div>
              <span className="badge" style={{ background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: 13, minWidth: 28, textAlign: 'center' }}>{count}</span>
            </div>
          );
        })}
      </div>

      <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 17, color: '#0A1F44', marginBottom: 12 }}>Recent Alerts</h2>

      {recent50.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 14, padding: 24 }}>No alerts in the last 30 days</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {recent50.map((alert, i) => {
            const cfg = ALERT_CONFIG[alert.type] || { label: alert.type, color: '#6B7280', bg: '#F3F4F6' };
            const job = jobMap[alert.job_id];
            const addr = job ? job.address : alert.job_id ? 'Job #' + alert.job_id.slice(0,8) : '—';
            return (
              <div key={alert.id || i} style={{ display: 'flex', alignItems: mob ? 'flex-start' : 'center', gap: 10, padding: '10px 14px', borderBottom: i < recent50.length - 1 ? '1px solid #E8E4DC' : 'none', flexDirection: mob ? 'column' : 'row' }}>
                <span className="badge" style={{ background: cfg.bg, color: cfg.color, fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>{cfg.label}</span>
                <span style={{ fontSize: 13, color: '#0A1F44', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr}</span>
                {alert.title && (
                  <span style={{ fontSize: 12, color: '#6B7280', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.title}</span>
                )}
                <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtDate(alert.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
