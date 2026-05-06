import { useState, useEffect } from 'react';
import {
  sb,
  AV_TENANT,
  sbLoadSubPerformance,
  sbLoadJobOutcomes,
  sbLoadBidAnalytics,
  sbLoadOwnerEscalations,
} from '../../lib/supabase';
import SubPortal from '../sub/SubPortal';
import ClientPortal from '../client/ClientPortal';

const TABS = [
  { id: 'intelligence', lb: 'Intelligence Dashboard' },
  { id: 'escalations', lb: 'Owner Escalations' },
  { id: 'preview', lb: 'Portal Preview' },
];

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';

function scoreColor(score) {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#EF4444';
}

function scoreBg(score) {
  if (score >= 80) return '#D1FAE5';
  if (score >= 60) return '#FEF3C7';
  return '#FEE2E2';
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: NAVY, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );
}

function EmptyState({ msg }) {
  return <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 14 }}>{msg}</div>;
}

// ─── Tab 1: Intelligence Dashboard ─────────────────────────────────────────────
function IntelligenceTab({ profile }) {
  const [subPerf, setSubPerf] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const tid = profile.tenant_id || AV_TENANT;
    Promise.all([
      sbLoadSubPerformance(tid),
      sbLoadJobOutcomes(tid),
      sbLoadBidAnalytics(tid),
    ])
      .then(([sp, jo, ba]) => { setSubPerf(sp); setOutcomes(jo); setBids(ba); setLoading(false); })
      .catch(e => { setError(e.message || 'Failed to load'); setLoading(false); });
  }, []);

  if (loading) return <Spinner />;
  if (error) return <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 12, borderRadius: 8, margin: 16 }}>{error}</div>;

  const avgEstAcc = outcomes.length ? (outcomes.reduce((s, o) => s + (o.estimate_accuracy_pct || 0), 0) / outcomes.length).toFixed(1) : null;
  const avgSchAcc = outcomes.length ? (outcomes.reduce((s, o) => s + (o.schedule_accuracy_pct || 0), 0) / outcomes.length).toFixed(1) : null;
  const wonBids = bids.filter(b => b.outcome === 'won').length;
  const lostBids = bids.filter(b => b.outcome === 'lost').length;
  const winRate = wonBids + lostBids > 0 ? ((wonBids / (wonBids + lostBids)) * 100).toFixed(0) : null;

  return (
    <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { lb: 'Jobs Completed', val: outcomes.length },
          { lb: 'Avg Estimate Accuracy', val: avgEstAcc != null ? `${avgEstAcc}%` : '—' },
          { lb: 'Avg Schedule Accuracy', val: avgSchAcc != null ? `${avgSchAcc}%` : '—' },
          { lb: 'Bid Win Rate', val: winRate != null ? `${winRate}%` : '—' },
          { lb: 'Bids Won / Lost', val: `${wonBids} / ${lostBids}` },
        ].map(k => (
          <div key={k.lb} className="card" style={{ textAlign: 'center', padding: '14px 12px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "'DM Serif Display',serif" }}>{k.val}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.lb}</div>
          </div>
        ))}
      </div>

      {/* Sub Leaderboard */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: NAVY }}>Sub Leaderboard</div>
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>{subPerf.length} contractors</div>
        </div>
        {subPerf.length === 0 ? (
          <EmptyState msg="No performance data yet. Scores appear once subs start completing phases." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, background: CREAM }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, background: CREAM }}>Trade</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, background: CREAM }}>Score</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, background: CREAM }}>Jobs</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, background: CREAM }}>On-Time %</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, background: CREAM }}>COs Caused</th>
                </tr>
              </thead>
              <tbody>
                {subPerf.map(s => {
                  const onTimePct = (s.phases_on_time + s.phases_late) > 0
                    ? ((s.phases_on_time / (s.phases_on_time + s.phases_late)) * 100).toFixed(0)
                    : '—';
                  return (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: NAVY, fontWeight: 500 }}>
                        {s.profiles?.full_name || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#6B7280' }}>{s.trade || '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ background: scoreBg(s.score), color: scoreColor(s.score), fontWeight: 700, fontSize: 13, padding: '2px 10px', borderRadius: 12 }}>
                          {s.score}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, color: '#6B7280' }}>{s.jobs_completed}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, color: '#6B7280' }}>{onTimePct === '—' ? '—' : `${onTimePct}%`}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, color: s.cos_caused > 0 ? '#EF4444' : '#6B7280', fontWeight: s.cos_caused > 0 ? 600 : 400 }}>{s.cos_caused}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 2: Pricing Approvals ───────────────────────────────────────────────────
