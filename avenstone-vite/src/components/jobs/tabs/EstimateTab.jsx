import { useState, Fragment } from 'react';
import LidarScanner from '../../ai/LidarScanner';
import { ANON_KEY, AI_ESTIMATOR_URL, NOTIFY_REALTOR_URL, sbLoadEstimate, sbSaveEstimate, sbSendEstimateEmail, sbUploadDoc, sbLoadITBs, sbCreateITB, sbUpdateITB, sbSendBidInvite, sbUpdateBidStatus, sbLoadSubDirectory, AV_USER_ID, DOC_TYPES, docTypeColor, COMMON_TRADES } from '../../../lib/supabase';
import { Ic, f$, fD } from '../../../lib/utils';
import { buildEstimatePDF, buildProposalPDF } from '../../../lib/pdf';

export default function EstimateTab({ job, photos, docs, setDocs }) {
  // ── AI Estimator state ────────────────────────────────────────────────────────
  const [showEstimator, setShowEstimator] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedRooms, setScannedRooms] = useState([]);
  const [estMessages, setEstMessages] = useState([]);
  const [estInput, setEstInput] = useState('');
  const [estLoading, setEstLoading] = useState(false);
  const [estStarted, setEstStarted] = useState(false);
  const [estForm, setEstForm] = useState({ scope: '', rooms: '', sqft: '', special: '' });
  const [estFile, setEstFile] = useState(null);
  const [estFileName, setEstFileName] = useState('');
  const [estSaving, setEstSaving] = useState(false);
  const [estSendingClient, setEstSendingClient] = useState(false);
  const [estSaveMsg, setEstSaveMsg] = useState('');

  // ── Proposal state ────────────────────────────────────────────────────────────
  const [showProposal, setShowProposal] = useState(false);
  const [propLoading, setPropLoading] = useState(false);
  const [propLineItems, setPropLineItems] = useState([]);
  const [propPmFee, setPropPmFee] = useState('1200');
  const [propMargin, setPropMargin] = useState('25');
  const [propNum, setPropNum] = useState('001');
  const [propSchedule, setPropSchedule] = useState([]);
  const [propErr, setPropErr] = useState('');
  const [propGenerating, setPropGenerating] = useState(false);

  // ── ITB state ─────────────────────────────────────────────────────────────────
  const [itbs, setItbs] = useState([]);
  const [itbsLoaded, setItbsLoaded] = useState(false);
  const [showNewITB, setShowNewITB] = useState(false);
  const [itbForm, setItbForm] = useState({ trade: '', description: '', budget_range: '', due_date: '' });
  const [itbInviteEmail, setItbInviteEmail] = useState('');
  const [itbInviteName, setItbInviteName] = useState('');
  const [itbSaving, setItbSaving] = useState(false);
  const [itbSendingTo, setItbSendingTo] = useState(null);
  const [itbErr, setItbErr] = useState('');
  const [expandedITB, setExpandedITB] = useState(null);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [allSubs, setAllSubs] = useState([]);

  const loadITBs = () => {
    if (itbsLoaded) return;
    sbLoadITBs(job.id).then(d => { setItbs(d); setItbsLoaded(true); });
    sbLoadSubDirectory().then(d => setAllSubs(d));
  };

  // Auto-load ITBs when component mounts
  useState(() => { loadITBs(); }, []);

  const readFileAsBase64 = file => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const openEstimator = async () => {
    setShowEstimator(true);
    const saved = await sbLoadEstimate(job.id);
    if (saved?.messages?.length) { setEstMessages(saved.messages); setEstStarted(true); }
    else { setEstMessages([]); setEstStarted(false); setEstForm({ scope: '', rooms: '', sqft: '', special: '' }); }
  };

  const sendEstimatorMessage = async (msgOverride, fileOverride) => {
    const text = msgOverride || estInput.trim();
    if ((!text && !fileOverride && !estFile) || estLoading) return;
    let userContent;
    const fileToUse = fileOverride || estFile;
    if (fileToUse) {
      const b64 = await readFileAsBase64(fileToUse);
      const mediaType = fileToUse.type || 'application/pdf';
      const isImage = mediaType.startsWith('image/');
      userContent = [
        ...(text ? [{ type: 'text', text }] : []),
        isImage ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } } : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
      ];
    } else { userContent = text; }
    const newMessages = [...estMessages, { role: 'user', content: userContent }];
    const displayMessages = [...estMessages, { role: 'user', content: text || (estFileName || '[File attached]'), _hasFile: !!fileToUse, _fileName: fileToUse?.name }];
    setEstMessages(displayMessages);
    setEstInput(''); setEstFile(null); setEstFileName('');
    setEstLoading(true);
    const res = await fetch(AI_ESTIMATOR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` }, body: JSON.stringify({ messages: newMessages }) });
    const data = await res.json();
    const reply = data.content || 'Sorry, something went wrong. Please try again.';
    const finalDisplay = [...displayMessages, { role: 'assistant', content: reply }];
    setEstMessages(finalDisplay);
    setEstLoading(false);
    sbSaveEstimate(job.id, finalDisplay);
  };

  const startEstimate = async () => {
    if (!estForm.scope.trim()) return;
    setEstStarted(true);
    const prompt = `Generate a detailed estimate for the following project:\n\nJob Address: ${job.address}\nScope of Work: ${estForm.scope}\n${estForm.rooms ? `Rooms: ${estForm.rooms}\n` : ''}${estForm.sqft ? `Square Footage: ${estForm.sqft} sqft\n` : ''}${estForm.special ? `Special Notes: ${estForm.special}\n` : ''}`;
    await sendEstimatorMessage(prompt, estFile || null);
  };

  const saveEstimatePDF = async () => {
    setEstSaving(true); setEstSaveMsg('');
    const doc = await buildEstimatePDF(job, estMessages);
    const blob = doc.output('blob');
    const file = new File([blob], `Estimate — ${job.address}.pdf`, { type: 'application/pdf' });
    const r = await sbUploadDoc(job.id, file, 'other');
    setEstSaveMsg(r.doc ? 'Saved to Documents' : 'Save failed — try again');
    setEstSaving(false); setTimeout(() => setEstSaveMsg(''), 3000);
  };

  const sendEstimateToClient = async () => {
    if (!job.client_email) { setEstSaveMsg('No client email on this job'); return; }
    setEstSendingClient(true); setEstSaveMsg('');
    const doc = await buildEstimatePDF(job, estMessages);
    const blob = doc.output('blob');
    await sbSendEstimateEmail(job, blob);
    const file = new File([blob], `Estimate — ${job.address}.pdf`, { type: 'application/pdf' });
    await sbUploadDoc(job.id, file, 'other');
    setEstSaveMsg(`Sent to ${job.client_email}`);
    setEstSendingClient(false); setTimeout(() => setEstSaveMsg(''), 4000);
  };

  const openProposal = async () => {
    const lastAI = estMessages.filter(m => m.role === 'assistant').pop();
    if (!lastAI) return;
    setPropLoading(true); setPropErr(''); setShowProposal(true); setPropLineItems([]);
    try {
      const extractMsgs = [...estMessages, { role: 'user', content: 'EXTRACT_JSON_FOR_PROPOSAL' }];
      const res = await fetch(AI_ESTIMATOR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` }, body: JSON.stringify({ messages: extractMsgs }) });
      const data = await res.json();
      const raw = data.content || '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse proposal data');
      const parsed = JSON.parse(match[0]);
      setPropLineItems(parsed.line_items || []);
      const sub = (parsed.line_items || []).reduce((a, l) => a + Number(l.amount || 0), 0);
      const dep = Math.round(sub * 0.15);
      const mid = Math.min(5000, Math.round(sub * 0.35));
      const bal = sub - dep - mid;
      setPropSchedule([{ milestone: 'Deposit — Contract Signing', timing: 'Due at signing', amount: dep }, { milestone: 'Draw 1 — Rough-In Complete', timing: 'Upon rough-in approval', amount: mid }, { milestone: 'Final Payment — Project Complete', timing: 'Upon completion', amount: bal > 0 ? bal : 0 }]);
      setPropNum(`${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`);
    } catch (e) { setPropErr(e.message || 'Failed to extract proposal data'); }
    setPropLoading(false);
  };

  const generateProposalPDF = async (download = true) => {
    setPropGenerating(true);
    try {
      const doc = buildProposalPDF(job, propLineItems, [], { pmFee: Number(propPmFee || 0), margin: Number(propMargin || 25), proposalNum: propNum, schedule: propSchedule });
      if (download) {
        doc.save(`Proposal — ${job.address}.pdf`);
      } else {
        const blob = doc.output('blob');
        const file = new File([blob], `Proposal — ${job.address}.pdf`, { type: 'application/pdf' });
        const r = await sbUploadDoc(job.id, file, 'proposal');
        if (r.doc && setDocs) setDocs(p => [r.doc, ...p]);
      }
    } catch (e) { console.error('Proposal PDF error:', e); }
    setPropGenerating(false);
  };

  const createITB = async () => {
    if (!itbForm.trade) return;
    setItbSaving(true); setItbErr('');
    const d = await sbCreateITB({ job_id: job.id, title: `${itbForm.trade} — ${job.address}`, description: itbForm.description, trade: itbForm.trade, budget_range: itbForm.budget_range, due_date: itbForm.due_date || null, shared_doc_ids: selectedDocs, shared_photo_ids: selectedPhotos, status: 'draft' });
    if (d) { setItbs(p => [d, ...p]); setShowNewITB(false); setItbForm({ trade: '', description: '', budget_range: '', due_date: '' }); setSelectedDocs([]); setSelectedPhotos([]); setExpandedITB(d.id); }
    setItbSaving(false);
  };

  const sendInvite = async itb => {
    if (!itbInviteEmail.trim()) return;
    setItbSendingTo(itb.id); setItbErr('');
    const res = await sbSendBidInvite({ ...itb, _jobAddress: job.address }, itbInviteEmail.trim(), itbInviteName.trim());
    if (res.error) { setItbErr(res.error); } else {
      await sbUpdateITB(itb.id, { status: 'sent' });
      setItbs(p => p.map(x => x.id === itb.id ? { ...x, status: 'sent', invitees: [...(x.invitees || []), { email: itbInviteEmail.trim(), profile: { full_name: itbInviteName.trim() } }] } : x));
      setItbInviteEmail(''); setItbInviteName('');
    }
    setItbSendingTo(null);
  };

  const awardBid = async (bidId, itbId) => {
    await sbUpdateBidStatus(bidId, 'awarded');
    await sbUpdateITB(itbId, { status: 'awarded' });
    setItbs(p => p.map(itb => itb.id === itbId ? { ...itb, status: 'awarded', responses: (itb.responses || []).map(r => r.id === bidId ? { ...r, status: 'awarded' } : r) } : itb));
  };

  const rejectBid = async (bidId, itbId) => {
    await sbUpdateBidStatus(bidId, 'rejected');
    setItbs(p => p.map(itb => itb.id === itbId ? { ...itb, responses: (itb.responses || []).map(r => r.id === bidId ? { ...r, status: 'rejected' } : r) } : itb));
  };

  const ssty = { appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 };

  return (
    <div>
      {/* AI Estimator banner */}
      <div style={{ background: '#0A1F44', borderRadius: 6, padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C', letterSpacing: 0.3 }}>AI Estimator</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Generate a trade-by-trade material &amp; labor estimate</div>
        </div>
        <button className="btn btn-gold" onClick={openEstimator} style={{ flexShrink: 0 }}>Open Estimator</button>
      </div>

      {/* Room Scanner card */}
      <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 6, padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44', letterSpacing: 0.3 }}>
            📱 Room Measurements
            {scannedRooms.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, background: '#D1FAE5', color: '#16a34a', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{scannedRooms.length} rooms scanned</span>}
          </div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
            {scannedRooms.length > 0
              ? `${scannedRooms.reduce((s, r) => s + (r.sqft || 0), 0).toLocaleString()} total sq ft · LiDAR scan on-site for exact dimensions`
              : 'Scan rooms on-site for exact dimensions · feeds directly into estimate'}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={() => setShowScanner(true)} style={{ flexShrink: 0, border: '1px solid #E8E4DC' }}>
          {scannedRooms.length > 0 ? 'Re-scan' : 'Scan Rooms'}
        </button>
      </div>

      {/* ITB section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Invitations to Bid</div>
        <button className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowNewITB(true)}><span style={{ width: 14, height: 14 }}>{Ic.plus}</span>New ITB</button>
      </div>
      {!itbsLoaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading...</div>}
      {itbsLoaded && !itbs.length && <div className="empty">{Ic.doc}<div className="empty-t">No bids yet</div><div>Create an ITB to invite subs to quote this project</div></div>}
      {itbs.map(itb => {
        const isOpen = expandedITB === itb.id;
        const statusColor = { draft: '#9CA3AF', sent: '#f59e0b', closed: '#6B7280', awarded: '#22c55e' }[itb.status] || '#9CA3AF';
        const responses = itb.responses || [];
        const invitees = itb.invitees || [];
        return (
          <div key={itb.id} style={{ background: '#fff', border: '1px solid #E8E4DC', marginBottom: 10 }}>
            <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => setExpandedITB(isOpen ? null : itb.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>{itb.trade || 'General'}</span>
                  <span style={{ fontSize: 9, background: statusColor + '18', color: statusColor, padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{itb.status}</span>
                </div>
                {itb.description && <div style={{ fontSize: 12, color: '#9CA3AF', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{itb.description}</div>}
                <div style={{ fontSize: 11, color: '#D1C9B8', marginTop: 2 }}>{invitees.length} invited · {responses.length} {responses.length === 1 ? 'response' : 'responses'}{itb.due_date && ` · Due ${fD(itb.due_date)}`}</div>
              </div>
              <span style={{ width: 14, height: 14, color: '#9CA3AF', transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.15s', display: 'flex' }}>{Ic.chev}</span>
            </div>
            {isOpen && <div style={{ borderTop: '1px solid #F3F0E8', padding: 16 }}>
              <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Send Invite</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Name (optional)</label><input className="finp" value={itbInviteName} onChange={e => setItbInviteName(e.target.value)} placeholder="John Smith" /></div>
                  <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Email</label><input className="finp" type="email" value={itbInviteEmail} onChange={e => setItbInviteEmail(e.target.value)} placeholder="john@smithelectric.com" /></div>
                </div>
                {allSubs.length > 0 && <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6 }}>Quick pick from directory:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {allSubs.filter(s => !invitees.find(i => i.email === s.email)).map(s => (
                      <button key={s.id} onClick={() => { setItbInviteEmail(s.email || ''); setItbInviteName(s.full_name || ''); }} style={{ background: itbInviteEmail === s.email ? '#0A1F44' : '#fff', color: itbInviteEmail === s.email ? '#C9A84C' : '#374151', border: `1px solid ${itbInviteEmail === s.email ? '#0A1F44' : '#E8E4DC'}`, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>{s.full_name || s.email}{s.trade && ` · ${s.trade}`}</button>
                    ))}
                  </div>
                </div>}
                {itbErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '6px 10px', fontSize: 12, marginBottom: 8 }}>{itbErr}</div>}
                <button className={`btn ${itbInviteEmail.trim() ? 'btn-gold' : 'btn-ghost'}`} style={{ width: '100%' }} onClick={() => sendInvite(itb)} disabled={itbSendingTo === itb.id || !itbInviteEmail.trim()}>{itbSendingTo === itb.id ? 'Sending invite...' : 'Send Bid Invite'}</button>
              </div>
              {invitees.length > 0 && <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Invited ({invitees.length})</div>
                {invitees.map((inv, i) => {
                  const resp = responses.find(r => r.sub_id === inv.sub_id);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #F3F0E8' }}>
                      <div style={{ width: 28, height: 28, background: '#0A1F4418', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#0A1F44', flexShrink: 0 }}>{(inv.profile?.full_name || inv.email || '?')[0].toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44' }}>{inv.profile?.full_name || inv.email}</div>
                        {inv.profile?.trade && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{inv.profile.trade}</div>}
                      </div>
                      {resp ? <span style={{ fontSize: 10, background: resp.status === 'awarded' ? '#F0FDF4' : resp.status === 'rejected' ? '#FEF2F2' : 'rgba(201,168,76,0.1)', color: resp.status === 'awarded' ? '#16a34a' : resp.status === 'rejected' ? '#ef4444' : '#C9A84C', padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, border: `1px solid ${resp.status === 'awarded' ? '#BBF7D0' : resp.status === 'rejected' ? '#FECACA' : 'rgba(201,168,76,0.3)'}` }}>{resp.status === 'submitted' ? 'Bid in' : resp.status}</span> : <span style={{ fontSize: 10, color: '#D1C9B8', fontStyle: 'italic' }}>Awaiting</span>}
                    </div>
                  );
                })}
              </div>}
              {responses.length > 0 && <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Bids Received ({responses.length})</div>
                {responses.map(r => {
                  const sub = invitees.find(i => i.sub_id === r.sub_id);
                  return (
                    <div key={r.id} style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderLeft: `3px solid ${r.status === 'awarded' ? '#22c55e' : r.status === 'rejected' ? '#ef4444' : '#C9A84C'}`, padding: 14, marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>{sub?.profile?.full_name || r.sub_id}</div>
                          {sub?.profile?.trade && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{sub.profile.trade}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {r.amount && <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#0A1F44' }}>{f$(r.amount)}</div>}
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: r.status === 'awarded' ? '#22c55e' : r.status === 'rejected' ? '#ef4444' : '#C9A84C' }}>{r.status}</div>
                        </div>
                      </div>
                      {r.notes && <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6, marginBottom: 8 }}>{r.notes}</div>}
                      {r.quote_file_url && <a href={r.quote_file_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#0A1F44', background: '#fff', border: '1px solid #E8E4DC', padding: '5px 10px', textDecoration: 'none', marginBottom: 8 }}><span style={{ width: 12, height: 12, display: 'flex' }}>{Ic.dl}</span>{r.quote_file_name || 'Download Quote'}</a>}
                      {r.status === 'submitted' && <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" style={{ flex: 1, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16a34a', fontSize: 11, fontWeight: 600 }} onClick={() => awardBid(r.id, itb.id)}>✓ Award This Sub</button>
                        <button className="btn" style={{ flex: 1, background: '#FEF2F2', border: '1px solid #FECACA', color: '#ef4444', fontSize: 11, fontWeight: 600 }} onClick={() => rejectBid(r.id, itb.id)}>✕ Reject</button>
                      </div>}
                    </div>
                  );
                })}
              </div>}
            </div>}
          </div>
        );
      })}

      {/* New ITB modal */}
      {showNewITB && <div className="overlay" onClick={() => setShowNewITB(false)}><div className="modal" style={{ maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">New Invitation to Bid</div>
        <div className="fg"><label className="flbl"><span className="freq">*</span>Trade</label>
          <select className="finp" value={itbForm.trade} onChange={e => setItbForm(p => ({ ...p, trade: e.target.value }))} style={ssty}>
            <option value="">Select trade...</option>
            {COMMON_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="fg"><label className="flbl">Scope Description</label><textarea className="finp fta" value={itbForm.description} onChange={e => setItbForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the work scope, specs, requirements..." rows={3} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Budget Range</label><input className="finp" value={itbForm.budget_range} onChange={e => setItbForm(p => ({ ...p, budget_range: e.target.value }))} placeholder="e.g. $8,000–$12,000" /></div>
          <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Bid Due Date</label><input className="finp" type="date" value={itbForm.due_date} onChange={e => setItbForm(p => ({ ...p, due_date: e.target.value }))} /></div>
        </div>
        {docs && docs.length > 0 && <div style={{ marginTop: 12 }}><div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Share Documents</div>
          {docs.map(d => <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 12, color: '#374151' }}>
            <input type="checkbox" checked={selectedDocs.includes(d.id)} onChange={e => setSelectedDocs(p => e.target.checked ? [...p, d.id] : p.filter(x => x !== d.id))} />
            <span className="doc-type" style={{ background: docTypeColor(d.file_type) + '18', color: docTypeColor(d.file_type), fontSize: 9 }}>{d.file_type}</span>
            {d.name}
          </label>)}
        </div>}
        {photos && photos.length > 0 && <div style={{ marginTop: 12 }}><div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Share Photos</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {photos.map(p => (
              <div key={p.id} onClick={() => setSelectedPhotos(x => x.includes(p.id) ? x.filter(i => i !== p.id) : [...x, p.id])} style={{ width: 60, height: 60, position: 'relative', cursor: 'pointer', border: `2px solid ${selectedPhotos.includes(p.id) ? '#C9A84C' : 'transparent'}` }}>
                <img src={p.url || p.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {selectedPhotos.includes(p.id) && <div style={{ position: 'absolute', inset: 0, background: 'rgba(201,168,76,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 700 }}>✓</div>}
              </div>
            ))}
          </div>
        </div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowNewITB(false)}>Cancel</button>
          <button className={`btn ${itbForm.trade ? 'btn-gold' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={createITB} disabled={itbSaving || !itbForm.trade}>{itbSaving ? 'Creating...' : 'Create ITB'}</button>
        </div>
      </div></div>}

      {/* AI Estimator modal */}
      {showEstimator && <div className="overlay" onClick={() => setShowEstimator(false)}><div className="modal" style={{ maxWidth: 660, height: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
          <div><div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44' }}>AI Estimator</div><div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{job.address}</div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {estSaveMsg && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>{estSaveMsg}</span>}
            {estStarted && <>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={saveEstimatePDF} disabled={estSaving}>{estSaving ? 'Saving...' : 'Save PDF'}</button>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={sendEstimateToClient} disabled={estSendingClient}>{estSendingClient ? 'Sending...' : 'Send to Client'}</button>
              <button className="btn btn-gold" style={{ fontSize: 11 }} onClick={openProposal}>Generate Proposal →</button>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { setEstMessages([]); setEstStarted(false); setEstForm({ scope: '', rooms: '', sqft: '', special: '' }); }}>Reset</button>
            </>}
            <button onClick={() => setShowEstimator(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
        </div>
        {!estStarted && <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="fg"><label className="flbl"><span className="freq">*</span>Scope of Work</label><textarea className="finp fta" rows={3} value={estForm.scope} onChange={e => setEstForm(p => ({ ...p, scope: e.target.value }))} placeholder="e.g. Full kitchen remodel — demo existing, new cabinets, countertops, flooring, electrical updates, plumbing relocation" /></div>
          <div className="fg"><label className="flbl">Rooms / Areas</label><input className="finp" value={estForm.rooms} onChange={e => setEstForm(p => ({ ...p, rooms: e.target.value }))} placeholder="e.g. Kitchen, Master Bath, Living Room" /></div>
          <div className="fg"><label className="flbl">Square Footage</label><input className="finp" type="number" value={estForm.sqft} onChange={e => setEstForm(p => ({ ...p, sqft: e.target.value }))} placeholder="e.g. 1200" /></div>
          <div className="fg"><label className="flbl">Special Notes</label><textarea className="finp fta" rows={2} value={estForm.special} onChange={e => setEstForm(p => ({ ...p, special: e.target.value }))} placeholder="High-end finishes, specific products, client requests, existing conditions..." /></div>
          <div className="fg">
            <label className="flbl">Floor Plan / Photos <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional — PDF or image)</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F7F5F0', border: '1px dashed #C9A84C', borderRadius: 4, padding: '10px 14px', cursor: 'pointer' }}>
              <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setEstFile(f); setEstFileName(f.name); } }} />
              <span style={{ width: 16, height: 16, color: '#C9A84C' }}>{Ic.plus}</span>
              <span style={{ fontSize: 13, color: estFileName ? '#0A1F44' : '#9CA3AF' }}>{estFileName || 'Attach floor plan or photo'}</span>
              {estFileName && <button onClick={e => { e.preventDefault(); setEstFile(null); setEstFileName(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16 }}>×</button>}
            </label>
          </div>
          <button className={`btn ${estForm.scope.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ width: '100%', marginTop: 4 }} onClick={startEstimate} disabled={!estForm.scope.trim() || estLoading}>{estLoading ? 'Generating...' : 'Generate Estimate'}</button>
        </div>}
        {estStarted && <>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
            {estMessages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && <div style={{ width: 28, height: 28, background: '#0A1F44', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#C9A84C', flexShrink: 0, marginRight: 8, marginTop: 2 }}>AI</div>}
                <div style={{ maxWidth: '85%', background: m.role === 'user' ? '#0A1F44' : '#fff', color: m.role === 'user' ? '#fff' : '#374151', padding: '10px 14px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: 13, lineHeight: 1.7, border: m.role === 'assistant' ? '1px solid #E8E4DC' : 'none', whiteSpace: 'pre-wrap' }}>
                  {m._hasFile && <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>📎 {m._fileName}</div>}
                  {typeof m.content === 'string' ? m.content : m.content}
                </div>
              </div>
            ))}
            {estLoading && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, background: '#0A1F44', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#C9A84C', flexShrink: 0 }}>AI</div>
              <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '10px 14px', borderRadius: '12px 12px 12px 2px', fontSize: 13, color: '#9CA3AF' }}>Generating estimate...</div>
            </div>}
          </div>
          {estFileName && <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: '#0A1F44', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexShrink: 0 }}>
            <span style={{ color: '#C9A84C' }}>{Ic.folder}</span>{estFileName}
            <button onClick={() => { setEstFile(null); setEstFileName(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>
              <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setEstFile(f); setEstFileName(f.name); } }} />
              <span style={{ width: 16, height: 16, color: '#9CA3AF' }}>{Ic.plus}</span>
            </label>
            <input className="finp" style={{ flex: 1, margin: 0 }} value={estInput} onChange={e => setEstInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendEstimatorMessage()} placeholder="Ask a follow-up — adjust scope, change materials, add a trade..." disabled={estLoading} />
            <button className="btn btn-navy" onClick={() => sendEstimatorMessage()} disabled={estLoading || (!estInput.trim() && !estFile)}>Send</button>
          </div>
        </>}
      </div></div>}

      {/* LiDAR Scanner overlay */}
      {showScanner && <LidarScanner rooms={scannedRooms} onRoomsChange={setScannedRooms} onDone={() => setShowScanner(false)} />}

      {/* Proposal modal */}
      {showProposal && <div className="overlay" onClick={() => setShowProposal(false)}><div className="modal" style={{ maxWidth: 720, maxHeight: '92vh', overflowY: 'auto', padding: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{ background: '#0A1F44', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '8px 8px 0 0' }}>
          <div style={{ color: '#C9A84C', fontFamily: "'DM Serif Display',serif", fontSize: 18 }}>Generate Proposal</div>
          <button onClick={() => setShowProposal(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 24 }}>
          {propErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 14px', borderRadius: 4, fontSize: 13, marginBottom: 16 }}>{propErr}</div>}
          {propLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}><div style={{ fontSize: 13 }}>Extracting line items from estimate...</div></div> : (
            <Fragment>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="fg"><label className="flbl">Proposal #</label><input className="finp" value={propNum} onChange={e => setPropNum(e.target.value)} /></div>
                <div className="fg"><label className="flbl">PM Fee ($)</label><input className="finp" type="number" value={propPmFee} onChange={e => setPropPmFee(e.target.value)} /></div>
                <div className="fg"><label className="flbl">Profit Margin (%)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min="15" max="40" step="1" value={propMargin} onChange={e => setPropMargin(e.target.value)} style={{ flex: 1 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44', minWidth: 36 }}>{propMargin}%</span>
                  </div>
                </div>
              </div>
              {propLineItems.length > 0 && (() => {
                const sub = propLineItems.reduce((a, l) => a + Number(l.amount || 0), 0);
                const pm = Number(propPmFee) || 0;
                const profit = Math.round(sub * (Number(propMargin) / 100));
                const total = sub + pm + profit;
                return (
                  <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: 16, marginBottom: 20, display: 'flex', gap: 0 }}>
                    {[['Subtotal', '$' + sub.toLocaleString()], ['PM Fee', '$' + pm.toLocaleString()], ['Profit (' + propMargin + '%)', '$' + profit.toLocaleString()], ['TOTAL', '$' + total.toLocaleString()]].map(([lbl, val], i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < 3 ? '1px solid #E8E4DC' : 'none', padding: '0 8px' }}>
                        <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{lbl}</div>
                        <div style={{ fontSize: i === 3 ? 18 : 14, fontWeight: 700, color: i === 3 ? '#C9A84C' : '#0A1F44' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {propLineItems.length > 0 && <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0A1F44', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Line Items</div>
                <div style={{ border: '1px solid #E8E4DC', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 90px 28px', background: '#0A1F44', padding: '6px 10px', gap: 8 }}>
                    {['Description', 'QTY', 'Amount', ''].map(h => <div key={h} style={{ fontSize: 10, fontWeight: 600, color: '#C9A84C' }}>{h}</div>)}
                  </div>
                  {propLineItems.map((li, i) => {
                    const isFirst = i === 0 || propLineItems[i - 1].trade !== li.trade;
                    return (
                      <Fragment key={i}>
                        {isFirst && <div style={{ background: '#F3F0EB', padding: '4px 10px', fontSize: 10, fontWeight: 700, color: '#0A1F44', borderTop: '1px solid #E8E4DC' }}>{li.trade}</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 90px 28px', padding: '4px 10px', gap: 8, borderTop: '1px solid #F3F0EB', alignItems: 'center', background: i % 2 === 0 ? '#fff' : '#FAFAF8' }}>
                          <input value={li.description || ''} onChange={e => { const u = [...propLineItems]; u[i] = { ...u[i], description: e.target.value }; setPropLineItems(u); }} style={{ fontSize: 11, border: 'none', background: 'transparent', color: '#374151', outline: 'none', width: '100%' }} />
                          <input value={li.qty_label || ''} onChange={e => { const u = [...propLineItems]; u[i] = { ...u[i], qty_label: e.target.value }; setPropLineItems(u); }} style={{ fontSize: 11, border: 'none', background: 'transparent', color: '#6B7280', outline: 'none' }} />
                          <input type="number" value={li.amount || ''} onChange={e => { const u = [...propLineItems]; u[i] = { ...u[i], amount: e.target.value }; setPropLineItems(u); }} style={{ fontSize: 11, border: 'none', background: 'transparent', color: '#0A1F44', fontWeight: 600, outline: 'none', textAlign: 'right' }} />
                          <button onClick={() => setPropLineItems(propLineItems.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
                <button onClick={() => setPropLineItems([...propLineItems, { trade: 'GENERAL', description: '', qty_label: '1 LS', amount: 0 }])} style={{ fontSize: 11, color: '#C9A84C', background: 'transparent', border: 'none', cursor: 'pointer', marginTop: 6, padding: 0 }}>+ Add line item</button>
              </div>}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0A1F44', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Payment Schedule</div>
                {propSchedule.map((ps, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 28px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input className="finp" value={ps.milestone} onChange={e => { const u = [...propSchedule]; u[i] = { ...u[i], milestone: e.target.value }; setPropSchedule(u); }} placeholder="Milestone" />
                    <input className="finp" value={ps.timing} onChange={e => { const u = [...propSchedule]; u[i] = { ...u[i], timing: e.target.value }; setPropSchedule(u); }} placeholder="Timing" />
                    <input className="finp" type="number" value={ps.amount} onChange={e => { const u = [...propSchedule]; u[i] = { ...u[i], amount: e.target.value }; setPropSchedule(u); }} placeholder="Amount" />
                    <button onClick={() => setPropSchedule(propSchedule.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                ))}
                <button onClick={() => setPropSchedule([...propSchedule, { milestone: '', timing: 'At milestone', amount: '' }])} style={{ fontSize: 11, color: '#C9A84C', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>+ Add milestone</button>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => generateProposalPDF(true)} disabled={propGenerating || propLineItems.length === 0}>{propGenerating ? 'Generating...' : 'Download PDF'}</button>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => generateProposalPDF(false)} disabled={propGenerating || propLineItems.length === 0}>{propGenerating ? 'Generating...' : 'Save to Documents'}</button>
              </div>
            </Fragment>
          )}
        </div>
      </div></div>}
    </div>
  );
}
