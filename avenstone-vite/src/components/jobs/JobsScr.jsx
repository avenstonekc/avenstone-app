import { useState, useEffect, useRef } from 'react';
import { sbLoad, sbSave, sbUpd, sbDel, ANON_KEY, ADDRESS_AUTOCOMPLETE_URL, AI_ERROR_LOGGER_URL, AV_USER_ID, AV_TENANT, captureFailedIntent, sbCompleteTodo } from '../../lib/supabase';
import { sbCreateJobCompanyFileRefs } from '../../lib/companyFiles';
import { Ic, STATS, sc, sl, f$, isMob, ls } from '../../lib/utils';
import JobDet from './JobDet';
import AiIntakeWizard from '../ai/AiIntakeWizard';

class JobDetBoundary extends Error {}

function ErrorBoundary({ back, children }) {
  const [err, setErr] = useState(null);
  if (err) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F7F5F0' }}>
      <div style={{ background: '#0A1F44', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', width: 24, height: 24, display: 'flex', alignItems: 'center' }} onClick={back}>←</button>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Project</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#0A1F44', textAlign: 'center' }}>Something went wrong loading this project</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', maxWidth: 300 }}>{err?.message || 'Unknown error'}</div>
        <button className="btn btn-navy" style={{ marginTop: 8 }} onClick={back}>← Back to Projects</button>
      </div>
    </div>
  );
  try {
    return children;
  } catch (e) {
    setErr(e);
    return null;
  }
}

