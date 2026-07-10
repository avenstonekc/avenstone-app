import { useState, useEffect, Fragment, lazy, Suspense } from 'react';
import { sb, AV_USER_ID, AV_TENANT, ANON_KEY, AI_ESTIMATOR_URL, sbLoadEstimate, sbSaveEstimate, sbSendEstimateEmail, sbUploadDoc, sbLoadEstimateLineItems, sbLoadOhShitMoments, sbToggleOhShitProposal, sbLoadJobRoomScopes, sbLoadCategoryConfig, sbSetContractFromEstimate, sbGetPricingPolicy, sbSetEstimateApproval, sbLoadBidModelConfig, sbInsertRateBookLabor, sbSeedJobPhases } from '../../../lib/supabase';
import { markLifecyclePhases } from '../../../lib/lifecycle';
import { computeEstimateDeviation } from '../../../lib/deviationGate';
import { sbCommitEstimate } from '../../../lib/commitEstimate';
import { markupRateForCategory } from '../../../lib/markupConfig';
import { Ic, f$, ll, ls } from '../../../lib/utils';
import { buildProposalPDF } from '../../../lib/pdf';
import LineItemModal from './financials/LineItemModal';
import ScopeTab from './ScopeTab';
import StructuredEstimate from './StructuredEstimate';
import GapBatchAsk from './GapBatchAsk';
import { deriveProjectSf } from '../../../lib/deriveProjectSf';

const TakeoffWizard = lazy(() => import('./TakeoffWizard'));

const NAV = 'var(--navy-900)';
const GOLD = 'var(--gold-500)';
const CREAM = 'var(--bg)';
const BORDER = 'var(--border)';

// SCOPE_CAPTURE_ENGINE P1B: final nudge that flips the scope-interview into the
// unchanged pricing path (sent to the API, never shown as a chat bubble).
const PRICING_TRIGGER = 'All scope questions answered — generate the full priced estimate now.';

const SUB_TABS = [
  { id: 'build',    lb: 'Build' },
  { id: 'scope',    lb: 'Scope' },
  { id: 'takeoff',  lb: 'Takeoff' },
  { id: 'items',    lb: 'Line items' },
  { id: 'proposal', lb: 'Proposal' },
];

