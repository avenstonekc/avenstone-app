import { useState, useEffect } from 'react';
import { sb, AV_TENANT } from '../../lib/supabase';
import { f$, STATS } from '../../lib/utils';
import StarRating from '../shared/StarRating';

export default function Reports({ jobs, profile }) {
  const isOwner = profile?.role === 'owner';
  const myJobs = isOwner ? jobs : jobs.filter(j => (j.assigned_rep || '') === (profile?.full_name || profile?.email || '__none__'));
  const complete = myJobs.filter(j => j.status === 'complete');
  const bids = myJobs.filter(j => j.status === 'proposal');
  const inProgress = myJobs.filter(j => j.status === 'in_progress');

  const [subRatings, setSubRatings] = useState([]);
  const [logStats, setLogStats] = useState([]);
  const [payments, setPayments] = useState([]);
  const [repProfiles, setRepProfiles] = useState([]);
  const [reportTab, setReportTab] = useState('overview');

  useEffect(() => {
    sb.from('sub_ratings').select('sub_id,stars,sub:sub_id(full_name,trade)').eq('tenant_id', AV_TENANT).then(({ data }) => { if (data) setSubRatings(data); });
    sb.from('daily_logs').select('job_id,crew_count,hours_worked,job:job_id(address)').eq('tenant_id', AV_TENANT).then(({ data }) => { if (data) setLogStats(data); });
    sb.from('payments').select('*').eq('tenant_id', AV_TENANT).eq('status', 'paid').then(({ data }) => { if (data) setPayments(data); });
    if (isOwner) { sb.from('profiles').select('*').eq('tenant_id', AV_TENANT).in('role', ['sales_rep', 'owner', 'project_manager']).then(({ data }) => { if (data) setRepProfiles(data); }); }
  }, []);

  const subMap = {};
  subRatings.forEach(r => { const k = r.sub_id; if (!subMap[k]) subMap[k] = { name: r.sub?.full_name || 'Unknown', trade: r.sub?.trade || '', sum: 0, cnt: 0 }; subMap[k].sum += r.stars; subMap[k].cnt++; });
  const subLeaderboard = Object.values(subMap).map(s => ({ ...s, avg: s.sum / s.cnt })).sort((a, b) => b.avg - a.avg || b.cnt - a.cnt).slice(0, 8);

  const logByJob = {};
  logStats.forEach(l => { const k = l.job_id; if (!logByJob[k]) logByJob[k] = { address: l.job?.address || l.job_id, hours: 0, crew: 0, logs: 0 }; logByJob[k].hours += Number(l.hours_worked || 0); logByJob[k].crew += Number(l.crew_count || 0); logByJob[k].logs++; });
  const logRows = Object.values(logByJob).sort((a, b) => b.hours - a.hours).slice(0, 8);
  const totalHours = logStats.reduce((a, l) => a + Number(l.hours_worked || 0), 0);

  const totalContract = myJobs.reduce((a, j) => a + Number(j.contract_value || 0), 0);
  const totalCOs = myJobs.reduce((a, j) => a + Number(j.co_total || 0), 0);
  const totalRevenue = totalContract + totalCOs;
  const completedRevenue = complete.reduce((a, j) => a + Number(j.contract_value || 0) + Number(j.co_total || 0), 0);
  const pipelineValue = bids.reduce((a, j) => a + Number(j.contract_value || 0), 0);
  const totalCollected = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
  const totalOutstanding = totalRevenue - totalCollected;

  const byRep = {};
  jobs.forEach(j => {
    const r = j.assigned_rep || 'Unassigned';
    if (!byRep[r]) byRep[r] = { name: r, total: 0, active: 0, complete: 0, value: 0, collected: 0, commission_pct: 0, commission_dollar: 0 };
    byRep[r].total++; if (!['complete', 'on_hold'].includes(j.status)) byRep[r].active++; if (j.status === 'complete') byRep[r].complete++; byRep[r].value += Number(j.contract_value || 0);
  });
  repProfiles.forEach(p => { const key = p.full_name || p.email || ''; if (byRep[key]) { byRep[key].commission_pct = Number(p.commission_pct || 0); byRep[key].commission_dollar = Number(p.commission_dollar || 0); } });
  payments.forEach(p => { const j = jobs.find(jj => jj.id === p.job_id); if (j) { const r = j.assigned_rep || 'Unassigned'; if (byRep[r]) byRep[r].collected += Number(p.amount || 0); } });
  const repRows = Object.entries(byRep).sort((a, b) => b[1].value - a[1].value);

  const statusBreakdown = STATS.map(s => ({ ...s, count: myJobs.filter(j => j.status === s.id).length, value: myJobs.filter(j => j.status === s.id).reduce((a, j) => a + Number(j.contract_value || 0), 0) })).filter(s => s.count > 0);

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), year: d.getFullYear(), month: d.getMonth() }; });
  const monthlyData = months.map(m => ({
    ...m,
    contracted: myJobs.filter(j => { const d = new Date(j.created); return d.getFullYear() === m.year && d.getMonth() === m.month; }).reduce((a, j) => a + Number(j.contract_value || 0), 0),
    collected: payments.filter(p => { const d = new Date(p.created_at); return d.getFullYear() === m.year && d.getMonth() === m.month; }).reduce((a, p) => a + Number(p.amount || 0), 0),
  }));
  const maxMonthly = Math.max(...monthlyData.map(m => Math.max(m.contracted, m.collected)), 1);

  const myCommPct = Number(repProfiles.find(p => p.id === profile?.id)?.commission_pct || 0);
  const myCommDollar = Number(repProfiles.find(p => p.id === profile?.id)?.commission_dollar || 0);
  const myCollected = payments.filter(p => { const j = myJobs.find(jj => jj.id === p.job_id); return !!j; }).reduce((a, p) => a + Number(p.amount || 0), 0);
  const myCommEarned = myCommDollar > 0 ? (myJobs.filter(j => j.status === 'complete').length * myCommDollar) : (myCollected * (myCommPct / 100));
  const myCommPending = myCommDollar > 0 ? (myJobs.filter(j => ['contract', 'in_progress', 'final_touches'].includes(j.status)).length * myCommDollar) : (totalOutstanding * (myCommPct / 100));

  const Stat = ({ label, value, sub, color }) => (
    <div style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: color || 'var(--navy-900)', marginBottom: sub ? 4 : 0 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{sub}</div>}
    </div>
  );

  const REPORT_TABS = isOwner
    ? [{ id: 'overview', lb: 'Overview' }, { id: 'revenue', lb: 'Revenue' }, { id: 'commissions', lb: 'Commissions' }, { id: 'labor', lb: 'Labor' }]
    : [{ id: 'overview', lb: 'Overview' }, { id: 'commissions', lb: 'My Commission' }];

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: 'var(--navy-900)' }}>Reports</div>
          {!isOwner && <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>Your projects only</div>}
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => {
          const rows = [['Address', 'Client', 'Status', 'Contract', 'CO Total', 'Collected', 'Rep', 'Target'].join(','), ...myJobs.map(j => { const col = payments.filter(p => p.job_id === j.id).reduce((a, p) => a + Number(p.amount || 0), 0); return [`"${j.address || ''}"`, `"${j.client_name || ''}"`, j.status || '', j.contract_value || 0, j.co_total || 0, col, `"${j.assigned_rep || ''}"`, j.target_completion || ''].join(','); })];
          const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `avenstone-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        }}>⬇ Export CSV</button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #E8E4DC', marginBottom: 20 }}>
        {REPORT_TABS.map(t => <button key={t.id} onClick={() => setReportTab(t.id)} style={{ padding: '8px 16px', border: 'none', background: 'transparent', fontWeight: 600, fontSize: 12, cursor: 'pointer', borderBottom: `2px solid ${reportTab === t.id ? 'var(--gold-500)' : 'transparent'}`, color: reportTab === t.id ? 'var(--navy-900)' : 'var(--text-subtle)' }}>{t.lb}</button>)}
      </div>

      {reportTab === 'overview' && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 24 }}>
          <Stat label="Total Contracted" value={f$(totalRevenue)} sub={totalCOs > 0 ? `incl. ${f$(totalCOs)} COs` : null} />
          <Stat label="Collected" value={f$(totalCollected)} sub="payments received" color="#22c55e" />
          <Stat label="Outstanding" value={f$(Math.max(totalOutstanding, 0))} sub="not yet collected" color="#f59e0b" />
          <Stat label="Completed" value={f$(completedRevenue)} sub={`${complete.length} jobs`} color="#22c55e" />
          <Stat label="Pipeline" value={f$(pipelineValue)} sub={`${bids.length} bids out`} color="#6366f1" />
          <Stat label="Avg Job Value" value={myJobs.length ? f$(Math.round(totalContract / myJobs.length)) : f$(0)} sub="contract value" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>By Status</div>
            {statusBreakdown.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.c, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{s.lb}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy-900)', minWidth: 20, textAlign: 'right' }}>{s.count}</div>
                {s.value > 0 && <div style={{ fontSize: 11, color: 'var(--text-subtle)', minWidth: 70, textAlign: 'right' }}>{f$(s.value)}</div>}
              </div>
            ))}
            {!statusBreakdown.length && <div style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: 20 }}>No jobs yet</div>}
          </div>
          {complete.length > 0 && <div style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Completed Jobs</div>
            {complete.slice(0, 8).map(j => { const col = payments.filter(p => p.job_id === j.id).reduce((a, p) => a + Number(p.amount || 0), 0); const tot = Number(j.contract_value || 0) + Number(j.co_total || 0); return (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #F3F0E8' }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.address}</div>{j.assigned_rep && <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{j.assigned_rep}</div>}</div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-dot)' }}>{f$(tot)}</div>{col < tot && <div style={{ fontSize: 10, color: 'var(--amber-text)' }}>{f$(tot - col)} outstanding</div>}</div>
              </div>
            ); })}
          </div>}
        </div>
      </>}

      {reportTab === 'revenue' && isOwner && <>
        <div style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Monthly — Contracted vs Collected</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
            {monthlyData.map(m => (
              <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 9, color: 'var(--text-subtle)', fontWeight: 600, textAlign: 'center' }}>{m.contracted > 0 ? f$(m.contracted) : ''}</div>
                <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 100 }}>
                  <div style={{ flex: 1, background: 'var(--navy-900)', borderRadius: '2px 2px 0 0', height: `${Math.max((m.contracted / maxMonthly) * 100, m.contracted > 0 ? 4 : 0)}px`, transition: 'height 0.3s' }} />
                  <div style={{ flex: 1, background: 'var(--green-dot)', borderRadius: '2px 2px 0 0', height: `${Math.max((m.collected / maxMonthly) * 100, m.collected > 0 ? 4 : 0)}px`, transition: 'height 0.3s' }} />
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-subtle)' }}>{m.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--text-subtle)' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--navy-900)', borderRadius: 2, marginRight: 4 }} />Contracted</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--green-dot)', borderRadius: 2, marginRight: 4 }} />Collected</span>
          </div>
        </div>
        <div style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Revenue by Rep</div>
          {repRows.map(([rep, d]) => (
            <div key={rep} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #F3F0E8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)' }}>{rep}</div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy-900)' }}>{f$(d.value)}</div><div style={{ fontSize: 11, color: 'var(--green-dot)' }}>{f$(d.collected)} collected</div></div>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-subtle)' }}>
                <span>{d.total} jobs</span><span style={{ color: '#6366f1' }}>{d.active} active</span><span style={{ color: 'var(--green-dot)' }}>{d.complete} complete</span>
              </div>
            </div>
          ))}
        </div>
      </>}

      {reportTab === 'commissions' && <>
        {isOwner && <div style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Commission Rates — set per rep in Team settings</div>
          {repRows.map(([rep, d]) => {
            const commPct = d.commission_pct || 0; const commDollar = d.commission_dollar || 0;
            const earned = commDollar > 0 ? (d.complete * commDollar) : (d.collected * (commPct / 100));
            const pending = commDollar > 0 ? (d.active * commDollar) : ((d.value - d.collected) * (commPct / 100));
            const rateLabel = commDollar > 0 ? `${f$(commDollar)}/job flat` : commPct > 0 ? `${commPct}% of collected` : 'No rate set';
            return (
              <div key={rep} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #F3F0E8' }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)' }}>{rep}</div><div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{rateLabel}</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-dot)' }}>{f$(earned)} earned</div><div style={{ fontSize: 11, color: 'var(--amber-text)' }}>{f$(Math.max(pending, 0))} pending</div></div>
              </div>
            );
          })}
          {!repRows.length && <div style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: 20 }}>No reps yet</div>}
        </div>}
        {!isOwner && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <Stat label="Commission Earned" value={f$(myCommEarned)} sub={myCommPct > 0 ? `${myCommPct}% of collected` : (myCommDollar > 0 ? `${f$(myCommDollar)}/sale` : '')} color="#22c55e" />
            <Stat label="Commission Pending" value={f$(myCommPending)} sub="on active jobs" color="#f59e0b" />
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>My Jobs</div>
            {myJobs.map(j => { const col = payments.filter(p => p.job_id === j.id).reduce((a, p) => a + Number(p.amount || 0), 0); const comm = myCommDollar > 0 ? (j.status === 'complete' ? myCommDollar : 0) : (col * (myCommPct / 100)); return (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #F3F0E8' }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.address}</div><div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{j.status}</div></div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f$(Number(j.contract_value || 0))}</div>{comm > 0 && <div style={{ fontSize: 11, color: 'var(--green-dot)', fontWeight: 600 }}>{f$(comm)} commission</div>}</div>
              </div>
            ); })}
          </div>
        </>}
      </>}

      {reportTab === 'labor' && isOwner && <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1 }}>Labor Hours by Job</div>
              {totalHours > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy-900)' }}>{totalHours.toLocaleString()} total</div>}
            </div>
            {logRows.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: 20 }}>No daily logs yet</div>}
            {logRows.map((r, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{r.address}</span>
                  <span style={{ flexShrink: 0, color: 'var(--navy-900)' }}>{r.hours} hrs</span>
                </div>
                <div style={{ background: 'var(--bg)', height: 6, borderRadius: 3 }}>
                  <div style={{ background: 'var(--gold-500)', height: 6, borderRadius: 3, width: `${Math.min((r.hours / Math.max(...logRows.map(x => x.hours), 1)) * 100, 100)}%`, transition: 'width 0.4s' }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 2 }}>{r.logs} log{r.logs !== 1 ? 's' : ''} · avg {r.logs ? Math.round(r.crew / r.logs) : 0} crew</div>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Sub Leaderboard</div>
            {subLeaderboard.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: 20 }}>No ratings yet</div>}
            {subLeaderboard.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 24, height: 24, background: 'var(--navy-900)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--gold-500)', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)' }}>{s.name}</div>{s.trade && <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{s.trade}</div>}</div>
                <div style={{ textAlign: 'right' }}><StarRating value={Math.round(s.avg)} readonly size={12} /><div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{s.avg.toFixed(1)} · {s.cnt} review{s.cnt !== 1 ? 's' : ''}</div></div>
              </div>
            ))}
          </div>
        </div>
      </>}
    </div>
  );
}
