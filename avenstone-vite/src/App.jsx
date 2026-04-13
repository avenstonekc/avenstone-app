import { useState, useEffect } from 'react';
import { sb, setSession, sbLoadNotifs, sbMarkNotifsRead, sbSave, sbUpd, setGlobalJobs, AI_PM_NIGHTLY_URL, ANON_KEY } from './lib/supabase';
import { Ic, STATS, sc, sl, f$, ls, ll } from './lib/utils';
import { IQ, IR, BQ, BR } from './lib/formData';
import logo from './assets/logo.png';

import LoginScr from './components/auth/LoginScr';
import SetPasswordScr from './components/auth/SetPasswordScr';
import ClientPortal from './components/client/ClientPortal';
import SubPortal from './components/sub/SubPortal';
import DashScr from './components/dashboard/DashScr';
import Reports from './components/dashboard/Reports';
import CalScr from './components/dashboard/CalScr';
import JobsScr from './components/jobs/JobsScr';
import FormScr from './components/forms/FormScr';
import TkOf from './components/common/TkOf';
import Pipeline from './components/common/Pipeline';
import UserMgmt from './components/common/UserMgmt';
import StatusPage from './components/common/StatusPage';
import SubDir from './components/sub/SubDir';
import NotifPanel from './components/shared/NotifPanel';
import SettingsModal from './components/modals/SettingsModal';
import AiKnowledgeScr from './components/ai/AiKnowledgeScr';
import AiHomeScr from './components/ai/AiHomeScr';
import PublicProfile from './components/public/PublicProfile';
import ReviewPage from './components/public/ReviewPage';
import LeadsScr from './components/leads/LeadsScr';
import AiFieldAgent from './components/ai/AiFieldAgent';

// Read URL params before React hydrates (mirrors legacy HTML behavior)
const _params     = new URLSearchParams(window.location.search);
const STATUS_TOKEN = _params.get('st');
const PRO_TENANT   = _params.get('pro');
const REVIEW_JOB   = _params.get('review');
const REVIEW_TENANT = _params.get('rt');
const INVITE_TYPE  = new URLSearchParams(window.location.hash.replace('#', '')).get('type');