export default function EstimateTab({ job, photos, docs, setDocs, profile, upd }) {
  const [sub, setSub] = useState('build');

  // ── AI Estimator state ──────────────────────────────────────────────────────
  const [estMessages, setEstMessages] = useState([]);
  const [estInput, setEstInput] = useState('');
  const [estLoading, setEstLoading] = useState(false);
  const [estStarted, setEstStarted] = useState(false);
  const [estForm, setEstForm] = useState({ scope: '', rooms: '', special: '' });
  const [sessionPrefill, setSessionPrefill] = useState(null); // P1A: set when drafted from a consultation session
  const [estimateScopeOrigin, setEstimateScopeOrigin] = useState(null); // persisted scope_origin from job_estimates
  const [estFile, setEstFile] = useState(null);
  const [estFileName, setEstFileName] = useState('');
  const [estSaving, setEstSaving] = useState(false);
  const [estSendingClient, setEstSendingClient] = useState(false);
  const [estSaveMsg, setEstSaveMsg] = useState('');
  const [estCommitting, setEstCommitting] = useState(false);
  const [estCommitMsg, setEstCommitMsg] = useState('');
  const [pricedScope, setPricedScope] = useState(null); // 3c: priced lines from 3b-2 engine
  const [showRaw, setShowRaw]         = useState(false); // toggle raw chat when FACE is present

  // Interview pricing inputs — seeded from job overrides then bid_model_config tenant defaults
  // Precedence: job.default_markup_pct > job.labor_markup_pct > bid_model_config 'default'
  const [interviewSf, setInterviewSf]               = useState('');
  const [interviewSfSource, setInterviewSfSource]   = useState(null); // 'scope'|'job'|'none'|null
  const [interviewSfRoomCount, setInterviewSfRoomCount] = useState(0);
  const [interviewTier, setInterviewTier]           = useState('mid');
  const [interviewMarkup, setInterviewMarkup]       = useState(() =>
    String(Number(job.default_markup_pct) > 0 ? Number(job.default_markup_pct)
      : Number(job.labor_markup_pct) > 0 ? Number(job.labor_markup_pct)
      : 0)); // seed from bid_model_config via useEffect; 0 until config loads
  const [interviewPmFee, setInterviewPmFee]         = useState(String(Number(job.pm_fee) || 0)); // seed from bid_model_config via useEffect if job.pm_fee unset
  const [configMissing, setConfigMissing]           = useState(false); // true when bid_model_config 'default' row absent

  // Gap batch-ask: keyed by gap_key → entered rate string (pre-filled from regional_rate)
  const [gapRates, setGapRates] = useState({});
  // B2.3 learn loop: labor gaps the rep just applied — offered for Rate Book save
  const [learnCandidates, setLearnCandidates] = useState([]);
  const [learnSaveState, setLearnSaveState] = useState(''); // '' | 'saving' | 'saved' | 'error'

  // SCOPE_CAPTURE_ENGINE P1B: scope-interview-before-pricing state.
  const [scopeProjectType, setScopeProjectType]           = useState(null);  // e.g. 'bathroom', from job_room_scopes
  const [scopeInterviewActive, setScopeInterviewActive]   = useState(false); // gathering scope (upstream of pricing)
  const [scopeComplete, setScopeComplete]                 = useState(false); // interview satisfied → run pricing
  const [forceDraftedIncomplete, setForceDraftedIncomplete] = useState(false); // rep forced a draft past open questions
  const [knownProjectTypes, setKnownProjectTypes]         = useState([]); // distinct project_types seeded in scope_checklists

  // ── Line items state ────────────────────────────────────────────────────────
  const [lineItems, setLineItems] = useState([]);
  const [lineItemsLoaded, setLineItemsLoaded] = useState(false);
  const [showLineItemModal, setShowLineItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [categoryConfig, setCategoryConfig] = useState(null);
  const [acceptingEstimate, setAcceptingEstimate] = useState(false);
  const [acceptMsg, setAcceptMsg] = useState('');

  // ── Proposal state ──────────────────────────────────────────────────────────
  const [propLoading, setPropLoading] = useState(false);
  const [propLineItems, setPropLineItems] = useState([]);
  const [propPmFee, setPropPmFee] = useState(job.pm_fee ?? 0);
  const [propNum, setPropNum] = useState('001');
  const [propSchedule, setPropSchedule] = useState([]);
  const [propErr, setPropErr] = useState('');
  const [propGenerating, setPropGenerating] = useState(false);
  const [propOhShit, setPropOhShit] = useState([]);
  const [propOhShitExpanded, setPropOhShitExpanded] = useState(false);
  const [propReady, setPropReady] = useState(false);

  // B1.6: seed markup and pm_fee from bid_model_config tenant default.
  // Fires on mount; only overwrites if the job-level values aren't already set.
  // B2.1: sets configMissing=true when the 'default' row is absent so the rep
  // sees a visible warning rather than a misleading 0% / $0 pre-fill.
  useEffect(() => {
    sbLoadBidModelConfig(job.tenant_id || AV_TENANT).then(result => {
      if (!result.ok) {
        setConfigMissing(true); // edge fn will also fail-loud when generate fires
        return;
      }
      setConfigMissing(false);
      const { markup_pct: cfgMarkup, pm_fee: cfgPmFee } = result.data;
      setInterviewMarkup(prev => {
        if (Number(prev) > 0) return prev; // job-level override already in place
        return String(cfgMarkup);
      });
      setInterviewPmFee(prev => {
        if (Number(prev) > 0) return prev; // job-level override already in place
        return String(cfgPmFee);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  // Default tab: items (if line items exist) → scope (if scope rows exist) → build
  useEffect(() => {
    Promise.all([
      sbLoadEstimateLineItems(job.id),
      sbLoadJobRoomScopes(job.id),
      sbLoadCategoryConfig(job.tenant_id || AV_TENANT),
    ]).then(([items, scopes, cfg]) => {
      // SCOPE_CAPTURE_ENGINE P1B: derive project_type from scoped room types.
      // Prefer 'bathroom' (the seeded/tested type); else first room_type; else null
      // (null → no interview, existing one-shot flow). ai-estimator returns
      // scope_complete:true for any project_type with no seeded checklist.
      const roomTypes = [...new Set((scopes || []).map(s => (s.room_type || '').toLowerCase()).filter(Boolean))];
      setScopeProjectType(roomTypes.includes('bathroom') ? 'bathroom' : (roomTypes[0] || null));
      if (items?.length) {
        setLineItems(items);
        setLineItemsLoaded(true);
        setSub('items');
      } else {
        // P1A: a consultation session may have drafted a prefill (scope/rooms/special).
        // Apply it only when no estimate exists yet — feeds the interview, doesn't clobber.
        const prefill = ll(`av_estimate_prefill_${job.id}`, null);
        if (prefill) {
          setEstForm({ scope: prefill.scope || '', rooms: prefill.rooms || '', special: prefill.special || '' });
          setSessionPrefill(prefill);
          ls(`av_estimate_prefill_${job.id}`, null); // one-shot — clear after applying
          setSub('build');
        } else if (scopes?.length) {
          setSub('scope');
        } else {
          setSub('build');
        }
      }
      if (cfg) setCategoryConfig(cfg);
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

  // Auto-init proposal when navigating there with line items ready
  useEffect(() => {
    if (sub === 'proposal' && lineItems.length > 0 && !propReady && !propLoading) {
      openProposal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, lineItems.length]);

  // Recompute payment schedule whenever PM fee or line item amounts change
  useEffect(() => {
    if (!propReady || !propLineItems.length) return;
    const clientTotal = propLineItems.reduce((s, li) => s + Number(li.amount || 0), 0);
    const grand = clientTotal + Number(propPmFee || 0);
    const dep = Math.round(grand * 0.15);
    const mid = Math.min(5000, Math.round(grand * 0.35));
    const bal = Math.max(0, grand - dep - mid);
    setPropSchedule([
      { milestone: 'Deposit — Contract Signing', timing: 'Due at signing', amount: dep },
      { milestone: 'Draw 1 — Rough-In Complete', timing: 'Upon rough-in approval', amount: mid },
      { milestone: 'Final Payment — Project Complete', timing: 'Upon completion', amount: bal },
    ]);
  }, [propPmFee, propLineItems, propReady]);

  // Load estimator history on mount
  useEffect(() => {
    sbLoadEstimate(job.id).then(saved => {
      if (saved?.scope_origin) setEstimateScopeOrigin(saved.scope_origin);
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
        special: [measureDoc ? '✓ Field measurements saved' : '', transcriptDoc ? '✓ Consultation notes saved' : ''].filter(Boolean).join(' · '),
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  // Derive project SF from scoped rooms on mount. P2: a completed consultation session
  // may carry an on-site measured SF — that takes precedence over scan derivation. Read
  // the prefill synchronously here (before the default-tab effect's async .then clears it).
  useEffect(() => {
    const pf = ll(`av_estimate_prefill_${job.id}`, null);
    const sessionSf = pf && Number(pf.sf) > 0 ? Number(pf.sf) : 0;
    deriveProjectSf(sb, job.id, job).then(({ sf, source, roomCount }) => {
      setInterviewSfRoomCount(roomCount || 0);
      if (sessionSf > 0) { setInterviewSf(String(sessionSf)); setInterviewSfSource('session'); return; }
      setInterviewSfSource(source);
      if (sf > 0) setInterviewSf(String(sf));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  // Seed gapRates from pricedScope when a new draft arrives.
  // Only initializes NEW gap_keys — preserves any edits the rep already typed.
  useEffect(() => {
    if (!pricedScope?.length) { setGapRates({}); return; }
    const gaps = pricedScope.filter(l => l.source_label === 'regional_avg' && l.gap_key);
    if (!gaps.length) return;
    setGapRates(prev => {
      const next = { ...prev };
      gaps.forEach(l => {
        if (!(l.gap_key in next)) next[l.gap_key] = l.regional_rate != null ? String(l.regional_rate) : '';
      });
      return next;
    });
  }, [pricedScope]);

  // SCOPE_CAPTURE_ENGINE P1B: when scope completes (or is force-drafted), run the
  // EXISTING pricing path over the confirmed conversation. Effect → fresh estMessages.
  useEffect(() => {
    if (scopeComplete && estStarted && !pricedScope?.length && !estLoading) {
      runPricing();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeComplete]);

  // SCOPE_CAPTURE_ENGINE P1B-fallback: load the seeded project_types so the typed
  // Rooms/Areas field can be matched against what actually exists (no hardcoded list
  // that drifts). Platform defaults (tenant_id NULL) + this tenant's overrides.
  useEffect(() => {
    const tid = job.tenant_id || AV_TENANT;
    sb.from('scope_checklists').select('project_type').eq('active', true)
      .or(`tenant_id.is.null,tenant_id.eq.${tid}`)
      .then(({ data }) => {
        const types = [...new Set((data || []).map(r => (r.project_type || '').toLowerCase()).filter(Boolean))];
        setKnownProjectTypes(types);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const readFileAsBase64 = file => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  // Run the UNCHANGED pricing path with the current conversation + a final user nudge.
  // Fired by the [scopeComplete] effect once the scope interview is satisfied/forced.
  // The conversation already carries the confirmed scope answers, so the priced draft
  // reflects them. The PRICING_TRIGGER is sent to the API but not shown as a bubble.
  const runPricing = async () => {
    setEstLoading(true);
    const apiMessages = [
      ...estMessages.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: PRICING_TRIGGER },
    ];
    let reply;
    try {
      const res = await fetch(AI_ESTIMATOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ messages: apiMessages, tenant_id: AV_TENANT, project_sf: Number(interviewSf) || 0, finish_tier: interviewTier, markup_pct: Number(interviewMarkup) || 0, pm_fee: Number(interviewPmFee) || 0, financial_model: job.financial_model || 'fixed_bid' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        reply = `Sorry, something went wrong: ${data.error || `HTTP ${res.status}`}`;
      } else {
        reply = data.content || 'Sorry, something went wrong. Please try again.';
        if (data.priced_scope?.length) setPricedScope(data.priced_scope); // 3c
      }
    } catch (e) {
      console.error('ai-estimator pricing error:', e);
      reply = `Sorry, something went wrong: ${e.message || 'network error'}`;
    }
    const finalDisplay = [...estMessages, { role: 'assistant', content: reply }];
    setEstMessages(finalDisplay);
    setEstLoading(false);
    sbSaveEstimate(job.id, finalDisplay, forceDraftedIncomplete ? 'incomplete' : (sessionPrefill ? 'session' : undefined));
  };

  const sendEstimatorMessage = async (msgOverride, fileOverride, modeOverride) => {
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
    // Strip UI-only metadata fields before sending — _hasFile/_fileName are display state only
    const apiMessages = newMessages.map(({ role, content }) => ({ role, content }));
    // Route to scope-interview mode while an interview is active and not yet complete.
    const mode = modeOverride || (scopeInterviewActive && !scopeComplete ? 'scope_interview' : undefined);
    let reply;
    let completedNow = false;
    try {
      const res = await fetch(AI_ESTIMATOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          messages: apiMessages, tenant_id: AV_TENANT, project_sf: Number(interviewSf) || 0,
          finish_tier: interviewTier, markup_pct: Number(interviewMarkup) || 0, pm_fee: Number(interviewPmFee) || 0,
          financial_model: job.financial_model || 'fixed_bid',
          ...(mode === 'scope_interview' ? {
            mode: 'scope_interview',
            project_type: resolveProjectType(),
            // P2: forward on-site captured fields so the interview skips them.
            ...(sessionPrefill?.measuredFields && Object.keys(sessionPrefill.measuredFields).length
              ? { prefilled_answers: sessionPrefill.measuredFields } : {}),
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const detail = data.error || `HTTP ${res.status}`;
        console.error('ai-estimator error:', detail, data);
        reply = `Sorry, something went wrong: ${detail}`;
      } else if (mode === 'scope_interview') {
        // Upstream of pricing: render the batched questions; flag completion for the effect.
        reply = data.content || 'Let me get a few scope details.';
        if (data.scope_complete) completedNow = true;
      } else {
        reply = data.content || 'Sorry, something went wrong. Please try again.';
        if (data.priced_scope?.length) setPricedScope(data.priced_scope); // 3c
      }
    } catch (e) {
      console.error('ai-estimator fetch/parse error:', e);
      reply = `Sorry, something went wrong: ${e.message || 'network error'}`;
    }
    const finalDisplay = [...displayMessages, { role: 'assistant', content: reply }];
    setEstMessages(finalDisplay);
    setEstLoading(false);
    // scope_origin: 'incomplete' when force-drafted; else 'session' on a prefilled
    // estimate; else undefined (upsert preserves the existing value).
    sbSaveEstimate(job.id, finalDisplay, forceDraftedIncomplete ? 'incomplete' : (sessionPrefill ? 'session' : undefined));
    // Scope just completed → leave interview; the [scopeComplete] effect runs pricing.
    if (completedNow) { setScopeComplete(true); setScopeInterviewActive(false); }
  };

  // Resolve project_type for the scope interview. Order (blueprint / dispatch):
  // explicit typed Rooms/Areas field → job_room_scopes derivation → none (one-shot).
  // The typed field is matched against the live seeded project_types, never a hardcoded
  // list. This is what makes the interview fire on a typed-from-scratch bathroom job.
  const resolveProjectType = () => {
    const rooms = (estForm.rooms || '').toLowerCase();
    const typed = rooms.trim() ? (knownProjectTypes.find(pt => pt && rooms.includes(pt)) || null) : null;
    return typed || scopeProjectType || null;
  };

  const startEstimate = async () => {
    if (!estForm.scope.trim()) return;
    setEstStarted(true);
    const prompt = `Generate a detailed estimate for the following project:\n\nJob Address: ${job.address}\nScope of Work: ${estForm.scope}\n${estForm.rooms ? `Rooms: ${estForm.rooms}\n` : ''}${interviewSf ? `Square Footage: ${interviewSf} sqft\n` : ''}${estForm.special ? `Special Notes: ${estForm.special}\n` : ''}`;
    if (resolveProjectType()) {
      // SCOPE_CAPTURE_ENGINE P1B: gather scope (checklist + trigger modules) BEFORE pricing.
      setScopeInterviewActive(true);
      setScopeComplete(false);
      setForceDraftedIncomplete(false);
      await sendEstimatorMessage(prompt, estFile || null, 'scope_interview');
    } else {
      await sendEstimatorMessage(prompt, estFile || null);
    }
  };

  // Soft gate (blueprint Decision C / Kalin fork 3): the rep may force a draft past open
  // scope questions. The estimate is marked scope_origin='incomplete' so the approval gate
  // can flag it; the [scopeComplete] effect then runs the unchanged pricing path.
  const forceDraftAnyway = () => {
    if (estLoading) return;
    setForceDraftedIncomplete(true);
    setScopeInterviewActive(false);
    setScopeComplete(true);
  };

  // Apply entered gap rates to pricedScope in memory. Deterministic — no AI call.
  // Filled gaps become source_label:'user_entered' (StructuredEstimate badges ✎ "You set").
  // Blank/zero entries stay regional_avg/TBD — committing with unset gaps is allowed.
  const applyGapRates = () => {
    if (!pricedScope) return;
    const candidates = [];
    const mutated = pricedScope.map(line => {
      if (line.source_label !== 'regional_avg' || !line.gap_key) return line;
      const entered = gapRates[line.gap_key];
      const rate = parseFloat(entered);
      if (!entered || isNaN(rate) || rate <= 0) return line; // leave as TBD
      // S7 provenance — derived from the entered value vs the cited KC anchor.
      // No anchor → rep_entered. Anchor + same number (numeric) → accepted. Else → override.
      const anchor = line.regional_rate;
      const rate_provenance = (anchor == null)
        ? 'rep_entered'
        : (Math.abs(rate - Number(anchor)) < 0.005 ? 'rep_accepted_anchor' : 'rep_override');
      // B2.3 learn hook — collect filled labor gaps for the save offer (no persist here).
      // S8: carry the provenance tag so the rate_book write records how the rate was set.
      if (line.category === 'labor') {
        candidates.push({ gap_key: line.gap_key, trade: line.trade, line_item: line.line_item, unit: line.unit, rate, source: rate_provenance });
      }
      // source_label stays 'user_entered' for the pricing/badge layer (unchanged readers);
      // rate_provenance is the new carrier that survives to commit (S9).
      return { ...line, unit_price: rate, amount: Math.round(rate * line.quantity * 100) / 100, source_label: 'user_entered', rate_provenance };
    });
    setPricedScope(mutated);
    setLearnCandidates(candidates);
    setLearnSaveState('');
  };

  // B2.3: save learnCandidates (labor gaps the rep just applied) to rate_book_labor.
  // Rep explicitly opts in — never fired automatically.
  const saveLearnedRates = async () => {
    if (!learnCandidates.length) return;
    setLearnSaveState('saving');
    let allOk = true;
    for (const c of learnCandidates) {
      // S8: write the real provenance ('rep_accepted_anchor' | 'rep_override' | 'rep_entered')
      // per gap. Both accept and override fatten the book (locked); owner vet-promotion
      // (source → 'owner_vetted') stays a separate, later action.
      const res = await sbInsertRateBookLabor({ trade: c.trade, line_item: c.line_item, unit: c.unit, rate: c.rate, source: c.source });
      if (!res.ok) allOk = false;
    }
    setLearnSaveState(allOk ? 'saved' : 'error');
  };

  const commitEstimateFromChat = async () => {
    if (!estMessages.some(m => m.role === 'assistant')) return;
    setEstCommitting(true);
    setEstCommitMsg('');
    try {
      // ── 3c: priced_scope path — use pricing engine output directly ─────────────
      // Avoids a second AI call; preserves exact qty/unit/unit_cost/source_label.
      if (pricedScope?.length) {
        const resolveCategory = line =>
          line.category === 'materials' ? 'materials'
          : (line.category === 'general' && line.line_item === 'permit') ? 'permit'
          : 'labor';
        const items = pricedScope.map(line => ({
          source: 'ai',
          trade: line.trade || 'GENERAL',
          category: resolveCategory(line),
          description: line.description,
          quantity: line.quantity,
          unit: line.unit || 'LS',
          unit_cost: line.unit_price ?? 0,
          multiplier: 1.0,
          notes: String(line.quantity) + ' ' + line.unit,
          source_label: line.source_label,
        }));
        const result = await sbCommitEstimate(sb, AV_TENANT, AV_USER_ID, {
          source: 'ai', jobId: job.id, estimateId: null, items,
        });
        if (!result.ok) {
          setEstCommitMsg(`Commit failed: ${result.error}`);
          setEstCommitting(false);
          return;
        }
        const refreshed = await sbLoadEstimateLineItems(job.id);
        setLineItems(refreshed || []);
        setLineItemsLoaded(true);
        setEstCommitMsg(`${result.data.inserted_count} line items committed`);
        setTimeout(() => setEstCommitMsg(''), 6000);
        setEstCommitting(false);
        return;
      }
      // ── Fallback: EXTRACT_JSON_FOR_PROPOSAL (pre-3b-2 conversations) ──────────
      // Sanitize history (same pattern as send — strip UI-only fields)
      const apiMessages = estMessages.map(({ role, content }) => ({ role, content }));
      // Append the extraction trigger as a user turn
      const extractMessages = [...apiMessages, { role: 'user', content: 'EXTRACT_JSON_FOR_PROPOSAL' }];
      const res = await fetch(AI_ESTIMATOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ messages: extractMessages, tenant_id: AV_TENANT, project_sf: Number(interviewSf) || 0, finish_tier: interviewTier, markup_pct: Number(interviewMarkup) || 0, pm_fee: Number(interviewPmFee) || 0, financial_model: job.financial_model || 'fixed_bid' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const detail = data.error || `HTTP ${res.status}`;
        console.error('ai-estimator extract error:', detail, data);
        setEstCommitMsg(`Extraction failed: ${detail}`);
        setEstCommitting(false);
        return;
      }
      if (data.truncated) {
        console.error('ai-estimator: extraction response was truncated (max_tokens hit)');
        setEstCommitMsg('Estimate too large to commit automatically — please split or shorten.');
        setEstCommitting(false);
        return;
      }
      let parsed;
      try {
        const clean = data.content.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
        const s = clean.indexOf('{'); const e = clean.lastIndexOf('}');
        const jsonStr = (s !== -1 && e !== -1) ? clean.slice(s, e + 1) : clean;
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        console.error('ai-estimator: JSON parse failed on extraction response:', e, data.content);
        setEstCommitMsg('Could not parse extraction response — try again.');
        setEstCommitting(false);
        return;
      }
      const rawItems = parsed.line_items || [];
      if (!rawItems.length) {
        setEstCommitMsg('Extraction returned no line items — try again.');
        setEstCommitting(false);
        return;
      }
      // Map extraction shape → NormalizedEstimateInput.
      // AI returns qty_label (string) + amount (lump total). No unit_cost decomposition
      // is possible without the quantity and unit parsed out, so we commit each line as
      // quantity=1 / unit='LS' / unit_cost=amount. qty_label is preserved in notes.
      const items = rawItems.map(li => ({
        source: 'ai',
        trade: li.trade || 'GENERAL',
        category: li.category || (/material|allowance/i.test(li.description) ? 'materials' : 'labor'),
        description: li.description || '',
        quantity: 1,
        unit: 'LS',
        unit_cost: Number(li.amount) || 0,
        multiplier: 1.0,
        notes: li.qty_label || null,
      }));
      const result = await sbCommitEstimate(sb, AV_TENANT, AV_USER_ID, {
        source: 'ai',
        jobId: job.id,
        estimateId: null,
        items,
      });
      if (!result.ok) {
        console.error('sbCommitEstimate failed:', result.error);
        setEstCommitMsg(`Commit failed: ${result.error}`);
        setEstCommitting(false);
        return;
      }
      const refreshed = await sbLoadEstimateLineItems(job.id);
      setLineItems(refreshed || []);
      setLineItemsLoaded(true);
      setEstCommitMsg(`${result.data.inserted_count} line items committed`);
      setTimeout(() => setEstCommitMsg(''), 6000);
    } catch (e) {
      console.error('commitEstimateFromChat error:', e);
      setEstCommitMsg('Commit failed — try again.');
    }
    setEstCommitting(false);
  };

  const _buildProposalDoc = () => {
    const lp = Number(job.labor_markup_pct || 0);
    const mp = Number(job.material_markup_pct || 0);
    const lastAI = estMessages.filter(m => m.role === 'assistant').pop();
    const flags = lastAI
      ? (lastAI.content.match(/\[FLAG:[^\]]+\]/g) || []).map(f => f.replace(/^\[FLAG:\s*/, '').replace(/\]$/, ''))
      : [];
    return buildProposalPDF(job, lineItems, propOhShit, {
      laborPct: lp, materialPct: mp, categoryConfig,
      pmFee: Number(propPmFee || 0), proposalNum: propNum, schedule: propSchedule, flags,
    });
  };

  const saveEstimatePDF = async () => {
    if (!lineItems.length) { setEstSaveMsg('No line items — run the estimator first'); return; }
    setEstSaving(true); setEstSaveMsg('');
    try {
      const blob = _buildProposalDoc().output('blob');
      const file = new File([blob], `Proposal — ${job.address}.pdf`, { type: 'application/pdf' });
      const r = await sbUploadDoc(job.id, file, 'proposal');
      if (r.doc && setDocs) setDocs(p => [r.doc, ...p]);
      setEstSaveMsg(r.doc ? 'Saved to Documents' : 'Save failed — try again');
    } catch (e) { setEstSaveMsg('Save failed — try again'); }
    setEstSaving(false); setTimeout(() => setEstSaveMsg(''), 3000);
  };

  const sendEstimateToClient = async () => {
    if (!job.client_email) { setEstSaveMsg('No client email on this job'); return; }
    if (!lineItems.length) { setEstSaveMsg('No line items — run the estimator first'); return; }
    const isManager = profile?.role === 'owner' || profile?.role === 'project_manager';
    setEstSendingClient(true); setEstSaveMsg('');
    try {
      if (!isManager) {
        const policy = await sbGetPricingPolicy(AV_TENANT);
        const dev = await computeEstimateDeviation(sb, AV_TENANT, lineItems, policy);
        if (dev.gated) {
          await sbSetEstimateApproval(job.id, 'awaiting_approval', {
            gatedLines: dev.gatedLines,
            requested_by: AV_USER_ID,
            at: new Date().toISOString(),
          });
          setEstSaveMsg(`Sent for manager approval — ${dev.gatedLines.length} line(s) below margin band`);
          setEstSendingClient(false);
          return;
        }
      }
      // not gated (or manager) → existing send path unchanged
      const blob = _buildProposalDoc().output('blob');
      await sbSendEstimateEmail(job, blob);
      const file = new File([blob], `Proposal — ${job.address}.pdf`, { type: 'application/pdf' });
      await sbUploadDoc(job.id, file, 'proposal');
      // Model B Phase 2 — proposal SENT: Lead complete + Proposal in_progress. Only on the
      // real send path (the gated-approval branch above returns early). Never block the send.
      await sbSeedJobPhases(job.id, AV_TENANT);
      const _adv = await markLifecyclePhases(sb, AV_TENANT, job.id, 'proposal_sent', AV_USER_ID);
      if (!_adv.ok) console.error('proposal_sent phase advance failed —', _adv.error);
      setEstSaveMsg(`Sent to ${job.client_email}`);
    } catch (e) { setEstSaveMsg('Send failed — try again'); }
    setEstSendingClient(false); setTimeout(() => setEstSaveMsg(''), 4000);
  };

  const openProposal = async () => {
    setSub('proposal');
    if (propReady) return;
    if (!lineItems.length) {
      setPropErr('Commit to Line Items first — run the estimator, then click Commit to Line Items.');
      return;
    }
    setPropLoading(true); setPropErr('');
    try {
      const moments = await sbLoadOhShitMoments(job.id);
      setPropOhShit(moments);
      if (moments.length) setPropOhShitExpanded(true);
      setPropNum(`${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`);

      // Populate preview list from DB rows — map to {trade, description, qty_label, amount (client price), category}
      const lp = Number(job.labor_markup_pct || 0);
      const mp = Number(job.material_markup_pct || 0);
      const previewItems = lineItems.map(li => {
        const cost = Number(li.total_cost ?? 0);
        const rate = markupRateForCategory(li.category, { laborPct: lp, materialPct: mp, categoryConfig });
        return {
          id:          li.id,
          trade:       li.trade || 'GENERAL',
          description: li.description || '',
          qty_label:   [li.quantity != null ? String(li.quantity) : '1', li.unit || ''].filter(Boolean).join(' '),
          amount:      Math.round(cost * (1 + rate / 100)),
          category:    li.category,
        };
      });
      setPropLineItems(previewItems);
      setPropReady(true); // schedule derives from propLineItems + propPmFee via useEffect
    } catch (e) { setPropErr(e.message || 'Failed to load proposal data'); }
    setPropLoading(false);
  };

  const generateProposalPDF = async (download = true) => {
    setPropGenerating(true);
    try {
      const lp = Number(job.labor_markup_pct || 0);
      const mp = Number(job.material_markup_pct || 0);
      // Extract AI assumption flags from the narrative (if available) as styled callouts
      const lastAI = estMessages.filter(m => m.role === 'assistant').pop();
      const flags = lastAI
        ? (lastAI.content.match(/\[FLAG:[^\]]+\]/g) || []).map(f => f.replace(/^\[FLAG:\s*/, '').replace(/\]$/, ''))
        : [];
      const doc = buildProposalPDF(job, lineItems, propOhShit, {
        laborPct:       lp,
        materialPct:    mp,
        categoryConfig,
        pmFee:          Number(propPmFee || 0),
        proposalNum:    propNum,
        schedule:       propSchedule,
        flags,
      });
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

  const reloadLineItems = async () => {
    const items = await sbLoadEstimateLineItems(job.id);
    setLineItems(items || []);
  };

  const handleAcceptEstimate = async () => {
    if (!lineItems.length) return;
    if (job.contract_value && job.contract_value > 0) {
      if (!window.confirm(`This job already has a contract value of $${Number(job.contract_value).toLocaleString()}. Replace it with the estimate total?`)) return;
    }
    setAcceptingEstimate(true); setAcceptMsg('');
    // Step 1c — freeze the rep's payment schedule into the contract snapshot. propSchedule
    // is only populated once the Proposal sub-tab has computed/edited it; if empty, the
    // helper omits the key and the contract PDF falls back to legal clause 3.
    const result = await sbSetContractFromEstimate(job.id, propSchedule);
    if (result.ok) {
      // Model B Phase 2 — estimate ACCEPTED: Lead+Proposal complete, Contract in_progress.
      // Never block the accept — it already succeeded above.
      await sbSeedJobPhases(job.id, AV_TENANT);
      const _adv = await markLifecyclePhases(sb, AV_TENANT, job.id, 'estimate_accepted', AV_USER_ID);
      if (!_adv.ok) console.error('estimate_accepted phase advance failed —', _adv.error);
      setAcceptMsg(`Contract set to $${Number(result.data.contract_total).toLocaleString()}`);
      setTimeout(() => setAcceptMsg(''), 5000);
    } else {
      setAcceptMsg(`Error: ${result.error}`);
    }
    setAcceptingEstimate(false);
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
          {sessionPrefill && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#1E40AF', lineHeight: 1.5 }}>
              📋 <strong>Drafted from a consultation session{sessionPrefill.sessionDate ? ` (${new Date(sessionPrefill.sessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''}.</strong> The scope, rooms, and notes below are prefilled from the on-site capture — review them, then <strong>Generate</strong> to run the Rate Book estimate over them. Prefilled assumptions get confirmed in the estimate, not taken as settled.
            </div>
          )}
          <div className="fg"><label className="flbl"><span className="freq">*</span>Scope of Work</label><textarea className="finp fta" rows={3} value={estForm.scope} onChange={e => setEstForm(p => ({ ...p, scope: e.target.value }))} placeholder="e.g. Full kitchen remodel — demo existing, new cabinets, countertops, flooring, electrical updates, plumbing relocation" /></div>
          <div className="fg"><label className="flbl">Rooms / Areas</label><input className="finp" value={estForm.rooms} onChange={e => setEstForm(p => ({ ...p, rooms: e.target.value }))} placeholder="e.g. Kitchen, Master Bath, Living Room" />
            {resolveProjectType() && (
              <div style={{ fontSize: 11, color: 'var(--green-text)', marginTop: 4 }}>
                ✓ {resolveProjectType()} — scope interview on (I'll confirm the scope before pricing)
              </div>
            )}
          </div>

          {/* ── Pricing interview ─────────────────────────────────────────────── */}
          <div className="fg">
            <label className="flbl">Project Square Footage <span style={{ color: 'var(--red-text)', fontWeight: 400 }}>*</span></label>
            {interviewSfSource === 'session' && (
              <div style={{ fontSize: 12, color: 'var(--green-text)', marginBottom: 6 }}>
                ✓ {interviewSf} SF measured on-site — confirm or override below
              </div>
            )}
            {interviewSfSource === 'scope' && (
              <div style={{ fontSize: 12, color: 'var(--green-text)', marginBottom: 6 }}>
                ✓ Pricing this as a {interviewSf} SF job (summed from {interviewSfRoomCount} scoped room{interviewSfRoomCount !== 1 ? 's' : ''})
              </div>
            )}
            {interviewSfSource === 'job' && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                {interviewSf} SF (from job record) — confirm or override below
              </div>
            )}
            {interviewSfSource === 'none' && (
              <div style={{ fontSize: 12, color: 'var(--amber-text)', marginBottom: 6 }}>
                No SF on file — I need the project square footage to price this.
              </div>
            )}
            <input
              className="finp"
              type="number"
              min="1"
              value={interviewSf}
              onChange={e => setInterviewSf(e.target.value)}
              placeholder="e.g. 1200"
              style={{ fontSize: 16 }}
            />
            {(!interviewSf || Number(interviewSf) <= 0) && (
              <div style={{ fontSize: 11, color: 'var(--amber-text)', marginTop: 4 }}>
                Square footage required to price the estimate.
              </div>
            )}
          </div>

          <div className="fg">
            <label className="flbl">Finish Tier</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['low', 'Budget'], ['mid', 'Mid-grade'], ['high', 'Premium']].map(([val, lb]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setInterviewTier(val)}
                  style={{
                    flex: 1, minHeight: 36, padding: '6px 0',
                    fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                    border: `1.5px solid ${interviewTier === val ? 'var(--navy-900)' : 'var(--border)'}`,
                    background: interviewTier === val ? 'var(--navy-900)' : 'transparent',
                    color: interviewTier === val ? 'var(--gold-500)' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                >{lb}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4 }}>Sets material pricing tier.</div>
          </div>

          {configMissing && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#92400E' }}>
              ⚠ Markup config not set — go to Settings → Bid Config to add a default row, or enter markup and PM fee manually below.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="fg">
              <label className="flbl">Markup %</label>
              <input className="finp" type="number" min="0" step="0.5" value={interviewMarkup} onChange={e => setInterviewMarkup(e.target.value)} placeholder="e.g. 30" style={{ fontSize: 16 }} />
              {!configMissing && job.financial_model !== 'flip' && (
                <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4 }}>Your standard rate — edit if this job differs.</div>
              )}
            </div>
            <div className="fg">
              <label className="flbl">PM Fee</label>
              <input className="finp" type="number" min="0" value={interviewPmFee} onChange={e => setInterviewPmFee(e.target.value)} placeholder="e.g. 1200" style={{ fontSize: 16 }} />
              {!configMissing && (
                <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4 }}>{f$(Number(interviewPmFee) || 0)} — confirm or change.</div>
              )}
            </div>
          </div>
          {/* ────────────────────────────────────────────────────────────────────── */}

          <div className="fg"><label className="flbl">Special Notes</label><textarea className="finp fta" rows={2} value={estForm.special} onChange={e => setEstForm(p => ({ ...p, special: e.target.value }))} placeholder="High-end finishes, specific products, client requests, existing conditions…" /></div>
          <div className="fg">
            <label className="flbl">Floor Plan / Photos <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>(optional — PDF or image)</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: CREAM, border: `1px dashed ${GOLD}`, borderRadius: 4, padding: '10px 14px', cursor: 'pointer' }}>
              <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setEstFile(f); setEstFileName(f.name); } }} />
              <span style={{ width: 16, height: 16, color: GOLD }}>{Ic.plus}</span>
              <span style={{ fontSize: 13, color: estFileName ? NAV : 'var(--text-subtle)' }}>{estFileName || 'Attach floor plan or photo'}</span>
              {estFileName && <button onClick={e => { e.preventDefault(); setEstFile(null); setEstFileName(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 16 }}>×</button>}
            </label>
          </div>
          {(() => { const canGen = !!(estForm.scope.trim() && Number(interviewSf) > 0); return (
          <button className={`btn ${canGen ? 'btn-navy' : 'btn-ghost'}`} style={{ width: '100%' }} onClick={startEstimate} disabled={!canGen || estLoading}>
            {estLoading ? 'Generating…' : 'Generate Estimate'}
          </button>
          ); })()}
        </div>
      )}
      {estStarted && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {(estimateScopeOrigin === 'session' || (sessionPrefill && !estimateScopeOrigin)) && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', fontWeight: 600, letterSpacing: 0.2 }}>
                📋 Session-sourced
              </span>
            )}
            {estSaveMsg && <span style={{ fontSize: 11, color: 'var(--green-dot)', fontWeight: 600 }}>{estSaveMsg}</span>}
            {estCommitMsg && <span style={{ fontSize: 11, color: lineItems.length > 0 ? 'var(--green-dot)' : 'var(--red-text)', fontWeight: 600 }}>{estCommitMsg}</span>}
            {estMessages.some(m => m.role === 'assistant') && !scopeInterviewActive && (
              <button className="btn btn-navy" style={{ fontSize: 11 }} onClick={commitEstimateFromChat} disabled={estCommitting}>
                {estCommitting ? 'Committing…' : 'Commit to Line Items'}
              </button>
            )}
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={saveEstimatePDF} disabled={estSaving || lineItems.length === 0}>{estSaving ? 'Saving…' : 'Save PDF'}</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={sendEstimateToClient} disabled={estSendingClient}>{estSendingClient ? 'Sending…' : 'Send to Client'}</button>
            <button className="btn btn-gold" style={{ fontSize: 11 }} onClick={openProposal}>Proposal →</button>
            <button className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => { setEstMessages([]); setEstStarted(false); setEstForm({ scope: '', rooms: '', special: '' }); setInterviewTier('mid'); setPricedScope(null); setGapRates({}); setLearnCandidates([]); setLearnSaveState(''); setSessionPrefill(null); setEstimateScopeOrigin(null); setShowRaw(false); setScopeInterviewActive(false); setScopeComplete(false); setForceDraftedIncomplete(false); }}>Reset</button>
          </div>
          {pricedScope?.length > 0 && (
            <>
              <StructuredEstimate lines={pricedScope} />
              {(() => {
                const gaps = pricedScope.filter(l => l.source_label === 'regional_avg' && l.gap_key);
                return gaps.length > 0
                  ? <GapBatchAsk gaps={gaps} gapRates={gapRates} setGapRates={setGapRates} onApply={applyGapRates} />
                  : null;
              })()}
              {learnCandidates.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  {learnSaveState === 'saved' ? (
                    <span style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 600 }}>✓ Saved to Rate Book — owner can vet in Rate Book → Labor Rates</span>
                  ) : learnSaveState === 'error' ? (
                    <span style={{ fontSize: 12, color: 'var(--red-text)' }}>Failed to save — try again or add manually in Rate Book</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Save {learnCandidates.length} labor rate{learnCandidates.length !== 1 ? 's' : ''} to Rate Book?
                        <span style={{ color: 'var(--text-subtle)', marginLeft: 4 }}>They'll stop being gaps next time.</span>
                      </span>
                      <button className="btn btn-navy" style={{ fontSize: 11, minHeight: 32, padding: '0 12px' }} onClick={saveLearnedRates} disabled={learnSaveState === 'saving'}>
                        {learnSaveState === 'saving' ? 'Saving…' : 'Save to Rate Book'}
                      </button>
                    </>
                  )}
                </div>
              )}
              <button
                onClick={() => setShowRaw(r => !r)}
                style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 8px', minHeight: 36, display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
              >
                {showRaw ? '▲ Hide raw' : '▼ View raw estimate'}
              </button>
            </>
          )}
          {(!pricedScope?.length || showRaw) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 480, overflowY: 'auto' }}>
            {estMessages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && <div style={{ width: 28, height: 28, background: NAV, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: GOLD, flexShrink: 0, marginRight: 8, marginTop: 2 }}>AI</div>}
                <div style={{ maxWidth: '85%', background: m.role === 'user' ? NAV : '#fff', color: m.role === 'user' ? '#fff' : 'var(--text-secondary)', padding: '10px 14px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: 13, lineHeight: 1.7, border: m.role === 'assistant' ? `1px solid ${BORDER}` : 'none', whiteSpace: 'pre-wrap' }}>
                  {m._hasFile && <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>📎 {m._fileName}</div>}
                  {typeof m.content === 'string' ? m.content : m.content}
                </div>
              </div>
            ))}
            {estLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, background: NAV, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: GOLD, flexShrink: 0 }}>AI</div>
                <div style={{ background: '#fff', border: `1px solid ${BORDER}`, padding: '10px 14px', borderRadius: '12px 12px 12px 2px', fontSize: 13, color: 'var(--text-subtle)' }}>Generating estimate…</div>
              </div>
            )}
          </div>
          )}
          {estFileName && (
            <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '6px 10px', fontSize: 12, color: NAV, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: GOLD }}>{Ic.folder}</span>{estFileName}
              <button onClick={() => { setEstFile(null); setEstFileName(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          )}
          {scopeInterviewActive && !scopeComplete && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--amber-text-strong)', background: 'var(--amber-bg-soft)', border: '1px solid var(--amber-border-soft)', borderRadius: 6, padding: '8px 12px' }}>
              <span>📋 Gathering scope — answer the questions above for an accurate estimate.</span>
              <button className="btn btn-ghost" style={{ fontSize: 11, minHeight: 32, marginLeft: 'auto' }} onClick={forceDraftAnyway} disabled={estLoading}>Draft anyway →</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>
              <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setEstFile(f); setEstFileName(f.name); } }} />
              <span style={{ width: 16, height: 16, color: 'var(--text-subtle)' }}>{Ic.plus}</span>
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
    const laborPct    = Number(job.labor_markup_pct    || 0);
    const materialPct = Number(job.material_markup_pct || 0);
    const lineClientPrice = (li) => {
      const cost = Number(li.total_cost ?? 0);
      const rate = markupRateForCategory(li.category, { laborPct, materialPct, categoryConfig });
      return cost * (1 + rate / 100);
    };
    const yourCost    = lineItems.reduce((s, li) => s + Number(li.total_cost ?? 0), 0);
    const clientPrice = lineItems.reduce((s, li) => s + lineClientPrice(li), 0) + Number(job.pm_fee || 0);
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {['owner', 'project_manager'].includes(profile?.role) && lineItems.length > 0 && (
              <button
                className="btn btn-gold"
                style={{ fontSize: 12 }}
                onClick={handleAcceptEstimate}
                disabled={acceptingEstimate}
              >
                {acceptingEstimate ? 'Setting…' : 'Accept Estimate →'}
              </button>
            )}
            <button className="btn btn-navy" style={{ fontSize: 12 }} onClick={() => { setEditingItem(null); setShowLineItemModal(true); }}>+ Add line item</button>
          </div>
        </div>
        {acceptMsg && (
          <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 10, background: acceptMsg.startsWith('Error') ? 'var(--red-bg)' : 'var(--green-bg)', color: acceptMsg.startsWith('Error') ? '#991b1b' : '#065f46' }}>
            {acceptMsg}
          </div>
        )}
        {lineItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-subtle)', fontSize: 14 }}>
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
              const lineTotal = lineClientPrice(li);
              return (
                <div key={li.id || i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 32px', padding: '8px 12px', gap: 8, borderTop: `1px solid ${BORDER}`, alignItems: 'center', background: i % 2 === 0 ? '#fff' : CREAM }}>
                  <div style={{ fontSize: 13, color: NAV }}>{li.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{li.trade || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{li.category || '—'}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAV }}>{f$(lineTotal)}</div>
                  <button onClick={() => { setEditingItem(li); setShowLineItemModal(true); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 14, padding: 0, display: 'flex' }}>{Ic.edit}</button>
                </div>
              );
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 32px', padding: '10px 12px', gap: 8, background: NAV, alignItems: 'center', rowGap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', gridColumn: '1/4' }}>Your Cost</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{f$(yourCost)}</div>
              <div />
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', gridColumn: '1/4' }}>Client Price</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>{f$(clientPrice)}</div>
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
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-subtle)', fontSize: 13 }}>Loading proposal data…</div>
      ) : lineItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>No line items yet — generate an estimate in Build, then click Commit to Line Items — or add items manually in Line Items.</div>
          <button className="btn btn-navy" onClick={() => setSub('build')}>Go to Build →</button>
        </div>
      ) : !propReady ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>{lineItems.length} line items ready.</div>
          <button className="btn btn-navy" onClick={openProposal}>Build Proposal →</button>
        </div>
      ) : (
        <Fragment>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div className="fg"><label className="flbl">Proposal #</label><input className="finp" value={propNum} onChange={e => setPropNum(e.target.value)} /></div>
            <div className="fg"><label className="flbl">PM Fee ($)</label><input className="finp" type="number" value={propPmFee} onChange={e => { const v = Number(e.target.value || 0); setPropPmFee(e.target.value); upd({ pm_fee: v }); }} /></div>
          </div>
          {lineItems.length > 0 && (() => {
            const _lp = Number(job.labor_markup_pct || 0);
            const _mp = Number(job.material_markup_pct || 0);
            const hardCost = lineItems.reduce((s, li) => s + Number(li.total_cost ?? 0), 0);
            const clientSub = lineItems.reduce((s, li) => {
              const cost = Number(li.total_cost ?? 0);
              const rate = markupRateForCategory(li.category, { laborPct: _lp, materialPct: _mp, categoryConfig });
              return s + cost * (1 + rate / 100);
            }, 0);
            const markup = clientSub - hardCost;
            const pm = Number(propPmFee) || 0;
            const grand = clientSub + pm;
            return (
              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16, marginBottom: 20, display: 'flex' }}>
                {[['Hard Cost', '$' + Math.round(hardCost).toLocaleString()], ['Markup', '$' + Math.round(markup).toLocaleString()], ['PM Fee', '$' + pm.toLocaleString()], ['GRAND TOTAL', '$' + Math.round(grand).toLocaleString()]].map(([lbl, val], i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < 3 ? `1px solid ${BORDER}` : 'none', padding: '0 8px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{lbl}</div>
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
                        <input value={li.description || ''} onChange={e => { const u = [...propLineItems]; u[i] = { ...u[i], description: e.target.value }; setPropLineItems(u); }} style={{ fontSize: 11, border: 'none', background: 'transparent', color: 'var(--text-secondary)', outline: 'none', width: '100%' }} />
                        <input value={li.qty_label || ''} onChange={e => { const u = [...propLineItems]; u[i] = { ...u[i], qty_label: e.target.value }; setPropLineItems(u); }} style={{ fontSize: 11, border: 'none', background: 'transparent', color: 'var(--text-muted)', outline: 'none' }} />
                        <input type="number" value={li.amount || ''} onChange={e => { const u = [...propLineItems]; u[i] = { ...u[i], amount: e.target.value }; setPropLineItems(u); }} style={{ fontSize: 11, border: 'none', background: 'transparent', color: NAV, fontWeight: 600, outline: 'none', textAlign: 'right' }} />
                        <button onClick={async () => {
                          const item = propLineItems[i];
                          if (item.id) {
                            await sb.from('estimate_line_items').delete().eq('id', item.id);
                            const refreshed = await sbLoadEstimateLineItems(job.id);
                            setLineItems(refreshed || []);
                            setLineItemsLoaded(true);
                          }
                          setPropLineItems(prev => prev.filter((_, j) => j !== i));
                        }} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
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
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{propOhShitExpanded ? '▲' : '▼'}</span>
              </button>
              {propOhShitExpanded && (
                <div>
                  {propOhShit.map((m, i) => (
                    <div key={m.id || i} style={{ padding: '10px 12px', borderTop: `1px solid ${BORDER}`, background: m.included_in_proposal ? '#FFFBEB' : '#fff', transition: 'background 0.15s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: NAV, marginBottom: 2 }}>{m.condition}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {m.likelihood && <span style={{ marginRight: 8, fontWeight: 600, color: m.likelihood === 'high' ? '#B91C1C' : m.likelihood === 'low' ? '#15803D' : '#92400E' }}>{m.likelihood.charAt(0).toUpperCase() + m.likelihood.slice(1)} likelihood</span>}
                            {(m.estimated_cost_low || m.estimated_cost_high) && <span>${Number(m.estimated_cost_low || 0).toLocaleString()} – ${Number(m.estimated_cost_high || 0).toLocaleString()}</span>}
                          </div>
                          {m.how_to_present && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>{m.how_to_present}</div>}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
                          <input type="checkbox" checked={!!m.included_in_proposal} onChange={async () => {
                            const next = !m.included_in_proposal;
                            setPropOhShit(prev => prev.map(x => x.id === m.id ? { ...x, included_in_proposal: next } : x));
                            await sbToggleOhShitProposal(m.id, next);
                          }} style={{ width: 14, height: 14, accentColor: GOLD, cursor: 'pointer' }} />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Include in proposal</span>
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
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => generateProposalPDF(true)} disabled={propGenerating || lineItems.length === 0}>{propGenerating ? 'Generating…' : 'Download PDF'}</button>
            <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => generateProposalPDF(false)} disabled={propGenerating || lineItems.length === 0}>{propGenerating ? 'Generating…' : 'Save to Documents'}</button>
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
            marginBottom: -2, color: sub === t.id ? NAV : 'var(--text-subtle)', transition: 'color 0.15s',
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

