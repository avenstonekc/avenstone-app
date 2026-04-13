import { useState, useEffect, useRef } from 'react';
import { sbLoadSubJobs, sbLoadSubITBs, sbSubmitBid, AV_USER_ID } from '../../lib/supabase';
import { Ic, sc, sl, f$, fD } from '../../lib/utils';
import SubJobView from './SubJobView';

export default function SubPortal({ profile, signOut }) {
  const [view, setView] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [itbs, setItbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itbsLoading, setItbsLoading] = useState(false);
  const [sel, setSel] = useState(null);
  const [bidITB, setBidITB] = useState(null);
  const [bidForm, setBidForm] = useState({ amount: '', notes: '' });
  const [bidFile, setBidFile] = useState(null);
  const [bidSaving, setBidSaving] = useState(false);
  const [bidDone, setBidDone] = useState(null);
  const bidFileRef = useRef();

  useEffect(() => {
    if (profile?.id) sbLoadSubJobs(profile.id).then(d => { setJobs(d); setLoading(false); });
  }, [profile?.id]);

  useEffect(() => {
    if (view !== 'bids' || itbs.length) return;
    setItbsLoading(true);
    sbLoadSubITBs(profile.id).then(d => { setItbs(d); setItbsLoading(false); });
  }, [view, profile?.id]);

  const submitBid = async () => {
    if (!bidITB) return;
    setBidSaving(true);
    const r = await sbSubmitBid(bidITB.id, bidForm.amount, bidForm.notes, bidFile);
    if (r) { setBidDone(bidITB.id); setItbs(p => p.map(x => x.id === bidITB.id ? { ...x, responses: [...(x.responses || []).filter(b => b.sub_id !== AV_USER_ID), r] } : x)); }
    setBidITB(null); setBidForm({ amount: '', notes: '' }); setBidFile(null); setBidSaving(false);
  };

  if (sel) return <SubJobView job={sel} back={() => setSel(null)} profile={profile} />;

  const unreadBids = itbs.filter(x => !(x.responses || []).find(r => r.sub_id === AV_USER_ID)).length;

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0' }}>
      <div style={{ background: '#0A1F44', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: '#C9A84C', letterSpacing: 4, textTransform: 'uppercase' }}>Avenstone Group</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{view === 'bids' ? 'Bid Invitations' : 'My Projects'}</div>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{profile?.full_name}</div>
        <button onClick={signOut} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', padding: 4 }}><span style={{ width: 16, height: 16, display: 'flex' }}>{Ic.logout}</span></button>
      </div>
      <div style={{ background: '#fff', borderBottom: '1px solid #E8E4DC', display: 'flex' }}>
        {[{ id: 'jobs', lb: 'My Projects', ic: 'home' }, { id: 'bids', lb: 'Bid Invitations', ic: 'doc', badge: unreadBids }].map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{ flex: 1, padding: '12px 8px', background: 'transparent', border: 'none', borderBottom: `2px solid ${view === t.id ? '#C9A84C' : 'transparent'}`, color: view === t.id ? '#0A1F44' : '#9CA3AF', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic[t.ic] || Ic.home}</span>{t.lb}
            {t.badge > 0 && <span style={{ background: '#C9A84C', color: '#0A1F44', width: 16, height: 16, borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.badge}</span>}
          </button>
        ))}
      </div>
      <div style={{ padding: 16 }}>
        {view === 'jobs' && <>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading your projects...</div>}
          {!loading && !jobs.length && <div className="empty" style={{ paddingTop: 60 }}>{Ic.home}<div className="empty-t">No projects assigned yet</div><div>Your contractor will assign you to a project</div></div>}
          {jobs.map(j => (
            <div key={j.id} onClick={() => setSel(j)} style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: `4px solid ${sc(j.status)}`, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.borderColor = '#C9A84C'} onMouseLeave={e => e.currentTarget.style.borderColor = '#E8E4DC'}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0A1F44', marginBottom: 4 }}>{j.address}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {j.client_name && <span style={{ fontSize: 12, color: '#9CA3AF' }}>{j.client_name}</span>}
                <span style={{ fontSize: 10, background: sc(j.status) + '18', color: sc(j.status), padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sl(j.status)}</span>
              </div>
            </div>
          ))}
        </>}
        {view === 'bids' && <>
          {itbsLoading && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading invitations...</div>}
          {!itbsLoading && !itbs.length && <div className="empty" style={{ paddingTop: 60 }}>{Ic.doc}<div className="empty-t">No bid invitations yet</div><div>Bid invitations from contractors will appear here</div></div>}
          {itbs.map(itb => {
            const myBid = (itb.responses || []).find(r => r.sub_id === AV_USER_ID);
            return (
              <div key={itb.id} style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: `3px solid ${myBid ? '#22c55e' : '#C9A84C'}`, padding: 16, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44', marginBottom: 2 }}>{itb.trade || 'General'}</div>
                    {itb.job && <div style={{ fontSize: 12, color: '#9CA3AF' }}>{itb.job.address}</div>}
                  </div>
                  <span style={{ fontSize: 10, background: myBid ? '#F0FDF4' : 'rgba(201,168,76,0.1)', color: myBid ? '#16a34a' : '#C9A84C', padding: '3px 10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, border: `1px solid ${myBid ? '#BBF7D0' : 'rgba(201,168,76,0.3)'}` }}>{myBid ? 'Bid Submitted' : 'Awaiting Your Bid'}</span>
                </div>
                {itb.description && <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 10 }}>{itb.description}</div>}
                <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                  {itb.budget_range && <span style={{ fontSize: 12, color: '#9CA3AF' }}><strong style={{ color: '#374151' }}>Budget:</strong> {itb.budget_range}</span>}
                  {itb.due_date && <span style={{ fontSize: 12, color: '#9CA3AF' }}><strong style={{ color: '#374151' }}>Due:</strong> {fD(itb.due_date)}</span>}
                </div>
                {myBid ? (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>Your bid: {myBid.amount ? f$(myBid.amount) : 'No amount'}</div>
                    {myBid.notes && <div style={{ fontSize: 12, color: '#6B7280' }}>{myBid.notes}</div>}
                    {myBid.quote_file_name && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>Quote: {myBid.quote_file_name}</div>}
                    {myBid.status === 'awarded' && <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginTop: 6 }}>🏆 Your bid was awarded!</div>}
                  </div>
                ) : (
                  <button className="btn btn-navy" style={{ width: '100%', marginTop: 4 }} onClick={() => { setBidITB(itb); setBidDone(null); }}>Submit Your Bid</button>
                )}
                {bidDone === itb.id && <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginTop: 8, textAlign: 'center' }}>✓ Bid submitted successfully!</div>}
              </div>
            );
          })}
        </>}
      </div>
      {bidITB && <div className="overlay" onClick={() => setBidITB(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">Submit Bid</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>{bidITB.trade} — {bidITB.job?.address || ''}</div>
          <div className="fg"><label className="flbl">Your Bid Amount ($)</label><input className="finp" type="number" value={bidForm.amount} onChange={e => setBidForm(p => ({ ...p, amount: e.target.value }))} placeholder="e.g. 9500" /></div>
          <div className="fg"><label className="flbl">Notes / Scope Clarifications</label><textarea className="finp fta" value={bidForm.notes} onChange={e => setBidForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any assumptions, exclusions, or details about your quote..." rows={3} /></div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="flbl">Upload Quote (PDF, Word, Excel)</label>
            <input ref={bidFileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e => setBidFile(e.target.files[0] || null)} style={{ display: 'none' }} />
            <button className="btn btn-outline" style={{ width: '100%', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => bidFileRef.current.click()}>
              <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.dl}</span>{bidFile ? bidFile.name : 'Choose file to upload'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setBidITB(null); setBidForm({ amount: '', notes: '' }); setBidFile(null); }}>Cancel</button>
            <button className="btn btn-gold" style={{ flex: 1 }} onClick={submitBid} disabled={bidSaving}>{bidSaving ? 'Submitting...' : 'Submit Bid'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
