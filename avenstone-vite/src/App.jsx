import { useState, useEffect, useRef } from 'react';
import { sb, setSession, sbLoadNotifs, sbMarkNotifsRead, sbSave, sbUpd, setGlobalJobs, AI_PM_NIGHTLY_URL, ANON_KEY, FIELD_OPUS_USER_ID } from './lib/supabase';
import { initBugContext, pushBreadcrumb } from './lib/bugContext';
import { registerForPush } from './lib/push';
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
import Pipeline from './components/common/Pipeline';
import UserMgmt from './components/common/UserMgmt';
import StatusPage from './components/common/StatusPage';
import SubDir from './components/sub/SubDir';
import NotifPanel from './components/shared/NotifPanel';
import SettingsModal from './components/modals/SettingsModal';
import AiKnowledgeScr from './components/ai/AiKnowledgeScr';
import OwnerPortal from './components/owner/OwnerPortal';
import HomeScr from './components/home/HomeScr';
import PublicProfile from './components/public/PublicProfile';
import ReviewPage from './components/public/ReviewPage';
import CompletionPage from './components/public/CompletionPage';
import LeadsScr from './components/leads/LeadsScr';
import AiFieldAgent from './components/ai/AiFieldAgent';
import MasterAgent from './components/shared/MasterAgent';
import FieldOpusPanel from './components/shared/FieldOpusPanel';
import SequencesScr from './components/common/SequencesScr';
import AiPmDashboard from './components/dashboard/AiPmDashboard';
import MyTodosScreen from './components/todos/MyTodosScreen';
import BugReportsScr from './components/admin/BugReportsScr';
import CompanyFilesScr from './components/company-files/CompanyFilesScr';
import ErrorBoundary from './components/common/ErrorBoundary';

// Read URL params before React hydrates (mirrors legacy HTML behavior)
const _params     = new URLSearchParams(window.location.search);
const STATUS_TOKEN = _params.get('st');
const PRO_TENANT   = _params.get('pro');
const REVIEW_JOB    = _params.get('review');
const REVIEW_TENANT = _params.get('rt');
const COMPLETION_JOB = _params.get('completion');
const INVITE_TYPE   = new URLSearchParams(window.location.hash.replace('#', '')).get('type');

const VALID_PG = new Set([
  'home', 'jobs', 'todos', 'calendar', 'leads', 'pipeline', 'reports', 'stats',
  'field-agent', 'subs', 'team', 'company-files', 'ai-knowledge', 'ai-pm',
  'sequences', 'owner-portal', 'admin-bugs',
]);
const _initJobId = _params.get('job') || null;
const _initPg = _initJobId ? 'jobs' : (VALID_PG.has(_params.get('pg')) ? _params.get('pg') : 'home');

