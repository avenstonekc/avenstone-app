import { useState, useEffect, Fragment, lazy, Suspense } from 'react';
import { sb, AV_USER_ID, AV_TENANT, ANON_KEY, AI_ESTIMATOR_URL, sbLoadEstimate, sbSaveEstimate, sbSendEstimateEmail, sbUploadDoc, sbSaveEstimateLineItems, sbLoadEstimateLineItems, sbLoadOhShitMoments, sbToggleOhShitProposal, sbLoadJobRoomScopes } from '../../../lib/supabase';
import { sbCommitEstimate } from '../../../lib/commitEstimate';
import { Ic, f$ } from '../../../lib/utils';
import { buildEstimatePDF, buildProposalPDF } from '../../../lib/pdf';
import LineItemModal from './financials/LineItemModal';
import ScopeTab from './ScopeTab';

const TakeoffWizard = lazy(() => import('./TakeoffWizard'));

const NAV = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';

const SUB_TABS = [
  { id: 'build',    lb: 'Build' },
  { id: 'scope',    lb: 'Scope' },
  { id: 'takeoff',  lb: 'Takeoff' },
  { id: 'items',    lb: 'Line items' },
  { id: 'proposal', lb: 'Proposal' },
];

export default function EstimateTab({ job, photos, docs, setDocs }) {
  const [sub, setSub] = useState('build');

  // ── AI Estimator state ──────────────────────────────────────────────────────
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

  // ── Line items state ────────────────────────────────────────────────────────
  const [lineItems, setLineItems] = useState([]);
  const [lineItemsLoaded, setLineItemsLoaded] = useState(false);
  const [showLineItemModal, setShowLineItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // ── Proposal state ──────────────────────────────────────────────────────────
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
  const [propReady, setPropReady] = useState(false);

  // Default tab: items (if line items exist) → scope (if scope rows exist) → build
  useEffect(() => {
    Promise.all([
      sbLoadEstimateLineItems(job.id),
      sbLoadJobRoomScopes(job.id),
    ]).then(([items, scopes]) => {
      if (items?.length) {
        setLineItems(items);
        setLineItemsLoaded(true);
        setSub('items');
      } else if (scopes?.length) {
        setSub('scope');
      } else {
        setSub('build');
      }
    });
  }, [job.id]);

  // Load line items when switching to items tab
  useEffect(() => {
    if (sub === 'items' && !lineItemsLoaded) {
      sbLoadEstimateLineItems(job.id).then(items => {
        setLineItems(items || []);
        setLineItemsLoaded(true);
      });
    }
  }, [sub, lineItemsLoaded, job.id]);

  // Load estimator history on mount
  useEffect(() => {
    sbLoadEstimate(job.id).then(saved => {
      if (saved?.messages?.length) {
        setEstMessages(saved.messages);
        setEstStarted(true);
        return;
      }
      const jobDocs = docs || [];
      const measureDoc = jobDocs.find(d => d.file_type === 'measurements');
      const transcriptDoc = jobDocs.find(d => d.file_type === 'transcript');
      const contextParts = [];
      if (job.scope) contextParts.push(`Project scope: ${job.scope}`);
      if (job.sqft) contextParts.push(`Approximate square footage: ${job.sqft} SF`);
      if (measureDoc) contextParts.push(`Field measurements on file: ${measureDoc.name}`);
      if (transcriptDoc) contextParts.push(`Consultation transcript on file: ${transcriptDoc.name}`);
      setEstForm({
        scope: job.scope || '',
        rooms: contextParts.join('\n'),
        sqft: String(job.sqft || ''),
        special: [measureDoc ? '✓ Field measurements saved' : '', transcriptDoc ? '✓ Consultation notes saved' : ''].filter(Boolean).join(' · '),
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const readFileAsBase64 = file => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

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
        isImage
          ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } }
          : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
      ];
    } else { userContent = text; }
    const newMessages = [...estMessages, { role: 'user', content: userContent }];
    const displayMessages = [...estMessages, { role: 'user', content: text || (estFileName || '[File attached]'), _hasFile: !!fileToUse, _fileName: fileToUse?.name }];
    setEstMessages(displayMessages);
    setEstInput(''); setEstFile(null); setEstFileName('');
    setEstLoading(true);
    const res = await fetch(AI_ESTIMATOR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ messages: newMessages }),
    });
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
    setSub('proposal');
    if (propReady) return;
    const lastAI = estMessages.filter(m => m.role === 'assistant').pop();
    if (!lastAI) return;
    setPropLoading(true); setPropErr('');
    try {
      const extractMsgs = [...estMessages, { role: 'user', content: 'EXTRACT_JSON_FOR_PROPOSAL' }];
      const res = await fetch(AI_ESTIMATOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ messages: extractMsgs }),
      });
      const data = await res.json();
      const raw = data.content || '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse proposal data');
      const parsed = JSON.parse(match[0]);
      setPropLineItems(parsed.line_items || []);
      const sub2 = (parsed.line_items || []).reduce((a, l) => a + Number(l.amount || 0), 0);
      const dep = Math.round(sub2 * 0.15);
      const mid = Math.min(5000, Math.round(sub2 * 0.35));
      const bal = sub2 - dep - mid;
      setPropSchedule([
        { milestone: 'Deposit — Contract Signing', timing: 'Due at signing', amount: dep },
        { milestone: 'Draw 1 — Rough-In Complete', timing: 'Upon rough-in approval', amount: mid },
        { milestone: 'Final Payment — Project Complete', timing: 'Upon completion', amount: bal > 0 ? bal : 0 },
      ]);
      setPropNum(`${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`);
      const moments = await sbLoadOhShitMoments(job.id);
      setPropOhShit(moments);
      if (moments.length) setPropOhShitExpanded(true);
      setPropReady(true);
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
      if (propLineItems.length) {
        // markup_pct=0: markup is a proposal-time concern (ESTIMATE_FLOW_ARC Slice 5).
        // Budget sub-tab will show cost, not marked-up total, until Slice 5 ships.
        const commitItems = propLineItems.map(li => ({
          source:      'ai',
          trade:       li.trade || 'General',
          // AI estimator JSON has no category field; system prompt reliably tags material/allowance
          // lines in the description. This regex infers category from that convention.
          // FRAGILE: if the AI omits the keyword on a material line, it mislabels as labor and
          // gets the wrong markup bucket. Long-term fix (backlogged): add explicit 'category' to
          // the ai-estimator JSON schema (Option B from the Slice-4b audit).
          category:    /material|allowance/i.test(li.description || '') ? 'materials' : 'labor',
          description: li.description || li.trade || 'Line item',
          quantity:    1,
          unit:        null,
          unit_cost:   Number(li.amount || 0),
          multiplier:  1.0,
          markup_pct:  0,
          notes:       null,
          waste_pct:   null,
        }));
        const commitResult = await sbCommitEstimate(sb, AV_TENANT, AV_USER_ID, {
          source:     'ai',
          jobId:      job.id,
          estimateId: null,
          items:      commitItems,
        });
        if (!commitResult.ok) console.error('AI estimate commit failed:', commitResult.error);
      }
    } catch (e) { console.error('Proposal PDF error:', e); }
    setPropGenerating(false);
  };

  const reloadLineItems = async () => {
    const items = await sbLoadEstimateLineItems(job.id);
    setLineItems(items || []);
  };

  // ── Sub-view: Build ─────────────────────────────────────────────────────────
  const renderBuild = () => (
    <div>
      {!estStarted && (
        <div>
          <div style={{ background: NAV, borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, letterSpacing: 0.3 }}>AI Estimator</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Generate a trade-by-trade material &amp; labor estimate</div>
          </div>
          <div className="fg"><label className="flbl"><span className="freq">*</span>Scope of Work</label><textarea className="finp fta" rows={3} value={estForm.scope} onChange={e => setEstForm(p => ({ ...p, scope: e.target.value }))} placeholder="e.g. Full kitchen remodel — demo existing, new cabinets, countertops, flooring, electrical updates, plumbing relocation" /></div>
          <div className="fg"><label className="flbl">Rooms / Areas</label><input className="finp" value={estForm.rooms} onChange={e => setEstForm(p => ({ ...p, rooms: e.target.value }))} placeholder="e.g. Kitchen, Master Bath, Living Room" /></div>
          <div className="fg"><label className="flbl">Square Footage</label><input className="finp" type="number" value={estForm.sqft} onChange={e => setEstForm(p => ({ ...p, sqft: e.target.value }))} placeholder="e.g. 1200" /></div>
          <div className="fg"><label className="flbl">Special Notes</label><textarea className="finp fta" rows={2} value={estForm.special} onChange={e => setEstForm(p => ({ ...p, special: e.target.value }))} placeholder="High-end finishes, specific products, client requests, existing conditions…" /></div>
          <div className="fg">
            <label className="flbl">Floor Plan / Photos <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional — PDF or image)</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: CREAM, border: `1px dashed ${GOLD}`, borderRadius: 4, padding: '10px 14px', cursor: 'pointer' }}>
              <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setEstFile(f); setEstFileName(f.name); } }} />
              <span style={{ width: 16, height: 16, color: GOLD }}>{Ic.plus}</span>
              <span style={{ fontSize: 13, color: estFileName ? NAV : '#9CA3AF' }}>{estFileName || 'Attach floor plan or photo'}</span>
              {estFileName && <button onClick={e => { e.preventDefault(); setEstFile(null); setEstFileName(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16 }}>×</button>}
            </label>
          </div>
          <button className={`btn ${estForm.scope.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ width: '100%' }} onClick={startEstimate} disabled={!estForm.scope.trim() || estLoading}>
            {estLoading ? 'Generating…' : 'Generate Estimate'}
          </button>
        </div>
      )}
      {estStarted && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {estSaveMsg && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>{estSaveMsg}</span>}
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={saveEstimatePDF} disabled={estSaving}>{estSaving ? 'Saving…' : 'Save PDF'}</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={sendEstimateToClient} disabled={estSendingClient}>{estSendingClient ? 'Sending…' : 'Send to Client'}</button>
            <button className="btn btn-gold" style={{ fontSize: 11 }} onClick={openProposal}>Proposal →</button>
            <button className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => { setEstMessages([]); setEstStarted(false); setEstForm({ scope: '', rooms: '', sqft: '', special: '' }); }}>Reset</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 480, overflowY: 'auto' }}>
            {estMessages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && <div style={{ width: 28, height: 28, background: NAV, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: GOLD, flexShrink: 0, marginRight: 8, marginTop: 2 }}>AI</div>}
                <div style={{ maxWidth: '85%', background: m.role === 'user' ? NAV : '#fff', color: m.role === 'user' ? '#fff' : '#374151', padding: '10px 14px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: 13, lineHeight: 1.7, border: m.role === 'assistant' ? `1px solid ${BORDER}` : 'none', whiteSpace: 'pre-wrap' }}>
                  {m._hasFile && <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>📎 {m._fileName}</div>}
                  {typeof m.content === 'string' ? m.content : m.content}
                </div>
              </div>
            ))}
            {estLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, background: NAV, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: GOLD, flexShrink: 0 }}>AI</div>
                <div style={{ background: '#fff', border: `1px solid ${BORDER}`, padding: '10px 14px', borderRadius: '12px 12px 12px 2px', fontSize: 13, color: '#9CA3AF' }}>Generating estimate…</div>
              </div>
            )}
          </div>
          {estFileName && (
            <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 10px', fontSize: 12, color: NAV, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: GOLD }}>{Ic.folder}</span>{estFileName}
              <button onClick={() => { setEstFile(null); setEstFileName(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>
              <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setEstFile(f); setEstFileName(f.name); } }} />
              <span style={{ width: 16, height: 16, color: '#9CA3AF' }}>{Ic.plus}</span>
            </label>
            <input className="finp" style={{ flex: 1, margin: 0 }} value={estInput} onChange={e => setEstInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendEstimatorMessage()} placeholder="Ask a follow-up — adjust scope, change materials, add a trade…" disabled={estLoading} />
            <button className="btn btn-navy" onClick={() => sendEstimatorMessage()} disabled={estLoading || (!estInput.trim() && !estFile)}>Send</button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Sub-view: Line items ────────────────────────────────────────────────────
  const renderItems = () => {
    const total = lineItems.reduce((s, li) => s + Number(li.client_price ?? 0), 0);
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: '#6B7280' }}>{lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}</span>
          <button className="btn btn-navy" style={{ fontSize: 12 }} onClick={() => { setEditingItem(null); setShowLineItemModal(true); }}>+ Add line item</button>
        </div>
        {lineItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 14 }}>
            No line items yet — run the AI Estimator in Build, or add manually.
          </div>
        ) : (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 32px', background: NAV, padding: '8px 12px', gap: 8 }}>
              {['Description', 'Trade', 'Category', 'Total', ''].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 600, color: GOLD }}>{h}</div>
              ))}
            </div>
            {lineItems.map((li, i) => {
              const lineTotal = Number(li.client_price ?? 0);
              return (
                <div key={li.id || i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 32px', padding: '8px 12px', gap: 8, borderTop: `1px solid ${BORDER}`, alignItems: 'center', background: i % 2 === 0 ? '#fff' : CREAM }}>
                  <div style={{ fontSize: 13, color: NAV }}>{li.description}</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>{li.trade || '—'}</div>
                  <div style={{ fontSize: 12, color: '#6B7280', textTransform: 'capitalize' }}>{li.category || '—'}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAV }}>{f$(lineTotal)}</div>
                  <button onClick={() => { setEditingItem(li); setShowLineItemModal(true); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, padding: 0, display: 'flex' }}>{Ic.edit}</button>
                </div>
              );
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 32px', padding: '10px 12px', gap: 8, background: NAV, alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', gridColumn: '1/4' }}>Total</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>{f$(total)}</div>
              <div />
            </div>
          </div>
        )}
        {showLineItemModal && (
          <LineItemModal
            mode={editingItem ? 'edit' : 'add'}
            item={editingItem || {}}
            job={job}
            onClose={() => setShowLineItemModal(false)}
            onSaved={() => { setShowLineItemModal(false); setLineItemsLoaded(false); reloadLineItems(); }}
          />
        )}
      </div>
    );
  };

  // ── Sub-view: Proposal ──────────────────────────────────────────────────────
  const renderProposal = () => (
    <div>
      {propErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 14px', borderRadius: 4, fontSize: 13, marginBottom: 16 }}>{propErr}</div>}
      {propLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 13 }}>Extracting line items from estimate…</div>
      ) : !propReady ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>Run the AI Estimator in Build first, then come back here.</div>
          <button className="btn btn-navy" onClick={() => setSub('build')}>Go to Build →</button>
        </div>
      ) : (
        <Fragment>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div className="fg"><label className="flbl">Proposal #</label><input className="finp" value={propNum} onChange={e => setPropNum(e.target.value)} /></div>
            <div className="fg"><label className="flbl">PM Fee ($)</label><input className="finp" type="number" value={propPmFee} onChange={e => setPropPmFee(e.target.value)} /></div>
            <div className="fg"><label className="flbl">Profit Margin (%)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min="15" max="40" step="1" value={propMargin} onChange={e => setPropMargin(e.target.value)} style={{ flex: 1 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: NAV, minWidth: 36 }}>{propMargin}%</span>
              </div>
            </div>
          </div>
          {propLineItems.length > 0 && (() => {
            const subTotal = propLineItems.reduce((a, l) => a + Number(l.amount || 0), 0);
            const pm = Number(propPmFee) || 0;
            const profit = Math.round(subTotal * (Number(propMargin) / 100));
            const total = subTotal + pm + profit;
            return (
              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16, marginBottom: 20, display: 'flex' }}>
                {[['Subtotal', '$' + subTotal.toLocaleString()], ['PM Fee', '$' + pm.toLocaleString()], ['Profit (' + propMargin + '%)', '$' + profit.toLocaleString()], ['TOTAL', '$' + total.toLocaleString()]].map(([lbl, val], i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < 3 ? `1px solid ${BORDER}` : 'none', padding: '0 8px' }}>
                    <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{lbl}</div>
                    <div style={{ fontSize: i === 3 ? 18 : 14, fontWeight: 700, color: i === 3 ? GOLD : NAV }}>{val}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          {propLineItems.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: NAV, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Line Items</div>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 90px 28px', background: NAV, padding: '6px 10px', gap: 8 }}>
                  {['Description', 'QTY', 'Amount', ''].map(h => <div key={h} style={{ fontSize: 10, fontWeight: 600, color: GOLD }}>{h}</div>)}
                </div>
                {propLineItems.map((li, i) => {
                  const isFirst = i === 0 || propLineItems[i - 1].trade !== li.trade;
                  return (
                    <Fragment key={i}>
                      {isFirst && <div style={{ background: '#F3F0EB', padding: '4px 10px', fontSize: 10, fontWeight: 700, color: NAV, borderTop: `1px solid ${BORDER}` }}>{li.trade}</div>}
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 90px 28px', padding: '4px 10px', gap: 8, borderTop: '1px solid #F3F0EB', alignItems: 'center', background: i % 2 === 0 ? '#fff' : '#FAFAF8' }}>
                        <input value={li.description || ''} onChange={e => { const u = [...propLineItems]; u[i] = { ...u[i], description: e.target.value }; setPropLineItems(u); }} style={{ fontSize: 11, border: 'none', background: 'transparent', color: '#374151', outline: 'none', width: '100%' }} />
                        <input value={li.qty_label || ''} onChange={e => { const u = [...propLineItems]; u[i] = { ...u[i], qty_label: e.target.value }; setPropLineItems(u); }} style={{ fontSize: 11, border: 'none', background: 'transparent', color: '#6B7280', outline: 'none' }} />
                        <input type="number" value={li.amount || ''} onChange={e => { const u = [...propLineItems]; u[i] = { ...u[i], amount: e.target.value }; setPropLineItems(u); }} style={{ fontSize: 11, border: 'none', background: 'transparent', color: NAV, fontWeight: 600, outline: 'none', textAlign: 'right' }} />
                        <button onClick={() => setPropLineItems(propLineItems.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
              <button onClick={() => setPropLineItems([...propLineItems, { trade: 'GENERAL', description: '', qty_label: '1 LS', amount: 0 }])} style={{ fontSize: 11, color: GOLD, background: 'transparent', border: 'none', cursor: 'pointer', marginTop: 6, padding: 0 }}>+ Add line item</button>
            </div>
          )}
          {propOhShit.length > 0 && (
            <div style={{ marginBottom: 20, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
              <button onClick={() => setPropOhShitExpanded(x => !x)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: CREAM, border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: NAV, textTransform: 'uppercase', letterSpacing: 1 }}>Disclosed unknowns ({propOhShit.filter(m => m.included_in_proposal).length} of {propOhShit.length} included)</span>
                <span style={{ fontSize: 12, color: '#6B7280' }}>{propOhShitExpanded ? '▲' : '▼'}</span>
              </button>
              {propOhShitExpanded && (
                <div>
                  {propOhShit.map((m, i) => (
                    <div key={m.id || i} style={{ padding: '10px 12px', borderTop: `1px solid ${BORDER}`, background: m.included_in_proposal ? '#FFFBEB' : '#fff', transition: 'background 0.15s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 2 }}>{m.condition}</div>
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
                          }} style={{ width: 14, height: 14, accentColor: GOLD, cursor: 'pointer' }} />
                          <span style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap' }}>Include in proposal</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: NAV, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Payment Schedule</div>
            {propSchedule.map((ps, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 28px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input className="finp" value={ps.milestone} onChange={e => { const u = [...propSchedule]; u[i] = { ...u[i], milestone: e.target.value }; setPropSchedule(u); }} placeholder="Milestone" />
                <input className="finp" value={ps.timing} onChange={e => { const u = [...propSchedule]; u[i] = { ...u[i], timing: e.target.value }; setPropSchedule(u); }} placeholder="Timing" />
                <input className="finp" type="number" value={ps.amount} onChange={e => { const u = [...propSchedule]; u[i] = { ...u[i], amount: e.target.value }; setPropSchedule(u); }} placeholder="Amount" />
                <button onClick={() => setPropSchedule(propSchedule.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            ))}
            <button onClick={() => setPropSchedule([...propSchedule, { milestone: '', timing: 'At milestone', amount: '' }])} style={{ fontSize: 11, color: GOLD, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>+ Add milestone</button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => generateProposalPDF(true)} disabled={propGenerating || propLineItems.length === 0}>{propGenerating ? 'Generating…' : 'Download PDF'}</button>
            <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => generateProposalPDF(false)} disabled={propGenerating || propLineItems.length === 0}>{propGenerating ? 'Generating…' : 'Save to Documents'}</button>
          </div>
        </Fragment>
      )}
    </div>
  );

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `2px solid ${BORDER}` }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', borderBottom: `2px solid ${sub === t.id ? GOLD : 'transparent'}`,
            marginBottom: -2, color: sub === t.id ? NAV : '#9CA3AF', transition: 'color 0.15s',
          }}>
            {t.lb}
          </button>
        ))}
      </div>

      {sub === 'build'    && renderBuild()}
      {sub === 'scope'    && <ScopeTab job={job} setSub={setSub} />}
      {sub === 'takeoff'  && <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: '#888' }}>Loading…</div>}><TakeoffWizard job={job} setSub={setSub} onAccepted={() => setLineItemsLoaded(false)} /></Suspense>}
      {sub === 'items'    && renderItems()}
      {sub === 'proposal' && renderProposal()}
    </div>
  );
}
