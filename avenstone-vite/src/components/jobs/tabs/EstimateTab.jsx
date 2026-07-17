import { useState, useEffect, useMemo, Fragment, lazy, Suspense } from 'react';
import { sb, AV_USER_ID, AV_TENANT, ANON_KEY, AI_ESTIMATOR_URL, sbLoadEstimate, sbSaveEstimate, sbSendEstimateEmail, sbUploadDoc, sbLoadEstimateLineItems, sbLoadOhShitMoments, sbToggleOhShitProposal, sbLoadJobRoomScopes, sbLoadCategoryConfig, sbSetContractFromEstimate, sbGetPricingPolicy, sbSetEstimateApproval, sbLoadBidModelConfig, sbInsertRateBookLabor, sbSeedJobPhases, sbLoadScopeOptionData, sbEnsureDefaultRoom, sbUpsertScopeAnswers, sbLoadScopeAnswers, sbScopePrefill, sbScopeVision, sbLoadScanMeasurements, sbDeleteScopeAnswers, captureFailedIntent, sbLoadRateBookLabor, sbCommittedLineSummary, sbLoadFloorPlansForJob, sbFetchFloorPlanPdf, sbLoadJobPhotos, sbSaveJobLidarScan, sbClearScopeAnswers, sbNote, sbClearCommittedLineItems, sbClearJobRoomScopes, sbClearEstimateDraft, sbEstimateStackCounts, sbUpsertProposalDraft, sbMarkProposalSent, sbResetProposals, sbLoadProposals } from '../../../lib/supabase';
import { isScanArtifact, artifactToScanParams, SCAN_ARTIFACT_VERSION } from '../../../lib/scanArtifact';
import { markLifecyclePhases } from '../../../lib/lifecycle';
import { computeEstimateDeviation } from '../../../lib/deviationGate';
import { sbCommitEstimate } from '../../../lib/commitEstimate';
import { markupRateForCategory } from '../../../lib/markupConfig';
import { Ic, f$, ll, ls } from '../../../lib/utils';
import { buildProposalPDF } from '../../../lib/pdf';
import { computeSanityFlags } from '../../../lib/priceSanity';
import LineItemModal from './financials/LineItemModal';
import ScopeTab from './ScopeTab';
import StructuredEstimate from './StructuredEstimate';
import GapBatchAsk from './GapBatchAsk';
import ScopeConfigurator from './ScopeConfigurator';
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
  // UPLOAD_PICKER — multi-file attach (photos + plans). estFiles feeds the estimator
  // as N image/document content blocks; nothing lands in a bucket (ephemeral AI context).
  const [estFiles, setEstFiles] = useState([]); // File[]
  const [attachError, setAttachError] = useState(null); // per-file reject surfacing
  const [jobPlans, setJobPlans] = useState(null); // saved floor_plans for this job (attach-from-job)
  const [jobPlansOpen, setJobPlansOpen] = useState(false);
  const [jobPlansBusy, setJobPlansBusy] = useState(false);
  const [jobPlanFetchId, setJobPlanFetchId] = useState(null); // row currently being pulled
  const [jobPhotos, setJobPhotos] = useState(null); // job image files (attach-from-job Photos section)
  const [hasJobPhotos, setHasJobPhotos] = useState(false); // SCOPE_VISION — job has photos (gate + vision trigger)
  const [scanMeas, setScanMeas] = useState(null); // SCOPE_VISION P2 — scan-derived measurements (gate + measure pass)
  const [photoSel, setPhotoSel] = useState(() => new Set()); // selected photo ids
  const [photoAttachBusy, setPhotoAttachBusy] = useState(false);
  const [photoShowAll, setPhotoShowAll] = useState(false);
  // SCAN_INGEST v2 — an uploaded avenstone-scan JSON is data, not a picture: it triggers an
  // import confirm instead of riding the vision call.
  const [pendingScanImport, setPendingScanImport] = useState(null); // { artifact, filename }
  const [scanImporting, setScanImporting] = useState(false);
  const [scanImportMsg, setScanImportMsg] = useState(null);
  // ESTIMATE_INTEGRITY Fix 1 — "Start fresh" reset dialog
  const [resetDlg, setResetDlg] = useState(null); // { scopeCount, measuredCount, clientCount } | null
  const [resetOpts, setResetOpts] = useState({ scope: true, measured: false, client: false });
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState(null); // RESET_FAILURE — post-reset verification failure
  const [estSaving, setEstSaving] = useState(false);
  const [estSendingClient, setEstSendingClient] = useState(false);
  const [estSaveMsg, setEstSaveMsg] = useState('');
  const [estCommitting, setEstCommitting] = useState(false);
  const [estCommitMsg, setEstCommitMsg] = useState('');
  const [pricedScope, setPricedScope] = useState(null); // 3c: priced lines from 3b-2 engine
  const [pricedMeta, setPricedMeta]   = useState(null); // Fix 5: markup/pm_fee ACTUALLY applied to this draft
  const [untranslatedFields, setUntranslatedFields] = useState([]); // price_plan: fields captured but not yet priced
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
  // Phase 5 — per-gap pricing mode: 'unit' ($/SF, $/EA…) or 'ls' (flat lump sum). Default 'unit'.
  const [gapModes, setGapModes] = useState({});
  // Phase 6a — true when this estimate ran through the tap-through configurator. On this path the
  // chat transcript / raw prompt is NEVER rendered; completion lands on the polished breakdown.
  const [configuratorPath, setConfiguratorPath] = useState(false);
  // TAKEOFF_BRIDGE Phase 2 — {count, trades[]} of existing takeoff:% lines, for the double-count warning.
  const [takeoffOverlap, setTakeoffOverlap] = useState(null);
  useEffect(() => { sbCommittedLineSummary(job.id).then(r => { if (r.ok) setTakeoffOverlap(r.data.takeoff.count > 0 ? r.data.takeoff : null); }); }, [job.id]);
  // B2.3 learn loop: labor gaps the rep just applied — offered for Rate Book save
  const [learnCandidates, setLearnCandidates] = useState([]);
  const [learnSaveState, setLearnSaveState] = useState(''); // '' | 'saving' | 'saved' | 'error'

  // SCOPE_CAPTURE_ENGINE P1B: scope-interview-before-pricing state.
  const [scopeProjectType, setScopeProjectType]           = useState(null);  // e.g. 'bathroom', from job_room_scopes
  const [scopeInterviewActive, setScopeInterviewActive]   = useState(false); // gathering scope (upstream of pricing)
  const [scopeComplete, setScopeComplete]                 = useState(false); // interview satisfied → run pricing
  const [forceDraftedIncomplete, setForceDraftedIncomplete] = useState(false); // rep forced a draft past open questions
  const [knownProjectTypes, setKnownProjectTypes]         = useState([]); // distinct project_types seeded in scope_checklists
  // SCE Phase 4B: option-image cards. openFields = current unanswered fields (from the
  // interview response); optData = {fields, images} loaded once per project_type.
  const [scopeOpenFields, setScopeOpenFields]             = useState([]);
  const [scopeOptData, setScopeOptData]                   = useState({ fields: [], images: {} });
  const [scopeSaveError, setScopeSaveError]               = useState(null); // Phase A: soft persist-failure banner
  const [resumeChecked, setResumeChecked]                 = useState(false); // one-shot resume-interview check

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

  // Phase 1b — pre-send price sanity guard. Rate-book rows (for the outlier bound) + ack flag.
  const [rateBookRows, setRateBookRows] = useState([]);
  const [sanityAck, setSanityAck] = useState(false);
  useEffect(() => { sbLoadRateBookLabor().then(r => { if (r.ok) setRateBookRows(r.data); }); }, []);
  // A change to the line items invalidates a prior acknowledgement.
  useEffect(() => { setSanityAck(false); }, [lineItems]);

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

  // SCOPE_VISION — does the job have photos? gates "generate from photos alone" + the vision pass.
  useEffect(() => {
    sbLoadJobPhotos(job.id, { limit: 1 }).then(r => setHasJobPhotos(!!(r.ok && (r.data || []).length))).catch(() => {});
  }, [job.id]);
  // SCOPE_VISION P2 — scan-derived measurements (floor_sf, ceiling height). Loaded on mount so a
  // scan can satisfy the SF gate and pre-fill the SF field; persisted as answers on Generate.
  useEffect(() => {
    sbLoadScanMeasurements(job.id).then(r => {
      const m = r.ok ? r.data : null;
      setScanMeas(m);
      if (m?.area_sqft > 0 && !interviewSf) { setInterviewSf(String(m.floor_sf)); setInterviewSfSource('scan'); }
    }).catch(() => {});
  }, [job.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // SCE 4B: RESUME an in-progress interview. On a reload the interview state (active +
  // option cards) is lost — the mount effect only rehydrates the chat. When a saved
  // conversation exists, a project type resolves, the rep didn't force-draft, and nothing
  // was priced/committed yet, re-enter interview mode and load the option cards — mirroring
  // the fresh-start load path. Runs once; keyed on scopeProjectType so it waits for it.
  useEffect(() => {
    if (resumeChecked || !estStarted || scopeInterviewActive || scopeComplete) return;
    if (!estMessages.length || pricedScope?.length) return;
    const pt = resolveProjectType();
    if (!pt || estimateScopeOrigin === 'incomplete') { setResumeChecked(true); return; }
    setResumeChecked(true);
    sbLoadEstimateLineItems(job.id).then(items => {
      if (items?.length) return; // committed estimate — don't re-gate
      setScopeInterviewActive(true);
      sbLoadScopeOptionData(pt).then(setScopeOptData).catch(() => {});
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estStarted, scopeProjectType, resumeChecked]);

  // Derive project SF from scoped rooms on mount. P2: a completed consultation session
  // may carry an on-site measured SF — that takes precedence over scan derivation. Read
  // the prefill synchronously here (before the default-tab effect's async .then clears it).
  useEffect(() => {
    (async () => {
      // TAKEOFF_BRIDGE Phase 3 — a persisted floor_sf answer (the dimension the rep entered) is the
      // authoritative SF; it becomes the home for what interviewSf approximated. Prefer it over
      // scan/job/session derivation. Sum across rooms for the whole-job SF.
      try {
        const ans = await sbLoadScopeAnswers(job.id);
        if (ans.ok) {
          const floorSfSum = (ans.data || [])
            .filter(a => a.field_key === 'floor_sf' && a.value != null && String(a.value).trim() !== '')
            .reduce((s, a) => s + (Number(a.value) || 0), 0);
          if (floorSfSum > 0) { setInterviewSf(String(floorSfSum)); setInterviewSfSource('answer'); return; }
        }
      } catch (_) { /* fall through to scan/job derivation */ }
      const pf = ll(`av_estimate_prefill_${job.id}`, null);
      const sessionSf = pf && Number(pf.sf) > 0 ? Number(pf.sf) : 0;
      const { sf, source, roomCount } = await deriveProjectSf(sb, job.id, job);
      setInterviewSfRoomCount(roomCount || 0);
      if (sessionSf > 0) { setInterviewSf(String(sessionSf)); setInterviewSfSource('session'); return; }
      setInterviewSfSource(source);
      if (sf > 0) setInterviewSf(String(sf));
    })();
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

  // UPLOAD_PICKER — validate + append files from any source (picker, or attach-from-job).
  // Per-file rejects are surfaced (copies the batch-failure spirit of NotesPhotosTab: keep
  // the good ones, name the bad ones). 4.5MB cap keeps each within the estimator's vision limit.
  const MAX_ATTACH_MB = 4.5;
  const addEstFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter(Boolean);
    if (!incoming.length) return;
    const good = []; const errs = [];
    for (const f of incoming) {
      const type = f.type || '';
      const isImg = type.startsWith('image/');
      const isPdf = type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
      if (!isImg && !isPdf) { errs.push(`${f.name || 'file'}: not an image or PDF`); continue; }
      if (f.size > MAX_ATTACH_MB * 1024 * 1024) { errs.push(`${f.name || 'file'}: too large (max ${MAX_ATTACH_MB}MB)`); continue; }
      good.push(f);
    }
    if (good.length) setEstFiles(prev => [...prev, ...good]);
    setAttachError(errs.length ? errs.join(' · ') : null);
  };

  const removeEstFile = (idx) => setEstFiles(prev => prev.filter((_, i) => i !== idx));

  // SCAN_INGEST v2 — the file-picker entry point. An avenstone-scan JSON is intercepted and
  // routed to the import confirm (it's data, not vision context); everything else flows to
  // addEstFiles unchanged. attach-from-job paths never produce JSON, so they call addEstFiles
  // directly and skip this hop.
  const handleUploadInput = async (fileList) => {
    const incoming = Array.from(fileList || []).filter(Boolean);
    if (!incoming.length) return;
    const passthrough = [];
    const errs = [];
    for (const f of incoming) {
      const looksJson = /\.json$/i.test(f.name || '') || (f.type || '') === 'application/json';
      if (!looksJson) { passthrough.push(f); continue; }
      try {
        const parsed = JSON.parse(await f.text());
        if (isScanArtifact(parsed)) {
          if ((parsed.version || 1) > SCAN_ARTIFACT_VERSION) { errs.push(`${f.name}: newer scan format (v${parsed.version}) — update the app`); continue; }
          setPendingScanImport({ artifact: parsed, filename: f.name });
        } else {
          errs.push(`${f.name}: not an Avenstone scan file`);
        }
      } catch { errs.push(`${f.name}: invalid JSON`); }
    }
    if (passthrough.length) addEstFiles(passthrough);
    if (errs.length) setAttachError(errs.join(' · '));
  };

  // Import the pending scan into THIS job — re-stamps the target job and runs the full
  // sbSaveJobLidarScan bridge (normalize + room link + measured answers + takeoff visibility).
  const confirmImportScan = async () => {
    if (!pendingScanImport) return;
    setScanImporting(true);
    setAttachError(null);
    const params = artifactToScanParams(pendingScanImport.artifact, job.id);
    const res = await sbSaveJobLidarScan(params);
    setScanImporting(false);
    if (!res.ok) { setAttachError(`Scan import failed: ${res.error}`); return; }
    const n = params.rooms.length;
    setScanImportMsg(`Scan imported — ${n} room${n === 1 ? '' : 's'} added to this job. Open the Scanner or Takeoff tab to see it.`);
    setPendingScanImport(null);
  };

  // ESTIMATE_INTEGRITY Fix 1 / RESET_SCOPE — reset local chat/interview + committed views.
  const resetLocalEstimateState = () => {
    setEstMessages([]); setEstStarted(false); setEstForm({ scope: '', rooms: '', special: '' });
    setInterviewTier('mid'); setPricedScope(null); setPricedMeta(null); setGapRates({}); setLearnCandidates([]);
    setLearnSaveState(''); setSessionPrefill(null); setEstimateScopeOrigin(null); setShowRaw(false);
    setScopeInterviewActive(false); setScopeComplete(false); setForceDraftedIncomplete(false);
    setConfiguratorPath(false);
    // RESET_SCOPE — drop the committed line-item + proposal views so the cleared DB is reflected.
    setLineItems([]); setLineItemsLoaded(false); setPropLineItems([]); setPropReady(false);
    // RESET_FAILURE — the one-shot resume guard must reset too, or a re-started interview reuses
    // the pre-reset resume decision (stale state the reset didn't touch).
    setResumeChecked(false);
  };

  // Open the "Start fresh" dialog — load the full estimate-stack counts so the confirm states
  // exactly what will be cleared vs protected, in plain rows.
  const openResetDialog = async () => {
    setResetOpts({ scope: true, measured: false, client: false });
    setResetError(null);
    let scopeCount = 0, measuredCount = 0, clientCount = 0;
    try {
      const [ans, stack, props] = await Promise.all([sbLoadScopeAnswers(job.id), sbEstimateStackCounts(job.id), sbLoadProposals(job.id)]);
      for (const a of (ans.ok ? ans.data : [])) {
        // Protection is source-based: only the client's own picks are protected. Rep confirmed
        // selections (rep_card/rep_typed) count as clearable scope (RESET_FAILURE fix).
        if (a.source === 'client_selected') clientCount++;
        else if (a.source === 'measured') measuredCount++;
        else scopeCount++;
      }
      const proposals = (props.ok ? props.data : []).filter(p => p.status === 'draft' || p.status === 'sent');
      setResetDlg({ scopeCount, measuredCount, clientCount, ...stack, proposals });
    } catch {
      setResetDlg({ scopeCount, measuredCount, clientCount, aiLines: 0, takeoffLines: 0, roomScopes: 0, hasDraft: false, proposals: [] });
    }
  };

  // RESET_SCOPE — "this estimate never happened": clear the whole draft stack. Scope answers,
  // committed line items (both ai:% + takeoff:%), takeoff scope tags, and the job_estimates draft
  // always go (that IS the reset). Scan measurements stay unless ticked; client selections are
  // protected behind the extra tick. Proposals are NOT touched — no send-state exists to tell a
  // sent proposal from a draft (reported; a Kalin decision).
  const confirmReset = async () => {
    setResetBusy(true);
    let answersCleared = 0;
    const parts = [];
    const failures = [];
    try {
      const [ansRes, liRes, rsRes, propRes] = await Promise.all([
        sbClearScopeAnswers(job.id, { includeScope: true, includeMeasured: resetOpts.measured, includeClientConfirmed: resetOpts.client }),
        sbClearCommittedLineItems(job.id),
        sbClearJobRoomScopes(job.id),
        sbResetProposals(job.id),
      ]);
      const draftRes = await sbClearEstimateDraft(job.id);
      // Collect helper-level failures (silent RLS deny surfaces as ok:false now).
      if (!ansRes.ok) failures.push(ansRes.error || 'scope answers delete failed');
      if (!liRes.ok) failures.push(liRes.error || 'line items delete failed');
      if (!rsRes.ok) failures.push(rsRes.error || 'takeoff scope delete failed');
      if (!propRes.ok) failures.push(propRes.error || 'proposal reset failed');
      if (!draftRes.ok) failures.push(draftRes.error || 'estimate draft clear failed');
      answersCleared = ansRes.ok ? (ansRes.data?.cleared || 0) : 0;
      const aiN = liRes.ok ? (liRes.data?.ai || 0) : 0;
      const tkN = liRes.ok ? (liRes.data?.takeoff || 0) : 0;
      const rsN = rsRes.ok ? (rsRes.data?.cleared || 0) : 0;
      const draftsDel = propRes.ok ? (propRes.data?.draftsDeleted || 0) : 0;
      const sentSup = propRes.ok ? (propRes.data?.sentSuperseded || 0) : 0;
      if (answersCleared) parts.push(`${answersCleared} scope answer${answersCleared === 1 ? '' : 's'}`);
      if (aiN + tkN) parts.push(`${aiN + tkN} line item${aiN + tkN === 1 ? '' : 's'} (${aiN} ai · ${tkN} takeoff)`);
      if (rsN) parts.push(`${rsN} takeoff scope tag${rsN === 1 ? '' : 's'}`);
      parts.push('estimate draft');
      if (draftsDel) parts.push(`${draftsDel} proposal draft${draftsDel === 1 ? '' : 's'} deleted`);
      if (sentSup) parts.push(`${sentSup} sent proposal${sentSup === 1 ? '' : 's'} superseded`);
      if (resetOpts.measured) parts.push('scan measurements');
      if (resetOpts.client) parts.push('client selections');

      // POST-RESET VERIFICATION (RESET_FAILURE) — re-query and prove the stack is actually clear.
      // Reset must be incapable of reporting success while rows survive. Anything that should be
      // zero but isn't = a hard failure the user sees; nothing is claimed cleared.
      const [postStack, postAns] = await Promise.all([sbEstimateStackCounts(job.id), sbLoadScopeAnswers(job.id)]);
      const survivingScope = (postAns.ok ? postAns.data : []).filter(a => {
        if (a.source === 'client_selected') return resetOpts.client;   // gone only if clearing client picks
        if (a.source === 'measured') return resetOpts.measured;        // gone only if clearing measurements
        return true;                                                   // every other scope answer must be gone
      }).length;
      if (survivingScope > 0) failures.push(`${survivingScope} scope answer(s) survived`);
      if ((postStack.aiLines + postStack.takeoffLines) > 0) failures.push(`${postStack.aiLines + postStack.takeoffLines} line item(s) survived`);
      if (postStack.roomScopes > 0) failures.push(`${postStack.roomScopes} takeoff scope tag(s) survived`);
    } catch (e) {
      failures.push(e?.message || 'reset threw');
    }

    if (failures.length) {
      // DO NOT reset local state or claim success — surface the failure IN the dialog so the store
      // is never silently believed clean (the reset-lied-twice fix: it cannot lie a third time).
      setResetBusy(false);
      setResetError(`Reset did NOT fully clear — ${failures.join('; ')}. The store is unchanged; do not re-interview. Re-check permissions/RLS and try again.`);
      return;
    }
    sbNote(job.id, `Estimate reset — cleared ${parts.join(', ')}. Verified empty.`, profile?.full_name || 'Staff').catch(() => {});
    resetLocalEstimateState();
    setResetBusy(false);
    setResetDlg(null);
    setScanImportMsg(`Started fresh — cleared ${parts.join(', ') || 'the estimate draft'} (verified). The interview will ask from zero.`);
  };

  // Downscale an oversized image blob rather than reject it — these are estimator VISION
  // context, not archival copies. Canvas re-encode to JPEG with the longest edge capped at
  // ~1600px. On iOS WKWebView this also transparently transcodes HEIC (Safari can decode it).
  const DOWNSCALE_MAX_EDGE = 1600;
  const downscaleImageBlob = (blob, filename) => new Promise((resolve) => {
    try {
      const img = new Image();
      const objUrl = URL.createObjectURL(blob);
      img.onload = () => {
        const longest = Math.max(img.width, img.height);
        const scale = longest > DOWNSCALE_MAX_EDGE ? DOWNSCALE_MAX_EDGE / longest : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((out) => {
          URL.revokeObjectURL(objUrl);
          const base = (filename || 'photo').replace(/\.(heic|heif|png|gif|webp)$/i, '.jpg');
          resolve(out ? new File([out], /\.jpe?g$/i.test(base) ? base : `${base}.jpg`, { type: 'image/jpeg' }) : null);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
      img.src = objUrl;
    } catch { resolve(null); }
  });

  // Attach-from-job — one panel, two sections: saved floor plans (stored PDFs) + the job's
  // photos. Both pull into estFiles the same way (fetch → File → chips). No export/re-import.
  const toggleJobPlans = async () => {
    const next = !jobPlansOpen;
    setJobPlansOpen(next);
    if (next && jobPlans === null) {
      setJobPlansBusy(true);
      const [planRes, photoRes] = await Promise.all([
        sbLoadFloorPlansForJob(job.id),
        sbLoadJobPhotos(job.id),
      ]);
      setJobPlans(planRes.ok ? planRes.data : []);
      setJobPhotos(photoRes.ok ? photoRes.data : []);
      if (!planRes.ok) setAttachError(`Couldn't load this job's floor plans: ${planRes.error}`);
      else if (!photoRes.ok) setAttachError(`Couldn't load this job's photos: ${photoRes.error}`);
      setJobPlansBusy(false);
    }
  };
  const attachJobPlan = async (fp) => {
    setJobPlanFetchId(fp.id);
    setAttachError(null);
    const res = await sbFetchFloorPlanPdf(fp);
    setJobPlanFetchId(null);
    if (!res.ok) { setAttachError(`Couldn't attach ${fp.name}: ${res.error}`); return; }
    const file = new File([res.blob], res.filename, { type: 'application/pdf' });
    addEstFiles([file]);
    setJobPlansOpen(false);
  };

  const togglePhotoSel = (id) => setPhotoSel(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  // Fetch each selected photo → File (downscale if over the vision cap) → estFiles.
  const attachSelectedPhotos = async () => {
    if (!photoSel.size) return;
    setPhotoAttachBusy(true);
    setAttachError(null);
    const picked = (jobPhotos || []).filter(p => photoSel.has(p.id));
    const files = []; const errs = [];
    for (const p of picked) {
      try {
        const resp = await fetch(p.url);
        if (!resp.ok) { errs.push(`${p.name}: fetch failed`); continue; }
        let blob = await resp.blob();
        let file = new File([blob], p.name, { type: blob.type || p.mime_type || 'image/jpeg' });
        if (file.size > MAX_ATTACH_MB * 1024 * 1024) {
          const scaled = await downscaleImageBlob(blob, p.name);
          if (scaled) file = scaled;
        }
        files.push(file);
      } catch (e) { errs.push(`${p.name}: ${e?.message || 'error'}`); }
    }
    if (files.length) addEstFiles(files); // addEstFiles applies the final per-file validation
    if (errs.length) setAttachError(errs.join(' · '));
    setPhotoSel(new Set());
    setPhotoAttachBusy(false);
    if (files.length) setJobPlansOpen(false);
  };

  // PRICE_DETERMINISM P4: deterministic pricing via mode:'price_plan'.
  // Reads job_scope_answers + scan geometry from DB — no LLM call.
  // Fired by the [scopeComplete] effect; persistence race closed (ScopeConfigurator awaits
  // the final answer upsert before calling onComplete).
  // "Scope captured" chat message is UX only — not a pricing input any more.
  const runPricing = async () => {
    setEstLoading(true);
    const pt = resolveProjectType();
    const financialModel = job.financial_model || 'fixed_bid';
    let reply;
    try {
      const res = await fetch(AI_ESTIMATOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          mode: 'price_plan',
          tenant_id: AV_TENANT,
          job_id: job.id,
          project_type: pt,
          finish_tier: interviewTier,
          markup_pct: Number(interviewMarkup) || 0,
          pm_fee: Number(interviewPmFee) || 0,
          financial_model: financialModel,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        if (res.status === 400 && data.error === 'scope_empty') {
          reply = '⚠ No scope answers found — please complete the scope configurator before pricing.';
        } else {
          reply = `Sorry, something went wrong: ${data.error || `HTTP ${res.status}`}`;
        }
      } else {
        reply = data.content || 'Sorry, something went wrong. Please try again.';
        if (data.priced_scope?.length) setPricedScope(data.priced_scope);
        if (data.priced_scope?.length) setPricedMeta({ markupPct: Number(data.applied_markup_pct) || 0, pmFee: Number(data.applied_pm_fee) || 0, financialModel: data.financial_model || financialModel });
        setUntranslatedFields(data.untranslated_fields || []);
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
    // UPLOAD_PICKER — attach set: an explicit override (single File or File[]) wins; else estFiles.
    const filesToUse = fileOverride
      ? (Array.isArray(fileOverride) ? fileOverride : [fileOverride])
      : estFiles;
    if ((!text && !filesToUse.length) || estLoading) return;
    let userContent;
    if (filesToUse.length) {
      const blocks = [];
      for (const f of filesToUse) {
        const b64 = await readFileAsBase64(f);
        const mediaType = f.type || 'application/pdf';
        const isImage = mediaType.startsWith('image/');
        blocks.push(isImage
          ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } }
          : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
      }
      userContent = [...(text ? [{ type: 'text', text }] : []), ...blocks];
    } else { userContent = text; }
    const newMessages = [...estMessages, { role: 'user', content: userContent }];
    const fileLabel = filesToUse.length === 1 ? filesToUse[0].name
      : filesToUse.length ? `${filesToUse.length} files attached` : '';
    const displayMessages = [...estMessages, { role: 'user', content: text || fileLabel || '[File attached]', _hasFile: filesToUse.length > 0, _fileName: fileLabel }];
    setEstMessages(displayMessages);
    setEstInput(''); setEstFiles([]); setAttachError(null);
    setEstLoading(true);
    // Strip UI-only metadata fields before sending — _hasFile/_fileName are display state only
    const apiMessages = newMessages.map(({ role, content }) => ({ role, content }));
    // Route to scope-interview mode while an interview is active and not yet complete.
    const mode = modeOverride || (scopeInterviewActive && !scopeComplete ? 'scope_interview' : undefined);
    // SCOPE_TO_ESTIMATE Phase B — read-back pre-fill. On start AND resume (this is the shared
    // injection point for both), load the persisted answers and merge them with the session's
    // on-site measured fields, sent as prefilled_answers so the interview skips already-answered
    // fields. Precedence: store 'confirmed' wins over session prefill; session prefill (fresher
    // measurement) wins over store 'proposed'. Source is preserved per answer via the {value,
    // source} shape — a stored 'measured' stays 'measured' on round-trip (the edge maps db
    // source -> record source, not a blanket 'measured' relabel).
    let prefillPayload = null;
    let clientPrefs = null;
    if (mode === 'scope_interview') {
      const sessionFields = sessionPrefill?.measuredFields || {};
      let storeRows = [];
      try { const r = await sbLoadScopeAnswers(job.id); if (r.ok) storeRows = r.data; } catch { /* soft — degrade to session-only prefill */ }
      const merged = {};
      const prefs = [];
      // Phase C2 SPLIT: a client_selected PROPOSED row is the homeowner's soft-pick — it goes to
      // client_prefs (CONTEXT ONLY: the AI may reference it but it does NOT count as answered, so
      // the field stays open and the rep still drives). Everything else — confirmed rows (any
      // source) and the rep's own proposed measured/rep_typed answers — feeds the gating prefill.
      // Sort so 'confirmed' lands last and wins on a duplicate field_key across rooms.
      for (const a of [...storeRows].sort((x, y) => (x.status === 'confirmed' ? 1 : 0) - (y.status === 'confirmed' ? 1 : 0))) {
        const v = a.value ?? a.option_key;
        if (!a.field_key || v == null || String(v).trim() === '') continue;
        if (a.source === 'client_selected' && a.status === 'proposed') { prefs.push({ field_key: a.field_key, value: v }); continue; }
        merged[a.field_key] = { value: v, source: a.source || 'rep_typed', _confirmed: a.status === 'confirmed' };
      }
      // Session measured fields win UNLESS the store row is confirmed.
      for (const [k, v] of Object.entries(sessionFields)) {
        if (v == null || String(v).trim() === '') continue;
        if (merged[k]?._confirmed) continue;
        merged[k] = { value: v, source: 'measured' };
      }
      const clean = {};
      for (const [k, e] of Object.entries(merged)) clean[k] = { value: e.value, source: e.source };
      if (Object.keys(clean).length) prefillPayload = clean;
      if (prefs.length) clientPrefs = prefs;
    }
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
            // Phase B: store + session merged, source-aware prefill (built above).
            ...(prefillPayload ? { prefilled_answers: prefillPayload } : {}),
            // Phase C2: client soft-picks as non-gating context.
            ...(clientPrefs ? { client_prefs: clientPrefs } : {}),
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
        setScopeOpenFields(data.open_field_keys || []); // SCE 4B: drive the option cards
        persistScopeAnswers(data.answers); // Phase A: persist answers (soft, non-blocking)
      } else {
        reply = data.content || 'Sorry, something went wrong. Please try again.';
        if (data.priced_scope?.length) setPricedScope(data.priced_scope); // 3c
        if (data.priced_scope?.length) setPricedMeta({ markupPct: Number(data.applied_markup_pct) || 0, pmFee: Number(data.applied_pm_fee) || 0, financialModel: data.financial_model || (job.financial_model || 'fixed_bid') }); // Fix 5
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

  // SCOPE_TO_ESTIMATE Phase A — persist interview answers so they stop evaporating.
  // Ensures the job's default room, stamps room_id, upserts. SOFT: never blocks the
  // interview — a failure just raises a dismissable banner (no new AI calls here).
  const persistScopeAnswers = async (answers) => {
    if (!answers?.length || !job?.id) return;
    try {
      const roomRes = await sbEnsureDefaultRoom(job.id, resolveProjectType());
      if (!roomRes.ok) { console.error('[persistScopeAnswers] room:', roomRes.error); setScopeSaveError('Scope answers not saved — could not set up the room. Your interview continues normally.'); return; }
      const stamped = answers.map(a => ({ ...a, room_id: roomRes.data.id }));
      const upRes = await sbUpsertScopeAnswers(job.id, stamped);
      if (!upRes.ok) { console.error('[persistScopeAnswers] upsert:', upRes.error); setScopeSaveError('Scope answers not saved this turn. Your interview continues normally.'); }
      else setScopeSaveError(null);
    } catch (e) {
      console.error('[persistScopeAnswers]', e);
      setScopeSaveError('Scope answers not saved this turn. Your interview continues normally.');
    }
  };

  // SCOPE_PREFILL P3/P4a — parse the job's Scope of Work into pre-answers on configurator entry.
  // HIGH → persisted confirmed (skipped, chip); MED → proposed (pre-selected for one-tap confirm).
  // P4a COMMIT 1: the parser reads jobs.scope server-side, but the rep types into estForm.scope
  // (never persisted before P4a — the live bug). Persist the box scope → jobs.scope (AWAITED) BEFORE
  // parsing so the fn sees the real text; jobs.scope is the canonical last-parsed text. Silent
  // degradation: any failure logs (console + captureFailedIntent), configurator runs as today.
  const runScopePrefill = async (pt) => {
    try {
      if (!pt || !job?.id) return;
      const scopeText = (estForm.scope || '').trim();
      if (!scopeText) return;
      const scopeChanged = scopeText !== (job.scope || '').trim();
      // Save → await → parse (order critical). Also update the in-memory prop so the guard is fresh.
      if (scopeChanged) { await upd({ scope: estForm.scope }); job.scope = estForm.scope; }
      const existing = await sbLoadScopeAnswers(job.id);
      if (!existing.ok) return;
      const rows0 = existing.data || [];
      // P4a COMMIT 2 — re-parse when there's something new: an EDITED scope, or no answers yet.
      // Unchanged scope + answers already present → read-back only (no parser call; API-cost rule).
      if (!scopeChanged && rows0.length > 0) return;
      // NEVER overwrite a human answer: protect any field that's human-confirmed (confirmed_by set)
      // or not scope-prefill-sourced (a rep/client pick). Only stale auto-prefills (source
      // scope_prefill, confirmed_by null) may be replaced by a re-parse.
      const protectedKeys = new Set(rows0.filter(r => r.source !== 'scope_prefill' || r.confirmed_by).map(r => r.field_key));
      const res = await sbScopePrefill(job.id, pt);
      if (!res.ok) {
        console.error('[scopePrefill]', res.error);
        captureFailedIntent({ kind: 'scope_prefill', payload: { jobId: job.id, projectType: pt }, jobId: job.id, message: res.error, resumable: false }).catch(() => {});
        return;
      }
      const rows = (res.data.answers || [])
        .filter(a => (a.confidence === 'high' || a.confidence === 'med') && !protectedKeys.has(a.field_key))
        .map(a => ({
          field_key: a.field_key,
          option_key: a.option_key,
          value: a.option_key,
          source: 'scope_prefill',
          status: a.confidence === 'high' ? 'confirmed' : 'proposed',
          evidence_phrase: a.evidence_phrase || null,
        }));
      // P4b COMMIT 1 — stale-prefill cleanup: on a re-parse, drop auto-prefills for fields the edited
      // scope NO LONGER mentions (not returned by the new parse). Only untouched auto rows
      // (source scope_prefill, confirmed_by null); human-confirmed / rep answers are never deleted.
      const returnedKeys = new Set((res.data.answers || []).map(a => a.field_key));
      const staleKeys = rows0
        .filter(r => r.source === 'scope_prefill' && !r.confirmed_by && !returnedKeys.has(r.field_key))
        .map(r => r.field_key);
      if (staleKeys.length) await sbDeleteScopeAnswers(job.id, staleKeys);
      if (rows.length) await persistScopeAnswers(rows);
    } catch (e) {
      console.error('[scopePrefill]', e);
      captureFailedIntent({ kind: 'scope_prefill', payload: { jobId: job?.id }, jobId: job?.id, message: e?.message, resumable: false }).catch(() => {});
    }
  };

  // SCOPE_VISION P1 — on estimate entry, if the job has photos, have Haiku VIEW them and pre-answer
  // the EXISTING-condition fields it can SEE (tub/shower, wall/floor finish, vanity, glass) as
  // source='photo' status='proposed' (rep confirms — photos are interpretive). Gap-fill only: never
  // overwrites a field text-prefill or a human already answered. Fires once per estimate (skips if
  // photo answers already exist). Silent degradation.
  const runScopeVision = async (pt) => {
    try {
      if (!pt || !job?.id || !hasJobPhotos) return;
      const existing = await sbLoadScopeAnswers(job.id);
      if (!existing.ok) return;
      const rows0 = existing.data || [];
      if (rows0.some(r => r.source === 'photo')) return;       // vision already ran (cost guard)
      const answeredKeys = new Set(rows0.map(r => r.field_key)); // fields text-prefill/human already own
      const res = await sbScopeVision(job.id, pt);
      if (!res.ok) {
        console.error('[scopeVision]', res.error);
        captureFailedIntent({ kind: 'scope_vision', payload: { jobId: job.id, projectType: pt }, jobId: job.id, message: res.error, resumable: false }).catch(() => {});
        return;
      }
      const rows = (res.data.answers || [])
        .filter(a => (a.confidence === 'high' || a.confidence === 'med') && !answeredKeys.has(a.field_key))
        .map(a => ({
          field_key: a.field_key,
          option_key: a.option_key,
          value: a.option_key,
          source: 'photo',
          status: 'proposed',                                   // interpretive — rep confirms
          evidence_phrase: a.evidence_phrase || null,
        }));
      if (rows.length) await persistScopeAnswers(rows);
    } catch (e) {
      console.error('[scopeVision]', e);
      captureFailedIntent({ kind: 'scope_vision', payload: { jobId: job?.id }, jobId: job?.id, message: e?.message, resumable: false }).catch(() => {});
    }
  };

  // SCOPE_VISION P2 — scan = MEASURE. On estimate entry, persist the scan's floor_sf + ceiling
  // height as source='measured' status='confirmed' (the scan measured it — skip those questions;
  // rep can override via the chip). Gap-fill only; never overwrites a human/text answer.
  const runScanMeasurements = async (pt) => {
    try {
      if (!pt || !job?.id || !scanMeas) return;
      const existing = await sbLoadScopeAnswers(job.id);
      if (!existing.ok) return;
      const answeredKeys = new Set((existing.data || []).map(r => r.field_key));
      const rows = [];
      if (scanMeas.floor_sf != null && !answeredKeys.has('floor_sf'))
        rows.push({ field_key: 'floor_sf', value: String(scanMeas.floor_sf), source: 'measured', status: 'confirmed', evidence_phrase: `${scanMeas.floor_sf} sq ft measured by the room scan` });
      if (scanMeas.wall_height_in != null && !answeredKeys.has('wall_height_in'))
        rows.push({ field_key: 'wall_height_in', value: String(scanMeas.wall_height_in), source: 'measured', status: 'confirmed', evidence_phrase: `${scanMeas.wall_height_in} in ceiling height from the scan` });
      if (rows.length) await persistScopeAnswers(rows);
    } catch (e) {
      console.error('[scanMeasurements]', e);
    }
  };

  const startEstimate = async () => {
    if (!estForm.scope.trim() && !hasJobPhotos && !scanMeas) return; // SCOPE_VISION — photos/scan alone can start
    setEstStarted(true);
    const prompt = `Generate a detailed estimate for the following project:\n\nJob Address: ${job.address}\nScope of Work: ${estForm.scope}\n${estForm.rooms ? `Rooms: ${estForm.rooms}\n` : ''}${interviewSf ? `Square Footage: ${interviewSf} sqft\n` : ''}${estForm.special ? `Special Notes: ${estForm.special}\n` : ''}`;
    const pt = resolveProjectType();
    if (pt) {
      // ESTIMATE_CONFIGURATOR S2: the tap-through configurator drives scope capture (deterministic,
      // no LLM turn here). Seed the conversation with the scope prompt so the UNCHANGED pricing path
      // still has context; the configurator persists structured answers + hands off on complete.
      await runScopePrefill(pt); // SCOPE_PREFILL P3 — seed answers from the TEXT scope
      await runScopeVision(pt);  // SCOPE_VISION P1 — seed existing conditions from the PHOTOS (gap-fill)
      await runScanMeasurements(pt); // SCOPE_VISION P2 — seed measurements from the SCAN (floor_sf, height)
      setScopeInterviewActive(true);
      setScopeComplete(false);
      setForceDraftedIncomplete(false);
      setConfiguratorPath(true); // Phase 6a — hide chat/prompt, land on the breakdown
      setEstMessages([{ role: 'user', content: prompt }]);
    } else {
      setConfiguratorPath(false);
      await sendEstimatorMessage(prompt, estFiles.length ? estFiles : null);
    }
  };

  // ESTIMATE_CONFIGURATOR S2 — configurator finished. Inject a scope summary into the conversation
  // so the UNCHANGED pricing path prices from the captured answers, then flip scopeComplete (the
  // [scopeComplete] effect runs pricing). Answers are already persisted + trade-derived server-side.
  const handleConfiguratorComplete = (answersMap) => {
    const summary = Object.entries(answersMap || {})
      .map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${String(v).replace(/_/g, ' ')}`).join('\n');
    setEstMessages(prev => [...prev, { role: 'assistant', content: summary ? `Scope captured:\n${summary}` : 'Scope captured.' }]);
    setScopeInterviewActive(false);
    setScopeComplete(true);
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
      const val = parseFloat(entered);
      if (!entered || isNaN(val) || val <= 0) return line; // leave as TBD
      // Phase 5 — LUMP SUM: the entered value IS the whole line total. Shape matches the existing
      // LS render (quantity=1, unit='LS', unit_price=lump). rate_provenance='lump_sum' is an
      // EXPLICIT marker; and an LS gap is NEVER pushed to learnCandidates → it can't reach
      // sbInsertRateBookLabor and pollute per-unit rate learning (the Rate Book guard).
      if (gapModes[line.gap_key] === 'ls') {
        return { ...line, quantity: 1, unit: 'LS', unit_price: val, amount: Math.round(val * 100) / 100, source_label: 'user_entered', rate_provenance: 'lump_sum' };
      }
      // S7 provenance — derived from the entered value vs the cited KC anchor.
      // No anchor → rep_entered. Anchor + same number (numeric) → accepted. Else → override.
      const anchor = line.regional_rate;
      const rate_provenance = (anchor == null)
        ? 'rep_entered'
        : (Math.abs(val - Number(anchor)) < 0.005 ? 'rep_accepted_anchor' : 'rep_override');
      // B2.3 learn hook — collect filled labor gaps for the save offer (no persist here).
      // S8: carry the provenance tag so the rate_book write records how the rate was set.
      if (line.category === 'labor') {
        candidates.push({ gap_key: line.gap_key, trade: line.trade, line_item: line.line_item, unit: line.unit, rate: val, source: rate_provenance });
      }
      // source_label stays 'user_entered' for the pricing/badge layer (unchanged readers);
      // rate_provenance is the new carrier that survives to commit (S9).
      return { ...line, unit_price: val, amount: Math.round(val * line.quantity * 100) / 100, source_label: 'user_entered', rate_provenance };
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
        // ESTIMATE_INTEGRITY Fix 3 — outside-scope (recommended) lines never enter the committed total.
        const items = pricedScope.filter(line => !line.outside_scope).map(line => ({
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
          rate_provenance: line.rate_provenance ?? null, // S9: HOW the gap rate was set, persisted
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
        return { ok: true, items: refreshed || [] }; // Phase 6b — Proposal folds this in
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
      setEstCommitting(false);
      return { ok: true, items: refreshed || [] };
    } catch (e) {
      console.error('commitEstimateFromChat error:', e);
      setEstCommitMsg('Commit failed — try again.');
    }
    setEstCommitting(false);
    return { ok: false };
  };

  // Phase 1b — client price of a line (markup applied), matching the proposal PDF. Feeds the guard.
  const clientPriceOf = (li) => {
    const cost = Number(li.total_cost ?? 0);
    const rate = markupRateForCategory(li.category, { laborPct: Number(job.labor_markup_pct || 0), materialPct: Number(job.material_markup_pct || 0), categoryConfig });
    return cost * (1 + rate / 100);
  };
  const sanityFlags = useMemo(
    () => computeSanityFlags(lineItems, clientPriceOf, rateBookRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineItems, rateBookRows, categoryConfig, job.labor_markup_pct, job.material_markup_pct],
  );

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

  // PROPOSAL_STATE — client-price total of the current proposal (matches the Proposal preview math).
  const computeProposalTotal = () => {
    const lp = Number(job.labor_markup_pct || 0);
    const mp = Number(job.material_markup_pct || 0);
    const clientSub = lineItems.reduce((s, li) =>
      s + Number(li.total_cost ?? 0) * (1 + markupRateForCategory(li.category, { laborPct: lp, materialPct: mp, categoryConfig }) / 100), 0);
    return clientSub + Number(propPmFee || 0);
  };

  const saveEstimatePDF = async () => {
    if (!lineItems.length) { setEstSaveMsg('No line items — run the estimator first'); return; }
    setEstSaving(true); setEstSaveMsg('');
    try {
      const blob = _buildProposalDoc().output('blob');
      const file = new File([blob], `Proposal — ${job.address}.pdf`, { type: 'application/pdf' });
      const r = await sbUploadDoc(job.id, file, 'proposal');
      if (r.doc && setDocs) setDocs(p => [r.doc, ...p]);
      // PROPOSAL_STATE draft moment — record/refresh the draft row (don't stack drafts).
      sbUpsertProposalDraft(job.id, { pdfPath: r.doc?.storage_path ?? null, total: computeProposalTotal() }).catch(() => {});
      setEstSaveMsg(r.doc ? 'Saved to Documents' : 'Save failed — try again');
    } catch (e) { setEstSaveMsg('Save failed — try again'); }
    setEstSaving(false); setTimeout(() => setEstSaveMsg(''), 3000);
  };

  const sendEstimateToClient = async () => {
    if (!job.client_email) { setEstSaveMsg('No client email on this job'); return; }
    if (!lineItems.length) { setEstSaveMsg('No line items — run the estimator first'); return; }
    // Phase 1b — price sanity guard. Block the client-facing send until flagged lines are
    // corrected or explicitly acknowledged. A guard, not an auto-correct — the human decides.
    if (sanityFlags.length && !sanityAck) {
      setEstSaveMsg(`${sanityFlags.length} line(s) look mispriced — review the price check below and acknowledge or fix before sending`);
      return;
    }
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
      const upl = await sbUploadDoc(job.id, file, 'proposal');
      // PROPOSAL_STATE send moment — flip the draft to sent (or create-as-sent); supersedes prior sent.
      sbMarkProposalSent(job.id, { pdfPath: upl.doc?.storage_path ?? null, total: computeProposalTotal() }).catch(() => {});
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
    setPropLoading(true); setPropErr('');
    try {
      // Phase 6b — Proposal performs the commit itself (all side effects) when there's an
      // uncommitted priced draft, then builds the proposal. Reload committed rows to avoid racing
      // the async lineItems state. A commit failure surfaces here and blocks the proposal.
      let items = (await sbLoadEstimateLineItems(job.id)) || [];
      if (!items.length && pricedScope?.length) {
        const r = await commitEstimateFromChat();
        if (!r?.ok) { setPropErr('Could not create line items — ' + (estCommitMsg || 'commit failed') + '. Nothing was sent.'); setPropLoading(false); return; }
        items = r.items?.length ? r.items : ((await sbLoadEstimateLineItems(job.id)) || []);
      }
      if (!items.length) { setPropErr('No line items yet — run the estimator first.'); setPropLoading(false); return; }
      setLineItems(items);
      const moments = await sbLoadOhShitMoments(job.id);
      setPropOhShit(moments);
      if (moments.length) setPropOhShitExpanded(true);
      setPropNum(`${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`);

      // Populate preview list from DB rows — map to {trade, description, qty_label, amount (client price), category}
      const lp = Number(job.labor_markup_pct || 0);
      const mp = Number(job.material_markup_pct || 0);
      const previewItems = items.map(li => {
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
            <label className="flbl">Floor Plan / Photos <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>(optional — PDFs or images, attach several)</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: CREAM, border: `1px dashed ${GOLD}`, borderRadius: 4, padding: '10px 14px', cursor: 'pointer' }}>
              {/* accept image/*,.pdf + NO capture → iOS presents the full sheet incl. "Choose Files" */}
              <input type="file" accept="image/*,.pdf,.json,application/json" multiple style={{ display: 'none' }} onChange={e => { handleUploadInput(e.target.files); e.target.value = ''; }} />
              <span style={{ width: 16, height: 16, color: GOLD }}>{Ic.plus}</span>
              <span style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Attach floor plans or photos</span>
            </label>
            {/* Attach from this job — the app's own saved scans AND photos, no export/re-import */}
            <button type="button" onClick={toggleJobPlans} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, background: 'transparent', border: 'none', color: NAV, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              <span style={{ width: 14, height: 14, color: GOLD }}>{Ic.folder}</span>
              Attach from this job
            </button>
            {jobPlansOpen && (
              <div style={{ marginTop: 6, border: `1px solid ${BORDER}`, borderRadius: 6, background: '#fff', overflow: 'hidden' }}>
                {jobPlansBusy ? (
                  <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-subtle)' }}>Loading…</div>
                ) : (
                  <>
                    {/* Section: Scans & floor plans */}
                    <div style={{ padding: '7px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--text-subtle)', background: CREAM, borderBottom: `1px solid ${BORDER}` }}>Scans & floor plans</div>
                    {(jobPlans && jobPlans.length) ? jobPlans.map(fp => (
                      <div key={fp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{ width: 15, height: 15, color: GOLD, flexShrink: 0 }}>{Ic.doc}</span>
                        <span style={{ flex: 1, fontSize: 12, color: NAV, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fp.name}</span>
                        <button type="button" disabled={jobPlanFetchId === fp.id} onClick={() => attachJobPlan(fp)} style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: NAV, cursor: 'pointer' }}>{jobPlanFetchId === fp.id ? 'Attaching…' : 'Attach'}</button>
                      </div>
                    )) : (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-subtle)', borderBottom: `1px solid ${BORDER}` }}>No saved floor plans yet — scan a room from the Scanner tab.</div>
                    )}

                    {/* Section: Photos — thumbnail grid, multi-select */}
                    <div style={{ padding: '7px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--text-subtle)', background: CREAM, borderBottom: `1px solid ${BORDER}` }}>Photos</div>
                    {(jobPhotos && jobPhotos.length) ? (
                      <div style={{ padding: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
                          {(photoShowAll ? jobPhotos : jobPhotos.slice(0, 12)).map(p => {
                            const sel = photoSel.has(p.id);
                            return (
                              <button key={p.id} type="button" onClick={() => togglePhotoSel(p.id)} title={p.name}
                                style={{ position: 'relative', padding: 0, border: sel ? `2px solid ${GOLD}` : `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: CREAM }}>
                                <img src={p.url} alt={p.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: sel ? 0.85 : 1 }} />
                                {sel && <span style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: GOLD, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
                              </button>
                            );
                          })}
                        </div>
                        {jobPhotos.length > 12 && !photoShowAll && (
                          <button type="button" onClick={() => setPhotoShowAll(true)} style={{ marginTop: 8, background: 'transparent', border: 'none', color: NAV, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Show all {jobPhotos.length} photos</button>
                        )}
                        {photoSel.size > 0 && (
                          <button type="button" disabled={photoAttachBusy} onClick={attachSelectedPhotos} className="btn btn-navy" style={{ marginTop: 10, width: '100%', fontSize: 13 }}>
                            {photoAttachBusy ? 'Attaching…' : `Attach ${photoSel.size} photo${photoSel.size > 1 ? 's' : ''}`}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-subtle)' }}>No photos on this job yet.</div>
                    )}
                  </>
                )}
              </div>
            )}
            {estFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {estFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: NAV, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '5px 10px' }}>
                    <span style={{ width: 14, height: 14, color: GOLD, flexShrink: 0 }}>{Ic.doc}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button type="button" onClick={() => removeEstFile(i)} style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {attachError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: 'var(--red-text-strong)', background: 'var(--red-bg)', border: '1px solid var(--red-text)', borderRadius: 6, padding: '6px 10px' }}>
                <span>⚠ {attachError}</span>
                <button type="button" onClick={() => setAttachError(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--red-text-strong)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            )}
          </div>
          {(() => { const canGen = !!((estForm.scope.trim() || hasJobPhotos || scanMeas) && (Number(interviewSf) > 0 || (scanMeas?.area_sqft || 0) > 0)); return (
          <button className={`btn ${canGen ? 'btn-navy' : 'btn-ghost'}`} style={{ width: '100%' }} onClick={startEstimate} disabled={!canGen || estLoading}>
            {estLoading ? 'Generating…' : 'Generate Estimate'}
          </button>
          ); })()}
          {/* P4b C5b — Start fresh stays VISIBLE in the form view (was hidden when !estStarted, so it
              vanished after a reset and confused the owner). Disabled, with a tooltip, when there's
              nothing to clear (no committed line items). */}
          {(() => { const clearable = lineItems.length > 0; return (
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8, fontSize: 11 }} onClick={openResetDialog} disabled={!clearable}
            title={clearable ? 'Clear this estimate and start over' : 'Nothing to clear yet'}>
            Start fresh
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
            {/* Phase 6b — "Commit to Line Items" collapsed into "Proposal →" (it performs the commit
                with all side effects, then proceeds; a commit failure surfaces on the proposal view). */}
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={saveEstimatePDF} disabled={estSaving || lineItems.length === 0}>{estSaving ? 'Saving…' : 'Save PDF'}</button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={sendEstimateToClient} disabled={estSendingClient}>{estSendingClient ? 'Sending…' : 'Send to Client'}</button>
            <button className="btn btn-gold" style={{ fontSize: 11 }} onClick={openProposal} disabled={estCommitting || (!pricedScope?.length && !lineItems.length)}>{estCommitting ? 'Committing…' : 'Proposal →'}</button>
            <button className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={openResetDialog}>Start fresh</button>
          </div>
          {/* Phase 1b — price sanity guard. Blocks Send to Client until flagged lines are fixed or acknowledged. */}
          {sanityFlags.length > 0 && (
            <div style={{ margin: '4px 0 8px', border: '1px solid var(--amber-border-soft, #FCD34D)', background: 'var(--amber-bg-soft, #FEF3C7)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-text-strong, #92400E)', marginBottom: 6 }}>
                ⚠ Price check — {sanityFlags.length} line(s) look mispriced (a client should not see these as-is)
              </div>
              {sanityFlags.map((fl, i) => (
                <div key={fl.id ?? i} style={{ fontSize: 11, color: 'var(--amber-text-strong, #92400E)', padding: '2px 0' }}>
                  <span style={{ fontWeight: 600 }}>{fl.description || '(line)'}</span> — {fl.reasons.join('; ')}
                </div>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: 'var(--amber-text-strong, #92400E)', cursor: 'pointer' }}>
                <input type="checkbox" checked={sanityAck} onChange={e => setSanityAck(e.target.checked)} />
                I reviewed these — send anyway
              </label>
            </div>
          )}
          {/* TAKEOFF_BRIDGE Phase 2 — double-count awareness (warn, don't block). */}
          {takeoffOverlap && pricedScope?.length > 0 && (
            <div style={{ margin: '4px 0 8px', border: '1px solid var(--amber-border-soft, #FCD34D)', background: 'var(--amber-bg-soft, #FEF3C7)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--amber-text-strong, #92400E)', lineHeight: 1.5 }}>
              <strong>⚠ Double-price warning.</strong> This job already has {takeoffOverlap.count} takeoff-priced line{takeoffOverlap.count !== 1 ? 's' : ''}
              {takeoffOverlap.trades.length > 0 && <> covering <strong>{takeoffOverlap.trades.join(', ')}</strong></>}.
              {' '}Committing this estimator draft for the same scope will double-price it.
            </div>
          )}
          {pricedScope?.length > 0 && (
            <>
              <StructuredEstimate
                lines={pricedScope}
                markupPct={pricedMeta?.markupPct ?? 0}
                pmFee={pricedMeta?.pmFee ?? 0}
                financialModel={pricedMeta?.financialModel}
                markupSource={(Number(job.default_markup_pct) > 0 || Number(job.labor_markup_pct) > 0) ? "this job's rate" : 'Bid Config default'}
              />
              {untranslatedFields.length > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, color: NAV }}>
                  <span style={{ flexShrink: 0, marginTop: 1 }}>ℹ</span>
                  <span><strong>Captured but not yet priced:</strong> {untranslatedFields.map(f => f.replace(/_/g, ' ')).join(', ')} — add takeoff mappings to price these fields.</span>
                </div>
              )}
              {(() => {
                const gaps = pricedScope.filter(l => l.source_label === 'regional_avg' && l.gap_key);
                return gaps.length > 0
                  ? <GapBatchAsk gaps={gaps} gapRates={gapRates} setGapRates={setGapRates} gapModes={gapModes} setGapModes={setGapModes} onApply={applyGapRates} />
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
              {/* Phase 6a — the raw transcript toggle is a chat-path affordance; hidden on the configurator path. */}
              {!configuratorPath && (
                <button
                  onClick={() => setShowRaw(r => !r)}
                  style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 8px', minHeight: 36, display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
                >
                  {showRaw ? '▲ Hide raw' : '▼ View raw estimate'}
                </button>
              )}
            </>
          )}
          {/* Phase 6a — configurator path: clean loading state while pricing runs; never the prompt/chat. */}
          {configuratorPath && scopeComplete && !pricedScope?.length && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              <div style={{ fontWeight: 600, color: 'var(--navy-900)', marginBottom: 4 }}>Building your estimate…</div>
              <div style={{ fontSize: 12 }}>Pricing your scope against the rate book.</div>
            </div>
          )}
          {!configuratorPath && (!pricedScope?.length || showRaw) && (
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
          {scopeInterviewActive && !scopeComplete && (
            <ScopeConfigurator
              jobId={job.id}
              projectType={resolveProjectType()}
              persistAnswers={persistScopeAnswers}
              onComplete={handleConfiguratorComplete}
              onSkip={forceDraftAnyway}
            />
          )}
          {scopeSaveError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--red-text-strong)', background: 'var(--red-bg)', border: '1px solid var(--red-text)', borderRadius: 6, padding: '8px 12px' }}>
              <span>⚠ {scopeSaveError}</span>
              <button onClick={() => setScopeSaveError(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--red-text-strong)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          )}
          {/* Chat input — hidden while the configurator is capturing scope (it IS the input);
              returns for follow-ups on the priced estimate. */}
          {(!scopeInterviewActive || scopeComplete) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {estFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {estFiles.map((f, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: NAV, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '4px 8px', maxWidth: 220 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button type="button" onClick={() => removeEstFile(i)} style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            {attachError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--red-text-strong)', background: 'var(--red-bg)', border: '1px solid var(--red-text)', borderRadius: 6, padding: '6px 10px' }}>
                <span>⚠ {attachError}</span>
                <button type="button" onClick={() => setAttachError(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--red-text-strong)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>
                <input type="file" accept="image/*,.pdf,.json,application/json" multiple style={{ display: 'none' }} onChange={e => { handleUploadInput(e.target.files); e.target.value = ''; }} />
                <span style={{ width: 16, height: 16, color: 'var(--text-subtle)' }}>{Ic.plus}</span>
              </label>
              <input className="finp" style={{ flex: 1, margin: 0 }} value={estInput} onChange={e => setEstInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendEstimatorMessage()} placeholder="Ask a follow-up — adjust scope, change materials, add a trade…" disabled={estLoading} />
              <button className="btn btn-navy" onClick={() => sendEstimatorMessage()} disabled={estLoading || (!estInput.trim() && !estFiles.length)}>Send</button>
            </div>
          </div>
          )}
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
      {/* SCAN_INGEST v2 — import confirm for an uploaded avenstone-scan JSON */}
      {pendingScanImport && (
        <div className="overlay" onClick={() => !scanImporting && setPendingScanImport(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,31,68,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 22, maxWidth: 420, width: '100%', boxShadow: '0 10px 40px rgba(10,31,68,0.3)' }}>
            <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 19, color: NAV, margin: '0 0 8px' }}>Import this scan?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-subtle)', margin: '0 0 6px' }}>
              <strong style={{ color: NAV }}>{pendingScanImport.filename}</strong>
            </p>
            <p style={{ fontSize: 13, color: NAV, margin: '0 0 18px' }}>
              {(pendingScanImport.artifact?.scan?.rooms || []).length} room{(pendingScanImport.artifact?.scan?.rooms || []).length === 1 ? '' : 's'} will be added to <strong>{job.name || 'this job'}</strong> — same as a fresh capture (rooms, dimensions, and takeoff visibility). This scan file won’t be sent to the estimator.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" disabled={scanImporting} onClick={() => setPendingScanImport(null)}>Cancel</button>
              <button className="btn btn-navy" disabled={scanImporting} onClick={confirmImportScan}>{scanImporting ? 'Importing…' : 'Import to this job'}</button>
            </div>
          </div>
        </div>
      )}
      {scanImportMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--green-text, #065F46)', background: 'var(--green-bg, #D1FAE5)', border: '1px solid #6EE7B7', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <span>✓ {scanImportMsg}</span>
          <button onClick={() => setScanImportMsg(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
      {/* ESTIMATE_INTEGRITY Fix 1 — Start fresh confirm */}
      {resetDlg && (
        <div className="overlay" onClick={() => !resetBusy && setResetDlg(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,31,68,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 22, maxWidth: 440, width: '100%', boxShadow: '0 10px 40px rgba(10,31,68,0.3)' }}>
            <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 19, color: NAV, margin: '0 0 6px' }}>Start fresh estimate?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-subtle)', margin: '0 0 12px' }}>
              This makes it as if the estimate never happened — the whole draft stack is cleared so a re-scope can't inherit the old numbers.
            </p>
            {/* Plain rows: what always clears */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, fontSize: 13, color: NAV }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Scope answers (interview/configurator)</span><strong>{resetDlg.scopeCount}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Committed line items (ai + takeoff)</span><strong>{resetDlg.aiLines + resetDlg.takeoffLines}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Takeoff scope tags</span><strong>{resetDlg.roomScopes}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Estimate chat draft</span><strong>{resetDlg.hasDraft ? 'yes' : '—'}</strong></div>
            </div>
            {/* Toggles: measurements (off) + protected client selections (extra tick) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: resetDlg.measuredCount ? NAV : 'var(--text-subtle)', cursor: resetDlg.measuredCount ? 'pointer' : 'default' }}>
                <input type="checkbox" disabled={!resetDlg.measuredCount} checked={resetOpts.measured} onChange={e => setResetOpts(p => ({ ...p, measured: e.target.checked }))} style={{ marginTop: 2 }} />
                <span>Also clear scan measurements <strong>({resetDlg.measuredCount})</strong> — floor SF / heights. Usually still true; off by default.</span>
              </label>
              {resetDlg.clientCount > 0 && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#92400E', background: 'var(--warning-bg, #FEF3C7)', border: '1px solid #FCD34D', borderRadius: 6, padding: '8px 10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={resetOpts.client} onChange={e => setResetOpts(p => ({ ...p, client: e.target.checked }))} style={{ marginTop: 2 }} />
                  <span>⚠ Also clear <strong>{resetDlg.clientCount}</strong> confirmed client selection{resetDlg.clientCount === 1 ? '' : 's'} — the homeowner's own picks. Tick only if you mean to discard them.</span>
                </label>
              )}
            </div>
            {(resetDlg.proposals?.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
                {resetDlg.proposals.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: p.status === 'sent' ? '#92400E' : NAV }}>
                    {p.status === 'sent'
                      ? <span>⚠ Proposal v{p.version} sent to client{p.sent_at ? ` on ${new Date(p.sent_at).toLocaleDateString()}` : ''} — marked <strong>superseded</strong>, not deleted.</span>
                      : <span>Proposal v{p.version} (draft) — <strong>deleted</strong>.</span>}
                  </div>
                ))}
              </div>
            )}
            {resetError && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--red-text-strong)', background: 'var(--red-bg)', border: '1px solid var(--red-text)', borderRadius: 6, padding: '8px 10px', marginBottom: 12 }}>
                <span>⛔ {resetError}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" disabled={resetBusy} onClick={() => setResetDlg(null)}>Cancel</button>
              <button className="btn btn-navy" disabled={resetBusy} onClick={confirmReset}>{resetBusy ? 'Verifying…' : (resetError ? 'Retry' : 'Start fresh')}</button>
            </div>
          </div>
        </div>
      )}
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

