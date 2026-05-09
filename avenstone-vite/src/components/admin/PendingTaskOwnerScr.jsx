import { useState, useEffect, useMemo } from 'react';
import { sb, AV_TENANT } from '../../lib/supabase';

const VERB_LABELS = { receipt: 'Receipt', todo: 'Todo', lead: 'Lead', change_order: 'CO', bug: 'Bug' };

function ageDays(createdAt) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

export default function PendingTaskOwnerScr({ profile }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('count');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedRep, setSelectedRep] = useState(null);
  const [rules, setRules] = useState({ max_pending: 10, max_age_days: 3 });
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [repMap, setRepMap] = useState({});

  const load = async () => {
    const { data } = await sb
      .from('pending_tasks')
      .select('*, profiles!user_id(full_name, id)')
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false });
    setTasks(data || []);

    // Load notification rules from tenants
    const { data: tenant } = await sb.from('tenants').select('notification_rules').eq('id', AV_TENANT).single();
    if (tenant?.notification_rules && Object.keys(tenant.notification_rules).length) {
      setRules(r => ({ ...r, ...tenant.notification_rules }));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Build per-rep aggregation
  const repData = useMemo(() => {
    const map = {};
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const task of tasks) {
      const repId = task.user_id;
      const repName = task.profiles?.full_name || repId?.slice(0, 8) || 'Unknown';
      if (!map[repId]) map[repId] = { repId, repName, tasks: [] };
      map[repId].tasks.push(task);
    }
    return Object.values(map).map(rep => {
      const count = rep.tasks.length;
      const oldestAge = rep.tasks.reduce((max, t) => Math.max(max, ageDays(t.created_at)), 0);
      const avgSnooze = rep.tasks.reduce((s, t) => s + (t.snooze_count || 0), 0) / (count || 1);
      const recentDiscards = rep.tasks.filter(t => t.discarded_at && new Date(t.discarded_at).getTime() > thirtyDaysAgo);
      const discardMix = recentDiscards.reduce((acc, t) => {
        const reason = t.discard_reason || 'unknown';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {});
      return { ...rep, count, oldestAge, avgSnooze: Math.round(avgSnooze * 10) / 10, discardMix };
    });
  }, [tasks]);

  const sorted = useMemo(() => {
    return [...repData].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'repName') { av = av || ''; bv = bv || ''; return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av); }
      return sortAsc ? av - bv : bv - av;
    });
  }, [repData, sortKey, sortAsc]);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const saveRules = async () => {
    setSavingRules(true);
    await sb.from('tenants').update({ notification_rules: rules, updated_at: new Date().toISOString() }).eq('id', AV_TENANT);
    setSavingRules(false);
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 3000);
  };

  const thStyle = (key) => ({
    padding: '10px 12px',
    textAlign: 'left',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 12,
    fontWeight: 600,
    color: '#6B7280',
    cursor: 'pointer',
    borderBottom: '1px solid #E8E4DC',
    whiteSpace: 'nowrap',
    background: sortKey === key ? '#F7F5F0' : '#fff',
    userSelect: 'none',
  });
  const tdStyle = { padding: '10px 12px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#374151', borderBottom: '1px solid #F3F4F6' };

  return (
    <div style={{ padding: '16px 20px', maxWidth: 900, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: '#0A1F44', marginBottom: 4 }}>Pending Tasks — Discipline</div>
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>Active pending + in-progress tasks by rep</div>
      </div>

      {/* Notification rules */}
      <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 10, padding: '16px 20px', marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Alert when rep has more than</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" min={1} max={100} value={rules.max_pending}
              onChange={e => setRules(r => ({ ...r, max_pending: parseInt(e.target.value) || 10 }))}
              style={{ width: 64, border: '1px solid #E8E4DC', borderRadius: 6, padding: '6px 8px', fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#0A1F44', textAlign: 'center' }} />
            <span style={{ fontSize: 13, color: '#374151' }}>pending tasks</span>
          </div>
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Alert when task older than</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" min={1} max={60} value={rules.max_age_days}
              onChange={e => setRules(r => ({ ...r, max_age_days: parseInt(e.target.value) || 3 }))}
              style={{ width: 64, border: '1px solid #E8E4DC', borderRadius: 6, padding: '6px 8px', fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#0A1F44', textAlign: 'center' }} />
            <span style={{ fontSize: 13, color: '#374151' }}>days</span>
          </div>
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <button onClick={saveRules} disabled={savingRules}
            style={{ padding: '8px 18px', borderRadius: 8, background: rulesSaved ? '#D1FAE5' : '#0A1F44', color: rulesSaved ? '#166534' : '#C9A84C', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>
            {savingRules ? 'Saving…' : rulesSaved ? '✓ Saved' : 'Save rules'}
          </button>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Rules saved — cron alerting deferred (v2)</div>
        </div>
      </div>

      {loading && <div style={{ color: '#9CA3AF', fontSize: 14 }}>Loading…</div>}

      {!loading && repData.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF', fontSize: 14 }}>No pending tasks across the team 🎉</div>
      )}

      {!loading && repData.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #E8E4DC', borderRadius: 10, overflow: 'hidden' }}>
          <thead>
            <tr>
              {[['repName', 'Rep'], ['count', 'Pending'], ['oldestAge', 'Oldest (days)'], ['avgSnooze', 'Avg snoozed'], ['discardMix', 'Discards (30d)']].map(([key, label]) => (
                <th key={key} style={thStyle(key)} onClick={() => key !== 'discardMix' && handleSort(key)}>
                  {label}{sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(rep => (
              <tr key={rep.repId}
                style={{ cursor: 'pointer', background: selectedRep?.repId === rep.repId ? '#F7F5F0' : '#fff' }}
                onClick={() => setSelectedRep(selectedRep?.repId === rep.repId ? null : rep)}
                onMouseEnter={e => { if (selectedRep?.repId !== rep.repId) e.currentTarget.style.background = '#FAFAFA'; }}
                onMouseLeave={e => { if (selectedRep?.repId !== rep.repId) e.currentTarget.style.background = '#fff'; }}>
                <td style={tdStyle}><strong>{rep.repName}</strong></td>
                <td style={{ ...tdStyle, color: rep.count > rules.max_pending ? '#991B1B' : '#374151', fontWeight: rep.count > rules.max_pending ? 700 : 400 }}>{rep.count}</td>
                <td style={{ ...tdStyle, color: rep.oldestAge > rules.max_age_days ? '#991B1B' : '#374151', fontWeight: rep.oldestAge > rules.max_age_days ? 700 : 400 }}>{rep.oldestAge}</td>
                <td style={tdStyle}>{rep.avgSnooze}</td>
                <td style={{ ...tdStyle, fontSize: 11 }}>
                  {Object.entries(rep.discardMix).length
                    ? Object.entries(rep.discardMix).map(([k, v]) => <span key={k} style={{ background: '#F3F4F6', borderRadius: 10, padding: '2px 7px', marginRight: 4 }}>{k}: {v}</span>)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Rep task drawer */}
      {selectedRep && (
        <div style={{ marginTop: 20, background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 600, color: '#0A1F44', fontSize: 15, marginBottom: 12 }}>{selectedRep.repName}'s queue</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedRep.tasks.map(task => (
              <div key={task.id} style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600, color: '#C9A84C', flexShrink: 0 }}>{VERB_LABELS[task.verb] || task.verb}</span>
                <span style={{ flex: 1, fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.quick_label || '—'}</span>
                <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{ageDays(task.created_at)}d old</span>
                {task.snooze_count > 0 && <span style={{ fontSize: 11, background: '#FEF3C7', color: '#92400E', borderRadius: 10, padding: '2px 7px', flexShrink: 0 }}>Snoozed {task.snooze_count}×</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 10 }}>Read-only — reps manage their own queue from Master Agent</div>
        </div>
      )}
    </div>
  );
}
