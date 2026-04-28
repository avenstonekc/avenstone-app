import { useState, Fragment } from 'react';
import LidarScanner from '../../ai/LidarScanner';
import { ANON_KEY, AI_ESTIMATOR_URL, NOTIFY_REALTOR_URL, sbLoadEstimate, sbSaveEstimate, sbSendEstimateEmail, sbUploadDoc, AV_USER_ID, DOC_TYPES, docTypeColor, sbSaveEstimateLineItems, sbLoadOhShitMoments, sbToggleOhShitProposal } from '../../../lib/supabase';
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
  const [propOhShit, setPropOhShit] = useState([]);
  const [propOhShitExpanded, setPropOhShitExpanded] = useState(false);


  const readFileAsBase64 = file => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const openEstimator = async () => {
    setShowEstimator(true);
    const saved = await sbLoadEstimate(job.id);
    if (saved?.messages?.length) { setEstMessages(saved.messages); setEstStarted(true); return; }

    // Auto-load measurement transcripts and consultation notes from job docs
    const jobDocs = docs || [];
    const measureDoc = jobDocs.find(d => d.file_type === 'measurements');
    const transcriptDoc = jobDocs.find(d => d.file_type === 'transcript');
    const contextParts = [];
    if (job.scope) contextParts.push(`Project scope: ${job.scope}`);
    if (job.sqft) contextParts.push(`Approximate square footage: ${job.sqft} SF`);
    if (measureDoc) contextParts.push(`Field measurements on file: ${measureDoc.name} (attached in job documents)`);
    if (transcriptDoc) contextParts.push(`Consultation transcript on file: ${transcriptDoc.name} (attached in job documents)`);

    setEstMessages([]);
    setEstStarted(false);
    setEstForm(prev => ({
      scope: prev.scope || job.scope || '',
      rooms: prev.rooms || (contextParts.length ? contextParts.join('\n') : ''),
      sqft: prev.sqft || String(job.sqft || ''),
      special: prev.special || [measureDoc ? '✓ Field measurements saved' : '', transcriptDoc ? '✓ Consultation notes saved' : ''].filter(Boolean).join(' · '),
    }));
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
      const moments = await sbLoadOhShitMoments(job.id);
      setPropOhShit(moments);
      if (moments.length) setPropOhShitExpanded(true);
    } catch (e) { setPropErr(e.message || 'Failed to extract proposal data'); }
    setPropLoading(false);
  };

  const generateProposalPDF = async (download = true) => {
    setPropGenerating(true);
    try {
      const doc = buildProposalPDF(job, propLineItems, [], { pmFee: Number(propPmFee || 0), margin: Number(propMargin || 25), proposalNum: propNum, schedule: propSchedule, ohShitMoments: propOhShit });
      if (download) {
        doc.save(`Proposal — ${job.address}.pdf`);
      } else {
        const blob = doc.output('blob');
        const file = new File([blob], `Proposal — ${job.address}.pdf`, { type: 'application/pdf' });
        const r = await sbUploadDoc(job.id, file, 'proposal');
        if (r.doc && setDocs) setDocs(p => [r.doc, ...p]);
      }
      // Persist line items for Budget vs Actual
      if (propLineItems.length) {
        const items = propLineItems.map(li => ({
          phase:       li.trade  || null,
          trade:       li.trade  || null,
          category:    'materials',
          description: li.description || li.trade || 'Line item',
          quantity:    1,
          unit_cost:   Number(li.amount || 0),
          markup_pct:  Number(propMargin || 0),
        }));
        await sbSaveEstimateLineItems(job.id, null, items);
      }
    } catch (e) { console.error('Proposal PDF error:', e); }
    setPropGenerating(false);
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

      {/* AI Estimator modal */}
      {showEstimator && <div className="overlay" onClick={() => { if (!estStarted && estForm.scope.trim()) return; setShowEstimator(false); }}><div className="modal" style={{ maxWidth: 660, height: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
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
              {propOhShit.length > 0 && <div style={{ marginBottom: 20, border: '1px solid #E8E4DC', borderRadius: 6, overflow: 'hidden' }}>
                <button onClick={() => setPropOhShitExpanded(x => !x)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#F7F5F0', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#0A1F44', textTransform: 'uppercase', letterSpacing: 1 }}>Disclosed unknowns ({propOhShit.filter(m => m.included_in_proposal).length} of {propOhShit.length} included)</span>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{propOhShitExpanded ? '▲' : '▼'}</span>
                </button>
                {propOhShitExpanded && <div>
                  {propOhShit.map((m, i) => (
                    <div key={m.id || i} style={{ padding: '10px 12px', borderTop: '1px solid #E8E4DC', background: m.included_in_proposal ? '#FFFBEB' : '#fff', transition: 'background 0.15s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#0A1F44', marginBottom: 2 }}>{m.condition}</div>
                          <div style={{ fontSize: 11, color: '#6B7280' }}>
                            {m.likelihood && <span style={{ marginRight: 8, fontWeight: 600, color: m.likelihood === 'high' ? '#B91C1C' : m.likelihood === 'low' ? '#15803D' : '#92400E' }}>{m.likelihood.charAt(0).toUpperCase() + m.likelihood.slice(1)} likelihood</span>}
                            {(m.estimated_cost_low || m.estimated_cost_high) && <span>${Number(m.estimated_cost_low || 0).toLocaleString()} – ${Number(m.estimated_cost_high || 0).toLocaleString()}</span>}
                          </div>
                          {m.how_to_present && <div style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginTop: 2 }}>{m.how_to_present}</div>}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
                          <input type="checkbox" checked={!!m.included_in_proposal} onChange={async () => {
                            const next = !m.included_in_proposal;
                            setPropOhShit(prev => prev.map(x => x.id === m.id ? { ...x, included_in_proposal: next } : x));
                            await sbToggleOhShitProposal(m.id, next);
                          }} style={{ width: 14, height: 14, accentColor: '#C9A84C', cursor: 'pointer' }} />
                          <span style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap' }}>Include in proposal</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>}
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