// ─── Tab 2: Owner Escalations ───────────────────────────────────────────────────
function EscalationsTab({ profile }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responses, setResponses] = useState({});
  const [expanded, setExpanded] = useState({});
  const [working, setWorking] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const tid = profile.tenant_id || AV_TENANT;
    sbLoadOwnerEscalations(tid)
      .then(d => { setItems(d); setLoading(false); })
      .catch(e => { setError(e.message || 'Failed to load'); setLoading(false); });
  }, []);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const answer = async item => {
    const resp = responses[item.id] || '';
    if (!resp.trim()) return;
    setWorking(item.id);
    await sb.from('owner_escalations').update({
      status: 'answered',
      owner_response: resp,
      answered_at: new Date().toISOString(),
    }).eq('id', item.id);
    setItems(p => p.filter(x => x.id !== item.id));
    setWorking(null);
    showToast('Response saved.');
  };

  const dismiss = async item => {
    setWorking(item.id + '_dismiss');
    await sb.from('owner_escalations').update({ status: 'dismissed' }).eq('id', item.id);
    setItems(p => p.filter(x => x.id !== item.id));
    setWorking(null);
    showToast('Dismissed.');
  };

  if (loading) return <Spinner />;
  if (error) return <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 12, borderRadius: 8, margin: 16 }}>{error}</div>;

  return (
    <div style={{ padding: '16px 0' }}>
      {toast && (
        <div style={{ background: '#D1FAE5', color: '#065F46', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{toast}</div>
      )}
      {items.length === 0 ? (
        <EmptyState msg="No pending questions from AI." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(item => (
            <div key={item.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{item.source_agent}</div>
                  {item.jobs?.address && (
                    <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{item.jobs.address}</div>
                  )}
                  <div style={{ fontSize: 11, color: '#9CA3AF' }}>{new Date(item.created_at).toLocaleDateString()}</div>
                </div>
              </div>
              <div style={{ fontSize: 14, color: NAVY, fontWeight: 500, marginBottom: 10, lineHeight: 1.5 }}>{item.question}</div>
              {item.context && (
                <div style={{ marginBottom: 10 }}>
                  <button
                    onClick={() => setExpanded(p => ({ ...p, [item.id]: !p[item.id] }))}
                    style={{ background: 'none', border: 'none', color: GOLD, fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600 }}
                  >
                    {expanded[item.id] ? 'Hide context' : 'Show context'}
                  </button>
                  {expanded[item.id] && (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#6B7280', background: CREAM, padding: '8px 12px', borderRadius: 6, lineHeight: 1.5 }}>
                      {item.context}
                    </div>
                  )}
                </div>
              )}
              <textarea
                placeholder="Your response..."
                value={responses[item.id] || ''}
                onChange={e => setResponses(p => ({ ...p, [item.id]: e.target.value }))}
                rows={3}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: NAVY, resize: 'vertical', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-navy"
                  disabled={working === item.id || !responses[item.id]?.trim()}
                  onClick={() => answer(item)}
                  style={{ flex: 1 }}
                >
                  {working === item.id ? 'Saving...' : 'Answer'}
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={working === item.id + '_dismiss'}
                  onClick={() => dismiss(item)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Portal Preview ──────────────────────────────────────────────────────
function PreviewTab({ profile }) {
  const [subs, setSubs] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedSub, setSelectedSub] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [previewProfile, setPreviewProfile] = useState(null);
  const [previewType, setPreviewType] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tid = profile.tenant_id || AV_TENANT;
    Promise.all([
      sb.from('profiles').select('id, full_name, role, tenant_id, email').eq('tenant_id', tid).eq('role', 'sub').order('full_name').then(r => r.data || []),
      sb.from('profiles').select('id, full_name, role, tenant_id, email').eq('tenant_id', tid).eq('role', 'client').order('full_name').then(r => r.data || []),
    ]).then(([s, c]) => { setSubs(s); setClients(c); setLoading(false); });
  }, []);

  const launchSub = () => {
    const p = subs.find(s => s.id === selectedSub);
    if (!p) return;
    setPreviewType('sub');
    setPreviewProfile(p);
  };

  const launchClient = () => {
    const p = clients.find(c => c.id === selectedClient);
    if (!p) return;
    setPreviewType('client');
    setPreviewProfile(p);
  };

  const exitPreview = () => { setPreviewProfile(null); setPreviewType(''); };

  if (previewProfile) {
    return (
      <div style={{ position: 'relative' }}>
        <div style={{ background: GOLD, color: NAVY, padding: '10px 16px', fontWeight: 700, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 8, marginBottom: 16 }}>
          <span>Previewing as: {previewProfile.full_name} ({previewType === 'sub' ? 'Contractor' : 'Client'})</span>
          <button onClick={exitPreview} className="btn btn-navy" style={{ fontSize: 12, padding: '4px 12px' }}>Exit Preview</button>
        </div>
        {previewType === 'sub' && <SubPortal profile={previewProfile} signOut={exitPreview} />}
        {previewType === 'client' && <ClientPortal profile={previewProfile} signOut={exitPreview} />}
      </div>
    );
  }

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sub Preview */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: NAVY, marginBottom: 12 }}>Sub / Contractor View</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>See the app exactly as a subcontractor sees it.</div>
        {subs.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>No contractors in this account.</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="finp"
              value={selectedSub}
              onChange={e => setSelectedSub(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            >
              <option value="">Select contractor...</option>
              {subs.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <button
              className="btn btn-navy"
              onClick={launchSub}
              disabled={!selectedSub}
            >
              Preview as Sub
            </button>
          </div>
        )}
      </div>

      {/* Client Preview */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: NAVY, marginBottom: 12 }}>Client View</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>See the app exactly as a client sees it.</div>
        {clients.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>No clients in this account.</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="finp"
              value={selectedClient}
              onChange={e => setSelectedClient(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            >
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            <button
              className="btn btn-navy"
              onClick={launchClient}
              disabled={!selectedClient}
            >
              Preview as Client
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main OwnerPortal ───────────────────────────────────────────────────────────
export default function OwnerPortal({ profile }) {
  const [activeTab, setActiveTab] = useState('intelligence');

  return (
    <div style={{ padding: '16px 20px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: NAVY }}>Owner Portal</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>Intelligence, approvals, and team visibility</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `2px solid ${BORDER}`, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.id ? `2px solid ${NAVY}` : '2px solid transparent',
              marginBottom: -2,
              color: activeTab === t.id ? NAVY : '#9CA3AF',
              fontWeight: activeTab === t.id ? 700 : 400,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {t.lb}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'intelligence' && <IntelligenceTab profile={profile} />}
      {activeTab === 'escalations' && <EscalationsTab profile={profile} />}
      {activeTab === 'preview' && <PreviewTab profile={profile} />}
    </div>
  );
}