export default function App() {
  const [session, setSessionState] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pg, setPg] = useState(_initPg);
  const [jobs, setJobs] = useState(() => ll('av_j', []));
  const [notifs, setNotifs] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingJobId, setPendingJobId] = useState(_initJobId);
  const [pendingNew, setPendingNew] = useState(false);
  const [jobsSelClear, setJobsSelClear] = useState(0);
  const [pendingAction, setPendingAction] = useState(null);
  const [viewportJobId, setViewportJobId] = useState(null);
  const pgInitRef = useRef(false);
  const pgFromPopRef = useRef(false);
  const jobBootRef = useRef(!!_initJobId);
  const jobFromPopRef = useRef(false);

  // Initialize bug context ring buffers once on mount
  useEffect(() => { initBugContext(); }, []);

  // Track page navigation as breadcrumbs
  useEffect(() => {
    pushBreadcrumb({ type: 'nav', label: pg, route: pg });
  }, [pg]);

  // Sync pg → URL so refresh/share preserves screen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!pgInitRef.current) {
      pgInitRef.current = true;
      // First render: normalize URL with replaceState (no new history entry)
      if (params.get('pg') !== pg) {
        params.set('pg', pg);
        window.history.replaceState(null, '', '?' + params.toString());
      }
      return;
    }
    // popstate already moved the URL — don't push again or Back collapses
    if (pgFromPopRef.current) {
      pgFromPopRef.current = false;
      return;
    }
    params.set('pg', pg);
    if (pg !== 'jobs') params.delete('job');
    window.history.pushState(null, '', '?' + params.toString());
  }, [pg]);

  // Sync URL → pg + job on browser back/forward
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const p = params.get('pg');
      const newPg = VALID_PG.has(p) ? p : 'home';
      pgFromPopRef.current = true;
      setPg(newPg);
      const j = params.get('job');
      if (j) {
        jobFromPopRef.current = true;
        setPendingJobId(j);
      } else if (newPg === 'jobs') {
        setJobsSelClear(c => c + 1);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Sync open job → URL (?job=<id>)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (viewportJobId) {
      if (jobBootRef.current) {
        jobBootRef.current = false;
        if (params.get('job') !== viewportJobId) {
          params.set('job', viewportJobId);
          window.history.replaceState(null, '', '?' + params.toString());
        }
        return;
      }
      if (jobFromPopRef.current) {
        jobFromPopRef.current = false;
        return;
      }
      params.set('job', viewportJobId);
      window.history.pushState(null, '', '?' + params.toString());
    } else {
      if (params.has('job')) {
        params.delete('job');
        window.history.replaceState(null, '', '?' + params.toString());
      }
    }
  }, [viewportJobId]);

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session: s } }) => {
      setSessionState(s);
      if (s) { loadProfile(s.user.id); return; }
      // DEV-ONLY auto-login — never runs on production unless ?devlogin=1 is explicit
      const wantsDevLogin = import.meta.env.DEV || _params.has('devlogin');
      const isProd = import.meta.env.PROD && window.location.hostname === 'avenstone-app.vercel.app';
      if (wantsDevLogin && !isProd) {
        sb.auth.signInWithPassword({ email: 'kalinspratling@gmail.com', password: 'TestClient2026!' })
          .then(({ error }) => {
            if (error) { console.error('[devlogin] failed:', error.message); setAuthLoading(false); }
            else console.log('[devlogin] auto-logged-in as kalinspratling@gmail.com');
          });
      } else {
        setAuthLoading(false);
      }
    });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, s) => {
      setSessionState(s);
      if (s) loadProfile(s.user.id);
      else { setProfile(null); setAuthLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async uid => {
    const { data } = await sb.from('profiles').select('*, is_platform_owner').eq('id', uid).single();
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


  const saveJob = async j => { const u = [j, ...jobs]; setJobs(u); ls('av_j', u); await sbSave(j); };
  const signOut = async () => { await sb.auth.signOut(); ls('av_j', []); setJobs([]); setNotifs([]); };

  useEffect(() => {
    if (!profile?.id) return;
    const ch = sb.channel('notif-' + profile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        payload => setNotifs(p => [payload.new, ...p]))
      .subscribe();
    return () => sb.removeChannel(ch);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    registerForPush({
      userId: profile.id,
      onDeepLink: (deepLink) => {
        if (!deepLink || typeof deepLink !== 'string') return;
        // /job/<jobId> or /job/<jobId>/<tab>
        const jobMatch = deepLink.match(/^\/job\/([^/]+)(?:\/(.+))?$/);
        if (jobMatch) {
          setPendingJobId(jobMatch[1]);
          setPg('jobs');
          return;
        }
        // /todo/<todoId> — navigate to todos screen
        if (deepLink.match(/^\/todo\/[^/]+$/)) {
          setPg('todos');
        }
      },
    });
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

  if (STATUS_TOKEN)   return <StatusPage token={STATUS_TOKEN} />;
  if (PRO_TENANT)     return <PublicProfile tenantId={PRO_TENANT} />;
  if (COMPLETION_JOB) return <CompletionPage jobId={COMPLETION_JOB} />;
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
    { id: 'home', lb: 'Home', ic: 'grid', sec: 'Main' },
    { id: 'jobs', lb: 'Projects', ic: 'home', sec: 'Main', badge: jobs.filter(j => !['complete', 'on_hold'].includes(j.status)).length },
    ...(isStaff ? [{ id: 'todos', lb: 'To-dos', ic: 'check', sec: 'Main' }] : []),
    { id: 'calendar', lb: 'Calendar', ic: 'clip', sec: 'Main' },
    ...(isOwnerOrRep ? [{ id: 'leads', lb: 'Leads', ic: 'doc', sec: 'Sales' }, { id: 'pipeline', lb: 'Pipeline', ic: 'grid', sec: 'Sales' }, { id: 'reports', lb: 'Reports', ic: 'box', sec: 'Sales' }, { id: 'stats', lb: 'Stats', ic: 'box', sec: 'Sales' }] : []),
    ...(isStaff ? [{ id: 'field-agent', lb: 'Field Agent', ic: 'grid', sec: 'AI' }] : []),
    ...(isStaff ? [{ id: 'subs', lb: 'Subs', ic: 'home', sec: 'People' }] : []),
    ...(profile?.role === 'owner' ? [{ id: 'team', lb: 'Team', ic: 'home', sec: 'People' }] : []),
    ...(isStaff ? [{ id: 'company-files', lb: 'Company Files', ic: 'folder', sec: 'Settings' }] : []),
    ...(profile?.role === 'owner' ? [{ id: 'ai-knowledge', lb: 'AI Knowledge', ic: 'doc', sec: 'Settings' }] : []),
    ...(profile?.role === 'owner' ? [{ id: 'ai-pm', lb: 'PM Dashboard', ic: 'bell', sec: 'Settings' }] : []),
    ...(profile?.role === 'owner' ? [{ id: 'sequences', lb: 'Sequences', ic: 'bell', sec: 'Tools' }] : []),
    ...(profile?.role === 'owner' ? [{ id: 'owner-portal', lb: 'Owner Portal', ic: 'box', sec: 'Settings' }] : []),
    ...(profile?.is_platform_owner ? [{ id: 'admin-bugs', lb: 'Bug Reports', ic: 'warn', sec: 'Platform' }] : []),
  ];

  return (
    <>
      <div className="app">
        <div className="sidebar">
          <div className="sb-logo" onClick={() => setPg('home')} style={{ cursor: 'pointer' }}>
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
                : <div key={item.id} className={`sb-item${pg === item.id ? ' on' : ''}`} onClick={() => { setPg(item.id); if (item.id === 'jobs') setJobsSelClear(n => n + 1); }}>
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
            <img src={logo} alt="Avenstone" style={{ width: 44, height: 44, objectFit: 'contain', cursor: 'pointer' }} onClick={() => setPg('home')} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 8, color: '#C9A84C', letterSpacing: 4, textTransform: 'uppercase' }}>Avenstone Group</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: 0.5 }}>Field Estimator</div>
            </div>
            <button onClick={() => setShowNotif(true)} style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4, display: 'flex', alignItems: 'center' }}>
              <span style={{ width: 20, height: 20, display: 'flex' }}>{Ic.bell}</span>
              {unreadCount > 0 && <span style={{ position: 'absolute', top: 0, right: 0, background: '#C9A84C', color: '#0A1F44', width: 16, height: 16, borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {profile?.id === FIELD_OPUS_USER_ID && (
              <button onClick={() => window.dispatchEvent(new CustomEvent('field-opus:open'))} title="Field-Opus Dev Console" style={{ background: 'transparent', border: '1.5px solid #C9A84C', borderRadius: 6, cursor: 'pointer', color: '#C9A84C', fontWeight: 700, fontSize: 10, padding: '3px 7px', letterSpacing: '0.04em', lineHeight: 1, flexShrink: 0 }}>DEV</button>
            )}
            <button onClick={() => setShowSettings(true)} title="Profile" style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {(profile?.full_name || 'U')[0].toUpperCase()}
            </button>
          </div>

          <div className="top-bar">
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>
              <strong style={{ color: '#0A1F44' }}>{NAV.find(n => n.id === pg)?.lb || 'Home'}</strong>&nbsp;·&nbsp;
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
              {profile?.id === FIELD_OPUS_USER_ID && (
                <button onClick={() => window.dispatchEvent(new CustomEvent('field-opus:open'))} title="Field-Opus Dev Console"
                  style={{ background: 'transparent', border: '1px solid #C9A84C', color: '#C9A84C', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', transition: 'all 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,168,76,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  DEV
                </button>
              )}
            </div>
          </div>

          <ErrorBoundary>
          <div className="pg-wrap">
            {pg === 'home' && <HomeScr profile={profile} jobs={jobs} setPendingAction={action => { setPendingAction(action); if (action?.kind === 'job_create') setPg('jobs'); else if (action?.jobId) { setPendingJobId(action.jobId); setPg('jobs'); } else if (action?.kind === 'master_agent_tool_call') { } }} onOpenJob={id => { setPendingJobId(id); setPg('jobs'); }} />}
            {pg === 'todos' && isStaff && <MyTodosScreen profile={profile} jobs={jobs} />}
            {pg === 'stats' && <DashScr nav={setPg} jobs={jobs} profile={profile} />}
            {pg === 'jobs' && <JobsScr jobs={jobs} setJobs={setJobs} onBack={() => setPg('home')} pendingJobId={pendingJobId} clearPendingJobId={() => setPendingJobId(null)} profile={profile} openNew={pendingNew} clearOpenNew={() => setPendingNew(false)} clearSel={jobsSelClear} pendingAction={pendingAction} clearPendingAction={() => setPendingAction(null)} onJobOpen={(id) => { if (jobs.some(j => j.id === id)) setViewportJobId(id); }} onJobClose={() => setViewportJobId(null)} />}
            {pg === 'subs' && isStaff && <SubDir profile={profile} />}
            {pg === 'team' && profile?.role === 'owner' && <UserMgmt />}
            {pg === 'reports' && isOwnerOrRep && <Reports jobs={jobs} profile={profile} />}
            {pg === 'calendar' && isStaff && <CalScr jobs={jobs} profile={profile} onSelectJob={id => { setPendingJobId(id); setPg('jobs'); }} />}
            {pg === 'leads' && isOwnerOrRep && <LeadsScr profile={profile} onConvertToJob={c => { setPg('jobs'); setPendingNew(true); }} />}
            {pg === 'field-agent' && isStaff && <AiFieldAgent profile={profile} currentJob={jobs.find(j => j.id === pendingJobId) || null} />}
            {pg === 'company-files' && isStaff && <CompanyFilesScr profile={profile} />}
            {pg === 'ai-knowledge' && profile?.role === 'owner' && <AiKnowledgeScr profile={profile} />}
            {pg === 'ai-pm' && profile?.role === 'owner' && <AiPmDashboard profile={profile} />}
            {pg === 'owner-portal' && profile?.role === 'owner' && <OwnerPortal profile={profile} />}
            {pg === 'sequences' && profile?.role === 'owner' && <SequencesScr profile={profile} />}
            {pg === 'admin-bugs' && profile?.is_platform_owner && <BugReportsScr profile={profile} />}
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
          </ErrorBoundary>

          <div className="bot-nav">
            {[
              { id: 'home', ic: 'grid', lb: 'Home' },
              { id: 'jobs', ic: 'home', lb: 'Projects' },
              ...(isStaff ? [{ id: 'todos', ic: 'check', lb: 'To-dos' }] : []),
              ...(isStaff ? [{ id: 'calendar', ic: 'cal', lb: 'Calendar' }] : []),
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
      {profile?.role === 'owner' && <MasterAgent profile={profile} pendingAction={pendingAction} clearPendingAction={() => setPendingAction(null)} suggestedJobId={viewportJobId} jobs={jobs} />}
      <FieldOpusPanel profile={profile} />
    </>
  );
}