export default function JobsScr({ jobs, setJobs, onBack, pendingJobId, clearPendingJobId, profile, openNew, clearOpenNew, clearSel, pendingAction, clearPendingAction, onJobOpen, onJobClose }) {
  const [sel, setSel] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showIntake, setShowIntake] = useState(false);
  const [newA, setNewA] = useState('');
  const [addrSuggestions, setAddrSuggestions] = useState([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const addrTimer = useRef(null);
  const [fil, setFil] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchSuggestions = async val => {
    if (val.length < 4) { setAddrSuggestions([]); return; }
    setAddrLoading(true);
    try {
      const res = await fetch(ADDRESS_AUTOCOMPLETE_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ input: val }),
      });
      const data = await res.json();
      setAddrSuggestions(Array.isArray(data) ? data : []);
    } catch { setAddrSuggestions([]); }
    setAddrLoading(false);
  };

  const onAddrChange = val => {
    setNewA(val); clearTimeout(addrTimer.current);
    addrTimer.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const pickAddr = desc => { setNewA(desc); setAddrSuggestions([]); };

  useEffect(() => {
    setLoading(true);
    const repFilter = profile?.role === 'sales_rep' ? profile.full_name : null;
    sbLoad(repFilter).then(d => { if (d) { setJobs(d); ls('av_j', d); } setLoading(false); });
  }, []);

  useEffect(() => { if (pendingJobId && !loading) { setSel(pendingJobId); clearPendingJobId(); } }, [pendingJobId, loading]);
  useEffect(() => { if (sel) { onJobOpen?.(sel); } else { onJobClose?.(); } }, [sel]);
  useEffect(() => { return () => onJobClose?.(); }, []);
  useEffect(() => { if (openNew) { setShowNew(true); clearOpenNew && clearOpenNew(); } }, [openNew]);
  useEffect(() => { if (clearSel) setSel(null); }, [clearSel]);
  useEffect(() => {
    if (pendingAction?.kind === 'job_create') {
      setNewA(pendingAction.payload?.address || '');
      setShowNew(true);
      clearPendingAction?.();
    }
  }, [pendingAction]);

  const upd = (id, ch) => { const u = jobs.map(j => j.id === id ? { ...j, ...ch } : j); setJobs(u); ls('av_j', u); sbUpd(id, ch); };
  const add = async () => {
    if (!newA.trim() || saving) return;
    const j = { id: crypto.randomUUID(), address: newA.trim(), status: 'lead', created: new Date().toISOString(), scope: '', sqft: '', photos: [], activity: [], change_orders: [], client_name: '', client_phone: '', client_email: '', assigned_rep: '', assigned_subs: '', contract_value: 0, co_total: 0, target_completion: '' };
    const prev = [...jobs];
    const u = [j, ...jobs]; setJobs(u); ls('av_j', u);
    setSaving(true); setSaveErr(null);
    const result = await sbSave(j);
    setSaving(false);
    if (!result.ok) {
      setJobs(prev); ls('av_j', prev);
      setSaveErr(result.error || 'Failed to save project — please try again');
      fetch(AI_ERROR_LOGGER_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ function_name: 'JobsScr.add', error_type: 'db_write_failure', error_message: result.error, user_input: j.address, user_id: AV_USER_ID, tenant_id: AV_TENANT }),
      }).catch(() => {});
      captureFailedIntent({ kind: 'job_create', payload: { address: j.address }, message: result.error || 'Project save failed' }).catch(() => {});
      return;
    }
    if (pendingAction?.todoId) sbCompleteTodo(pendingAction.todoId).catch(() => {});
    // Phase 3a — attach client-visible company files as virtual job_files rows (non-blocking)
    sbCreateJobCompanyFileRefs(j.id, AV_TENANT).catch(() => {});
    setNewA(''); setShowNew(false); setSel(j.id);
  };
  const del = async id => { if (!window.confirm('Delete this job?')) return; const u = jobs.filter(j => j.id !== id); setJobs(u); ls('av_j', u); setSel(null); const r = await sbDel(id); if (!r.ok) { setJobs(jobs); ls('av_j', jobs); alert('Delete failed: ' + (r.error || 'Unknown error')); } };

  const selJ = jobs.find(j => j.id === sel);
  if (selJ) return (
    <ErrorBoundary back={() => setSel(null)}>
      <JobDet job={selJ} upd={ch => upd(selJ.id, ch)} del={() => del(selJ.id)} back={() => setSel(null)} profile={profile} pendingAction={pendingAction} clearPendingAction={clearPendingAction} />
    </ErrorBoundary>
  );

  const q = search.toLowerCase().trim();
  const filtered = (fil === 'all' ? jobs : jobs.filter(j => j.status === fil)).filter(j => !q || (j.address || '').toLowerCase().includes(q) || (j.client_name || '').toLowerCase().includes(q) || (j.assigned_rep || '').toLowerCase().includes(q));
  const mob = isMob();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F7F5F0' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #E8E4DC', flexShrink: 0 }}>
        <div style={{ padding: mob ? '12px 16px' : '16px 24px', display: 'flex', alignItems: 'center', gap: mob ? 8 : 12 }}>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', width: 24, height: 24, display: 'flex', alignItems: 'center', flexShrink: 0 }} onClick={onBack}>{Ic.back}</button>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: mob ? 18 : 20, color: '#0A1F44', flex: 1 }}>Projects</div>
          {!mob && <div style={{ position: 'relative', flex: '0 1 220px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..." style={{ width: '100%', border: '1px solid #E8E4DC', borderRadius: 4, padding: '6px 10px 6px 28px', fontSize: 12, color: '#374151', outline: 'none', boxSizing: 'border-box', background: '#F7F5F0' }} />
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: 13, pointerEvents: 'none' }}>⌕</span>
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>}
          </div>}
          {!mob && <span style={{ fontSize: 12, color: '#9CA3AF', marginRight: 8 }}>{filtered.length}{search || fil !== 'all' ? ` / ${jobs.length}` : ''} jobs</span>}
          <button className="btn btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontSize: 12 }} onClick={() => setShowIntake(true)}>✦ AI Intake</button>
          <button className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={() => setShowNew(true)}><span style={{ width: 14, height: 14 }}>{Ic.plus}</span>New</button>
        </div>
        {mob && <div style={{ padding: '0 16px 12px', position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..." style={{ width: '100%', border: '1px solid #E8E4DC', borderRadius: 4, padding: '8px 32px 8px 32px', fontSize: 13, color: '#374151', outline: 'none', boxSizing: 'border-box', background: '#F7F5F0' }} />
          <span style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: 14, pointerEvents: 'none' }}>⌕</span>
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>}
        </div>}
      </div>
      <div style={{ background: '#fff', borderBottom: '1px solid #E8E4DC', padding: '10px 24px', flexShrink: 0 }}>
        <div className="filbar">
          <button className={`fil${fil === 'all' ? ' on' : ''}`} onClick={() => setFil('all')}>All ({jobs.length})</button>
          {STATS.map(s => { const cnt = jobs.filter(j => j.status === s.id).length; if (!cnt) return null; return <button key={s.id} className={`fil${fil === s.id ? ' on' : ''}`} onClick={() => setFil(s.id)}>{s.lb} ({cnt})</button>; })}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: mob ? '12px' : '24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: '48px', color: '#9CA3AF', fontSize: 14 }}>Loading projects...</div>}
        {!loading && !filtered.length && <div className="empty">{Ic.home}<div className="empty-t">{search ? 'No matches' : 'No projects yet'}</div><div>{search ? `No projects match "${search}"` : 'Tap New to add your first project'}</div></div>}
        {!loading && filtered.length > 0 && !mob && <div className="card"><table className="tbl"><thead><tr><th>Property</th><th>Status</th><th>Contract</th><th>Rep</th><th>Target</th></tr></thead><tbody>{filtered.map(j => { const rev = Number(j.contract_value || 0) + Number(j.co_total || 0); return <tr key={j.id} onClick={() => setSel(j.id)}><td><div className="cell-a">{j.address}</div>{j.client_name && <div className="cell-b">{j.client_name}{j.client_phone ? ' · ' + j.client_phone : ''}</div>}</td><td><span className="badge" style={{ background: sc(j.status) + '15', color: sc(j.status) }}><span className="bdot" style={{ background: sc(j.status) }} />{sl(j.status)}</span></td><td>{rev > 0 ? <span style={{ fontWeight: 700, color: '#0A1F44' }}>{f$(rev)}</span> : <span style={{ color: '#9CA3AF', fontSize: 12 }}>—</span>}</td><td>{j.assigned_rep ? <span className="tag">{j.assigned_rep}</span> : <span style={{ color: '#9CA3AF', fontSize: 12 }}>—</span>}</td><td style={{ color: '#9CA3AF', fontSize: 12 }}>{j.target_completion || '—'}</td></tr>; })}</tbody></table></div>}
        {!loading && filtered.length > 0 && mob && filtered.map(j => { const rev = Number(j.contract_value || 0) + Number(j.co_total || 0); return <div key={j.id} className="jcard" style={{ borderLeftColor: sc(j.status) }} onClick={() => setSel(j.id)}><div style={{ fontWeight: 600, fontSize: 15, color: '#0A1F44', marginBottom: 3 }}>{j.address}</div>{j.client_name && <div style={{ fontSize: 12, color: '#C9A84C', fontWeight: 500, marginBottom: 10 }}>{j.client_name}</div>}<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}><span className="badge" style={{ background: sc(j.status) + '15', color: sc(j.status) }}><span className="bdot" style={{ background: sc(j.status) }} />{sl(j.status)}</span>{rev > 0 && <span style={{ fontWeight: 700, fontSize: 14, color: '#0A1F44' }}>{f$(rev)}</span>}{j.photos?.length > 0 && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{j.photos.length} photos</span>}{j.assigned_rep && <span className="tag">{j.assigned_rep}</span>}</div></div>; })}
      </div>
      {showIntake && <AiIntakeWizard profile={profile} onClose={() => setShowIntake(false)} onJobCreated={newJob => { setJobs(prev => [newJob, ...prev]); setShowIntake(false); }} />}
      {showNew && <div className="overlay" onClick={() => { setShowNew(false); setAddrSuggestions([]); }}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">New Project</div>
          <div className="fg">
            <label className="flbl">Property Address</label>
            <div style={{ position: 'relative' }}>
              <input className="finp" value={newA} onChange={e => onAddrChange(e.target.value)} placeholder="123 Main St, Kansas City MO" onKeyDown={e => e.key === 'Enter' && add()} autoFocus autoComplete="off" />
              {addrLoading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9CA3AF' }}>...</span>}
              {addrSuggestions.length > 0 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #E8E4DC', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 100, marginTop: 2 }}>
                {addrSuggestions.map((s, i) => (
                  <div key={i} onClick={() => pickAddr(s.description)} style={{ padding: '10px 14px', fontSize: 13, color: '#374151', cursor: 'pointer', borderBottom: i < addrSuggestions.length - 1 ? '1px solid #F3F0EB' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F7F5F0'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    onTouchStart={e => e.currentTarget.style.background = '#F7F5F0'}
                    onTouchEnd={e => e.currentTarget.style.background = '#fff'}
                    onTouchCancel={e => e.currentTarget.style.background = '#fff'}>
                    {s.description}
                  </div>
                ))}
              </div>}
            </div>
          </div>
          {saveErr && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '8px 12px', marginTop: 8, fontSize: 12, color: '#991B1B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{saveErr}</span>
              <button onClick={() => setSaveErr(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', fontSize: 14, lineHeight: 1, marginLeft: 8 }}>✕</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowNew(false); setAddrSuggestions([]); setSaveErr(null); }}>Cancel</button>
            <button className={`btn ${newA.trim() && !saving ? 'btn-navy' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={add} disabled={saving}>{saving ? 'Saving…' : 'Add Project'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