export default function App() {
  const [session, setSessionState] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pg, setPg] = useState('dashboard');
  const [jobs, setJobs] = useState(() => ll('av_j', []));
  const [notifs, setNotifs] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingJobId, setPendingJobId] = useState(null);
  const [pendingNew, setPendingNew] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session: s } }) => {
      setSessionState(s);
      if (s) loadProfile(s.user.id);
      else setAuthLoading(false);
    });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, s) => {
      setSessionState(s);
      if (s) loadProfile(s.user.id);
      else { setProfile(null); setAuthLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async uid => {
    const { data } = await sb.from('profiles').select('*').eq('id', uid).single();
    setProfile(data);
    setSession(data?.tenant_id, uid);
    sbLoadNotifs().then(d => setNotifs(d));
    // Trigger PM analysis once per day on first login
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('av_pm_date') !== today) {
      localStorage.setItem('av_pm_date', today);
      fetch(AI_PM_NIGHTLY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` }, body: '{}' }).catch(() => {});
    }
    setAuthLoading(false);
  };

  useEffect(() => { setGlobalJobs(jobs); }, [jobs]);

  const saveJob = j => { const u = [j, ...jobs]; setJobs(u); ls('av_j', u); sbSave(j); };
  const signOut = async () => { await sb.auth.signOut(); ls('av_j', []); setJobs([]); setNotifs([]); };

  useEffect(() => {
    if (!profile?.id) return;
    const ch = sb.channel('notif-' + profile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        payload => setNotifs(p => [payload.new, ...p]))
      .subscribe();
    return () => sb.removeChannel(ch);
  }, [profile?.id]);

  const unreadCount = notifs.filter(n => !n.read).length;
  const markAllNotifsRead = async () => {
    const ids = notifs.filter(n => !n.read).map(n => n.id);
    if (!ids.length) return;
    await sbMarkNotifsRead(ids);
    setNotifs(p => p.map(n => ({ ...n, read: true })));
  };
  const onClickNotif = async n => {
    if (!n.read) { await sbMarkNotifsRead([n.id]); setNotifs(p => p.map(x => x.id === n.id ? { ...x, read: true } : x)); }
    if (n.job_id) { setPendingJobId(n.job_id); setPg('jobs'); }
    setShowNotif(false);
  };

  if (STATUS_TOKEN) return <StatusPage token={STATUS_TOKEN} />;
  if (PRO_TENANT)   return <PublicProfile tenantId={PRO_TENANT} />;
  if (REVIEW_JOB || REVIEW_TENANT) return <ReviewPage jobId={REVIEW_JOB} tenantId={REVIEW_TENANT} />;

  if (authLoading) return (
    <div style={{ minHeight: '100dvh', background: '#0A1F44', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <img src={logo} alt="Avenstone" style={{ width: 64, height: 64, objectFit: 'contain', opacity: 0.7 }} />
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 3, textTransform: 'uppercase' }}>Loading</div>
    </div>
  );
  if (!session) return <LoginScr />;

  if ((INVITE_TYPE === 'invite' || INVITE_TYPE === 'recovery') && session) {
    return <SetPasswordScr onDone={() => window.history.replaceState(null, '', window.location.pathname)} />;
  }

  if (profile?.role === 'sub') return <SubPortal profile={profile} signOut={signOut} />;
  if (profile?.role === 'client') return <ClientPortal profile={profile} signOut={signOut} />;

  const isOwnerOrRep = ['owner', 'sales_rep'].includes(profile?.role);
  const isStaff = ['owner', 'sales_rep', 'project_manager'].includes(profile?.role);
  const initial = (profile?.full_name || '?')[0].toUpperCase();
  const roleLabel = { owner: 'Owner', sales_rep: 'Sales Rep', project_manager: 'Project Manager', sub: 'Contractor' }[profile?.role] || 'User';

  const NAV = [
    { id: 'dashboard', lb: 'AI Home', ic: 'grid', sec: 'Main' },
    { id: 'jobs', lb: 'Projects', ic: 'home', sec: 'Main', badge: jobs.filter(j => !['complete', 'on_hold'].includes(j.status)).length },
    { id: 'calendar', lb: 'Calendar', ic: 'clip', sec: 'Main' },
    ...(isOwnerOrRep ? [{ id: 'leads', lb: 'Leads', ic: 'doc', sec: 'Sales' }, { id: 'pipeline', lb: 'Pipeline', ic: 'grid', sec: 'Sales' }, { id: 'reports', lb: 'Reports', ic: 'box', sec: 'Sales' }, { id: 'stats', lb: 'Stats', ic: 'box', sec: 'Sales' }] : []),
    ...(isStaff ? [{ id: 'field-agent', lb: 'Field Agent', ic: 'grid', sec: 'AI' }] : []),
    ...(isStaff ? [{ id: 'subs', lb: 'Subs', ic: 'home', sec: 'People' }] : []),
    ...(profile?.role === 'owner' ? [{ id: 'team', lb: 'Team', ic: 'home', sec: 'People' }] : []),
    ...(profile?.role === 'owner' ? [{ id: 'ai-knowledge', lb: 'AI Knowledge', ic: 'doc', sec: 'Settings' }] : []),
  ];

  return (
    <>
      <div className="app">
        <div className="sidebar">
          <div className="sb-logo" onClick={() => setPg('dashboard')} style={{ cursor: 'pointer' }}>
            <img src={logo} alt="Avenstone" />
          </div>
          <nav className="sb-nav">
            {NAV.reduce((acc, item, i) => {
              if (i === 0 || item.sec !== NAV[i - 1].sec) acc.push({ type: 's', lb: item.sec, k: `s${i}` });
              acc.push(item);
              return acc;
            }, []).map(item =>
              item.type === 's'
                ? <div key={item.k} className="sb-sec">{item.lb}</div>
                : <div key={item.id} className={`sb-item${pg === item.id ? ' on' : ''}`} onClick={() => setPg(item.id)}>
                    <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{Ic[item.ic] || Ic.grid}</span>
                    {item.lb}
                    {item.badge > 0 && <span className="sb-badge">{item.badge}</span>}
                  </div>
            )}
          </nav>
          <div className="sb-foot">
            <div className="av-row" onClick={() => setShowSettings(true)} style={{ cursor: 'pointer', borderRadius: 6, transition: 'background 0.15s', padding: '6px 4px', margin: '-6px -4px' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div className="av">{initial}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name || 'User'}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{roleLabel}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); signOut(); }} title="Sign out"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '4px', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>
                <span style={{ width: 16, height: 16, display: 'flex' }}>{Ic.logout}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="main">
          <div className="mob-hdr">
            <img src={logo} alt="Avenstone" style={{ width: 44, height: 44, objectFit: 'contain', cursor: 'pointer' }} onClick={() => setPg('dashboard')} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: '#C9A84C', letterSpacing: 4, textTransform: 'uppercase' }}>Avenstone Group</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: 0.5 }}>Field Estimator</div>
            </div>
            <button onClick={() => setShowNotif(true)} style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4, display: 'flex', alignItems: 'center' }}>
              <span style={{ width: 20, height: 20, display: 'flex' }}>{Ic.bell}</span>
              {unreadCount > 0 && <span style={{ position: 'absolute', top: 0, right: 0, background: '#C9A84C', color: '#0A1F44', width: 16, height: 16, borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            <button onClick={() => setShowSettings(true)} title="Profile" style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {(profile?.full_name || 'U')[0].toUpperCase()}
            </button>
          </div>

          <div className="top-bar">
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>
              <strong style={{ color: '#0A1F44' }}>{NAV.find(n => n.id === pg)?.lb || 'Dashboard'}</strong>&nbsp;·&nbsp;
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {isOwnerOrRep && <button className="btn btn-navy" onClick={() => { setPg('jobs'); setPendingNew(true); }}>+ New Project</button>}
              <button onClick={() => setShowNotif(true)} title="Notifications"
                style={{ position: 'relative', background: 'transparent', border: '1px solid #E8E4DC', color: '#6B7280', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#C9A84C'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E8E4DC'}>
                <span style={{ width: 16, height: 16, display: 'flex' }}>{Ic.bell}</span>
                {unreadCount > 0 && <span style={{ position: 'absolute', top: -6, right: -6, background: '#C9A84C', color: '#0A1F44', width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
            </div>
          </div>

          <div className="pg-wrap">
            {pg === 'dashboard' && <AiHomeScr profile={profile} jobs={jobs} nav={setPg} onOpenJob={id => { setPendingJobId(id); setPg('jobs'); }} />}
            {pg === 'stats' && <DashScr nav={setPg} jobs={jobs} profile={profile} />}
            {pg === 'jobs' && <JobsScr jobs={jobs} setJobs={setJobs} onBack={() => setPg('dashboard')} pendingJobId={pendingJobId} clearPendingJobId={() => setPendingJobId(null)} profile={profile} openNew={pendingNew} clearOpenNew={() => setPendingNew(false)} />}
            {pg === 'intake' && isOwnerOrRep && <FormScr title="Project Intake" secs={IQ} rules={IR} ftype="intake" onBack={() => setPg('dashboard')} onSave={saveJob} />}
            {pg === 'bid' && isOwnerOrRep && <FormScr title="Bid and Proposal" secs={BQ} rules={BR} ftype="bid" onBack={() => setPg('dashboard')} />}
            {pg === 'takeoff' && isStaff && <TkOf onBack={() => setPg('dashboard')} />}
            {pg === 'subs' && isStaff && <SubDir profile={profile} />}
            {pg === 'team' && profile?.role === 'owner' && <UserMgmt />}
            {pg === 'reports' && isOwnerOrRep && <Reports jobs={jobs} profile={profile} />}
            {pg === 'calendar' && isOwnerOrRep && <CalScr jobs={jobs} profile={profile} onSelectJob={id => { setPendingJobId(id); setPg('jobs'); }} />}
            {pg === 'leads' && isOwnerOrRep && <LeadsScr profile={profile} onConvertToJob={c => { setPg('jobs'); setPendingNew(true); }} />}
            {pg === 'field-agent' && isStaff && <AiFieldAgent profile={profile} currentJob={jobs.find(j => j.id === pendingJobId) || null} />}
            {pg === 'ai-knowledge' && profile?.role === 'owner' && <AiKnowledgeScr profile={profile} />}
            {pg === 'pipeline' && isOwnerOrRep && (
              <div style={{ padding: '16px 20px' }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#0A1F44' }}>Lead Pipeline</div>
                  <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 2 }}>Drag jobs between columns to update status</div>
                </div>
                <Pipeline
                  jobs={jobs}
                  onStatusChange={(jid, status) => {
                    const prev = jobs.find(j => j.id === jid);
                    const u = jobs.map(j => j.id === jid ? { ...j, status } : j);
                    setJobs(u); ls('av_j', u); sbUpd(jid, { status });
                  }}
                  onOpenJob={j => { setPg('jobs'); setPendingJobId(j.id); }}
                />
              </div>
            )}
          </div>

          <div className="bot-nav">
            {[
              { id: 'dashboard', ic: 'grid', lb: 'Home' },
              { id: 'jobs', ic: 'home', lb: 'Projects' },
              ...(isStaff ? [{ id: 'field-agent', ic: 'grid', lb: '⚡ Agent' }] : []),
              ...(isOwnerOrRep ? [{ id: 'reports', ic: 'box', lb: 'Reports' }] : []),
            ].map(t => (
              <button key={t.id} className={`bn-item${pg === t.id ? ' on' : ''}`} onClick={() => setPg(t.id)}>
                <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pg === t.id ? '#C9A84C' : '#9CA3AF' }}>{Ic[t.ic] || Ic.grid}</span>
                <span className="bn-lbl" style={{ color: pg === t.id ? '#C9A84C' : '#9CA3AF' }}>{t.lb}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {showNotif && <NotifPanel notifs={notifs} onClose={() => setShowNotif(false)} onMarkAllRead={markAllNotifsRead} onClickNotif={onClickNotif} />}
      {showSettings && <SettingsModal profile={profile} setProfile={setProfile} onClose={() => setShowSettings(false)} />}
    </>
  );
}
