import { createClient } from '@supabase/supabase-js';
import { runGatesForTransition, getNextPhase, PHASE_LABELS } from './phaseGates.js';
import { runTodoEngine } from './todoEngine.js';
import { checkAndCreateSubStart } from './scheduleAutoCreate.js';
import { checkAndAutoInvoice } from './autoInvoice.js';
import { countPhotosForEntity } from './photoGate.js';
import { getTemplateItems } from './siteVisitTemplates.js';
import { captureTradeActualsForJob } from './tradeActuals.js';
import { normalizeFloorPlan } from './floorPlan/normalize.js';
import { markupRateForCategory, normalizeCategoryKey, DEFAULT_CATEGORY_CONFIG } from './markupConfig.js';
import { canonicalizeTrade } from './tradeUtils.js';

// ─── Client ───────────────────────────────────────────────────────────────────
export const sb = createClient(
  'https://cbfftukmhqvvjlrlnltk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ',
  { auth: { detectSessionInUrl: true, flowType: 'implicit' } }
);

// ─── Session state (set on login, used by helpers) ───────────────────────────
export let AV_TENANT = null;
export let AV_USER_ID = null;
export let AV_JOBS = [];
export const setSession = (tenantId, userId) => { AV_TENANT = tenantId; AV_USER_ID = userId; };
export const setGlobalJobs = jobs => { AV_JOBS = jobs; };

// ─── Edge function URLs ───────────────────────────────────────────────────────
export const SUPABASE_URL = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
export const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ';
const FN = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1';
export const INVITE_URL        = `${FN}/send-invite`;
export const CLIENT_LINK_URL          = `${FN}/send-client-link`;
export const CREATE_CLIENT_LOGIN_URL  = `${FN}/create-client-login`;
export const PAYMENT_LINK_URL  = `${FN}/create-payment-link`;
export const AI_ESTIMATOR_URL  = `${FN}/ai-estimator`;
export const CONTRACT_EMAIL_URL = `${FN}/send-contract-email`;
export const NOTIFY_REALTOR_URL = `${FN}/notify-realtor`;
export const NOTIFY_EMAIL_URL   = `${FN}/notify-email`;
export const authHeader = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` });
export const AI_PM_URL                  = `${FN}/ai-project-manager`;
export const AI_COMPANION_URL           = `${FN}/ai-companion`;
export const AI_HOME_URL                = `${FN}/ai-home-companion`;
export const PROCESS_TRANSCRIPT_URL     = `${FN}/process-transcript`;
export const GENERATE_ESTIMATE_URL      = `${FN}/generate-estimate-from-session`;
export const AI_ERROR_LOGGER_URL        = `${FN}/ai-error-logger`;
export const AI_FIELD_AGENT_URL         = `${FN}/ai-field-agent`;
export const MEASURE_GUIDE_URL          = `${FN}/measure-guide`;
export const AI_MASTER_URL              = `${FN}/ai-master-agent`;
export const ADDRESS_AUTOCOMPLETE_URL   = `${FN}/address-autocomplete`;
export const GET_CONTRACTOR_PROFILE_URL = `${FN}/get-contractor-profile`;
export const GET_JOB_STATUS_URL         = `${FN}/get-job-status`;
export const SUBMIT_BID_RESPONSE_URL    = `${FN}/submit-bid-response`;
export const VIEW_ENGAGEMENT_URL        = `${FN}/view-engagement`;
export const SUBMIT_BUG_REPORT_URL      = `${FN}/submit-bug-report`;
export const AI_DAILY_LOG_DRAFT_URL     = `${FN}/ai-daily-log-draft`;
export const AI_CATEGORIZE_URL          = `${FN}/ai-categorize-file`;
export const AI_EXTRACT_SUB_INVOICE_URL = `${FN}/ai-extract-sub-invoice`;
export const FIELD_OPUS_CHAT_URL        = `${FN}/field-opus-chat`;
export const FIELD_OPUS_DISPATCH_URL    = `${FN}/field-opus-dispatch-to-vm`;

// ─── Jobs ─────────────────────────────────────────────────────────────────────
export const sbSave = async j => {
  try {
    const { error } = await sb.from('jobs').insert({
      id: j.id, tenant_id: AV_TENANT, address: j.address, status: j.status,
      scope: j.scope || '', sqft: j.sqft || '', created_at: j.created,
      intake_answers: j.ans || {}, client_name: j.client_name || '',
      client_phone: j.client_phone || '', client_email: j.client_email || '',
      assigned_rep: j.assigned_rep || '', assigned_subs: j.assigned_subs || '',
      contract_value: Number(j.contract_value || 0), co_total: Number(j.co_total || 0),
      target_completion: j.target_completion || '',
      referring_realtor_name: j.referring_realtor_name || '',
      referring_realtor_phone: j.referring_realtor_phone || '',
      referring_realtor_email: j.referring_realtor_email || '',
    });
    if (error) return { ok: false, error: error.message };
    sbSeedJobPhases(j.id, AV_TENANT).catch(() => {});
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message || 'Unknown error' }; }
};

export const sbLoad = async repName => {
  try {
    let q = sb.from('jobs').select('*').order('created_at', { ascending: false });
    if (repName) q = q.eq('assigned_rep', repName);
    const { data, error } = await q;
    if (error || !data) return null;
    return await Promise.all(data.map(async j => {
      // slice 7/12: photos now read from job_files (source of truth); id is job_files.id
      const [{ data: ph }, { data: nt }, { data: co }] = await Promise.all([
        sb.from('job_files')
          .select('id, storage_path, storage_bucket, name, mime_type, subcategory, client_visible, created_at')
          .eq('job_id', j.id)
          .eq('storage_bucket', 'job-photos')
          .eq('lifecycle_status', 'active')
          .order('created_at', { ascending: true }),
        sb.from('job_notes').select('*').eq('job_id', j.id).order('created_at', { ascending: false }),
        sb.from('change_orders').select('*').eq('job_id', j.id).order('created_at', { ascending: false }),
      ]);
      return {
        id: j.id, address: j.address, status: j.status, scope: j.scope || '',
        sqft: j.sqft || '', created: j.created_at, ans: j.intake_answers || {},
        client_name: j.client_name || '', client_phone: j.client_phone || '',
        client_email: j.client_email || '', assigned_rep: j.assigned_rep || '',
        assigned_subs: j.assigned_subs || '', contract_value: Number(j.contract_value || 0),
        co_total: Number(j.co_total || 0), target_completion: j.target_completion || '',
        contract_signed: j.contract_signed || false, contract_signed_at: j.contract_signed_at || null,
        referring_realtor_name: j.referring_realtor_name || '',
        referring_realtor_phone: j.referring_realtor_phone || '',
        referring_realtor_email: j.referring_realtor_email || '',
        status_token: j.status_token || '',
        cost_plus: j.cost_plus || false,
        default_markup_pct: Number(j.default_markup_pct || 0),
        labor_markup_pct: Number(j.labor_markup_pct || 0),
        material_markup_pct: Number(j.material_markup_pct || 0),
        pm_fee: Number(j.pm_fee || 0),
        retainage_pct: Number(j.retainage_pct || 0),
        client_user_id: j.client_user_id || null,
        photos: (ph || []).map(jf => ({
          id: jf.id,  // job_files.id — used by sbDeleteJobPhoto and sbLabelPhoto
          type: jf.mime_type?.startsWith('video/') ? 'video' : 'photo',
          url: sb.storage.from(jf.storage_bucket).getPublicUrl(jf.storage_path).data?.publicUrl || '',
          name: jf.name,
          label: jf.subcategory?.toLowerCase() || null,  // 'Before'→'before', 'After'→'after'
          storage_path: jf.storage_path,  // needed by sbDeleteJobPhoto for storage cleanup
        })),
        activity: nt || [], change_orders: co || [],
      };
    }));
  } catch (e) { console.error(e); return null; }
};

export const sbUpd = async (id, ch) => {
  try {
    const ok = ['status','scope','sqft','client_name','client_phone','client_email','assigned_rep','assigned_subs','contract_value','co_total','target_completion','contract_signed','contract_signed_at','client_notify','referring_realtor_name','referring_realtor_phone','referring_realtor_email','cost_plus','default_markup_pct','labor_markup_pct','material_markup_pct','pm_fee','retainage_pct'];
    const p = {};
    ok.forEach(k => { if (ch[k] !== undefined) p[k] = ch[k]; });
    if (Object.keys(p).length) await sb.from('jobs').update(p).eq('id', id);
  } catch (e) { console.error('[sbUpd]', e); }
};

export const sbDel = async id => {
  try {
    const { data: ph } = await sb.from('photos').select('url').eq('job_id', id);
    if (ph?.length) {
      const paths = ph.map(p => p.url?.split('/job-photos/')[1]).filter(Boolean);
      if (paths.length) await sb.storage.from('job-photos').remove(paths);
    }
    await Promise.all([
      sb.from('photos').delete().eq('job_id', id),
      sb.from('job_files').delete().eq('job_id', id),  // slice 7/12: clean up unified files rows
      sb.from('job_notes').delete().eq('job_id', id),
      sb.from('change_orders').delete().eq('job_id', id),
      sb.from('jobs').delete().eq('id', id),
    ]);
    return { ok: true, error: null };
  } catch (e) {
    captureFailedIntent({ kind: 'job_delete', payload: { jobId: id }, jobId: id, message: e.message, resumable: false }).catch(() => {});
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

export const sbNote = async (jid, content, author) => {
  try {
    const { data, error } = await sb.from('job_notes').insert({ job_id: jid, tenant_id: AV_TENANT, content, author, created_at: new Date().toISOString() }).select().single();
    if (error) {
      captureFailedIntent({ kind: 'note_save', payload: {}, jobId: jid, message: error.message, resumable: false }).catch(() => {});
      return { ok: false, error: error.message, data: null };
    }
    return { ok: true, error: null, data };
  } catch (e) {
    captureFailedIntent({ kind: 'note_save', payload: {}, jobId: jid, message: e.message, resumable: false }).catch(() => {});
    return { ok: false, error: e.message || 'Unknown error', data: null };
  }
};

// Canonical note-create wrapper: insert via sbNote + fire note_posted notification.
// Use this from any caller that wants the full note-add side effects (voice agent, master agent, future UI callers).
// UI sites that already manage their own notify call (e.g. NotesPhotosTab) can keep using sbNote directly.
export const sbCreateNote = async (jobId, content, author, opts = {}) => {
  const r = await sbNote(jobId, content, author);
  if (!r.ok) return r;
  const title = opts.jobAddress ? `Note on ${opts.jobAddress}` : 'New job note';
  const preview = String(content || '').slice(0, 120);
  sbNotify('note_posted', title, preview, jobId, opts.excludeUserId ?? AV_USER_ID).catch(() => {});
  return r;
};

// Phase → subcategory map for photo dual-write (mirrors inferFileCategory.js PHASE_TO_SUBCATEGORY)
const _PHASE_SUBCAT_MAP = {
  'Demo / Tear-out': 'Demo', 'Demo': 'Demo',
  'Framing / Rough Structure': 'Framing', 'Framing': 'Framing',
  'Plumbing - Rough': 'Plumbing', 'Plumbing - Rough-in': 'Plumbing', 'Plumbing - Finish / fixtures': 'Plumbing',
  'Electrical - Rough': 'Electrical', 'Electrical - Rough-in': 'Electrical', 'Electrical - Finish': 'Electrical',
  'HVAC - Rough': 'HVAC', 'HVAC - Finish': 'HVAC', 'HVAC-Install': 'HVAC',
  'Drywall / Insulation': 'Drywall', 'Drywall-Hang': 'Drywall', 'Drywall': 'Drywall',
  'Tile - Floor': 'Tile', 'Tile - Wall / shower': 'Tile', 'Tile': 'Tile',
  'Cabinets / vanities - Install': 'Cabinets', 'Cabinets': 'Cabinets',
  'Paint / Finish': 'Paint', 'Paint-Interior': 'Paint', 'Paint': 'Paint',
  'Trim / Finish carpentry': 'Trim/Finish', 'Trim': 'Trim/Finish',
  'Flooring': 'Flooring', 'Roofing': 'Roofing',
  'Final inspection / Punch list': 'Final', 'Final': 'Final',
};
// Entity types in job_files.related_entity_type CHECK constraint
// material_order added slice 7/12 — future uploads populate job_files
const _JF_VALID_ENTITY_TYPES = new Set(['schedule_item', 'change_order', 'daily_log', 'floor_plan', 'job_transaction', 'consultation_session', 'material_order']);

/**
 * Calls ai-categorize-file edge function with a base64-encoded image.
 * Returns { category, subcategory, confidence, source } or throws on error.
 * Cost: ~$0.001/call (Claude Haiku vision). User-triggered only — never fires on DB hooks.
 */
async function _callVisionCategorizer({ file, jobId }) {
  // Convert File → base64 string (strips data:<mime>;base64, prefix)
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(file);
  });

  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('No auth session for vision categorizer');

  const res = await fetch(AI_CATEGORIZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      jobId,
      imageBase64: base64,
      imageMimeType: file.type || 'image/jpeg',
      fileName: file.name || 'photo',
    }),
  });
  if (!res.ok) throw new Error(`ai-categorize-file returned ${res.status}`);
  return await res.json();
}

/**
 * Write photo record to job_files. Returns the inserted job_files.id, or null on error.
 * slice 8/12: replaces _dualWritePhotoToJobFiles; now the PRIMARY write (no legacy photos table).
 * Storage bucket stays 'job-photos' (public) so existing consumers work without URL changes.
 */
async function _insertPhotoToJobFiles(path, file, jid, entityType, entityId) {
  try {
    let category = 'Photos';
    let subcategory = null;
    let aiConfidence = 0.3;
    let aiSuggested = null;

    if (entityType === 'change_order') {
      category = 'Change Orders';
      aiConfidence = 1.0;
    } else {
      try {
        const { inferFileCategory } = await import('./jobFiles/inferFileCategory.js');
        const queryFn = async ({ jobId: qjid }) => {
          const { data } = await sb.from('job_phases')
            .select('phase_name')
            .eq('job_id', qjid)
            .eq('tenant_id', AV_TENANT)
            .eq('status', 'in_progress')
            .order('phase_order', { ascending: true })
            .limit(1)
            .maybeSingle();
          return data?.phase_name ?? null;
        };
        const inferred = await inferFileCategory({
          file, jobId: jid, uploadSource: entityType || 'manual', queryFn, visionFn: _callVisionCategorizer,
        });
        category = inferred.category;
        const isLowConf = inferred.source === 'vision_lowconf';
        subcategory = isLowConf ? null : (inferred.subcategory ?? null);
        aiConfidence = inferred.confidence;
        aiSuggested = isLowConf ? (inferred.subcategory ?? null) : null;
      } catch { /* non-fatal — falls back to Photos / null */ }
    }

    const linkedType = entityType && _JF_VALID_ENTITY_TYPES.has(entityType) ? entityType : null;
    const linkedId   = linkedType ? (entityId || null) : null;

    const { data: jfRow, error } = await sb.from('job_files').insert({
      tenant_id: AV_TENANT,
      job_id: jid,
      uploaded_by_id: AV_USER_ID || null,
      name: file?.name || 'photo',
      storage_path: path,
      storage_bucket: 'job-photos',
      mime_type: file?.type || null,
      size_bytes: file?.size || null,
      category,
      subcategory,
      ai_confidence: aiConfidence < 1.0 ? aiConfidence : null,
      ai_subcategory_suggested: aiSuggested,
      client_visible: false,
      related_entity_type: linkedType,
      related_entity_id: linkedId,
    }).select('id').single();
    if (error) { console.warn('[sbPhoto _insertPhotoToJobFiles]', error?.message); return null; }
    return jfRow?.id || null;
  } catch (err) {
    console.warn('[sbPhoto _insertPhotoToJobFiles]', err?.message || err);
    return null;
  }
}

/**
 * Upload a photo and record it in job_files (source of truth).
 * slice 8/12: dual-write bridge dropped — no longer writes to legacy photos table.
 * Storage bucket stays 'job-photos' (public). Return shape preserved for callers.
 */
export const sbPhoto = async (jid, file, entityType, entityId, category = null) => {
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${jid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: ue } = await sb.storage.from('job-photos').upload(path, file, { contentType: file.type, upsert: false });
    if (ue) { console.error('[sbPhoto] upload failed:', ue.message); return { ok: false, error: ue.message, data: null }; }
    const { data: ud } = sb.storage.from('job-photos').getPublicUrl(path);
    const url = ud.publicUrl;
    const type = file.type.startsWith('video') ? 'video' : 'photo';
    const jfId = await _insertPhotoToJobFiles(path, file, jid, entityType, entityId);
    if (!jfId) {
      // Clean up orphaned storage object and surface the error
      sb.storage.from('job-photos').remove([path]).catch(() => {});
      return { ok: false, error: 'Failed to save photo record', data: null };
    }
    return { ok: true, error: null, data: { id: jfId, type, url, name: file.name } };
  } catch (e) {
    console.error('[sbPhoto]', e);
    return { ok: false, error: e.message || 'Photo save failed', data: null };
  }
};

export const sbCountPhotosForEntity = async (entityType, entityId, category = null) => {
  return countPhotosForEntity(sb, entityType, entityId, category);
};

/**
 * Load photos for a given entity from job_files (slice 6/12 migration).
 * slice 7/12: material_order added to _JF_VALID_ENTITY_TYPES — all entity types now read job_files.
 * Returns: [{ id, url, name, type, client_visible, created_at }]
 */
export const sbLoadPhotosForEntity = async (entityType, entityId) => {
  const { data } = await sb.from('job_files')
    .select('id, storage_path, storage_bucket, name, mime_type, client_visible, created_at')
    .eq('related_entity_type', entityType)
    .eq('related_entity_id', entityId)
    .eq('lifecycle_status', 'active')
    .order('created_at', { ascending: true });
  return (data || []).map(jf => ({
    id: jf.id,
    url: sb.storage.from(jf.storage_bucket).getPublicUrl(jf.storage_path).data?.publicUrl || '',
    name: jf.name,
    type: jf.mime_type?.startsWith('video/') ? 'video' : 'photo',
    client_visible: jf.client_visible,
    created_at: jf.created_at,
  }));
};

/**
 * Label a photo (Before/After/During). slice 7/12: photoId is now job_files.id.
 * Stores label as subcategory in job_files ('before'→'Before', 'after'→'After').
 */
export const sbLabelPhoto = async (jobId, photoId, label) => {
  try {
    // Map lowercase label to INITCAP subcategory used in job_files
    const subcategory = label ? (label.charAt(0).toUpperCase() + label.slice(1)) : null;
    // Clear same subcategory from other photos in this job first
    if (subcategory) {
      await sb.from('job_files').update({ subcategory: null })
        .eq('job_id', jobId)
        .eq('subcategory', subcategory)
        .neq('id', photoId);
    }
    const { error } = await sb.from('job_files').update({ subcategory }).eq('id', photoId);
    if (error) {
      captureFailedIntent({ kind: 'photo_label', payload: { photoId }, jobId, message: error.message, resumable: false }).catch(() => {});
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    captureFailedIntent({ kind: 'photo_label', payload: { photoId }, jobId, message: e.message, resumable: false }).catch(() => {});
    return { ok: false, error: e.message || 'Unknown error' };
  }
};

/**
 * Delete a job photo by job_files.id. slice 7/12: source of truth is now job_files.
 * Also best-effort removes: storage object + legacy photos row (matched by storage path).
 */
export const sbDeleteJobPhoto = async jobFileId => {
  try {
    // Load the storage path from job_files so we can clean up storage + legacy table
    const { data: jfRow } = await sb.from('job_files')
      .select('storage_path, storage_bucket')
      .eq('id', jobFileId)
      .maybeSingle();

    // Delete from job_files first (source of truth)
    const { error } = await sb.from('job_files').delete().eq('id', jobFileId);
    if (error) return { ok: false, error: error.message };

    const storagePath = jfRow?.storage_path;
    const bucket = jfRow?.storage_bucket || 'job-photos';

    // Best-effort: remove storage object
    if (storagePath) {
      sb.storage.from(bucket).remove([storagePath]).catch(() => {});
    }
    // Best-effort: remove legacy photos row (matched by URL suffix)
    if (storagePath && bucket === 'job-photos') {
      sb.from('photos').delete().like('url', `%${storagePath}`).catch(() => {});
    }

    return { ok: true };
  } catch (e) { return { ok: false, error: e.message || 'Delete failed' }; }
};

export const sbCO = async co => {
  try {
    const { data, error } = await sb.from('change_orders').insert({ ...co, tenant_id: AV_TENANT }).select().single();
    if (error) {
      captureFailedIntent({ kind: 'co_save', payload: { co_number: co.co_number }, jobId: co.job_id, message: error.message, resumable: false }).catch(() => {});
      return { ok: false, error: error.message, data: null };
    }
    return { ok: true, error: null, data };
  } catch (e) {
    captureFailedIntent({ kind: 'co_save', payload: {}, jobId: co.job_id, message: e.message, resumable: false }).catch(() => {});
    return { ok: false, error: e.message || 'Unknown error', data: null };
  }
};

// Canonical change-order create wrapper: auto co_number, insert via sbCO + fire co_submitted notification.
// Use this from voice/master agents where the full side-effect path is required.
// UI sites (COTab) keep using sbCO directly because they already orchestrate co_number + notify locally.
export const sbCreateChangeOrder = async ({ jobId, description, amount, jobAddress, excludeUserId } = {}) => {
  if (!jobId || !description || amount == null) {
    return { ok: false, error: 'jobId, description, and amount are required', data: null };
  }
  try {
    const { count, error: cerr } = await sb
      .from('change_orders')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId);
    if (cerr) return { ok: false, error: cerr.message, data: null };
    const coNumber = `CO-${String((count || 0) + 1).padStart(3, '0')}`;
    const r = await sbCO({
      job_id: jobId,
      co_number: coNumber,
      description,
      amount: Number(amount),
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    if (!r.ok) return r;
    const title = jobAddress ? `New CO on ${jobAddress}` : `New change order ${coNumber}`;
    const dollar = `$${Number(amount || 0).toLocaleString()}`;
    const body = `${coNumber}: ${String(description).trim()} — ${dollar}`;
    sbNotify('co_submitted', title, body, jobId, excludeUserId ?? AV_USER_ID).catch(() => {});
    return r;
  } catch (e) {
    return { ok: false, error: e.message || 'Change order failed', data: null };
  }
};
export const sbUpdCO = async (id, ch) => {
  try {
    const { error } = await sb.from('change_orders').update(ch).eq('id', id);
    if (error) {
      captureFailedIntent({ kind: 'co_update', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    captureFailedIntent({ kind: 'co_update', payload: { id }, jobId: null, message: e.message, resumable: false }).catch(() => {});
    return { ok: false, error: e.message || 'Unknown error' };
  }
};

// Creates a pending job_transactions row at CO cost for cost-plus financial accrual.
// Idempotent — skips if accrual_transaction_id already set on the CO.
export const sbCreateCOAccrualRow = async (coId, jobId, amount, createdBy) => {
  try {
    const { data: existing } = await sb.from('change_orders')
      .select('accrual_transaction_id').eq('id', coId).single();
    if (existing?.accrual_transaction_id) return { ok: true, skipped: true };
    const { data: tx, error: txErr } = await sb.from('job_transactions').insert({
      job_id: jobId, tenant_id: AV_TENANT,
      direction: 'out', type: 'change_order',
      amount, status: 'pending',
      change_order_id: coId,
      description: 'CO accrual — approved, pending payment',
      created_by: createdBy, created_at: new Date().toISOString(),
      date_incurred: new Date().toISOString().slice(0, 10),
    }).select().single();
    if (txErr) return { ok: false, error: txErr.message };
    await sb.from('change_orders').update({ accrual_transaction_id: tx.id }).eq('id', coId);
    return { ok: true, data: tx };
  } catch (e) { return { ok: false, error: e.message }; }
};
// Converts a predicted oh-shit moment into a pending change order via the same path COTab uses.
// Double-convert guarded: returns error if converted_to_co_id is already set on the moment.
// Approval still goes through the normal COTab approval → contract_value bump + accrual cascade.
export const sbCreateCOFromOhShit = async ({ ohShitMomentId, jobId, amount, markupPct } = {}) => {
  try {
    const [{ data: moment, error: mErr }, { data: jobRow, error: jErr }] = await Promise.all([
      sb.from('oh_shit_moments').select('*').eq('id', ohShitMomentId).eq('tenant_id', AV_TENANT).single(),
      sb.from('jobs').select('default_markup_pct,cost_plus').eq('id', jobId).single(),
    ]);
    if (mErr || !moment) return { ok: false, error: 'Oh-shit moment not found', data: null };
    if (jErr || !jobRow) return { ok: false, error: 'Job not found', data: null };
    if (moment.converted_to_co_id) return { ok: false, error: 'This risk has already been converted to a change order.', data: null };

    const midpoint = Math.round(((Number(moment.estimated_cost_low || 0) + Number(moment.estimated_cost_high || 0)) / 2) * 100) / 100;
    const coAmount = amount != null ? Number(amount) : midpoint;
    const coMarkupPct = markupPct != null ? Number(markupPct) : (Number(jobRow.default_markup_pct) || null);

    const { count } = await sb.from('change_orders').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
    const coNumber = `CO-${String((count || 0) + 1).padStart(3, '0')}`;

    const r = await sbCO({
      job_id: jobId,
      co_number: coNumber,
      description: moment.condition,
      amount: coAmount,
      status: 'pending',
      created_at: new Date().toISOString(),
      submitted_by: AV_USER_ID,
      oh_shit_moment_id: ohShitMomentId,
      ...(jobRow.cost_plus ? { markup_pct: coMarkupPct } : {}),
    });
    if (!r.ok) return r;

    const { error: updErr } = await sb.from('oh_shit_moments')
      .update({ converted_to_co_id: r.data.id })
      .eq('id', ohShitMomentId);
    if (updErr) return { ok: false, error: updErr.message, data: null };

    return { ok: true, error: null, data: r.data };
  } catch (e) {
    return { ok: false, error: e.message || 'sbCreateCOFromOhShit failed', data: null };
  }
};

export const getJobCoTotal = (job) => Number(job?.co_total || 0);

// ─── Phases ───────────────────────────────────────────────────────────────────
export const DEFAULT_PHASES = ['Lead','Proposal','Contract','Demo','Rough-ins','Inspections','Drywall','Finishes','Final touches','Complete'];
export const sbLoadPhases = async jid => {
  const { data } = await sb.from('job_phases').select('*').eq('job_id', jid).order('phase_order', { ascending: true });
  return data || [];
};
export const sbSeedJobPhases = async (jobId, tenantId) => {
  try {
    const { count } = await sb.from('job_phases').select('id', { count: 'exact', head: true }).eq('job_id', String(jobId));
    if (count > 0) return { ok: true, seeded: false };
    const rows = DEFAULT_PHASES.map((name, i) => ({
      tenant_id: tenantId,
      job_id: String(jobId),
      phase_name: name,
      phase_order: i + 1,
      status: 'not_started',
    }));
    const { error } = await sb.from('job_phases').insert(rows);
    if (error) return { ok: false, error: error.message };
    return { ok: true, seeded: true };
  } catch (e) { return { ok: false, error: e.message || 'Unknown error' }; }
};
export async function sbLoadJobPhaseProgress(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required' };
  try {
    const [phasesRes, itemsRes] = await Promise.all([
      sb.from('job_phases').select('*').eq('job_id', jobId).order('phase_order', { ascending: true }),
      sb.from('schedule_items')
        .select('id, phase_id, scheduled_date, scheduled_end_date, actual_finish_date, status')
        .eq('job_id', jobId)
        .neq('status', 'cancelled'),
    ]);
    if (phasesRes.error) return { ok: false, error: phasesRes.error.message };
    if (itemsRes.error) return { ok: false, error: itemsRes.error.message };
    const phases = phasesRes.data || [];
    const items = itemsRes.data || [];
    const today = new Date().toISOString().slice(0, 10);
    const byPhase = new Map();
    for (const it of items) {
      if (!it.phase_id) continue;
      if (!byPhase.has(it.phase_id)) byPhase.set(it.phase_id, []);
      byPhase.get(it.phase_id).push(it);
    }
    return {
      ok: true,
      data: phases.map(phase => {
        const phItems = byPhase.get(phase.id) || [];
        const total = phItems.length;
        const completed = phItems.filter(i => !!i.actual_finish_date).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const scheduledEnds = phItems.map(i => i.scheduled_end_date || i.scheduled_date).filter(Boolean).sort();
        const scheduledDates = phItems.map(i => i.scheduled_date).filter(Boolean).sort();
        const finishDates = phItems.map(i => i.actual_finish_date).filter(Boolean).sort();
        const earliest_scheduled_date = scheduledDates[0] || null;
        const latest_scheduled_end_date = scheduledEnds[scheduledEnds.length - 1] || null;
        const actual_finish_date = (total > 0 && completed === total) ? (finishDates[finishDates.length - 1] || null) : null;
        const actual_start_date = finishDates[0] || (earliest_scheduled_date && earliest_scheduled_date <= today ? earliest_scheduled_date : null);
        let status;
        if (total === 0) { status = 'not_started'; }
        else if (completed === total) { status = 'completed'; }
        else if (completed === 0 && (!earliest_scheduled_date || earliest_scheduled_date > today)) { status = 'not_started'; }
        else if (phase.end_date && latest_scheduled_end_date && latest_scheduled_end_date > phase.end_date) { status = 'delayed'; }
        else { status = 'in_progress'; }
        const is_on_schedule = (!phase.end_date || !latest_scheduled_end_date) ? null : (latest_scheduled_end_date <= phase.end_date);
        return {
          id: phase.id, phase_name: phase.phase_name, phase_order: phase.phase_order,
          start_date: phase.start_date, end_date: phase.end_date,
          total_items: total, completed_items: completed, pct_complete: pct,
          status, earliest_scheduled_date, latest_scheduled_end_date,
          actual_start_date, actual_finish_date, is_on_schedule,
        };
      }),
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sbCheckLeadTime({ jobId, trade, scheduledDate }) {
  if (!jobId || !trade || !scheduledDate) return { ok: true, warning: null };

  const leadResult = await sbGetTradeLeadDays(trade);
  if (!leadResult.ok) return { ok: true, warning: null };
  const leadDays = leadResult.data;

  const { data: orders, error } = await sb
    .from('material_orders')
    .select('id, created_at, quoted_delivery_date, status')
    .eq('job_id', jobId)
    .eq('trade', trade)
    .neq('status', 'cancelled');

  if (error) return { ok: true, warning: null };

  if (!orders || orders.length === 0) {
    return {
      ok: true,
      warning: {
        message: `No ${trade} material order found. Materials may not arrive by ${scheduledDate}.`,
        hasOrder: false,
        daysShort: null,
      },
    };
  }

  for (const order of orders) {
    const estimated = order.quoted_delivery_date
      || _addDaysISO(order.created_at.slice(0, 10), leadDays);
    if (estimated <= scheduledDate) return { ok: true, warning: null };
  }

  const deliveries = orders
    .map(o => o.quoted_delivery_date || _addDaysISO(o.created_at.slice(0, 10), leadDays))
    .sort();
  const bestDelivery = deliveries[0];
  const daysShort = _daysBetweenISO(scheduledDate, bestDelivery);

  return {
    ok: true,
    warning: {
      message: `${trade} materials may not arrive in time. Estimated delivery: ${bestDelivery} (${daysShort} day${daysShort === 1 ? '' : 's'} after scheduled date).`,
      hasOrder: true,
      daysShort,
    },
  };
}

export const sbSavePhase = async ph => {
  const { data, error } = await sb.from('job_phases').upsert(ph).select().single();
  if (error) {
    captureFailedIntent({ kind: 'phase_save', payload: { phaseId: ph.id }, jobId: ph.job_id, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};

// ─── Documents ────────────────────────────────────────────────────────────────
export const DOC_TYPES = ['plan','permit','contract','spec','inspection','other'];
export const docTypeColor = t => ({ plan:'#3B82F6', permit:'#f59e0b', contract:'#22c55e', spec:'#8b5cf6', inspection:'#ef4444', other:'#9CA3AF' }[t] || '#9CA3AF');

const docSignedUrl = async path => {
  if (!path) return null;
  const { data } = await sb.storage.from('job-documents').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
};
const docPathFromUrl = url => {
  if (!url) return null;
  if (url.startsWith('http')) return url.split('/job-documents/')[1] || null;
  return url; // already a plain path
};

/**
 * Load documents for a job from job_files (slice 6/12 migration).
 * Returns a backward-compatible shape matching the old job_documents rows:
 *   { id, job_id, tenant_id, name, file_url, file_type, version, client_visible, created_at, signed_url }
 *
 * Field mapping:
 *   job_files.storage_path → file_url
 *   job_files.subcategory  → file_type (Plans→plan, Permits→permit, Contracts→contract, etc.)
 *   version is not stored in job_files; always 1 for these rows.
 *
 * Callers: DocsTab.jsx, InfoTab.jsx — signatures unchanged.
 */
export const sbLoadDocs = async jid => {
  const _subcatToFileType = {
    'Plans': 'plan', 'Permits': 'permit', 'Contracts': 'contract',
    'Inspections': 'inspection', 'Specs': 'spec',
  };
  const { data } = await sb.from('job_files')
    .select('*')
    .eq('job_id', jid)
    .eq('storage_bucket', 'job-documents')
    .eq('lifecycle_status', 'active')
    .order('created_at', { ascending: false });
  if (!data || !data.length) return [];
  return Promise.all(data.map(async jf => {
    const signed_url = await docSignedUrl(jf.storage_path);
    return {
      id: jf.id,
      job_id: jf.job_id,
      tenant_id: jf.tenant_id,
      name: jf.name,
      file_url: jf.storage_path,
      file_type: _subcatToFileType[jf.subcategory] || 'other',
      version: 1, // job_files does not track document versions
      client_visible: jf.client_visible,
      created_at: jf.created_at,
      signed_url,
    };
  }));
};
/**
 * Upload a document and record it in job_files (source of truth).
 * slice 8/12: dual-write bridge dropped — no longer writes to legacy job_documents table.
 * Storage bucket stays 'job-documents' (private). Return shape preserved for callers.
 * Note: ClientSignContractModal directly updates job_documents.client_visible — that path
 * is now a silent no-op. Fix scheduled for slice 9.
 */
export const sbUploadDoc = async (jid, file, fileType) => {
  try {
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${jid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: ue } = await sb.storage.from('job-documents').upload(path, file, { contentType: file.type, upsert: false });
    if (ue) { console.error('Doc upload error:', ue); return { error: ue.message || 'Upload failed' }; }

    // fileType → category/subcategory mapping (consistent with slice 1 migration + subcategory='Proposals' fix)
    let category = 'Documents';
    let subcategory = null;
    const ft = (fileType || 'other').toLowerCase();
    if (ft === 'permit')                              { category = 'Documents';       subcategory = 'Permits'; }
    else if (ft === 'plan' || ft === 'blueprint')     { category = 'Documents';       subcategory = 'Plans'; }
    else if (ft === 'contract' || ft === 'agreement') { category = 'Documents';       subcategory = 'Contracts'; }
    else if (ft === 'receipt' || ft === 'invoice')    { category = 'Receipts';        subcategory = null; }
    else if (ft === 'spec' || ft === 'specification') { category = 'Documents';       subcategory = 'Specs'; }
    else if (ft === 'inspection')                     { category = 'Documents';       subcategory = 'Inspections'; }
    else if (ft === 'proposal')                       { category = 'Documents';       subcategory = 'Proposals'; }
    // 'other', 'transcript', etc. → Documents / null

    const { data: jfRow, error: ie } = await sb.from('job_files').insert({
      tenant_id: AV_TENANT,
      job_id: jid,
      uploaded_by_id: AV_USER_ID || null,
      name: file?.name || 'document',
      storage_path: path,
      storage_bucket: 'job-documents',
      mime_type: file?.type || null,
      size_bytes: file?.size || null,
      category,
      subcategory,
      ai_confidence: 1.0,
      ai_subcategory_suggested: subcategory,
      client_visible: false,
    }).select('id, created_at').single();
    if (ie) return { error: ie.message || 'Save failed' };

    const signed_url = await docSignedUrl(path);
    // Return a shape compatible with the legacy job_documents-based callers
    return { doc: {
      id: jfRow.id,          // job_files.id — used by sbDelDoc, sbToggleDocVisible, DocsTab
      job_id: jid,
      tenant_id: AV_TENANT,
      name: file.name,
      file_url: path,        // storage_path — used by sbDelDoc for storage cleanup
      file_type: ft === 'other' ? 'other' : (subcategory?.toLowerCase().replace(/s$/, '') || 'other'),
      version: 1,            // job_files has no version column
      client_visible: false,
      created_at: jfRow.created_at,
      signed_url,
    }};
  } catch (e) { return { error: e.message || 'Unknown error' }; }
};

/**
 * Delete a document by id. slice 8/12: id is job_files.id (sbLoadDocs returns job_files rows).
 * Also removes storage object. Legacy job_documents table NOT touched — write-frozen.
 */
export const sbDelDoc = async doc => {
  try {
    const path = docPathFromUrl(doc.file_url);
    if (path) await sb.storage.from('job-documents').remove([path]);
    const { error } = await sb.from('job_files').delete().eq('id', doc.id);
    if (error) {
      captureFailedIntent({ kind: 'doc_delete', payload: { docId: doc.id }, jobId: doc.job_id, message: error.message, resumable: false }).catch(() => {});
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    captureFailedIntent({ kind: 'doc_delete', payload: { docId: doc.id }, jobId: doc.job_id, message: e.message, resumable: false }).catch(() => {});
    return { ok: false, error: e.message || 'Delete failed' };
  }
};

/**
 * Toggle client_visible on a document. slice 8/12: id is job_files.id.
 */
export const sbToggleDocVisible = async (id, val) => {
  try {
    const { error } = await sb.from('job_files').update({ client_visible: val }).eq('id', id);
    if (error) {
      captureFailedIntent({ kind: 'doc_toggle', payload: { id, val }, jobId: null, message: error.message, resumable: false }).catch(() => {});
      return { ok: false, error: error.message };
    }
    return { ok: true, error: null };
  } catch (e) {
    captureFailedIntent({ kind: 'doc_toggle', payload: { id, val }, jobId: null, message: e.message, resumable: false }).catch(() => {});
    return { ok: false, error: e.message || 'Unknown error' };
  }
};

// ─── Cost-plus tracking ───────────────────────────────────────────────────────
const costFileSignedUrl = async path => {
  if (!path) return null;
  const { data } = await sb.storage.from('job-documents').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
};
const costFilePathFromUrl = url => {
  if (!url) return null;
  if (url.startsWith('http')) return url.split('/job-documents/')[1] || null;
  return url;
};
/**
 * @deprecated Replaced by sbLoadClientDrawBreakdown (COST_PLUS_ARC Phase 6, shipped 2026-05-27).
 * job_cost_items + job_cost_invoices tables retained for backward compat on jobs
 * that predate the cost-plus arc. After 30+ days with zero new writes (verify via
 * audit log), this helper and its sibling sbLoadCostInvoices should be removed,
 * and the underlying tables DROPped via a separate legacy cleanup arc.
 *
 * Removal path:
 *   1. Confirm zero new INSERTs to job_cost_items / job_cost_invoices in 30 days
 *   2. Backfill any remaining rows into draw_line_items / job_transactions for completeness
 *   3. Delete sbLoadCostItems + sbLoadCostInvoices + these comments
 *   4. DROP TABLE job_cost_items, job_cost_invoices in a migration
 */
export const sbLoadCostItems = async jid => {
  const { data } = await sb.from('job_cost_items').select('*').eq('job_id', jid).order('created_at', { ascending: true });
  if (!data || !data.length) return [];
  return Promise.all(data.map(async item => {
    const proposal_signed_url = item.proposal_file_url
      ? await costFileSignedUrl(costFilePathFromUrl(item.proposal_file_url))
      : null;
    return { ...item, proposal_signed_url };
  }));
};
export const sbUploadCostItemProposal = async (jid, itemId, file) => {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${jid}/proposal-${itemId}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('job-documents').upload(path, file, { contentType: file.type });
  if (error) return { error };
  await sb.from('job_cost_items').update({ proposal_file_url: path, proposal_file_name: file.name }).eq('id', itemId);
  return { path };
};
export const sbCreateCostItem = async (jid, item) => {
  const { data, error } = await sb.from('job_cost_items').insert({ ...item, job_id: jid, tenant_id: AV_TENANT, created_at: new Date().toISOString() }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'cost_item_save', payload: {}, jobId: jid, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbUpdCostItem = async (id, ch) => {
  const { data, error } = await sb.from('job_cost_items').update(ch).eq('id', id).select().single();
  if (error) {
    captureFailedIntent({ kind: 'cost_item_update', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbDelCostItem = async id => {
  const { error } = await sb.from('job_cost_items').delete().eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'cost_item_delete', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
};
/** @deprecated See sbLoadCostItems deprecation note above. Same removal path applies. */
export const sbLoadCostInvoices = async jid => {
  const { data } = await sb.from('job_cost_invoices').select('*').eq('job_id', jid).order('created_at', { ascending: true });
  if (!data || !data.length) return [];
  return Promise.all(data.map(async inv => {
    const lien_waiver_signed_url = inv.lien_waiver_file_url
      ? await costFileSignedUrl(costFilePathFromUrl(inv.lien_waiver_file_url))
      : null;
    return { ...inv, lien_waiver_signed_url };
  }));
};
export const sbCreateCostInvoice = async (jid, invoice) => {
  // Write directly to job_transactions; job_cost_invoices is now a compat view
  const { data, error } = await sb.from('job_transactions').insert({
    job_id: jid,
    tenant_id: AV_TENANT,
    direction: 'out',
    type: 'vendor_payment',
    amount: invoice.amount,
    date_incurred: invoice.date || new Date().toISOString().slice(0, 10),
    date_paid: invoice.paid ? (invoice.date || new Date().toISOString().slice(0, 10)) : null,
    status: invoice.paid ? 'paid' : 'pending',
    cost_item_id: invoice.cost_item_id || null,
    receipt_url: invoice.invoice_file_url || null,
    lien_waiver_url: invoice.lien_waiver_file_url || null,
    lien_waiver_signed_date: invoice.lien_waiver_signed_date || null,
    created_by: AV_USER_ID,
    created_at: new Date().toISOString(),
  }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'cost_invoice_save', payload: {}, jobId: jid, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbUpdCostInvoice = async (id, ch) => {
  // Map compat field names to job_transactions columns
  const mapped = { ...ch };
  if ('invoice_file_url' in ch) { mapped.receipt_url = ch.invoice_file_url; delete mapped.invoice_file_url; }
  if ('invoice_file_name' in ch) delete mapped.invoice_file_name;
  if ('lien_waiver_file_url' in ch) { mapped.lien_waiver_url = ch.lien_waiver_file_url; delete mapped.lien_waiver_file_url; }
  if ('lien_waiver_file_name' in ch) delete mapped.lien_waiver_file_name;
  if ('date' in ch) { mapped.date_incurred = ch.date; delete mapped.date; }
  if ('paid' in ch) { mapped.status = ch.paid ? 'paid' : 'pending'; delete mapped.paid; }
  const { data, error } = await sb.from('job_transactions').update(mapped).eq('id', id).select().single();
  if (error) {
    captureFailedIntent({ kind: 'cost_invoice_update', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbDelCostInvoice = async id => {
  const { error } = await sb.from('job_transactions').delete().eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'cost_invoice_delete', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
};
export const sbUploadInvoiceFile = async (jid, invId, file) => {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${jid}/invoice-${invId}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('job-documents').upload(path, file, { contentType: file.type });
  if (error) return { error };
  await sb.from('job_transactions').update({ receipt_url: path }).eq('id', invId);
  return { path };
};
export const sbUploadLienWaiver = async (jid, invId, file) => {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${jid}/lien-${invId}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('job-documents').upload(path, file, { contentType: file.type });
  if (error) return { error };
  await sb.from('job_transactions').update({ lien_waiver_url: path, lien_waiver_signed_date: new Date().toISOString().slice(0, 10) }).eq('id', invId);
  return { path };
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const sbLoadNotifs = async () => {
  const { data } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
  return data || [];
};
export const sbMarkNotifsRead = async ids => {
  if (!ids?.length) return;
  try {
    const { error } = await sb
      .from('notifications')
      .update({ read: true })
      .in('id', ids);
    if (error) console.error('[sbMarkNotifsRead]', error);
  } catch (e) {
    console.error('[sbMarkNotifsRead]', e);
  }
};
const getTenantStaffIds = async () => {
  const { data } = await sb.from('profiles').select('id').eq('tenant_id', AV_TENANT).in('role', ['owner','project_manager','sales_rep']);
  return (data || []).map(p => p.id);
};
export const sbNotify = async (type, title, body, jobId, excludeId) => {
  try {
    const ids = await getTenantStaffIds();
    const targets = ids.filter(id => id !== excludeId);
    if (!targets.length) return;
    await sb.from('notifications').insert(
      targets.map(uid => ({ tenant_id: AV_TENANT, user_id: uid, job_id: jobId, type, title, body, read: false, email_sent: false, sms_sent: false }))
    );
  } catch (e) { console.error('sbNotify error:', e); }
};
export const sbNotifyUser = async (userId, type, title, body, jobId) => {
  if (!userId) return;
  try {
    await sb.from('notifications').insert({ tenant_id: AV_TENANT, user_id: userId, job_id: jobId, type, title, body, read: false, email_sent: false, sms_sent: false });
  } catch (e) { console.error('sbNotifyUser error:', e); }
};

// ─── Subs ─────────────────────────────────────────────────────────────────────
export const sbLoadTradeTaxonomy = async () => {
  const { data, error } = await sb
    .from('trade_taxonomy')
    .select(`id, parent_trade, sub_trade, display_order, default_unit, default_waste_pct,
             tenant_trade_visibility!inner(active)`)
    .eq('tenant_trade_visibility.tenant_id', AV_TENANT)
    .eq('tenant_trade_visibility.active', true)
    .order('display_order')
    .order('sub_trade');
  if (error) return [];
  const grouped = {};
  for (const row of data || []) {
    if (!grouped[row.parent_trade]) grouped[row.parent_trade] = { parent: row.parent_trade, subTrades: [] };
    if (row.sub_trade) {
      grouped[row.parent_trade].subTrades.push({
        id: row.id, sub_trade: row.sub_trade,
        default_unit: row.default_unit, default_waste_pct: row.default_waste_pct,
      });
    }
  }
  return Object.values(grouped);
};

export const sbLoadActiveTradeStrings = async () => {
  const taxonomy = await sbLoadTradeTaxonomy();
  const strings = [];
  for (const { parent, subTrades } of taxonomy) {
    if (subTrades.length === 0) strings.push(parent);
    else for (const { sub_trade } of subTrades) strings.push(`${parent} - ${sub_trade}`);
  }
  return strings;
};

export const sbGetTradeMeta = async (parentTrade, subTrade = null) => {
  let q = sb.from('trade_taxonomy').select('*').eq('parent_trade', parentTrade);
  q = subTrade ? q.eq('sub_trade', subTrade) : q.is('sub_trade', null);
  const { data } = await q.maybeSingle();
  return data || null;
};

export const sbLoadSubDirectory = async () => {
  const { data } = await sb.from('profiles').select('*').eq('tenant_id', AV_TENANT).eq('role', 'sub').order('full_name');
  return data || [];
};
export const sbLoadActiveSubs = async () => {
  const { data } = await sb.from('profiles').select('id, full_name, phone, email').eq('tenant_id', AV_TENANT).eq('role', 'sub').order('full_name');
  return data || [];
};
export const sbInviteSub = async (name, email, trade, phone) => {
  const res = await fetch(INVITE_URL, { method: 'POST', headers: authHeader(), body: JSON.stringify({ email, full_name: name, role: 'sub', trade, phone, tenant_id: AV_TENANT }) });
  return res.json();
};

// ─── Messages ─────────────────────────────────────────────────────────────────
export const sbLoadMessages = async jid => {
  const { data } = await sb.from('job_messages').select('*,sender:profiles(id,full_name,role)').eq('job_id', jid).order('created_at', { ascending: true });
  return data || [];
};
export const sbPostMessage = async (jid, content) => {
  const { data, error } = await sb.from('job_messages').insert({ tenant_id: AV_TENANT, job_id: jid, sender_id: AV_USER_ID, content }).select('*,sender:profiles(id,full_name,role)').single();
  if (error) {
    captureFailedIntent({ kind: 'message_send', payload: { content }, jobId: jid, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbNotifyEmail = (userId, title, body, jobId) => {
  if (!userId) return;
  fetch(NOTIFY_EMAIL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` }, body: JSON.stringify({ record: { user_id: userId, title, body, job_id: jobId, type: 'job_message' } }) }).catch(() => {});
};
export const sbLoadStaffMessages = async jid => {
  const { data } = await sb.from('staff_messages').select('*,sender:profiles(id,full_name,role)').eq('job_id', jid).order('created_at', { ascending: true });
  return data || [];
};
export const sbPostStaffMessage = async (jid, content) => {
  const { data, error } = await sb.from('staff_messages').insert({ tenant_id: AV_TENANT, job_id: jid, sender_id: AV_USER_ID, content }).select('*,sender:profiles(id,full_name,role)').single();
  if (error) {
    captureFailedIntent({ kind: 'message_send', payload: { content }, jobId: jid, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};


// ─── Client portal auth ───────────────────────────────────────────────────────
// PM/owner sets email+password for a client — creates or updates auth user,
// sets role=client, links to job. login works immediately (email_confirm: true).
export const sbCreateClientLogin = async (email, password, clientName, jobId) => {
  const res = await fetch(CREATE_CLIENT_LOGIN_URL, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ email, password, client_name: clientName, job_id: jobId, tenant_id: AV_TENANT }),
  });
  return res.json();
};

// Legacy magic-link helpers — kept for send-client-link backward compat (email flow).
// NOT used for client portal access — portal auth is now email+password via sbCreateClientLogin.
export const sbSendClientLink = async (email, clientName, jobAddress, jobId) => {
  const res = await fetch(CLIENT_LINK_URL, { method: 'POST', headers: authHeader(), body: JSON.stringify({ email, client_name: clientName, job_address: jobAddress, job_id: jobId, tenant_id: AV_TENANT }) });
  return res.json();
};
export const sbGetClientLink = async (email, clientName, jobAddress, jobId) => {
  const res = await fetch(CLIENT_LINK_URL, { method: 'POST', headers: authHeader(), body: JSON.stringify({ email, client_name: clientName, job_address: jobAddress, job_id: jobId, tenant_id: AV_TENANT, link_only: true }) });
  return res.json();
};

// ─── Sub pricing ──────────────────────────────────────────────────────────────
export const sbLoadSubPricing = async (subId) => {
  const { data } = await sb.from('sub_pricing').select('*').eq('sub_id', subId).order('trade');
  return data || [];
};
export const sbSaveSubPricing = async ({ subId, tenantId, trade, pricingMode, unit, rate, notes }) => {
  const { data, error } = await sb.from('sub_pricing').upsert({
    sub_id: subId, tenant_id: tenantId, trade,
    pricing_mode: pricingMode,
    unit: unit || null,
    rate: rate != null ? Number(rate) : null,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'sub_id,trade' }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'sub_pricing_save', payload: { subId, trade }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbDeleteSubPricing = async (subId, trade) => {
  const { error } = await sb.from('sub_pricing').delete().eq('sub_id', subId).eq('trade', trade);
  if (error) {
    captureFailedIntent({ kind: 'sub_pricing_delete', payload: { subId, trade }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
};
export const sbLoadSubRating = async (subId) => {
  const { data } = await sb.from('sub_ratings').select('*').eq('sub_id', subId).order('created_at', { ascending: false });
  if (!data?.length) return null;
  const avg = data.reduce((s, r) => s + (r.rating || 0), 0) / data.length;
  return { ratings: data, average: avg, count: data.length };
};
export const sbLoadSubPhases = async (subId, jobId) => {
  const { data } = await sb.from('job_phases').select('*').eq('assigned_sub_id', subId).eq('job_id', jobId).order('phase_order', { ascending: true });
  return data || [];
};
/**
 * Load documents for a job from job_files (slice 6/12 migration).
 * Returns a backward-compatible shape for SubJobView:
 *   { id, name, file_url, url (signed URL for download), client_visible, created_at }
 * SubJobView uses d.url || d.file_url for the download anchor href.
 * Callers: SubJobView.jsx
 */
export const sbLoadJobDocuments = async (jobId) => {
  const { data } = await sb.from('job_files')
    .select('id, name, storage_path, storage_bucket, client_visible, created_at')
    .eq('job_id', jobId)
    .eq('storage_bucket', 'job-documents')
    .eq('lifecycle_status', 'active')
    .order('created_at', { ascending: false });
  if (!data || !data.length) return [];
  return Promise.all(data.map(async jf => {
    const signed = await docSignedUrl(jf.storage_path);
    return {
      id: jf.id,
      name: jf.name,
      file_url: jf.storage_path,
      url: signed,
      client_visible: jf.client_visible,
      created_at: jf.created_at,
    };
  }));
};
export const sbLoadSubPayments = async (subId, jobId) => {
  const { data } = await sb.from('payments').select('*').eq('job_id', jobId).order('due_date', { ascending: true });
  return data || [];
};
export const sbLoadSubCOs = async (jobId) => {
  const { data } = await sb.from('change_orders').select('*').eq('job_id', jobId).order('created_at', { ascending: false });
  return data || [];
};
export const sbSubUpdatePhase = async (id, status) => {
  try {
    const audit = {};
    if (status === 'in_progress') { audit.started_at = new Date().toISOString(); audit.started_by_id = AV_USER_ID; }
    else if (status === 'complete') { audit.completed_at = new Date().toISOString(); audit.completed_by_id = AV_USER_ID; }
    const { data, error } = await sb.from('job_phases').update({ status, ...audit }).eq('id', id).eq('assigned_sub_id', AV_USER_ID).select().single();
    if (error) {
      captureFailedIntent({ kind: 'sub_phase_update', payload: { id, status }, jobId: null, message: error.message, resumable: false }).catch(() => {});
      return { ok: false, error: error.message, data: null };
    }
    if (status === 'complete' && data?.job_id) {
      autoInvoiceMilestonesForPhases(data.job_id, [id])
        .catch(err => console.warn('[milestoneInvoice] sbSubUpdatePhase hook failed:', err?.message));
    }
    return { ok: true, error: null, data };
  } catch (e) {
    console.error('sbSubUpdatePhase', e);
    captureFailedIntent({ kind: 'sub_phase_update', payload: { id, status }, jobId: null, message: e.message, resumable: false }).catch(() => {});
    return { ok: false, error: e.message, data: null };
  }
};
export const sbSubSubmitCO = async ({ job_id, tenant_id, description, amount }) => {
  try {
    const { count } = await sb.from('change_orders').select('*', { count: 'exact', head: true }).eq('job_id', job_id);
    const co_number = `CO-${String((count || 0) + 1).padStart(3, '0')}`;
    const { data, error } = await sb.from('change_orders').insert({
      id: crypto.randomUUID(), job_id, tenant_id,
      co_number, description,
      amount: amount ? Number(amount) : 0,
      status: 'pending', created_at: new Date().toISOString(),
      submitted_by: AV_USER_ID,
    }).select().single();
    if (error) {
      captureFailedIntent({ kind: 'sub_co_submit', payload: { description, amount }, jobId: job_id, message: error.message, resumable: false }).catch(() => {});
      return { ok: false, error: error.message, data: null };
    }
    return { ok: true, error: null, data };
  } catch (e) {
    console.error('sbSubSubmitCO', e);
    captureFailedIntent({ kind: 'sub_co_submit', payload: { description, amount }, jobId: job_id, message: e.message, resumable: false }).catch(() => {});
    return { ok: false, error: e.message, data: null };
  }
};

// ─── Sub jobs ─────────────────────────────────────────────────────────────────
export const sbLoadSubJobs = async subId => {
  const { data: phases } = await sb.from('job_phases').select('job_id').eq('assigned_sub_id', subId);
  if (!phases || !phases.length) return [];
  const ids = [...new Set(phases.map(p => p.job_id))];
  const { data } = await sb.from('jobs').select('id,address,status,client_name,created_at').in('id', ids);
  return (data || []).map(j => ({ ...j, created: j.created_at }));
};

// ─── Signatures & Contracts ───────────────────────────────────────────────────
export const toBase64 = blob => new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result.split(',')[1]); rd.readAsDataURL(blob); });
export const sbSaveSignature = async sig => {
  const { data, error } = await sb.from('contract_signatures').insert({ ...sig, tenant_id: sig.tenant_id || AV_TENANT }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'signature_save', payload: {}, jobId: sig.job_id || null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbSendContractEmail = async (job, contractType, pdfBlob) => {
  const b64 = pdfBlob ? await toBase64(pdfBlob) : null;
  const res = await fetch(CONTRACT_EMAIL_URL, {
    method: 'POST', headers: authHeader(),
    body: JSON.stringify({ email: job.client_email, client_name: job.client_name || '', job_address: job.address || '', job_id: job.id, tenant_id: AV_TENANT, contract_type: contractType, ...(b64 ? { pdf_base64: b64 } : {}) }),
  });
  return res.json();
};

// ─── Ratings & Reviews ────────────────────────────────────────────────────────
export const sbLoadSubRatings = async subId => {
  const { data } = await sb.from('sub_ratings').select('*,rater:rater_id(full_name,role)').eq('sub_id', subId).order('created_at', { ascending: false });
  return data || [];
};
export const sbSubmitRating = async (subId, stars, comment, jobId) => {
  const { data, error } = await sb.from('sub_ratings').upsert({ tenant_id: AV_TENANT, sub_id: subId, rater_id: AV_USER_ID, job_id: jobId || null, stars, comment: comment || null }, { onConflict: 'tenant_id,sub_id,rater_id,job_id' }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'rating_submit', payload: { subId, stars }, jobId: jobId || null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbSubmitJobReview = async (jobId, tenantId, r) => {
  return await sb.from('job_reviews').insert({ job_id: jobId, tenant_id: tenantId, client_name: r.client_name || null, client_email: r.client_email || null, rating_quality: r.quality, rating_communication: r.communication, rating_timeliness: r.timeliness, would_recommend: r.would_recommend, review_text: r.text || null, created_at: new Date().toISOString() });
};
export const sbLoadJobReview = async jobId => {
  const { data } = await sb.from('job_reviews').select('*').eq('job_id', jobId).maybeSingle();
  return data || null;
};
export const sbLoadTenantReviews = async () => {
  const { data } = await sb.from('job_reviews').select('*').eq('tenant_id', AV_TENANT).order('created_at', { ascending: false });
  return data || [];
};

// ─── Daily logs ───────────────────────────────────────────────────────────────
export const WEATHER_OPTS = ['Clear','Partly Cloudy','Overcast','Rain','Heavy Rain','Snow','Wind','Extreme Heat'];
export const sbLoadDailyLogs = async jid => {
  const { data } = await sb.from('daily_logs').select('*,author:profiles!author_id(full_name,role)').eq('job_id', jid).order('log_date', { ascending: false }).order('created_at', { ascending: false });
  return data || [];
};
export const sbSubmitDailyLog = async log => {
  const { data, error } = await sb.from('daily_logs').insert({ ...log, tenant_id: AV_TENANT, author_id: AV_USER_ID }).select('*,author:profiles!author_id(full_name,role)').single();
  if (error) {
    captureFailedIntent({ kind: 'daily_log_save', payload: {}, jobId: log.job_id || null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbGenerateDailyLogDraft = async (jobId, rawNote) => {
  try {
    const res = await fetch(AI_DAILY_LOG_DRAFT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, raw_note: rawNote }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, data: null };
    const json = await res.json();
    if (!json.ok) return { ok: false, error: json.error || 'Draft generation failed', data: null };
    return { ok: true, error: null, data: { client_message: json.client_message } };
  } catch (e) {
    return { ok: false, error: String(e), data: null };
  }
};
export const sbSaveDailyLogClientMessage = async (logId, clientMessage) => {
  const { data, error } = await sb.from('daily_logs').update({ client_message: clientMessage }).eq('id', logId).select('id').single();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Update affected 0 rows — RLS or missing row' };
  return { ok: true };
};
export const sbSendDailyLog = async (logId, clientMessage, job) => {
  const { data, error } = await sb.from('daily_logs').update({
    client_message: clientMessage,
    status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by_id: AV_USER_ID,
  }).eq('id', logId).select('id').single();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Update affected 0 rows — RLS or missing row' };
  if (job?.client_user_id) {
    sbNotifyUser(job.client_user_id, 'daily_log_sent', `Project update — ${job.address}`, clientMessage.slice(0, 120), job.id).catch(() => {});
  }
  return { ok: true };
};
// slice 7/12: photoId is job_files.id (sbLoadPhotosForEntity already returns job_files rows)
export const sbSetPhotoClientVisible = async (photoId, visible) => {
  const { error } = await sb.from('job_files').update({ client_visible: visible }).eq('id', photoId);
  return error ? { ok: false, error: error.message } : { ok: true };
};
/**
 * Load client-visible approved daily log updates with their photos.
 * Photos now read from job_files (slice 6/12 migration).
 * daily_log is in _JF_VALID_ENTITY_TYPES so photos are present in job_files.
 * Returns: [{ id, log_date, client_message, work_completed, approved_at, photos: [{ id, url, type, related_entity_id, created_at }] }]
 */
export const sbLoadClientUpdates = async jobId => {
  const { data: logs } = await sb.from('daily_logs')
    .select('id, log_date, client_message, work_completed, approved_at')
    .eq('job_id', jobId)
    .eq('status', 'approved')
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (!logs?.length) return [];
  const logIds = logs.map(l => l.id);
  const { data: files } = await sb.from('job_files')
    .select('id, storage_path, storage_bucket, mime_type, related_entity_id, created_at')
    .in('related_entity_id', logIds)
    .eq('related_entity_type', 'daily_log')
    .eq('client_visible', true)
    .eq('lifecycle_status', 'active');
  const photosByLog = {};
  (files || []).forEach(jf => {
    if (!photosByLog[jf.related_entity_id]) photosByLog[jf.related_entity_id] = [];
    photosByLog[jf.related_entity_id].push({
      id: jf.id,
      url: sb.storage.from(jf.storage_bucket).getPublicUrl(jf.storage_path).data?.publicUrl || '',
      type: jf.mime_type?.startsWith('video/') ? 'video' : 'photo',
      related_entity_id: jf.related_entity_id,
      created_at: jf.created_at,
    });
  });
  return logs.map(l => ({ ...l, photos: photosByLog[l.id] || [] }));
};

// ─── AI Estimator ─────────────────────────────────────────────────────────────
export const sbLoadEstimate = async jid => {
  const { data } = await sb.from('job_estimates').select('*').eq('job_id', jid).single();
  return data || null;
};
export const sbSaveEstimate = async (jid, messages) => {
  try {
    const { data } = await sb.from('job_estimates').upsert({ job_id: jid, tenant_id: AV_TENANT, messages, updated_at: new Date().toISOString() }, { onConflict: 'job_id' }).select().single();
    return data;
  } catch (e) { console.error('[sbSaveEstimate]', e); return null; }
};
export const sbSendEstimateEmail = async (job, pdfBlob) => {
  const b64 = await toBase64(pdfBlob);
  const res = await fetch(`${FN}/send-estimate-email`, { method: 'POST', headers: authHeader(), body: JSON.stringify({ job_id: job.id, job_address: job.address, client_email: job.client_email, client_name: job.client_name, pdf_base64: b64, tenant_id: AV_TENANT }) });
  return res.json();
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const sbLoadPayments = async jid => {
  const { data } = await sb.from('payments').select('*').eq('job_id', jid).order('created_at', { ascending: false });
  return data || [];
};
export const sbCreatePaymentLink = async p => {
  const res = await fetch(PAYMENT_LINK_URL, { method: 'POST', headers: authHeader(), body: JSON.stringify(p) });
  return res.json();
};

// ─── Unified financial ledger (job_transactions) ──────────────────────────────
export const sbLoadJobTransactions = async (jobId, filters = {}) => {
  let q = sb.from('job_transactions').select('*').eq('job_id', jobId);
  if (filters.direction) q = q.eq('direction', filters.direction);
  if (filters.type)      q = q.eq('type', filters.type);
  if (filters.status)    q = q.eq('status', filters.status);
  if (filters.phase_id)  q = q.eq('phase_id', filters.phase_id);
  if (filters.date_from) q = q.gte('date_incurred', filters.date_from);
  if (filters.date_to)   q = q.lte('date_incurred', filters.date_to);
  if (filters.missing_lien_waiver) q = q.eq('lien_waiver_required', true).is('lien_waiver_url', null);
  q = q.order('created_at', { ascending: false });
  const { data } = await q;
  return data || [];
};
export const sbLoadJobFinancialSummary = async (jobId, { contractValue = 0, coTotal = 0, costPlus = false } = {}) => {
  const round2 = n => Math.round(n * 100) / 100;
  const cpFallback = costPlus ? { float_unreimbursed: 0, bucket_balance: 0, client_float_owed: 0, markup_earned: 0, outstanding_pending: 0, projected_profit: 0, projected_total_revenue: 0, margin_pct: 0, pm_fee: 0 } : {};
  const { data } = await sb.from('job_transactions')
    .select('direction,amount,status,type,lien_waiver_required,lien_waiver_url,invoice_id,reimbursement_status,created_at')
    .eq('job_id', jobId).neq('status', 'void');
  if (!data) return { total_in: 0, total_out: 0, pending_out: 0, lien_waivers_missing: 0, contract_total: 0, client_owes: 0, ...cpFallback };
  const total_in   = data.filter(t => t.direction === 'in'  && t.status === 'paid'   ).reduce((s, t) => s + Number(t.amount || 0), 0);
  const total_out  = data.filter(t => t.direction === 'out' && t.status === 'paid'   ).reduce((s, t) => s + Number(t.amount || 0), 0);
  const pending_out = data.filter(t => t.direction === 'out' && t.status === 'pending').reduce((s, t) => s + Number(t.amount || 0), 0);
  const lien_waivers_missing = data.filter(t => t.lien_waiver_required && !t.lien_waiver_url).length;
  const contract_total = costPlus ? Number(contractValue || 0) : Number(contractValue || 0) + Number(coTotal || 0);
  const client_owes = contract_total - total_in;
  const summary = { total_in, total_out, pending_out, lien_waivers_missing, contract_total, client_owes };

  if (costPlus) {
    // Raw client deposits (inbound, not attached to an invoice)
    // Unreimbursed — outbound rows still waiting to be billed in a draw
    let bucket = 0;
    let unreimbursed = 0;
    for (const r of data) {
      const amt = Number(r.amount) || 0;
      if (r.direction === 'in' && r.invoice_id === null && r.status === 'paid') bucket += amt;
      else if (r.direction === 'out' && r.reimbursement_status === 'unreimbursed') unreimbursed += amt;
    }

    // Markup earned — sum of markup_amount on line items belonging to paid draws
    let markup_earned = 0;
    const { data: paidDraws } = await sb.from('draw_schedules').select('id').eq('job_id', jobId).eq('status', 'paid');
    if (paidDraws?.length) {
      const paidDrawIds = paidDraws.map(d => d.id);
      const { data: markupRows } = await sb.from('draw_line_items').select('markup_amount').in('draw_id', paidDrawIds);
      markup_earned = round2((markupRows || []).reduce((s, r) => s + (Number(r.markup_amount) || 0), 0));
    }

    // Outstanding — pending sub_payout and change_order accrual rows
    const outstanding_pending = round2(
      data.filter(t => t.direction === 'out' && t.status === 'pending' && (t.type === 'sub_payout' || t.type === 'change_order'))
          .reduce((s, t) => s + Number(t.amount || 0), 0)
    );

    // Projected profit — per-category markup rate via shared markupRateForCategory mapper
    const { data: jobRow } = await sb.from('jobs').select('labor_markup_pct,material_markup_pct,pm_fee,tenant_id').eq('id', jobId).single();
    const laborMarkupPct   = Number(jobRow?.labor_markup_pct   || 0);
    const materialMarkupPct = Number(jobRow?.material_markup_pct || 0);
    const pm_fee = Number(jobRow?.pm_fee || 0);
    const categoryConfig = await sbLoadCategoryConfig(jobRow?.tenant_id);
    const total_cost_base = round2(total_out + outstanding_pending);

    const allCostTxns = [
      ...data.filter(t => t.direction === 'out' && t.status === 'paid'),
      ...data.filter(t => t.direction === 'out' && t.status === 'pending' && (t.type === 'sub_payout' || t.type === 'change_order')),
    ];
    const projected_markup = round2(allCostTxns.reduce((sum, t) => {
      const rate = markupRateForCategory(t.type, { laborPct: laborMarkupPct, materialPct: materialMarkupPct, categoryConfig });
      return sum + (Number(t.amount) || 0) * rate / 100;
    }, 0));
    const projected_profit = round2(projected_markup + pm_fee);
    const projected_total_revenue = round2(total_cost_base + projected_profit);
    const margin_pct = projected_total_revenue > 0
      ? Math.round((projected_profit / projected_total_revenue) * 1000) / 10
      : 0;

    // Bucket balance — signed: positive = client has prepaid more than current obligations,
    // negative = client owes (request a draw). Includes both paid and pending obligations.
    const bucket_balance = round2(bucket - (total_out + outstanding_pending));

    summary.received             = round2(bucket);
    summary.paid_out             = round2(total_out);
    summary.float_unreimbursed   = round2(unreimbursed);
    summary.bucket_balance       = bucket_balance;
    summary.client_float_owed    = round2(Math.max(0, -bucket_balance));
    summary.markup_earned        = markup_earned;
    summary.outstanding_pending  = outstanding_pending;
    summary.projected_profit     = projected_profit;
    summary.projected_total_revenue = projected_total_revenue;
    summary.margin_pct           = margin_pct;
    summary.pm_fee               = pm_fee;
    const { data: drawRows } = await sb.from('draw_schedules').select('retainage_held').eq('job_id', jobId).neq('status', 'voided');
    summary.retainage_held = round2((drawRows || []).reduce((s, d) => s + Number(d.retainage_held || 0), 0));
    const projected_final_bill   = round2(total_cost_base + projected_markup + pm_fee);
    const contract_variance      = round2(contract_total - projected_final_bill);
    summary.projected_final_bill = projected_final_bill;
    summary.contract_variance    = contract_variance;

    // Activity pulse timestamps — derived from already-fetched data + one schedule query
    const outSorted = data.filter(t => t.direction === 'out' && t.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const inPaidSorted = data.filter(t => t.direction === 'in' && t.status === 'paid' && t.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
    summary.last_expense_at = outSorted[0]?.created_at || null;
    summary.last_payment_at = inPaidSorted[0]?.created_at || null;
    const { data: lastSched } = await sb.from('schedule_items').select('updated_at,created_at').eq('job_id', jobId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    summary.last_schedule_activity_at = lastSched?.updated_at || lastSched?.created_at || null;
  }

  return summary;
};
export const sbLoadCostPlusActivityPulse = async (jobId) => {
  const [{ data: txs }, { data: lastSched }] = await Promise.all([
    sb.from('job_transactions').select('direction,status,created_at').eq('job_id', jobId).neq('status', 'void'),
    sb.from('schedule_items').select('updated_at,created_at').eq('job_id', jobId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const out = (txs || []).filter(t => t.direction === 'out' && t.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const inPaid = (txs || []).filter(t => t.direction === 'in' && t.status === 'paid' && t.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    last_expense_at: out[0]?.created_at || null,
    last_payment_at: inPaid[0]?.created_at || null,
    last_schedule_activity_at: lastSched?.updated_at || lastSched?.created_at || null,
  };
};
export const sbCreateTransaction = async tx => {
  const { data, error } = await sb.from('job_transactions').insert({ ...tx, tenant_id: AV_TENANT, created_by: AV_USER_ID, created_at: new Date().toISOString() }).select().single();
  if (error) return { ok: false, error: error.message, data: null };
  if (data?.type === 'sub_payout' && data?.payer_or_payee_id) {
    sbAutoEnrollSubInSequences(data.payer_or_payee_id, 'payment_made', AV_TENANT).catch(console.error);
  }
  return { ok: true, error: null, data };
};
export const sbUpdateTransaction = async (id, updates) => {
  const { data, error } = await sb.from('job_transactions').update(updates).eq('id', id).select().single();
  return { data, error };
};
export const sbVoidTransaction = async id => {
  const { data, error } = await sb.from('job_transactions').update({ status: 'void' }).eq('id', id).select().single();
  return { data, error };
};
export const sbUploadReceipt = async (file, jobId) => {
  try {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = `${jobId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await sb.storage.from('job-receipts').upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { error: error.message };
    const { data } = await sb.storage.from('job-receipts').createSignedUrl(path, 3600);
    return { path, signedUrl: data?.signedUrl || null };
  } catch (e) { return { error: e.message || 'Upload failed' }; }
};
export const sbGetReceiptUrl = async (path) => {
  try {
    const { data, error } = await sb.storage.from('job-receipts').createSignedUrl(path, 3600);
    if (error) return { ok: false, error: error.message, data: null };
    return { ok: true, error: null, data: { signedUrl: data?.signedUrl } };
  } catch (e) { return { ok: false, error: e.message || 'Failed to get receipt URL', data: null }; }
};
export const sbUploadLienWaiverTx = async (file, jobId) => {
  try {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = `${jobId}/lien-waivers/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await sb.storage.from('job-documents').upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { error: error.message };
    const { data } = await sb.storage.from('job-documents').createSignedUrl(path, 3600);
    return { path, signedUrl: data?.signedUrl || null };
  } catch (e) { return { error: e.message || 'Upload failed' }; }
};

// ─── Estimate line items (Budget vs Actual — Phase 4) ────────────────────────
export const sbLoadEstimateLineItems = async (jobId) => {
  const { data } = await sb.from('estimate_line_items').select('*').eq('job_id', jobId).order('display_order');
  return data || [];
};

// Per-category markup config — maps estimate categories to 'labor_rate'|'material_rate'|'flat'.
// Falls back to DEFAULT_CATEGORY_CONFIG from markupConfig.js when no DB rows exist for the tenant.
export const sbLoadCategoryConfig = async (tenantId) => {
  const { data } = await sb.from('markup_category_config').select('category,markup_mode').eq('tenant_id', tenantId);
  if (!data || !data.length) return null; // caller falls back to DEFAULT_CATEGORY_CONFIG
  return Object.fromEntries(data.map(r => [r.category, r.markup_mode]));
};

// Upsert all six category rows in one call. configMap: { labor: 'labor_rate', sub: 'labor_rate', ... }
export const sbSaveCategoryConfig = async (tenantId, configMap) => {
  const rows = Object.entries(configMap).map(([category, markup_mode]) => ({
    tenant_id: tenantId, category, markup_mode,
  }));
  const { error } = await sb.from('markup_category_config').upsert(rows, { onConflict: 'tenant_id,category' });
  return { ok: !error, error: error?.message || null };
};

/**
 * Converts the current estimate_line_items into a contract value.
 * Sums total_cost per line, applies per-category markup via markupRateForCategory,
 * adds pm_fee, then writes the result to:
 *   jobs.contract_value
 *   job_estimates.estimate_data.contract_total  (upserted)
 *
 * @returns {{ ok: boolean, error: string|null, data: { contract_total: number }|null }}
 */
export const sbSetContractFromEstimate = async (jobId) => {
  try {
    const [{ data: items }, { data: jobRow }] = await Promise.all([
      sb.from('estimate_line_items').select('category,total_cost').eq('job_id', jobId).eq('tenant_id', AV_TENANT),
      sb.from('jobs').select('labor_markup_pct,material_markup_pct,pm_fee,tenant_id').eq('id', jobId).single(),
    ]);
    if (!jobRow) return { ok: false, error: 'Job not found', data: null };

    const laborPct    = Number(jobRow.labor_markup_pct   || 0);
    const materialPct = Number(jobRow.material_markup_pct || 0);
    const pmFee       = Number(jobRow.pm_fee              || 0);
    const categoryConfig = await sbLoadCategoryConfig(jobRow.tenant_id);

    const markedUpSum = (items || []).reduce((sum, li) => {
      const cost = Number(li.total_cost ?? 0);
      const rate = markupRateForCategory(li.category, { laborPct, materialPct, categoryConfig });
      return sum + cost * (1 + rate / 100);
    }, 0);
    const contractTotal = Math.round((markedUpSum + pmFee) * 100) / 100;

    const [jobUpd, estRow] = await Promise.all([
      sb.from('jobs').update({ contract_value: contractTotal }).eq('id', jobId).eq('tenant_id', AV_TENANT),
      sb.from('job_estimates').select('estimate_data').eq('job_id', jobId).maybeSingle(),
    ]);
    if (jobUpd.error) return { ok: false, error: jobUpd.error.message, data: null };

    const existingData = estRow.data?.estimate_data ?? {};
    const { error: estErr } = await sb.from('job_estimates').upsert(
      { job_id: jobId, tenant_id: AV_TENANT, estimate_data: { ...existingData, contract_total: contractTotal }, updated_at: new Date().toISOString() },
      { onConflict: 'job_id' }
    );
    if (estErr) return { ok: false, error: estErr.message, data: null };

    return { ok: true, error: null, data: { contract_total: contractTotal } };
  } catch (e) {
    return { ok: false, error: e.message || 'sbSetContractFromEstimate failed', data: null };
  }
};

export const sbLoadCustomTakeoffLines = async (jobId, roomType) => {
  const prefix = `takeoff:custom:${roomType}:`;
  const { data } = await sb.from('estimate_line_items').select('*').eq('job_id', jobId).like('notes', `${prefix}%`);
  if (!data || !data.length) return [];
  return data.map(row => {
    const roomId = (row.notes || '').slice(prefix.length).split(' ')[0] || row.id;
    return {
      lineKey:           `custom__${roomId}__restored_${row.id}`,
      roomId,
      trade:             row.trade || '',
      materialName:      row.category === 'materials' ? (row.description || '') : null,
      category:          row.category || 'labor',
      description:       row.description || '',
      templateNotes:     row.description || '',
      optional:          false,
      conditional:       null,
      unit:              row.unit || 'each',
      unitCostId:        null,
      unitCostSource:    null,
      baseRate:          row.unit_cost ?? null,
      baseRateMissing:   row.unit_cost == null,
      multiplier:        row.multiplier ?? 1,
      wastePct:          0,
      quantity:          row.quantity ?? 0,
      quantityPreFilled: true,
      quantityNotes:     'custom',
      lineCost:          row.total_cost ?? null,
      lineCostStatus:    'ok',
      notes:             row.notes || 'custom',
      isCustom:          true,
    };
  });
};

// ─── QuickBooks export ────────────────────────────────────────────────────────
export const sbLoadQbCategoryMap = async () => {
  const { data } = await sb.from('qb_category_map').select('*').eq('tenant_id', AV_TENANT).order('tx_type');
  return data || [];
};
export const sbUpsertQbCategoryMap = async (txType, qbAccount, qbClass) => {
  const { error } = await sb.from('qb_category_map').upsert(
    { tenant_id: AV_TENANT, tx_type: txType, qb_account: qbAccount, qb_class: qbClass, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,tx_type' }
  );
  return { error };
};
export const sbLoadTransactionsForExport = async ({ jobId, dateFrom, dateTo, allJobs = false }) => {
  let q = sb.from('job_transactions').select('*,job:jobs(address,client_name)');
  if (allJobs) q = q.eq('tenant_id', AV_TENANT);
  else if (jobId) q = q.eq('job_id', jobId);
  if (dateFrom) q = q.gte('date_incurred', dateFrom);
  if (dateTo)   q = q.lte('date_incurred', dateTo);
  q = q.order('date_incurred', { ascending: true });
  const { data } = await q;
  return data || [];
};
export const sbStampQbSynced = async (ids) => {
  if (!ids?.length) return { error: null };
  const { error } = await sb.from('job_transactions').update({ qb_synced_at: new Date().toISOString() }).in('id', ids);
  return { error };
};

// ─── Team / User management ───────────────────────────────────────────────────
export const STAFF_ROLES = ['owner','project_manager','sales_rep'];
export const ROLE_LABELS = { owner: 'Owner', sales_rep: 'Sales Rep', project_manager: 'Project Manager', sub: 'Contractor', client: 'Client' };
export const sbLoadTeam = async () => {
  const { data } = await sb.from('profiles').select('*').eq('tenant_id', AV_TENANT).in('role', STAFF_ROLES).order('full_name');
  return data || [];
};
export const sbInviteStaff = async (name, email, role) => {
  const res = await fetch(INVITE_URL, { method: 'POST', headers: authHeader(), body: JSON.stringify({ email, full_name: name, role, tenant_id: AV_TENANT }) });
  return res.json();
};
export const sbSetUserActive = async (id, val) => {
  const { error } = await sb.from('profiles').update({ is_active: val }).eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'user_manage', payload: { id, is_active: val }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
};
export const sbSetUserRole = async (id, role) => {
  const { error } = await sb.from('profiles').update({ role }).eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'user_manage', payload: { id, role }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
};
export const sbSaveCommission = async (id, pct, dollar) => {
  const { error } = await sb.from('profiles').update({ commission_pct: Number(pct) || 0, commission_dollar: Number(dollar) || 0 }).eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'user_manage', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
};

// ─── Contacts (CRM) ───────────────────────────────────────────────────────────
export const CONTACT_STATUSES = ['new','contacted','qualified','customer','lost'];
export const CONTACT_SOURCES = ['manual','website','referral','facebook','instagram','google','ghl','other'];

// ── Leads list — queries jobs with status lead/proposal (ROLE_DASHBOARDS_ARC) ─
export async function sbLoadLeads(tenantId) {
  if (!tenantId) return { ok: false, error: 'tenantId required', data: null };
  const { data, error } = await sb
    .from('jobs')
    .select('id, address, client_name, status, lead_status, lead_source, contract_value, scope, created_at')
    .eq('tenant_id', tenantId)
    .in('status', ['lead', 'proposal'])
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
}

export const sbLoadContacts = async () => {
  const { data } = await sb.from('contacts').select('*').eq('tenant_id', AV_TENANT).order('created_at', { ascending: false });
  return data || [];
};
export const sbSaveContact = async c => {
  const { data, error } = await sb.from('contacts').insert({ ...c, tenant_id: AV_TENANT, created_at: new Date().toISOString() }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'contact_save', payload: {}, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbUpdContact = async (id, ch) => {
  const { data, error } = await sb.from('contacts').update(ch).eq('id', id).select().single();
  if (error) {
    captureFailedIntent({ kind: 'contact_update', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbDelContact = async id => {
  const { error } = await sb.from('contacts').delete().eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'contact_delete', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
};
export const sbLoadContactMessages = async contactId => {
  const { data } = await sb.from('contact_messages').select('*').eq('contact_id', contactId).order('created_at', { ascending: true });
  return data || [];
};

// ─── LiDAR Scans ─────────────────────────────────────────────────────────────
export const sbSaveJobLidarScan = async ({ jobId, rooms, totalSqft, captureMode, heightMeters, heightSource, heightPoints, gpsLatitude, gpsLongitude, gpsAccuracy, qualityScore, qualityGrade, qualityDeductions, outlineData, editOverrides }) => {
  const { data, error } = await sb.from('job_lidar_scans').insert({
    tenant_id: AV_TENANT,
    job_id: jobId,
    created_by: AV_USER_ID,
    rooms,
    total_sqft: totalSqft,
    room_count: rooms.length,
    capture_mode: captureMode ?? 'interior',
    height_meters: heightMeters ?? null,
    height_source: heightSource ?? null,
    height_points: heightPoints ?? null,
    gps_latitude: gpsLatitude ?? null,
    gps_longitude: gpsLongitude ?? null,
    gps_accuracy: gpsAccuracy ?? null,
    quality_score: qualityScore ?? null,
    quality_grade: qualityGrade ?? null,
    quality_deductions: qualityDeductions ?? null,
    outline_data: outlineData ?? null,
    edit_overrides: editOverrides ?? null,
  }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'lidar_scan_save', payload: {}, jobId: jobId || null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  // Fire-and-safe: normalize geometry inline, non-blocking
  let normGeom = null;
  try {
    const normalized = normalizeFloorPlan({ rooms, scanner_version: null });
    if (normalized.ok) {
      normGeom = normalized.data;
      sb.from('job_lidar_scans')
        .update({ normalized_geometry: normGeom })
        .eq('id', data.id)
        .eq('tenant_id', AV_TENANT)
        .then(({ error: normErr }) => {
          if (normErr) console.warn('[normalize-scan] update failed:', normErr.message);
        });
    } else {
      console.warn('[normalize-scan] normalizeFloorPlan error:', normalized.error);
    }
  } catch (normEx) {
    console.warn('[normalize-scan] inline normalize threw:', normEx);
  }
  // Attach normalized_geometry to in-memory record so callers (e.g. sbCreateFloorPlan) can copy it
  return { ok: true, error: null, data: normGeom ? { ...data, normalized_geometry: normGeom } : data };
};
export const sbGetJobLidarScans = async jobId => {
  const { data } = await sb.from('job_lidar_scans').select('*').eq('job_id', jobId).order('created_at', { ascending: false });
  return data || [];
};
export const sbSaveLidarScan = async ({ contactId, rooms, totalSqft, captureMode, heightMeters, heightSource, heightPoints, gpsLatitude, gpsLongitude, gpsAccuracy, qualityScore, qualityGrade, qualityDeductions, outlineData, editOverrides }) => {
  const { data, error } = await sb.from('contact_lidar_scans').insert({
    tenant_id: AV_TENANT,
    contact_id: contactId,
    created_by: AV_USER_ID,
    rooms,
    total_sqft: totalSqft,
    room_count: rooms.length,
    capture_mode: captureMode ?? 'interior',
    height_meters: heightMeters ?? null,
    height_source: heightSource ?? null,
    height_points: heightPoints ?? null,
    gps_latitude: gpsLatitude ?? null,
    gps_longitude: gpsLongitude ?? null,
    gps_accuracy: gpsAccuracy ?? null,
    quality_score: qualityScore ?? null,
    quality_grade: qualityGrade ?? null,
    quality_deductions: qualityDeductions ?? null,
    outline_data: outlineData ?? null,
    edit_overrides: editOverrides ?? null,
  }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'lidar_scan_save', payload: {}, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbGetContactLidarScans = async contactId => {
  const { data } = await sb.from('contact_lidar_scans').select('*').eq('contact_id', contactId).order('created_at', { ascending: false });
  return data || [];
};
// Edit an existing scan's overrides (rotation, mirror, room name overrides). isJob=true → job_lidar_scans.
export const sbUpdateScanOverrides = async (scanId, isJob, editOverrides) => {
  if (isJob) {
    const { error } = await sb.from('job_lidar_scans').update({ edit_overrides: editOverrides }).eq('id', scanId);
    return { error };
  }
  const { error } = await sb.from('contact_lidar_scans').update({ edit_overrides: editOverrides }).eq('id', scanId);
  return { error };
};

// ─── Sequences (follow-up automation) ────────────────────────────────────────
export const sbLoadSequences = async () => {
  const { data } = await sb.from('sequences').select('*').eq('tenant_id', AV_TENANT).order('created_at', { ascending: false });
  return data || [];
};
export const sbSaveSequence = async seq => {
  const { data, error } = await sb.from('sequences').insert({ ...seq, tenant_id: AV_TENANT, created_by: AV_USER_ID, created_at: new Date().toISOString() }).select().single();
  return { data, error };
};
export const sbUpdSequence = async (id, ch) => sb.from('sequences').update(ch).eq('id', id);
export const sbLoadEnrollments = async seqId => {
  const { data } = await sb.from('sequence_enrollments').select('*, contact:contacts(first_name, last_name, phone, email)').eq('sequence_id', seqId).order('enrolled_at', { ascending: false });
  return data || [];
};
export const sbEnrollContact = async (seqId, contactId, nextSendAt) => {
  const { data, error } = await sb.from('sequence_enrollments').insert({ tenant_id: AV_TENANT, sequence_id: seqId, contact_id: contactId, status: 'active', current_step: 0, next_send_at: nextSendAt, enrolled_at: new Date().toISOString() }).select().single();
  return { data, error };
};
export const sbStopEnrollment = async id => sb.from('sequence_enrollments').update({ status: 'stopped' }).eq('id', id);
export const sbAutoEnrollSubInSequences = async (subId, triggerType, tenantId) => {
  try {
    const { data: seqs } = await sb.from('sequences').select('id, steps').eq('tenant_id', tenantId).eq('trigger', triggerType).eq('status', 'active');
    for (const seq of (seqs || [])) {
      const { data: ex } = await sb.from('sequence_enrollments').select('id').eq('sequence_id', seq.id).eq('sub_id', subId).in('status', ['active', 'complete']).maybeSingle();
      if (ex) continue;
      const steps = seq.steps || [];
      const nextSendAt = new Date(Date.now() + (steps[0]?.day ?? 0) * 86400000).toISOString();
      await sb.from('sequence_enrollments').insert({ tenant_id: tenantId, sequence_id: seq.id, sub_id: subId, status: 'active', current_step: 0, next_send_at: nextSendAt, enrolled_at: new Date().toISOString() });
    }
  } catch (e) { console.error('[sbAutoEnrollSubInSequences] error:', e); }
};

// ─── Todos (EXECUTION_ARC Phase 5a) ───────────────────────────────────────────

export async function sbLoadTodosForJob(jobId, { status = 'open' } = {}) {
  if (!jobId) throw new Error('jobId required');
  let q = sb.from('todos').select('*').eq('job_id', jobId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function sbLoadTodosForUser(userId, { status = 'open' } = {}) {
  if (!userId) throw new Error('userId required');
  let q = sb.from('todos').select('*, job:jobs(id, address, client_name)');
  q = q.or(`assigned_to_user_id.eq.${userId},created_by_id.eq.${userId}`);
  if (status) q = q.eq('status', status);
  const { data, error } = await q
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function sbLoadMyTodos(opts = {}) {
  if (!AV_USER_ID) return [];
  return sbLoadTodosForUser(AV_USER_ID, opts);
}

export async function sbCreateUserTodo({ title, notes, jobId, assignedToUserId, dueDate, priority }) {
  if (!title?.trim()) throw new Error('title required');
  const row = {
    tenant_id: AV_TENANT,
    title: title.trim(),
    notes: notes?.trim() ?? null,
    type: 'user_task',
    source: 'manual',
    status: 'open',
    job_id: jobId ?? null,
    assigned_to_user_id: assignedToUserId ?? AV_USER_ID,
    created_by_id: AV_USER_ID,
    due_date: dueDate ?? null,
    priority: priority ?? null,
  };
  const { data, error } = await sb.from('todos').insert(row).select().single();
  if (error) {
    captureFailedIntent({ kind: 'create_user_todo', payload: row, jobId: jobId ?? null, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  return data;
}

export async function sbUpdateTodo(todoId, updates) {
  if (!todoId) throw new Error('todoId required');
  const { id: _id, tenant_id, source, created_by_id, created_at, ...patch } = updates || {};
  patch.updated_at = new Date().toISOString();
  const { data, error } = await sb
    .from('todos')
    .update(patch)
    .eq('id', todoId)
    .select()
    .single();
  if (error) {
    captureFailedIntent({ kind: 'update_todo', payload: { todoId, ...patch }, jobId: data?.job_id ?? null, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  return data;
}

export async function sbResolveTodoManually(todoId, reason = 'manually_resolved') {
  if (!todoId) throw new Error('todoId required');
  const { data, error } = await sb
    .from('todos')
    .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', todoId)
    .eq('status', 'open')
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function fireTodoEvent(eventType, event) {
  try {
    return await runTodoEngine(sb, AV_TENANT, AV_USER_ID, eventType, event);
  } catch (err) {
    console.warn('[todoEngine] event handling failed:', eventType, err.message);
    return { created: [], resolved: [] };
  }
}

// Legacy helpers — updated to work with new schema; kept for TodoCard, App.jsx, edge functions
export const sbCountPendingTodos = async () => {
  if (!AV_USER_ID) return 0;
  const { count, error } = await sb.from('todos')
    .select('id', { count: 'exact', head: true })
    .or(`assigned_to_user_id.eq.${AV_USER_ID},created_by_id.eq.${AV_USER_ID}`)
    .eq('status', 'open');
  if (error) console.error('sbCountPendingTodos', error);
  return count || 0;
};

export const sbCreateTodo = async ({ targetUserId, title, body, type, severity = 'medium', jobId = null, sourceTable = null, sourceId = null, dueAt = null }) => {
  const row = {
    tenant_id: AV_TENANT,
    assigned_to_user_id: targetUserId,
    created_by_id: AV_USER_ID,
    title,
    notes: body,
    type: type || 'user_task',
    source: 'engine',
    status: 'open',
    job_id: jobId,
    related_entity_type: sourceTable,
    related_entity_id: sourceId || null,
    due_date: dueAt ? dueAt.slice(0, 10) : null,
  };
  const { data, error } = await sb.from('todos').insert(row).select().single();
  if (error) console.error('sbCreateTodo', error);
  return data;
};

export const sbSnoozeTodo = async (id, _snoozeHours) => {
  // New schema has no snooze concept — maps to cancelled until Phase 5c redesigns the UI
  const { error } = await sb.from('todos').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'open');
  if (error) console.error('sbSnoozeTodo', error);
};

export const sbDismissTodo = async (id) => {
  const { error } = await sb.from('todos').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'open');
  if (error) console.error('sbDismissTodo', error);
};

export const sbCompleteTodo = async (id) => {
  const { error } = await sb.from('todos').update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_reason: 'manually_resolved', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'open');
  if (error) console.error('sbCompleteTodo', error);
};

export const sbResolveTodosBySource = async (sourceTable, sourceId) => {
  const { error } = await sb.from('todos')
    .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_reason: 'auto_resolved_by_engine', updated_at: new Date().toISOString() })
    .eq('related_entity_type', sourceTable)
    .eq('related_entity_id', sourceId)
    .eq('status', 'open');
  if (error) console.error('sbResolveTodosBySource', error);
};

// ─── Failed-intent capture ────────────────────────────────────────────────────
const VALID_KINDS = new Set([
  'job_create', 'transaction_save', 'line_item_save', 'master_agent_tool_call',
  'phase_save', 'note_save', 'co_save', 'co_update', 'job_delete', 'doc_delete', 'doc_toggle',
  'message_send', 'quote_request_save', 'bid_submit', 'bid_status_update',
  'sub_pricing_save', 'sub_pricing_delete', 'sub_phase_update', 'sub_co_submit',
  'signature_save', 'rating_submit', 'daily_log_save',
  'cost_item_save', 'cost_item_update', 'cost_item_delete',
  'cost_invoice_save', 'cost_invoice_update', 'cost_invoice_delete',
  'user_manage', 'contact_save', 'contact_update', 'contact_delete',
  'sub_assign', 'sub_unassign', 'material_save', 'material_update', 'material_delete',
  'lidar_scan_save', 'room_scope_save', 'room_scope_delete', 'photo_label',
  'create_user_todo', 'update_todo',
]);
const KIND_LABEL = {
  job_create: 'Add Project', transaction_save: 'Add Transaction', line_item_save: 'Add Line Item',
  master_agent_tool_call: 'AI Action', phase_save: 'Save Phase', note_save: 'Save Note',
  co_save: 'Create CO', co_update: 'Update CO', job_delete: 'Delete Project',
  doc_delete: 'Delete Document', doc_toggle: 'Document Visibility', message_send: 'Send Message',
  quote_request_save: 'Quote Request', bid_submit: 'Submit Bid', bid_status_update: 'Bid Status',
  sub_pricing_save: 'Save Pricing', sub_pricing_delete: 'Delete Pricing',
  sub_phase_update: 'Phase Update', sub_co_submit: 'Submit CO', signature_save: 'Save Signature',
  rating_submit: 'Submit Rating', daily_log_save: 'Daily Log',
  cost_item_save: 'Save Cost Item', cost_item_update: 'Update Cost Item', cost_item_delete: 'Delete Cost Item',
  cost_invoice_save: 'Save Invoice', cost_invoice_update: 'Update Invoice', cost_invoice_delete: 'Delete Invoice',
  user_manage: 'User Management', contact_save: 'Save Contact', contact_update: 'Update Contact',
  contact_delete: 'Delete Contact', sub_assign: 'Assign Sub', sub_unassign: 'Remove Sub',
  material_save: 'Save Material', material_update: 'Update Material', material_delete: 'Delete Material',
  lidar_scan_save: 'Save Scan', room_scope_save: 'Save Room Scope', room_scope_delete: 'Delete Room Scope',
  photo_label: 'Label Photo',
  create_user_todo: 'Create To-do', update_todo: 'Update To-do',
};
export const captureFailedIntent = async ({ kind, payload = {}, jobId = null, message = '', resumable = true, bugReportId = null }) => {
  try {
    if (!VALID_KINDS.has(kind)) return { ok: false, error: 'invalid kind' };
    const kindLabel = KIND_LABEL[kind] || kind;
    const { data, error } = await sb.from('todos').insert({
      tenant_id: AV_TENANT,
      assigned_to_user_id: AV_USER_ID,
      created_by_id: AV_USER_ID,
      title: `Resume: ${kindLabel}`,
      notes: message || 'Save failed — tap Resume to retry.',
      type: 'failed_intent',
      source: 'manual',
      status: 'open',
      job_id: jobId || null,
      payload: { kind, jobId, resumable, ...payload },
      ...(bugReportId ? { bug_report_id: bugReportId } : {}),
    }).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, todoId: data.id };
  } catch (e) { return { ok: false, error: e.message }; }
};
export const sbLinkBugToTodo = async (todoId, bugReportId) => {
  const { error } = await sb.from('todos').update({ bug_report_id: bugReportId }).eq('id', todoId);
  return { ok: !error, error: error?.message };
};
export const sbCountRecentFailedIntents = async (days = 7) => {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await sb.from('todos')
    .select('id, payload, assigned_to_user_id')
    .eq('type', 'failed_intent')
    .gte('created_at', since);
  if (error) return { total: 0, byKind: {}, byUser: {} };
  const byKind = {};
  const byUser = {};
  (data || []).forEach(t => {
    const k = t.payload?.kind || 'unknown';
    byKind[k] = (byKind[k] || 0) + 1;
    byUser[t.assigned_to_user_id] = (byUser[t.assigned_to_user_id] || 0) + 1;
  });
  return { total: data.length, byKind, byUser };
};

// ─── Address autocomplete ─────────────────────────────────────────────────────
export const fetchAddressSuggestions = async input => {
  if (!input || input.length < 3) return [];
  try {
    const res = await fetch(`${FN}/address-autocomplete`, { method: 'POST', headers: authHeader(), body: JSON.stringify({ input }) });
    return await res.json();
  } catch { return []; }
};

// ─── Materials ────────────────────────────────────────────────────────────────
export const MATERIAL_STATUSES = ['needed','ordered','delivered','installed'];
export const MATERIAL_UNITS = ['sq ft','lin ft','ea','box','sheet','gal','bag','ton','yd','roll','set'];

export const sbLoadMaterials = async jid => {
  const { data } = await sb.from('job_materials').select('*').eq('job_id', jid).order('created_at', { ascending: true });
  return data || [];
};
export const sbSaveMaterial = async mat => {
  const { data, error } = await sb.from('job_materials').insert({ ...mat, tenant_id: AV_TENANT, created_by: AV_USER_ID, created_at: new Date().toISOString() }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'material_save', payload: {}, jobId: mat.job_id || null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbUpdMaterial = async (id, ch) => {
  const { data, error } = await sb.from('job_materials').update(ch).eq('id', id).select().single();
  if (error) {
    captureFailedIntent({ kind: 'material_update', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbDelMaterial = async id => {
  const { error } = await sb.from('job_materials').delete().eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'material_delete', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
};

// ─── Owner Intelligence ───────────────────────────────────────────────────────
export const sbLoadSubPerformance = (tenant_id) =>
  sb.from('sub_performance').select('*, profiles(full_name, email, phone)').eq('tenant_id', tenant_id).order('score', { ascending: false }).then(r => r.data || []);

export const sbLoadJobOutcomes = (tenant_id) =>
  sb.from('job_outcomes').select('*').eq('tenant_id', tenant_id).order('completed_at', { ascending: false }).then(r => r.data || []);

export const sbLoadBidAnalytics = (tenant_id) =>
  sb.from('bid_analytics').select('*').eq('tenant_id', tenant_id).order('bid_sent_at', { ascending: false }).then(r => r.data || []);


export const sbLoadOwnerEscalations = (tenant_id) =>
  sb.from('owner_escalations').select('*, jobs(address)').eq('tenant_id', tenant_id).eq('status', 'pending').order('created_at', { ascending: false }).then(r => r.data || []);

// ─── Oh Shit Moments ─────────────────────────────────────────────────────────
export const sbLoadOhShitMoments = async (jobId) => {
  const { data } = await sb.from('oh_shit_moments').select('*').eq('job_id', jobId).order('created_at', { ascending: false });
  return data || [];
};
export const sbToggleOhShitProposal = async (id, included) => {
  await sb.from('oh_shit_moments').update({ included_in_proposal: included }).eq('id', id);
};

// ─── Pricing Lookup ───────────────────────────────────────────────────────────
export const sbLoadPricingLookup = async (trade = 'general') => {
  const { data, error } = await sb.from('pricing_lookup')
    .select('*')
    .eq('tenant_id', AV_TENANT)
    .eq('trade', trade)
    .eq('active', true)
    .order('category');
  if (error) console.error('sbLoadPricingLookup', error);
  return data || [];
};

// ─── Takeoff Templates ────────────────────────────────────────────────────────
export const sbLoadTakeoffTemplates = async (roomType = null) => {
  let q = sb.from('takeoff_templates')
    .select('*')
    .eq('tenant_id', AV_TENANT)
    .eq('active', true);
  if (roomType) q = q.eq('room_type', roomType);
  const { data, error } = await q.order('name');
  if (error) console.error('sbLoadTakeoffTemplates', error);
  return data || [];
};

// ─── Takeoff Drafts ───────────────────────────────────────────────────────────
export const sbSaveTakeoffDraft = async (jobId, draftType, snapshot) => {
  const { data, error } = await sb.from('takeoff_drafts').insert({
    tenant_id: AV_TENANT,
    job_id: jobId,
    draft_type: draftType,
    snapshot,
    created_by: AV_USER_ID,
  }).select().single();
  if (error) console.error('sbSaveTakeoffDraft', error);
  return data;
};
export const sbLoadTakeoffDrafts = async (jobId) => {
  const { data, error } = await sb.from('takeoff_drafts')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  if (error) console.error('sbLoadTakeoffDrafts', error);
  return data || [];
};

// ─── Material Orders (legacy stubs removed — see sbCreateMaterialOrder etc. at bottom) ───

// ─── Gap Analyzer ─────────────────────────────────────────────────────────────
export const GAP_ANALYZER_URL = `${FN}/ai-consultation-gap-analyzer`;
export const sbRunGapAnalysis = async (sessionId, jobId) => {
  try {
    const res = await fetch(GAP_ANALYZER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ session_id: sessionId, job_id: jobId }),
    });
    return await res.json();
  } catch (e) { return { error: String(e) }; }
};
export const sbLoadLatestGapAnalysis = async (sessionId) => {
  const { data } = await sb.from('consultation_gap_analyses').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
};

// ─── Takeoff wizard data layer ─────────────────────────────────────────────────
export const sbBuildTakeoffDraft = async ({ jobId, roomType, roomIds }) => {
  const { buildTakeoffDraft } = await import('./takeoff');
  return buildTakeoffDraft({ jobId, roomType, roomIds });
};

// ─── Room scope tagging ────────────────────────────────────────────────────────

export const sbLoadJobRoomScopes = async (jobId) => {
  const { data } = await sb.from('job_room_scopes').select('*').eq('job_id', jobId);
  return data || [];
};

export const sbSaveJobRoomScope = async ({
  jobId, roomId, roomLabel, roomType, scopeTag, customTrades, notes,
  scopeDetails, tenantId, userId,
}) => {
  const { data, error } = await sb.from('job_room_scopes').upsert({
    tenant_id:     tenantId,
    job_id:        jobId,
    room_id:       roomId,
    room_label:    roomLabel ?? null,
    room_type:     roomType,
    scope_tag:     scopeTag,
    custom_trades: customTrades ?? null,
    notes:         notes ?? null,
    scope_details: scopeDetails ?? {},
    created_by:    userId,
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'tenant_id,job_id,room_id' }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'room_scope_save', payload: { roomId, scopeTag }, jobId: jobId || null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};

export const sbDeleteJobRoomScope = async (id) => {
  const { error } = await sb.from('job_room_scopes').delete().eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'room_scope_delete', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
};

/**
 * Load all scanned rooms for a job, flattened from job_lidar_scans.rooms JSONB.
 * Returns rooms WITHOUT any scope filter — used by ScopeTab for room discovery
 * so that not_in_scope rooms are visible in the UI (not filtered as orphans).
 * TakeoffWizard uses buildTakeoffDraft which applies scope filters.
 */
export const sbLoadJobScanRooms = async (jobId) => {
  const { data: scans } = await sb
    .from('job_lidar_scans')
    .select('id, rooms, capture_mode')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(5);

  const result = [];
  for (const scan of (scans || [])) {
    (scan.rooms || []).forEach((room, idx) => {
      const roomId = `${scan.id}_${idx}`;
      const label = room.name || `Room ${idx + 1}`;
      // Assign room type by label — see roomMatchesType in takeoff.js (duplicated here
      // for ScopeTab room discovery without importing the full takeoff module).
      const l = label.toLowerCase();
      let roomType = 'refresh';
      if (l.includes('bath'))     roomType = 'bathroom';
      else if (l.includes('kitchen'))  roomType = 'kitchen';
      else if (l.includes('basement')) roomType = 'basement';
      else if (scan.capture_mode === 'exterior') roomType = 'exterior';

      result.push({
        roomId,
        roomLabel: label,
        scanId:    scan.id,
        idx,
        areaSf:    room.sqft ?? 0,
        floor:     0,
        roomType,
        captureMode: scan.capture_mode ?? null,
      });
    });
  }
  return result;
};

export const sbLoadScopeSubsets = async (roomType) => {
  let q = sb.from('template_scope_subsets').select('*').order('sort_order');
  if (roomType) q = q.eq('room_type', roomType);
  const { data } = await q;
  if (!data?.length) return [];
  // Tenant override beats platform default for same scope_tag (same de-dup pattern).
  const map = {};
  for (const row of data) {
    const prev = map[row.scope_tag];
    if (!prev || (row.tenant_id !== null && prev.tenant_id === null)) {
      map[row.scope_tag] = row;
    }
  }
  return Object.values(map).sort((a, b) => a.sort_order - b.sort_order);
};

/**
 * Load the scope detail schema for a (room_type, scope_tag) pair.
 * Returns the schema JSONB or null if no schema exists.
 * Tenant override beats platform default (same de-dup pattern).
 */
export const sbLoadScopeDetailSchema = async (roomType, scopeTag, tenantId) => {
  const { data } = await sb
    .from('scope_detail_schemas')
    .select('schema, tenant_id')
    .eq('room_type', roomType)
    .eq('scope_tag', scopeTag)
    .eq('active', true)
    .order('tenant_id', { nullsFirst: true }); // platform first, tenant override last
  if (!data?.length) return null;
  // Prefer tenant row if one exists and tenantId matches
  const tenantRow = tenantId ? data.find(r => r.tenant_id === tenantId) : null;
  const row = tenantRow ?? data.find(r => r.tenant_id === null) ?? data[0];
  return row?.schema ?? null;
};

/**
 * Save a rep-edited rate back to takeoff_unit_costs as a tenant override row.
 * Platform-default rows (tenant_id NULL) are never touched — only tenant rows
 * are written. If a tenant override for this (trade, room_type, category,
 * material_name) already exists, it is updated in-place.
 *
 * Uses SELECT → INSERT-or-UPDATE because the unique indexes on the table use
 * coalesce() expressions that Supabase JS onConflict can't target directly.
 */
export const sbSaveTenantUnitCostOverride = async ({
  tenantId,
  roomType,
  trade,
  materialName,     // null for labor rows
  category,         // 'labor' | 'materials'
  unit,
  baseRate,
  sourceUnitCostId, // id of the platform-default row this overrides
}) => {
  if (!baseRate || Number(baseRate) <= 0) return { error: 'baseRate must be positive' };

  // Find existing tenant override for this exact (trade, room_type, category, material_name)
  let q = sb.from('takeoff_unit_costs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('room_type', roomType)
    .eq('trade', trade)
    .eq('category', category)
    .eq('active', true);

  if (materialName == null) {
    q = q.is('material_name', null);
  } else {
    q = q.eq('material_name', materialName);
  }

  const { data: existing } = await q.maybeSingle();

  if (existing) {
    const { error } = await sb.from('takeoff_unit_costs')
      .update({ base_rate: Number(baseRate), updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    return { error, id: existing.id };
  }

  // Fetch platform default to inherit coverage_sf and waste_pct.
  // Without this, a new override row gets coverage_sf=null which breaks
  // the ÷coverage formula and produces wildly wrong material quantities.
  let pq = sb.from('takeoff_unit_costs')
    .select('coverage_sf, waste_pct, unit')
    .is('tenant_id', null)
    .eq('room_type', roomType)
    .eq('trade', trade)
    .eq('category', category)
    .eq('active', true);
  if (materialName == null) pq = pq.is('material_name', null);
  else pq = pq.eq('material_name', materialName);
  const { data: platform } = await pq.maybeSingle();

  const row = {
    tenant_id:    tenantId,
    room_type:    roomType,
    trade,
    category,
    material_name: materialName ?? null,
    unit:          unit ?? platform?.unit ?? null,
    base_rate:     Number(baseRate),
    coverage_sf:   platform?.coverage_sf ?? null,
    waste_pct:     platform?.waste_pct ?? null,
    multipliers:   {},
    active:        true,
    notes:         sourceUnitCostId ? `override of platform row ${sourceUnitCostId}` : null,
  };
  const { data, error } = await sb.from('takeoff_unit_costs').insert(row).select('id').single();
  return { error, id: data?.id };
};

// ─── Schedule Items ───────────────────────────────────────────────────────────

export const sbLoadScheduleItems = async (jobId) => {
  try {
    const { data, error } = await sb
      .from('schedule_items')
      .select('*, assigned_sub:profiles!assigned_sub_id(id, full_name)')
      .eq('job_id', jobId)
      .order('scheduled_date', { nullsFirst: false })
      .order('scheduled_time', { nullsFirst: true })
      .order('created_at');
    if (error) throw error;
    return { ok: true, error: null, data: data || [] };
  } catch (e) {
    return { ok: false, error: e.message, data: [] };
  }
};

export async function sbLoadClientMilestones(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required' };
  try {
    const { data, error } = await sb
      .from('schedule_items')
      .select('id, title, type, trade, scheduled_date, scheduled_end_date, actual_finish_date, status, notes, duration_days, phase_id, is_milestone')
      .eq('job_id', jobId)
      .eq('is_milestone', true)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true, nullsFirst: false });
    if (error) return { ok: false, error: error.message };
    const today = new Date().toISOString().slice(0, 10);
    const formatted = (data || []).map(item => {
      let computed_status = 'upcoming';
      if (item.actual_finish_date) {
        computed_status = item.scheduled_date && item.actual_finish_date > item.scheduled_date
          ? 'completed_late'
          : 'completed';
      } else if (!item.scheduled_date) {
        computed_status = 'unscheduled';
      } else if (item.scheduled_date <= today) {
        computed_status = 'in_progress';
      }
      return { ...item, computed_status };
    });
    return { ok: true, data: formatted };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export const sbLoadUpcomingScheduleItems = async (days = 7) => {
  if (!AV_TENANT) return { ok: true, data: [] };
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from('schedule_items')
    .select('*, job:jobs!job_id(id, address)')
    .eq('tenant_id', AV_TENANT)
    .gte('scheduled_date', today)
    .lte('scheduled_date', end)
    .neq('status', 'cancelled')
    .neq('status', 'complete')
    .order('scheduled_date', { nullsFirst: false })
    .order('scheduled_time', { nullsFirst: true });
  if (error) return { ok: false, error: error.message, data: [] };
  return { ok: true, data: data || [] };
};

export const sbCreateScheduleItem = async (payload) => {
  try {
    const row = {
      ...payload,
      tenant_id:           AV_TENANT,
      created_by_id:       AV_USER_ID,
      // coalesce empty strings → null at write boundary (sweep 2 pattern)
      scheduled_date:      payload.scheduled_date      || null,
      scheduled_time:      payload.scheduled_time      || null,
      scheduled_end_date:  payload.scheduled_end_date  || null,
      assigned_sub_id:     payload.assigned_sub_id     || null,
      trade:               payload.trade ? canonicalizeTrade(payload.trade) : null,
    };
    const { data, error } = await sb
      .from('schedule_items')
      .insert(row)
      .select('*, assigned_sub:profiles!assigned_sub_id(id, full_name)')
      .single();
    if (error) throw error;
    if (payload.type === 'sub_start') {
      await derivePhaseStatus(payload.job_id, AV_TENANT).catch(() => {});
      // B1: sync walkthrough fire_at now that this sub_start has a date
      if (data?.trade && data?.scheduled_date) {
        sbSyncWalkthroughFireAt(data.job_id, data.trade, data.scheduled_date)
          .catch(err => console.warn('[walkthrough] create fire_at sync failed:', err?.message));
      }
    }
    return { ok: true, error: null, data };
  } catch (e) {
    captureFailedIntent({ kind: 'schedule_item_create', payload, jobId: payload.job_id, message: e.message }).catch(() => {});
    return { ok: false, error: e.message, data: null };
  }
};

export const sbUpdateScheduleItem = async (id, patch) => {
  try {
    const { data: prevRow } = await sb
      .from('schedule_items')
      .select('*')
      .eq('id', id)
      .single();
    // Photo gate: sub_start / site_visit / inspection require ≥1 linked photo to complete
    if (patch.status === 'complete') {
      const itemType = patch.type ?? prevRow?.type;
      if (['sub_start', 'site_visit', 'inspection'].includes(itemType)) {
        const photoCount = await countPhotosForEntity(sb, 'schedule_item', id);
        if (photoCount === 0) {
          return { ok: false, error: 'At least 1 photo is required to mark this item complete.', data: null, prevRow: prevRow || null };
        }
      }
    }
    const clean = {
      ...patch,
      scheduled_date:     patch.scheduled_date     !== undefined ? (patch.scheduled_date     || null) : undefined,
      scheduled_time:     patch.scheduled_time     !== undefined ? (patch.scheduled_time     || null) : undefined,
      scheduled_end_date: patch.scheduled_end_date !== undefined ? (patch.scheduled_end_date || null) : undefined,
      assigned_sub_id:    patch.assigned_sub_id    !== undefined ? (patch.assigned_sub_id    || null) : undefined,
      trade:              patch.trade              !== undefined ? (patch.trade ? canonicalizeTrade(patch.trade) : null) : undefined,
      phase_id:           patch.phase_id           !== undefined ? (patch.phase_id           || null) : undefined,
    };
    // strip undefined keys so we don't accidentally null un-patched columns
    Object.keys(clean).forEach(k => clean[k] === undefined && delete clean[k]);
    const { data, error } = await sb
      .from('schedule_items')
      .update(clean)
      .eq('id', id)
      .select('*, assigned_sub:profiles!assigned_sub_id(id, full_name)')
      .single();
    if (error) throw error;
    const type    = data?.type    ?? prevRow?.type;
    const jobId   = data?.job_id  ?? prevRow?.job_id;
    const tenantId = data?.tenant_id ?? prevRow?.tenant_id ?? AV_TENANT;
    if (type === 'sub_start' || patch.status) {
      await derivePhaseStatus(jobId, tenantId).catch(() => {});
    }
    const siTrade = data?.trade ?? prevRow?.trade;
    if (data?.status === 'complete') {
      fireTodoEvent('schedule_item.completed', { jobId, scheduleItemId: id, trade: siTrade }).catch(() => {});
    } else if (data?.status === 'cancelled') {
      fireTodoEvent('schedule_item.cancelled', { jobId, scheduleItemId: id, trade: siTrade }).catch(() => {});
    } else {
      fireTodoEvent('schedule_item.modified', { jobId, scheduleItemId: id, trade: siTrade, newStatus: data?.status }).catch(() => {});
    }
    if ((data?.type ?? prevRow?.type) === 'sub_start' && patch.status !== undefined) {
      checkAndAutoInvoice(sb, AV_TENANT, AV_USER_ID, 'sub_start.status_changed', {
        jobId, trade: siTrade, newStatus: data?.status,
      }).then(fired => fired.forEach(f => fireTodoEvent('invoice.auto_drafted', { jobId, invoiceId: f.invoiceId, drawId: f.drawId, triggerLabel: f.triggerLabel }).catch(() => {})))
        .catch(err => console.warn('[autoInvoice] sbUpdateScheduleItem hook failed:', err?.message));
    }
    // Cascade when scheduled_date or scheduled_end_date changed
    const dateChanged = (patch.scheduled_date !== undefined && patch.scheduled_date !== prevRow?.scheduled_date)
      || (patch.scheduled_end_date !== undefined && patch.scheduled_end_date !== prevRow?.scheduled_end_date);
    if (dateChanged) {
      sbCascadeScheduleChange(id, 'rescheduled').catch(err =>
        console.warn('[cascade] sbUpdateScheduleItem cascade failed:', err?.message)
      );
    }
    // B1: sync walkthrough fire_at when a sub_start's scheduled_date is set or changed
    if (type === 'sub_start' && data?.trade && data?.scheduled_date &&
        patch.scheduled_date !== undefined && patch.scheduled_date !== prevRow?.scheduled_date) {
      sbSyncWalkthroughFireAt(jobId, data.trade, data.scheduled_date)
        .catch(err => console.warn('[walkthrough] update fire_at sync failed:', err?.message));
    }
    return { ok: true, error: null, data, prevRow: prevRow || null };
  } catch (e) {
    captureFailedIntent({ kind: 'schedule_item_update', payload: { id, patch }, jobId: patch.job_id, message: e.message }).catch(() => {});
    return { ok: false, error: e.message, data: null, prevRow: null };
  }
};

// Soft-delete: sets status='cancelled' rather than hard-deleting.
// If the item was a sub_start, re-derives phase status.
// NOTE: phase derivation never decrements — a phase already at 'complete' stays 'complete'
// even after its driver sub_start item is cancelled. UI in Prompt B should warn the PM.
export const sbDeleteScheduleItem = async (id) => {
  try {
    const { data: row } = await sb
      .from('schedule_items')
      .select('type, job_id, tenant_id, trade')
      .eq('id', id)
      .single();
    const { error } = await sb
      .from('schedule_items')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) throw error;
    if (row?.type === 'sub_start') {
      await derivePhaseStatus(row.job_id, row.tenant_id ?? AV_TENANT).catch(() => {});
    }
    fireTodoEvent('schedule_item.cancelled', { jobId: row?.job_id, scheduleItemId: id, trade: row?.trade }).catch(() => {});
    return { ok: true, error: null };
  } catch (e) {
    captureFailedIntent({ kind: 'schedule_item_delete', payload: { id }, jobId: null, message: e.message }).catch(() => {});
    return { ok: false, error: e.message };
  }
};

// ─── Schedule Item Invitees (CALENDAR_ARC Phase 1) ──────────────────────────

export const sbLoadScheduleInvitees = async (scheduleItemId) => {
  if (!scheduleItemId) return { ok: false, error: 'scheduleItemId required', data: [] };
  try {
    const { data: rows, error } = await sb
      .from('schedule_item_invitees')
      .select('id, invitee_user_id, status, invited_by, invited_at, responded_at')
      .eq('schedule_item_id', scheduleItemId)
      .order('invited_at', { ascending: true });
    if (error) return { ok: false, error: error.message, data: [] };
    if (!rows?.length) return { ok: true, data: [] };
    const userIds = rows.map(r => r.invitee_user_id);
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, full_name, email, role, avatar_url')
      .in('id', userIds);
    const pm = {};
    (profiles || []).forEach(p => { pm[p.id] = p; });
    return { ok: true, data: rows.map(r => ({ ...r, profile: pm[r.invitee_user_id] || null })) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), data: [] };
  }
};

export const sbAddScheduleInvitee = async ({ scheduleItemId, inviteeUserId, scheduleItem }) => {
  if (!scheduleItemId || !inviteeUserId) return { ok: false, error: 'scheduleItemId and inviteeUserId required' };
  try {
    const { data: inv, error: invErr } = await sb
      .from('schedule_item_invitees')
      .insert({ schedule_item_id: scheduleItemId, invitee_user_id: inviteeUserId, tenant_id: AV_TENANT, invited_by: AV_USER_ID })
      .select('id')
      .single();
    if (invErr) return { ok: false, error: invErr.message };
    const title = scheduleItem?.title || 'Event';
    const dateStr = scheduleItem?.scheduled_date || '';
    const { error: notifErr } = await sb.from('notifications').insert({
      user_id: inviteeUserId,
      type: 'schedule_item_created',
      title: `Invited: ${title}`,
      body: `You've been invited to "${title}"${dateStr ? ` on ${dateStr}` : ''}. Open the calendar to view.`,
      job_id: scheduleItem?.job_id || null,
    });
    if (notifErr) console.error('sbAddScheduleInvitee notification insert failed:', notifErr.message);
    return { ok: true, data: { id: inv.id } };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
};

export const sbRemoveScheduleInvitee = async (inviteeRowId) => {
  if (!inviteeRowId) return { ok: false, error: 'inviteeRowId required' };
  try {
    const { error } = await sb.from('schedule_item_invitees').delete().eq('id', inviteeRowId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
};

export const sbRespondToScheduleInvite = async (inviteeRowId, status) => {
  if (!inviteeRowId) return { ok: false, error: 'inviteeRowId required' };
  if (!['accepted','declined','tentative'].includes(status)) return { ok: false, error: `invalid status: ${status}` };
  try {
    const { error } = await sb
      .from('schedule_item_invitees')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', inviteeRowId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
};

// ─── Scheduling Arc Phase 1 (SCHEDULING_ARC slice 1) ────────────────────────

export async function sbSetScheduleItemDependencies(id, predecessorIds = [], lagDays = 0) {
  if (!id) return { ok: false, error: 'id required' };
  if (!Array.isArray(predecessorIds)) return { ok: false, error: 'predecessorIds must be array' };
  try {
    if (predecessorIds.length > 0) {
      const visited = new Set();
      const queue = [...predecessorIds];
      while (queue.length > 0) {
        const cur = queue.shift();
        if (cur === id) return { ok: false, error: 'cycle detected — predecessor chain reaches this item' };
        if (visited.has(cur)) continue;
        visited.add(cur);
        const { data, error } = await sb.from('schedule_items').select('predecessor_ids').eq('id', cur).single();
        if (error) return { ok: false, error: `walking predecessors: ${error.message}` };
        for (const pid of data?.predecessor_ids || []) {
          if (!visited.has(pid)) queue.push(pid);
        }
      }
    }
    const { error: updErr } = await sb.from('schedule_items').update({ predecessor_ids: predecessorIds, lag_days: lagDays }).eq('id', id);
    if (updErr) return { ok: false, error: updErr.message };
    const { data: { user } } = await sb.auth.getUser();
    const { data: item } = await sb.from('schedule_items').select('job_id').eq('id', id).single();
    await sb.from('schedule_change_log').insert({
      tenant_id: AV_TENANT,
      schedule_item_id: id,
      job_id: item?.job_id,
      change_kind: 'date_moved',
      new_value: { predecessor_ids: predecessorIds, lag_days: lagDays },
      changed_by_id: user?.id,
      reason: 'dependencies updated',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sbMarkScheduleItemFinished(id, finishDate = null) {
  if (!id) return { ok: false, error: 'id required' };
  try {
    const date = finishDate || new Date().toISOString().slice(0, 10);
    const { data: { user } } = await sb.auth.getUser();
    const { data: current, error: rdErr } = await sb.from('schedule_items').select('actual_finish_date, job_id').eq('id', id).single();
    if (rdErr) return { ok: false, error: rdErr.message };
    const { error: updErr } = await sb.from('schedule_items').update({ actual_finish_date: date, status: 'complete' }).eq('id', id);
    if (updErr) return { ok: false, error: updErr.message };
    await sb.from('schedule_change_log').insert({
      tenant_id: AV_TENANT,
      schedule_item_id: id,
      job_id: current.job_id,
      change_kind: 'finished',
      old_value: { actual_finish_date: current.actual_finish_date },
      new_value: { actual_finish_date: date },
      changed_by_id: user?.id,
    });
    // Cascade to downstream items — fire-and-forget, never blocks finish return
    const cascadeResult = await sbCascadeScheduleChange(id, `finished on ${date}`);
    return {
      ok: true,
      cascade: cascadeResult.ok ? cascadeResult.data : null,
      cascade_error: cascadeResult.ok ? null : cascadeResult.error,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─── Schedule-lock walkthrough sync (ANTI_SURPRISE_ENGINE_ARC Phase 2.1) ─────

/**
 * Syncs a walkthrough_prep scheduled_action's fire_at to scheduledDate - 1 day.
 * Called when a sub_start schedule item's date is set or changed.
 * Only updates status='scheduled' rows (not-yet-fired). No-op if no row matches.
 * Failures are logged but never block the caller — always call fire-and-forget.
 */
export async function sbSyncWalkthroughFireAt(jobId, trade, scheduledDate) {
  if (!jobId || !trade || !scheduledDate) return { ok: false, error: 'jobId, trade, scheduledDate required' };
  const canonTrade = canonicalizeTrade(trade);
  const ruleKey = `walkthrough_prep::${canonTrade}`;
  // Compute fire_at the same way as the generator: midnight UTC one day before start
  const d = new Date(scheduledDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  const fireAt = d.toISOString();
  const { data, error } = await sb
    .from('scheduled_actions')
    .update({ fire_at: fireAt })
    .eq('related_job_id', jobId)
    .eq('kind', 'walkthrough_prep')
    .eq('rule_key', ruleKey)
    .eq('status', 'scheduled')
    .select('id, fire_at');
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null, data: data || [] };
}

// ─── Cascade Engine — SCHEDULING_ARC slice 6 ─────────────────────────────────

// ISO date helpers (module-private)
function _addDaysISO(isoDate, days) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function _daysBetweenISO(start, end) {
  if (!start || !end) return null;
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  return Math.floor((e - s) / 86400000);
}

/**
 * SCHEDULING_ARC slice 6: cascade engine.
 *
 * Called when a source schedule_item's date or duration changes. BFS-walks all
 * items that have the source in their predecessor_ids, computes new
 * earliest_start_date for each as max(predecessor_finish + lag_days + 1) across
 * all predecessors, and pushes scheduled_date forward only when the item is
 * currently scheduled BEFORE that earliest. Recurses to depth 20 (safety cap).
 *
 * @param {string} sourceItemId — the item whose change triggered this
 * @param {string} reason — description for audit log
 * @returns {{ ok, data: { affected_items, depth, source_item_id }, error }}
 */
export async function sbCascadeScheduleChange(sourceItemId, reason = 'predecessor change') {
  if (!sourceItemId) return { ok: false, error: 'sourceItemId required' };
  try {
    const { data: { user } } = await sb.auth.getUser();
    const userId = user?.id || null;

    // Pre-load source's effective finish date
    const { data: src, error: srcErr } = await sb
      .from('schedule_items')
      .select('id, job_id, scheduled_date, scheduled_end_date, actual_finish_date, duration_days')
      .eq('id', sourceItemId)
      .single();
    if (srcErr) return { ok: false, error: `read source item: ${srcErr.message}` };

    const affected = [];
    const visited  = new Set([sourceItemId]);
    // Queue entries: { id, finishDate }
    const srcFinish = src.actual_finish_date
      || src.scheduled_end_date
      || _addDaysISO(src.scheduled_date, (src.duration_days || 1) - 1);
    const queue = [{ id: sourceItemId, finishDate: srcFinish }];
    let maxDepth = 0;

    // Cache job rows (job_id → { assigned_pm, client_user_id, address })
    const jobCache = {};
    const _getJob = async (jobId) => {
      if (!jobId) return null;
      if (jobCache[jobId]) return jobCache[jobId];
      const { data } = await sb
        .from('jobs')
        .select('id, assigned_pm, client_user_id, address')
        .eq('id', jobId)
        .single();
      if (data) jobCache[jobId] = data;
      return data || null;
    };

    let depth = 0;
    while (queue.length > 0) {
      depth++;
      if (depth > 20) {
        return { ok: false, error: `cascade exceeded depth 20 — possible cycle near item ${sourceItemId}` };
      }
      maxDepth = Math.max(maxDepth, depth - 1);

      const batch = queue.splice(0, queue.length);

      for (const { id: currentId, finishDate: currentFinish } of batch) {
        if (!currentFinish) continue;

        // Find items with currentId in their predecessor_ids, scoped to same job
        const { data: downstream, error: dsErr } = await sb
          .from('schedule_items')
          .select('id, job_id, title, type, trade, scheduled_date, scheduled_end_date, predecessor_ids, lag_days, duration_days, assigned_sub_id, actual_finish_date, status')
          .eq('job_id', src.job_id)
          .contains('predecessor_ids', [currentId])
          .neq('status', 'cancelled');
        if (dsErr) return { ok: false, error: `query downstream of ${currentId}: ${dsErr.message}` };

        for (const item of (downstream || [])) {
          if (visited.has(item.id)) continue;
          visited.add(item.id);

          const lag = item.lag_days || 0;
          // Start with this predecessor's contribution
          let effectiveEarliest = _addDaysISO(currentFinish, lag + 1);

          // If multi-predecessor, take MAX across all
          const otherPredIds = (item.predecessor_ids || []).filter(pid => pid !== currentId);
          if (otherPredIds.length > 0) {
            const { data: otherPreds } = await sb
              .from('schedule_items')
              .select('id, scheduled_date, scheduled_end_date, actual_finish_date, duration_days')
              .in('id', otherPredIds);
            for (const op of (otherPreds || [])) {
              const opFinish = op.actual_finish_date
                || op.scheduled_end_date
                || _addDaysISO(op.scheduled_date, (op.duration_days || 1) - 1);
              if (opFinish) {
                const opEarliest = _addDaysISO(opFinish, lag + 1);
                if (opEarliest > effectiveEarliest) effectiveEarliest = opEarliest;
              }
            }
          }

          // Only push if item is currently scheduled BEFORE new earliest
          if (item.scheduled_date && item.scheduled_date >= effectiveEarliest) continue;

          const oldDate  = item.scheduled_date;
          const newDate  = effectiveEarliest;
          const daysShifted = oldDate ? _daysBetweenISO(oldDate, newDate) : null;
          const newEnd = (item.scheduled_end_date && oldDate)
            ? _addDaysISO(newDate, _daysBetweenISO(oldDate, item.scheduled_end_date) || 0)
            : null;

          const updatePayload = { scheduled_date: newDate };
          if (newEnd) updatePayload.scheduled_end_date = newEnd;

          const { error: updErr } = await sb
            .from('schedule_items')
            .update(updatePayload)
            .eq('id', item.id);

          if (updErr) {
            affected.push({ id: item.id, title: item.title, old_date: oldDate, new_date: newDate, days_shifted: daysShifted, error: updErr.message, notified: false });
            continue;
          }

          // Audit log
          await sb.from('schedule_change_log').insert({
            tenant_id:         AV_TENANT,
            schedule_item_id:  item.id,
            job_id:            item.job_id,
            change_kind:       'cascade_applied',
            old_value:         { scheduled_date: oldDate, scheduled_end_date: item.scheduled_end_date },
            new_value:         { scheduled_date: newDate, scheduled_end_date: newEnd },
            cascade_source_id: sourceItemId,
            reason:            `cascade from item ${sourceItemId}: ${reason}`,
            changed_by_id:     userId,
          }).catch(() => {});

          // Notify: enriched body with date change context
          let notified = false;
          try {
            const oldFmt = fDate(oldDate);
            const newFmt = fDate(newDate);
            const body   = oldFmt
              ? `${item.title} moved from ${oldFmt} to ${newFmt} (cascade from upstream task).`
              : `${item.title} rescheduled to ${newFmt} (cascade from upstream task).`;
            const job = await _getJob(item.job_id);
            const title = `Schedule update — ${job?.address || 'job'}`;
            const recipients = new Set();
            if (item.assigned_sub_id) recipients.add(item.assigned_sub_id);
            if (job?.assigned_pm)  recipients.add(job.assigned_pm);
            if (AV_USER_ID) recipients.delete(AV_USER_ID);
            await Promise.all([...recipients].map(uid =>
              sbNotifyUser(uid, 'schedule_item_changed', title, body, item.job_id).catch(() => {})
            ));
            notified = recipients.size > 0;
          } catch (_notifErr) { /* best effort */ }

          affected.push({ id: item.id, title: item.title, old_date: oldDate, new_date: newDate, days_shifted: daysShifted, notified });

          // B2: sync walkthrough fire_at if cascaded item is a sub_start with a trade
          if (item.type === 'sub_start' && item.trade && newDate) {
            sbSyncWalkthroughFireAt(item.job_id, item.trade, newDate)
              .catch(err => console.warn('[walkthrough] cascade fire_at sync failed:', err?.message));
          }

          // Recurse: this item is now a new source for its own descendants
          const itemFinish = newEnd || newDate;
          queue.push({ id: item.id, finishDate: itemFinish });
        }
      }
    }

    return { ok: true, data: { affected_items: affected, depth: maxDepth, source_item_id: sourceItemId } };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Soft resource-conflict check for schedule items.
 * Checks two independent ID systems:
 *   1. assigned_sub_id (TEXT contact ID) — finds schedule_items on overlapping dates
 *      with the same assigned_sub_id. Sub name resolved from contacts.name.
 *   2. invitee_user_id (UUID profile ID) — checks schedule_item_invitees joined to
 *      schedule_items; date overlap evaluated client-side.
 * Returns conflicts as a flat array; caller decides whether to block or warn+override.
 *
 * @param {{ scheduledDate: string, scheduledEndDate?: string, assignedSubId?: string,
 *            inviteeUserIds?: string[], excludeItemId?: string }}
 * @returns {{ ok: boolean, conflicts: Array<{ type, name, itemTitle, itemId, conflictDate, jobId }>, error?: string }}
 */
export async function sbCheckResourceConflicts({
  scheduledDate,
  scheduledEndDate,
  assignedSubId,
  inviteeUserIds,
  excludeItemId,
} = {}) {
  if (!scheduledDate) return { ok: true, conflicts: [] };
  const effectiveEnd = scheduledEndDate || scheduledDate;
  const conflicts = [];

  try {
    // ── 1. Sub double-booking (assigned_sub_id is a TEXT contact ID) ──────────
    if (assignedSubId) {
      // Overlap condition: item.start <= our.end  AND  (item.end >= our.start OR (item.end IS NULL AND item.start >= our.start))
      let q = sb
        .from('schedule_items')
        .select('id, title, scheduled_date, scheduled_end_date, job_id')
        .eq('assigned_sub_id', assignedSubId)
        .eq('tenant_id', AV_TENANT)
        .not('status', 'eq', 'cancelled')
        .lte('scheduled_date', effectiveEnd)
        .or(`scheduled_end_date.gte.${scheduledDate},and(scheduled_end_date.is.null,scheduled_date.gte.${scheduledDate})`);
      if (excludeItemId) q = q.neq('id', excludeItemId);
      const { data: subItems } = await q;

      if (subItems?.length) {
        // Resolve sub name from contacts (best-effort — fall back to ID)
        let subName = assignedSubId;
        const { data: contactRow } = await sb.from('contacts').select('name').eq('id', assignedSubId).maybeSingle();
        if (contactRow?.name) subName = contactRow.name;

        (subItems).forEach(si => {
          conflicts.push({
            type:        'sub',
            name:        subName,
            itemTitle:   si.title,
            itemId:      si.id,
            conflictDate: si.scheduled_date,
            jobId:       si.job_id,
          });
        });
      }
    }

    // ── 2. Invitee double-booking (invitee_user_id is a UUID profile ID) ──────
    if (inviteeUserIds?.length) {
      const { data: invRows } = await sb
        .from('schedule_item_invitees')
        .select('invitee_user_id, profile:profiles!invitee_user_id(full_name), schedule_item:schedule_items!schedule_item_id(id, title, scheduled_date, scheduled_end_date, job_id, status, tenant_id)')
        .in('invitee_user_id', inviteeUserIds);

      (invRows || []).forEach(row => {
        const si = row.schedule_item;
        if (!si || si.status === 'cancelled') return;
        if (si.tenant_id !== AV_TENANT) return;
        if (excludeItemId && si.id === excludeItemId) return;
        const siStart = si.scheduled_date;
        const siEnd   = si.scheduled_end_date || siStart;
        if (!siStart) return;
        // JS date-string comparison (YYYY-MM-DD lexicographic == chronological)
        if (siStart <= effectiveEnd && siEnd >= scheduledDate) {
          conflicts.push({
            type:         'invitee',
            name:         row.profile?.full_name || 'Team member',
            itemTitle:    si.title,
            itemId:       si.id,
            conflictDate: si.scheduled_date,
            jobId:        si.job_id,
          });
        }
      });
    }

    return { ok: true, conflicts };
  } catch (err) {
    // Non-fatal: surface as ok with empty conflicts so callers can proceed
    console.warn('[sbCheckResourceConflicts]', err?.message);
    return { ok: true, conflicts: [], error: err?.message || String(err) };
  }
}

export async function sbUpdateScheduleItemPhase(id, phaseId) {
  if (!id) return { ok: false, error: 'id required' };
  try {
    const { error } = await sb.from('schedule_items').update({ phase_id: phaseId || null }).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sbUpdateContactCapacity(contactId, dailyCapacityHours) {
  if (!contactId) return { ok: false, error: 'contactId required' };
  if (dailyCapacityHours !== null && (typeof dailyCapacityHours !== 'number' || dailyCapacityHours < 0)) {
    return { ok: false, error: 'dailyCapacityHours must be non-negative number or null' };
  }
  try {
    const { error } = await sb.from('contacts').update({ daily_capacity_hours: dailyCapacityHours }).eq('id', contactId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─── Site Visit Checklists (EXECUTION_ARC Phase 8) ──────────────────────────

export async function sbCreateChecklistFromTemplate(scheduleItemId, templateKey) {
  if (!scheduleItemId) throw new Error('scheduleItemId required');
  if (!templateKey) throw new Error('templateKey required');

  const items = getTemplateItems(templateKey);
  if (!items.length) throw new Error(`Unknown template: ${templateKey}`);

  const { count } = await sb
    .from('site_visit_checklist_items')
    .select('*', { count: 'exact', head: true })
    .eq('schedule_item_id', scheduleItemId);
  if ((count ?? 0) > 0) throw new Error('Checklist already exists for this site visit');

  const rows = items.map((name, idx) => ({
    tenant_id:        AV_TENANT,
    schedule_item_id: scheduleItemId,
    template_name:    templateKey,
    item_name:        name,
    item_order:       idx,
    status:           'pending',
  }));

  const { data, error } = await sb
    .from('site_visit_checklist_items')
    .insert(rows)
    .select();

  if (error) {
    captureFailedIntent({ kind: 'create_checklist_from_template', payload: { scheduleItemId, templateKey }, jobId: null, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  return data;
}

export async function sbLoadChecklistForScheduleItem(scheduleItemId) {
  if (!scheduleItemId) throw new Error('scheduleItemId required');
  const { data, error } = await sb
    .from('site_visit_checklist_items')
    .select('*')
    .eq('schedule_item_id', scheduleItemId)
    .order('item_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function sbUpdateChecklistItem(itemId, updates) {
  if (!itemId) throw new Error('itemId required');
  const { id: _id, tenant_id, schedule_item_id, template_name, item_order, created_at, ...patch } = updates || {};
  patch.updated_at = new Date().toISOString();

  if (patch.status && ['pass', 'fail', 'n_a'].includes(patch.status)) {
    patch.completed_at    = new Date().toISOString();
    patch.completed_by_id = AV_USER_ID;
  }

  const { data, error } = await sb
    .from('site_visit_checklist_items')
    .update(patch)
    .eq('id', itemId)
    .select()
    .single();

  if (error) throw error;

  // Look up job_id once for engine events
  let jobId = null;
  if (patch.status) {
    const { data: si } = await sb.from('schedule_items').select('job_id').eq('id', data.schedule_item_id).single();
    jobId = si?.job_id ?? null;
  }

  if (patch.status === 'fail') {
    fireTodoEvent('checklist_item.failed', {
      jobId,
      checklistItemId:  data.id,
      itemName:         data.item_name,
      templateName:     data.template_name,
      scheduleItemId:   data.schedule_item_id,
    }).catch(() => {});
  } else if (patch.status === 'pass' || patch.status === 'n_a') {
    fireTodoEvent('checklist_item.resolved', {
      jobId,
      checklistItemId: data.id,
    }).catch(() => {});
  }

  return data;
}

export const sbLoadScheduleItemsForSub = async (subId) => {
  try {
    const { data, error } = await sb
      .from('schedule_items')
      .select('*, job:jobs!job_id(id, address)')
      .eq('assigned_sub_id', subId)
      .not('status', 'in', '(completed,cancelled)')
      .order('scheduled_date', { nullsFirst: false });
    if (error) throw error;
    return { ok: true, error: null, data: data || [] };
  } catch (e) {
    return { ok: false, error: e.message, data: [] };
  }
};

// ─── Phase derivation ─────────────────────────────────────────────────────────
// Derives job_phases.status from sub_start schedule items via trade_phase_map.
// Asymmetry (by design): phases never decrement. A phase at 'complete' stays
// 'complete' even if its driver sub_start item is later cancelled.
// Idempotent: calling twice in a row is a no-op.

// Maps job_phases.phase_name → trade_phase_map.phase_name (lowercase condensed tmap key).
// Sales lifecycle phases (Lead/Proposal/Contract/Inspections/Complete) have no trade driver — manual-only.
const JOB_PHASE_TO_TMAP = {
  'Demo':          'demo',
  'Rough-ins':     'rough_mep',
  'Drywall':       'drywall',
  'Finishes':      'finish',
  'Final touches': 'finish',
};

export const derivePhaseStatus = async (jobId, tenantId) => {
  if (!jobId) return;
  const today = new Date().toISOString().slice(0, 10);
  const tid   = tenantId || AV_TENANT;

  const [{ data: phases }, { data: maps }, { data: items }] = await Promise.all([
    sb.from('job_phases')
      .select('id, phase_name, status, started_at, started_by_id, completed_at, completed_by_id')
      .eq('job_id', jobId),
    sb.from('trade_phase_map')
      .select('trade, phase_name, tenant_id, is_primary')
      .or(`tenant_id.eq.${tid},tenant_id.is.null`)
      .eq('is_primary', true),
    sb.from('schedule_items')
      .select('id, trade, status, scheduled_date, updated_at, created_by_id')
      .eq('job_id', jobId)
      .eq('type', 'sub_start')
      .neq('status', 'cancelled'),
  ]);

  if (!phases?.length || !maps?.length || !items) return;

  // Deduplicate map: tenant row beats platform null for same trade
  const tradeToPhase = {};
  for (const m of maps) {
    if (!tradeToPhase[m.trade] || m.tenant_id !== null) {
      tradeToPhase[m.trade] = m.phase_name;
    }
  }

  // Build phase_name → [trades]
  const phaseToTrades = {};
  for (const [trade, phaseName] of Object.entries(tradeToPhase)) {
    if (!phaseToTrades[phaseName]) phaseToTrades[phaseName] = [];
    phaseToTrades[phaseName].push(trade);
  }

  const prevComplete = new Set(phases.filter(p => p.status === 'complete').map(p => p.id));
  const updates = [];
  for (const phase of phases) {
    // Never decrement from complete
    if (phase.status === 'complete') continue;

    const tmapKey = JOB_PHASE_TO_TMAP[phase.phase_name];
    const trades  = tmapKey ? phaseToTrades[tmapKey] : null;
    if (!trades?.length) continue;

    const relevant = items.filter(i => trades.includes(i.trade));
    if (!relevant.length) continue;

    const driverComplete   = relevant.find(i => i.status === 'complete');
    const driverInProgress = relevant.find(i => i.status === 'in_progress');
    const driverOverdue    = relevant.find(
      i => i.status === 'scheduled' && i.scheduled_date && i.scheduled_date <= today
    );

    if (driverComplete) {
      const upd = { status: 'complete' };
      if (!phase.completed_at) {
        upd.completed_at    = driverComplete.updated_at;
        upd.completed_by_id = driverComplete.created_by_id || null;
      }
      if (!phase.started_at) {
        upd.started_at    = driverComplete.updated_at;
        upd.started_by_id = driverComplete.created_by_id || null;
      }
      updates.push({ id: phase.id, patch: upd });
    } else if (driverInProgress || driverOverdue) {
      if (phase.status === 'in_progress') continue;
      const driver = driverInProgress || driverOverdue;
      const upd    = { status: 'in_progress' };
      if (!phase.started_at) {
        upd.started_at    = driver.updated_at || new Date().toISOString();
        upd.started_by_id = driver.created_by_id || null;
      }
      updates.push({ id: phase.id, patch: upd });
    }
  }

  await Promise.all(
    updates.map(({ id, patch }) =>
      sb.from('job_phases').update(patch).eq('id', id)
    )
  );

  const newlyCompleted = updates
    .filter(u => u.patch.status === 'complete')
    .map(u => u.id)
    .filter(id => !prevComplete.has(id));
  if (newlyCompleted.length) {
    autoInvoiceMilestonesForPhases(jobId, newlyCompleted)
      .catch(err => console.warn('[milestoneInvoice] derivePhaseStatus hook failed:', err?.message));
  }
};

// ─── Schedule item notification helpers ──────────────────────────────────────
// Fire-and-forget — callers .catch() at the call site.

const TYPE_LABEL_MAP = {
  material_delivery: 'Material delivery',
  sub_start:         'Sub start',
  site_visit:        'Site visit',
  inspection:        'Inspection',
  milestone:         'Milestone',
  delay:             'Schedule delay',
};

const fDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

// Collect recipient user IDs for a schedule item
const _collectRecipients = async (item, job, includeClient) => {
  const ids = new Set();
  if (item.notify_sub !== false && item.assigned_sub_id) ids.add(item.assigned_sub_id);
  if (includeClient && item.notify_client && job?.client_user_id) ids.add(job.client_user_id);
  // Staff: PM assigned to job
  if (job?.assigned_pm) ids.add(job.assigned_pm);
  // Exclude the acting user so they don't self-notify
  if (AV_USER_ID) ids.delete(AV_USER_ID);
  return [...ids].filter(Boolean);
};

export const sbNotifyScheduleItemCreated = async (item, job) => {
  const typeLabel = TYPE_LABEL_MAP[item.type] || item.type;
  const datePart  = item.scheduled_date ? ` on ${fDate(item.scheduled_date)}` : '';
  const title = `${typeLabel}${datePart} — ${job?.address || 'job'}`;
  const body  = `${item.title}${item.trade ? ` (${item.trade})` : ''}${item.notes ? ': ' + item.notes.slice(0, 80) : ''}`;
  const recipients = await _collectRecipients(item, job, true);
  await Promise.all(recipients.map(uid => sbNotifyUser(uid, 'schedule_item_created', title, body, job?.id).catch(() => {})));
};

export const sbNotifyScheduleItemChanged = async (item, prevRow, job) => {
  // Only fire if meaningful fields changed
  const watchFields = ['scheduled_date', 'scheduled_end_date', 'status', 'assigned_sub_id', 'trade', 'title'];
  const changed = watchFields.filter(k => item[k] !== prevRow[k]);
  if (!changed.length) return;

  const parts = [];
  if (changed.includes('scheduled_date'))     parts.push(`Date → ${fDate(item.scheduled_date) || 'TBD'}`);
  if (changed.includes('scheduled_end_date')) parts.push(`End → ${fDate(item.scheduled_end_date) || 'removed'}`);
  if (changed.includes('status'))             parts.push(`Status → ${(item.status || '').replace(/_/g, ' ')}`);
  if (changed.includes('assigned_sub_id'))    parts.push(item.assigned_sub_id ? 'Reassigned' : 'Unassigned');
  if (changed.includes('trade'))              parts.push(`Trade → ${item.trade || 'none'}`);
  if (changed.includes('title'))              parts.push(`Renamed to "${item.title}"`);

  const title = `Schedule update — ${job?.address || 'job'}`;
  const body  = `${item.title}: ${parts.join(' · ')}`;
  const recipients = await _collectRecipients(item, job, true);
  await Promise.all(recipients.map(uid => sbNotifyUser(uid, 'schedule_item_changed', title, body, job?.id).catch(() => {})));
};

// ─── Sub Engagements ──────────────────────────────────────────────────────────

export const sbCreateEngagement = async ({
  jobId, subId, trade, bidType,
  scopeDescription = null, dueDate = null,
  budgetMin = null, budgetMax = null,
  sharedDocIds = [], sharedPhotoIds = [], notes = null,
}) => {
  if (!jobId) return { ok: false, error: 'jobId is required', data: null };
  if (!subId) return { ok: false, error: 'subId is required', data: null };
  if (!trade) return { ok: false, error: 'trade is required', data: null };
  if (!bidType) return { ok: false, error: 'bidType is required', data: null };
  if (!['sub_drafted', 'gc_drafted'].includes(bidType))
    return { ok: false, error: "bidType must be 'sub_drafted' or 'gc_drafted'", data: null };
  if (!AV_TENANT || !AV_USER_ID) return { ok: false, error: 'Not authenticated', data: null };

  const { data, error } = await sb.from('job_sub_engagements').insert({
    tenant_id: AV_TENANT,
    job_id: jobId,
    sub_id: subId,
    trade,
    bid_type: bidType,
    status: 'invited',
    invited_by_id: AV_USER_ID,
    scope_description: scopeDescription,
    due_date: dueDate || null,
    budget_min: budgetMin != null ? Number(budgetMin) : null,
    budget_max: budgetMax != null ? Number(budgetMax) : null,
    shared_doc_ids: sharedDocIds,
    shared_photo_ids: sharedPhotoIds,
    notes: notes || null,
    invited_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single();

  if (error) {
    if (error.code === '23505')
      return { ok: false, error: 'This sub already has a live engagement for this job and trade. Re-engage only after the current one is completed, declined, withdrawn, or removed.', data: null };
    captureFailedIntent({ kind: 'sub_assign', payload: { subId, trade, jobId }, jobId, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  fireTodoEvent('engagement.created', { engagementId: data.id, jobId: data.job_id, trade: data.trade }).catch(() => {});
  return { ok: true, error: null, data };
};

export const sbLoadEngagementsForJob = async jobId => {
  if (!jobId) return { ok: false, error: 'jobId is required', data: null };
  const { data, error } = await sb
    .from('job_sub_engagements')
    .select(`*, sub:profiles!sub_id(id, full_name, email, phone), invited_by:profiles!invited_by_id(id, full_name), current_bid:engagement_bids!engagement_id(id, total_amount, terms, start_date, end_date, line_items, earliest_start_date, availability_notes, drafted_by, submitted_at, revision_number, is_current)`)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message, data: null };
  const normalized = (data || []).map(eng => ({
    ...eng,
    current_bid: (eng.current_bid || []).find(b => b.is_current) || null,
  }));
  return { ok: true, error: null, data: normalized };
};

export const sbLoadEngagementsForSub = async subId => {
  if (!subId) return { ok: false, error: 'subId is required', data: null };
  const { data, error } = await sb
    .from('job_sub_engagements')
    .select(`*, job:jobs!job_id(id, address, status), current_bid:engagement_bids!engagement_id(id, total_amount, terms, start_date, end_date, line_items, earliest_start_date, availability_notes, drafted_by, submitted_at, revision_number, is_current)`)
    .eq('sub_id', subId)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message, data: null };
  const normalized = (data || []).map(eng => ({
    ...eng,
    current_bid: (eng.current_bid || []).find(b => b.is_current) || null,
  }));
  return { ok: true, error: null, data: normalized };
};

export const sbLoadEngagementByIds = async ({ jobId, subId, trade, includeTerminal = false }) => {
  if (!jobId) return { ok: false, error: 'jobId is required', data: null };
  if (!subId) return { ok: false, error: 'subId is required', data: null };
  if (!trade) return { ok: false, error: 'trade is required', data: null };

  let q = sb
    .from('job_sub_engagements')
    .select('*')
    .eq('job_id', jobId)
    .eq('sub_id', subId)
    .eq('trade', trade)
    .order('created_at', { ascending: false });

  if (!includeTerminal)
    q = q.not('status', 'in', '("completed","declined","withdrawn","removed")');

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
};

const ENGAGEMENT_TRANSITIONS = {
  invited:       ['bid_submitted', 'declined', 'withdrawn'],
  bid_submitted: ['active', 'declined', 'withdrawn'],
  active:        ['completed', 'removed'],
  completed:     [],
  declined:      [],
  withdrawn:     [],
  removed:       [],
};

const TERMINAL_STATUSES = new Set(['declined', 'withdrawn', 'removed']);

export async function sbTransitionEngagement({ engagementId, toStatus, reason = null }) {
  if (!engagementId) return { ok: false, error: 'engagementId is required', data: null };
  if (!toStatus) return { ok: false, error: 'toStatus is required', data: null };

  const { data: current, error: fetchErr } = await sb
    .from('job_sub_engagements')
    .select('id, status')
    .eq('id', engagementId)
    .single();
  if (fetchErr || !current) return { ok: false, error: 'Engagement not found', data: null };

  const currentStatus = current.status;
  const allowed = ENGAGEMENT_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(toStatus))
    return { ok: false, error: `Illegal transition: ${currentStatus} → ${toStatus}`, data: null };

  if (TERMINAL_STATUSES.has(toStatus) && !reason?.trim())
    return { ok: false, error: `reason is required when transitioning to '${toStatus}'`, data: null };

  const now = new Date().toISOString();
  const auditCols = { updated_at: now };
  if (toStatus === 'bid_submitted') {
    auditCols.bid_submitted_at = now;
  } else if (toStatus === 'active') {
    auditCols.activated_at = now;
    auditCols.activated_by_id = AV_USER_ID;
  } else if (toStatus === 'completed') {
    auditCols.completed_at = now;
    auditCols.completed_by_id = AV_USER_ID;
  } else if (TERMINAL_STATUSES.has(toStatus)) {
    auditCols.terminated_at = now;
    auditCols.terminated_by_id = AV_USER_ID;
    auditCols.termination_reason = reason;
  }

  const { data, error } = await sb
    .from('job_sub_engagements')
    .update({ status: toStatus, ...auditCols })
    .eq('id', engagementId)
    .eq('status', currentStatus)
    .select()
    .single();

  if (error) {
    captureFailedIntent({ kind: 'transition_engagement', payload: { engagementId, fromStatus: currentStatus, toStatus, reason }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  if (!data)
    return { ok: false, error: 'Engagement state changed concurrently — refresh and retry', data: null };

  if (['declined', 'withdrawn', 'removed'].includes(toStatus)) {
    fireTodoEvent(`engagement.${toStatus}`, { engagementId, jobId: data.job_id }).catch(() => {});
  }

  return { ok: true, error: null, data };
}

export async function sbDeclineBid({ engagementId, reason }) {
  if (!reason?.trim()) return { ok: false, error: 'reason is required to decline', data: null };
  return sbTransitionEngagement({ engagementId, toStatus: 'declined', reason });
}

export async function sbWithdrawEngagement({ engagementId, reason }) {
  if (!reason?.trim()) return { ok: false, error: 'reason is required to withdraw', data: null };
  return sbTransitionEngagement({ engagementId, toStatus: 'withdrawn', reason });
}

export async function sbRemoveEngagement({ engagementId, reason }) {
  if (!reason?.trim()) return { ok: false, error: 'reason is required to remove', data: null };
  return sbTransitionEngagement({ engagementId, toStatus: 'removed', reason });
}

export async function sbCompleteEngagement({ engagementId }) {
  return sbTransitionEngagement({ engagementId, toStatus: 'completed' });
}

export async function sbAcceptBid({ engagementId }) {
  if (!engagementId) return { ok: false, error: 'engagementId is required', data: null };

  // 1. Read engagement + current bid
  const { data: engagement, error: engErr } = await sb
    .from('job_sub_engagements')
    .select('*, job:jobs!job_id(id, address, status), sub:profiles!sub_id(id, full_name, email)')
    .eq('id', engagementId)
    .single();
  if (engErr || !engagement) return { ok: false, error: 'Engagement not found', data: null };
  if (engagement.status !== 'bid_submitted')
    return { ok: false, error: `Cannot accept bid — engagement status is '${engagement.status}', expected 'bid_submitted'`, data: null };

  const { data: bid, error: bidFetchErr } = await sb
    .from('engagement_bids')
    .select('*')
    .eq('engagement_id', engagementId)
    .eq('is_current', true)
    .single();
  if (bidFetchErr || !bid) return { ok: false, error: 'No current bid found for this engagement', data: null };

  // 2. Transition engagement → active (optimistic concurrency via Phase 1c)
  const transition = await sbTransitionEngagement({ engagementId, toStatus: 'active' });
  if (!transition.ok) return transition;

  fireTodoEvent('engagement.accepted', { engagementId, jobId: engagement.job_id }).catch(() => {});

  const now = new Date().toISOString();

  // 3. Stamp the bid as accepted (non-blocking on failure)
  const { error: bidStampErr } = await sb
    .from('engagement_bids')
    .update({ accepted_at: now, accepted_by_id: AV_USER_ID })
    .eq('id', bid.id);
  if (bidStampErr) {
    captureFailedIntent({ kind: 'stamp_bid_accepted', payload: { engagementId, bidId: bid.id }, jobId: engagement.job_id, message: bidStampErr.message, resumable: false }).catch(() => {});
  }

  // 4. Auto-draft schedule items
  let insertedItems = null;
  try {
    const { data: phaseRow } = await sb
      .from('trade_phase_map')
      .select('phase_name')
      .eq('tenant_id', AV_TENANT)
      .eq('trade', engagement.trade)
      .eq('is_primary', true)
      .maybeSingle();

    if (!phaseRow) {
      captureFailedIntent({ kind: 'schedule_item_save', payload: { engagementId, trade: engagement.trade, reason: 'no primary phase mapping' }, jobId: engagement.job_id, message: `No primary trade_phase_map entry for trade: ${engagement.trade}`, resumable: false }).catch(() => {});
    }

    const lineItems = Array.isArray(bid.line_items) && bid.line_items.length > 0 ? bid.line_items : null;
    const baseRow = {
      tenant_id: AV_TENANT,
      job_id: engagement.job_id,
      type: 'sub_start',
      trade: engagement.trade,
      assigned_sub_id: engagement.sub_id,
      engagement_id: engagement.id,
      scheduled_date: bid.start_date || null,
      scheduled_end_date: bid.end_date || null,
      status: 'scheduled',
      notify_client: false,
      created_by_id: AV_USER_ID,
      created_at: now,
      updated_at: now,
    };

    const rows = lineItems
      ? lineItems.map(li => ({
          ...baseRow,
          title: li.description || li.name || 'Sub work',
        }))
      : [{
          ...baseRow,
          title: bid.scope_description || engagement.scope_description || `Sub work for ${engagement.trade}`,
          notes: 'Auto-drafted from bid acceptance — review and split into specific schedule items as needed.',
        }];

    const { data: drafted, error: schedErr } = await sb.from('schedule_items').insert(rows).select('id');
    if (schedErr) {
      captureFailedIntent({ kind: 'schedule_item_save', payload: { engagementId, rowCount: rows.length }, jobId: engagement.job_id, message: schedErr.message, resumable: false }).catch(() => {});
    } else {
      insertedItems = drafted;
    }
  } catch (schedEx) {
    captureFailedIntent({ kind: 'schedule_item_save', payload: { engagementId }, jobId: engagement.job_id, message: schedEx.message, resumable: false }).catch(() => {});
  }

  // 5. Notify the sub (non-blocking)
  try {
    await sbNotifyUser(
      engagement.sub_id,
      'bid_accepted',
      'Your bid was accepted',
      `Your bid for ${engagement.job?.address || 'a job'} was accepted. Schedule details coming soon.`,
      engagement.job_id,
    );
  } catch (notifyEx) {
    console.error('[sbAcceptBid] sub notify failed:', notifyEx.message);
  }

  // 6. Phase 6 dual-trigger: auto-create delivery-based sub_start if material order exists
  checkAndCreateSubStart(sb, AV_TENANT, AV_USER_ID, engagement.job_id, engagement.trade)
    .then(result => {
      if (result) {
        fireTodoEvent('schedule_item.auto_created', { jobId: engagement.job_id, trade: result.trade, scheduleItemId: result.id, startDate: result.scheduled_date }).catch(() => {});
      }
    })
    .catch(err => console.warn('[sbAcceptBid] Phase 6 auto-create failed:', err?.message));

  // 7. Return
  return {
    ok: true,
    error: null,
    data: {
      engagement: transition.data,
      bid,
      scheduleItemIds: insertedItems?.map(r => r.id) || [],
    },
  };
}

// ─── Draw Schedules (Invoicing Phase 2a) ─────────────────────────────────────

export async function sbCreateDrawSchedule(jobId, draw) {
  if (!jobId) throw new Error('jobId required');
  if (!draw?.title) throw new Error('title required');
  if (draw?.target_amount == null) throw new Error('target_amount required');
  if (draw?.draw_number == null) throw new Error('draw_number required');

  const row = {
    tenant_id: AV_TENANT,
    job_id: jobId,
    draw_number: draw.draw_number,
    title: draw.title,
    description: draw.description ?? null,
    target_amount: draw.target_amount,
    target_date: draw.target_date ?? null,
    phase: draw.phase ?? null,
    display_order: draw.display_order ?? 0,
  };

  const { data, error } = await sb
    .from('draw_schedules')
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const friendly = `Draw ${draw.draw_number} already exists on this job`;
      captureFailedIntent({ kind: 'create_draw_schedule', payload: row, jobId, message: friendly, resumable: false }).catch(() => {});
      throw new Error(friendly);
    }
    captureFailedIntent({ kind: 'create_draw_schedule', payload: row, jobId, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  return data;
}

// ─── PAYMENT SCHEDULES (PHASE_INVOICE_ARC) ───────────────────────────────────

export async function sbLoadPaymentSchedule(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required' };
  const { data: schedule, error: se } = await sb
    .from('payment_schedules')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();
  if (se) return { ok: false, error: se.message };
  if (!schedule) return { ok: true, data: null };
  const { data: milestones, error: me } = await sb
    .from('payment_milestones')
    .select('*')
    .eq('schedule_id', schedule.id)
    .order('milestone_order', { ascending: true });
  if (me) return { ok: false, error: me.message };
  return { ok: true, data: { schedule, milestones: milestones || [] } };
}

export async function sbSavePaymentSchedule(jobId, contractTotal, milestones) {
  if (!jobId) return { ok: false, error: 'jobId required' };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  // Upsert the schedule row
  const { data: schedule, error: se } = await sb
    .from('payment_schedules')
    .upsert({ job_id: jobId, tenant_id: AV_TENANT, contract_total: contractTotal, created_by_id: user.id }, { onConflict: 'job_id' })
    .select()
    .single();
  if (se) return { ok: false, error: se.message };

  // Only replace pending milestones — preserves invoiced/paid/released rows
  const { error: de } = await sb.from('payment_milestones').delete()
    .eq('schedule_id', schedule.id)
    .eq('status', 'pending');
  if (de) return { ok: false, error: de.message };

  const toInsert = (milestones || []).filter(m => !m.status || m.status === 'pending');
  if (toInsert.length > 0) {
    const rows = milestones.map((m, i) => {
      if (m.status && m.status !== 'pending') return null;
      return {
        tenant_id:       AV_TENANT,
        schedule_id:     schedule.id,
        job_id:          jobId,
        phase_id:        m.phase_id || null,
        label:           m.label,
        pct:             m.pct != null ? Number(m.pct) : null,
        amount:          m.pct != null ? Math.round((Number(m.pct) / 100) * contractTotal * 100) / 100 : (m.amount != null ? Number(m.amount) : null),
        is_retainage:    !!m.is_retainage,
        milestone_order: i,
        status:          'pending',
      };
    }).filter(Boolean);
    const { error: ie } = await sb.from('payment_milestones').insert(rows);
    if (ie) return { ok: false, error: ie.message };
  }

  return { ok: true, data: schedule };
}

export async function sbDeletePaymentSchedule(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required' };
  const { error } = await sb.from('payment_schedules').delete().eq('job_id', jobId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────

export async function sbLoadDrawsForJob(jobId) {
  if (!jobId) throw new Error('jobId required');
  const { data, error } = await sb
    .from('draw_schedules')
    .select('*')
    .eq('job_id', jobId)
    .order('display_order', { ascending: true })
    .order('draw_number', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function sbUpdateDrawSchedule(id, updates) {
  if (!id) throw new Error('id required');
  const { id: _id, tenant_id, job_id, created_at, ...patch } = updates || {};
  patch.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from('draw_schedules')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const friendly = 'Draw number conflicts with another draw on this job';
      captureFailedIntent({ kind: 'update_draw_schedule', payload: { id, ...patch }, jobId: null, message: friendly, resumable: false }).catch(() => {});
      throw new Error(friendly);
    }
    captureFailedIntent({ kind: 'update_draw_schedule', payload: { id, ...patch }, jobId: null, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  return data;
}

export async function sbDeleteDrawSchedule(id) {
  if (!id) throw new Error('id required');
  // Reverse cascade before hard-delete: flip in_draw transactions → unreimbursed, delete draw_line_items
  const { error: voidErr } = await sb.rpc('void_draw', { p_draw_id: id });
  if (voidErr) throw voidErr;
  const { error } = await sb
    .from('draw_schedules')
    .delete()
    .eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'delete_draw_schedule', payload: { id }, jobId: null, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  return true;
}

// ─── Invoices (Invoicing Phase 3a) ───────────────────────────────────────────

export async function sbLoadJobTotalPaid(jobId) {
  if (!jobId) throw new Error('jobId required');
  const { data, error } = await sb
    .from('job_transactions')
    .select('amount, type')
    .eq('job_id', jobId)
    .eq('direction', 'in')
    .eq('status', 'paid');
  if (error) throw error;
  let total = 0;
  for (const row of data || []) {
    if (row.type === 'client_refund') total -= Number(row.amount);
    else total += Number(row.amount);
  }
  return total;
}

export function deriveInvoiceStatus(invoice) {
  if (!invoice) return null;
  if (invoice.status !== 'sent' && invoice.status !== 'viewed') return invoice.status;
  if (!invoice.due_date) return invoice.status;
  const today = new Date().toISOString().slice(0, 10);
  return invoice.due_date < today ? 'overdue' : invoice.status;
}

export async function sbGenerateInvoiceNumber() {
  const { data, error } = await sb.rpc('next_invoice_number', { p_tenant_id: AV_TENANT });
  if (error) throw error;
  return data;
}

export async function sbCreateInvoice(jobId, invoice) {
  if (!jobId) throw new Error('jobId required');

  let invoiceNumber = invoice?.invoice_number;
  if (!invoiceNumber) invoiceNumber = await sbGenerateInvoiceNumber();

  const row = {
    tenant_id:      AV_TENANT,
    job_id:         jobId,
    draw_id:        invoice?.draw_id        ?? null,
    invoice_number: invoiceNumber,
    invoice_date:   invoice?.invoice_date   ?? new Date().toISOString().slice(0, 10),
    due_date:       invoice?.due_date       ?? null,
    subtotal:       invoice?.subtotal       ?? 0,
    tax_amount:     invoice?.tax_amount     ?? 0,
    total_amount:   invoice?.total_amount   ?? 0,
    notes:          invoice?.notes          ?? null,
    internal_notes: invoice?.internal_notes ?? null,
    created_by_id:  AV_USER_ID,
  };

  const { data, error } = await sb.from('invoices').insert(row).select().single();
  if (error) {
    if (error.code === '23505') {
      const friendly = `Invoice number ${invoiceNumber} already exists`;
      captureFailedIntent({ kind: 'create_invoice', payload: row, jobId, message: friendly, resumable: false }).catch(() => {});
      throw new Error(friendly);
    }
    captureFailedIntent({ kind: 'create_invoice', payload: row, jobId, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  return data;
}

// ─── Milestone invoice generation (PHASE_INVOICE_ARC slice 2) ────────────────
// Creates a DRAFT invoice from a payment milestone.
// Idempotent via payment_milestones.invoice_id — won't double-create.
// Never sends — always status='draft'. Returns { ok, error, data: { invoice_id, created } }
export async function sbGenerateMilestoneInvoice(milestoneId) {
  if (!milestoneId) return { ok: false, error: 'milestoneId required', data: null };

  const { data: ms, error: msErr } = await sb
    .from('payment_milestones')
    .select('id, label, amount, is_retainage, status, invoice_id, job_id')
    .eq('id', milestoneId)
    .single();
  if (msErr) return { ok: false, error: msErr.message, data: null };
  if (!ms) return { ok: false, error: 'Milestone not found', data: null };

  if (ms.invoice_id) return { ok: true, error: null, data: { invoice_id: ms.invoice_id, created: false } };
  if (ms.is_retainage) return { ok: false, error: 'Retainage milestones are released at final completion', data: null };

  const jobId  = ms.job_id;
  const amount = Number(ms.amount) || 0;
  const today  = new Date().toISOString().slice(0, 10);
  const due    = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10);

  let inv;
  try {
    inv = await sbCreateInvoice(jobId, {
      invoice_date: today,
      due_date:     due,
      subtotal:     amount,
      total_amount: amount,
      notes:        `${ms.label} — payment milestone`,
    });
  } catch (e) {
    return { ok: false, error: e.message, data: null };
  }

  await sb.from('invoice_line_items').insert({
    tenant_id:     AV_TENANT,
    invoice_id:    inv.id,
    description:   ms.label,
    quantity:      1,
    unit_price:    amount,
    line_total:    amount,
    source_type:   'milestone',
    source_id:     milestoneId,
    display_order: 0,
  }).catch(err => console.warn('[milestone] line item insert failed:', err.message));

  const { error: linkErr } = await sb
    .from('payment_milestones')
    .update({ invoice_id: inv.id, status: 'invoiced' })
    .eq('id', milestoneId)
    .is('invoice_id', null);
  if (linkErr) console.warn('[milestone] link update failed:', linkErr.message);

  return { ok: true, error: null, data: { invoice_id: inv.id, created: true } };
}

// Releases the retainage milestone and generates a draft invoice for it.
// Gates: job at final_touches/complete + all non-retainage milestones paid.
// Milestone → 'invoiced' (→ 'released' when invoice is paid via sync).
export async function sbReleaseRetainageMilestone(milestoneId) {
  if (!milestoneId) return { ok: false, error: 'milestoneId required', data: null };

  const { data: ms, error: msErr } = await sb
    .from('payment_milestones')
    .select('id, label, amount, is_retainage, status, invoice_id, job_id')
    .eq('id', milestoneId)
    .single();
  if (msErr) return { ok: false, error: msErr.message, data: null };
  if (!ms) return { ok: false, error: 'Milestone not found', data: null };
  if (!ms.is_retainage) return { ok: false, error: 'Not a retainage milestone', data: null };
  if (ms.invoice_id) return { ok: true, error: null, data: { invoice_id: ms.invoice_id, created: false } };

  const { data: job } = await sb.from('jobs').select('status, cost_plus, address').eq('id', ms.job_id).single();
  if (!job) return { ok: false, error: 'Job not found', data: null };
  if (job.cost_plus) return { ok: false, error: 'Cost-plus jobs do not use payment milestones', data: null };
  if (!['final_touches', 'complete'].includes(job.status)) {
    return { ok: false, error: 'Retainage releases only once the job reaches Final touches or Complete phase', data: null };
  }

  const { data: others } = await sb
    .from('payment_milestones')
    .select('status')
    .eq('job_id', ms.job_id)
    .eq('is_retainage', false);
  const allPaid = (others || []).every(m => m.status === 'paid');
  if (!allPaid) {
    return { ok: false, error: 'All other milestones must be paid before releasing retainage', data: null };
  }

  const amount = Number(ms.amount) || 0;
  const today  = new Date().toISOString().slice(0, 10);
  const due    = new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10);

  let inv;
  try {
    inv = await sbCreateInvoice(ms.job_id, {
      invoice_date: today,
      due_date:     due,
      subtotal:     amount,
      total_amount: amount,
      notes:        `${ms.label} — final retainage release`,
    });
  } catch (e) {
    return { ok: false, error: e.message, data: null };
  }

  await sb.from('invoice_line_items').insert({
    tenant_id:     AV_TENANT,
    invoice_id:    inv.id,
    description:   ms.label,
    quantity:      1,
    unit_price:    amount,
    line_total:    amount,
    source_type:   'milestone',
    source_id:     milestoneId,
    display_order: 0,
  }).catch(err => console.warn('[retainage] line item insert failed:', err.message));

  const { error: linkErr } = await sb
    .from('payment_milestones')
    .update({ invoice_id: inv.id, status: 'invoiced' })
    .eq('id', milestoneId)
    .is('invoice_id', null);
  if (linkErr) console.warn('[retainage] link update failed:', linkErr.message);

  return { ok: true, error: null, data: { invoice_id: inv.id, created: true } };
}

// Private: fires milestone auto-invoices for phases that just transitioned to 'complete'.
// Fixed-price jobs only. Fire-and-forget from derivePhaseStatus + sbSubUpdatePhase.
async function autoInvoiceMilestonesForPhases(jobId, phaseIds) {
  if (!phaseIds?.length || !jobId) return;

  const { data: job } = await sb
    .from('jobs')
    .select('cost_plus, address')
    .eq('id', jobId)
    .single()
    .catch(() => ({ data: null }));
  if (!job || job.cost_plus) return;

  const { data: milestones } = await sb
    .from('payment_milestones')
    .select('id, label, amount')
    .in('phase_id', phaseIds)
    .eq('job_id', jobId)
    .eq('status', 'pending')
    .eq('is_retainage', false)
    .is('invoice_id', null);
  if (!milestones?.length) return;

  for (const m of milestones) {
    const res = await sbGenerateMilestoneInvoice(m.id);
    if (!res.ok || !res.data?.created) continue;
    sbNotify(
      'invoice_auto_drafted',
      `Draft invoice ready — ${job.address || 'job'}`,
      `"${m.label}" draft created. Review and send when ready.`,
      jobId,
      AV_USER_ID,
    ).catch(() => {});
    fireTodoEvent('invoice.auto_drafted', {
      jobId,
      invoiceId:    res.data.invoice_id,
      milestoneId:  m.id,
      triggerLabel: m.label,
    }).catch(() => {});
  }
}

export async function sbLoadInvoicesForJob(jobId) {
  if (!jobId) throw new Error('jobId required');
  const { data, error } = await sb
    .from('invoices')
    .select('*')
    .eq('job_id', jobId)
    .order('invoice_date', { ascending: false })
    .order('invoice_number', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function sbLoadInvoice(id) {
  if (!id) throw new Error('id required');
  const { data, error } = await sb
    .from('invoices')
    .select('*, line_items:invoice_line_items(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  if (data?.line_items) {
    data.line_items.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  }
  return data;
}

export async function sbUpdateInvoice(id, updates) {
  if (!id) throw new Error('id required');
  const { id: _id, tenant_id, job_id, created_at, created_by_id, invoice_number, ...patch } = updates || {};
  patch.updated_at = new Date().toISOString();

  const { data, error } = await sb.from('invoices').update(patch).eq('id', id).select().single();
  if (error) {
    captureFailedIntent({ kind: 'update_invoice', payload: { id, ...patch }, jobId: data?.job_id ?? null, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  return data;
}

export async function sbVoidInvoice(id, reason) {
  if (!id) throw new Error('id required');

  const { data: invoice, error: loadErr } = await sb
    .from('invoices')
    .select('id, tenant_id, job_id, draw_id, total_amount, amount_paid, status')
    .eq('id', id)
    .single();
  if (loadErr) throw loadErr;
  if (!invoice) throw new Error('Invoice not found');

  if (invoice.status === 'void') throw new Error('Invoice is already void');
  if (invoice.status === 'draft') throw new Error('Drafts should be deleted, not voided. Use the Delete action instead.');
  // Cost-plus draw invoices may be voided even when paid — reverse cascade restores in_draw status
  if (Number(invoice.amount_paid) > 0.01 && !invoice.draw_id) {
    throw new Error('Cannot void an invoice with payments received. Issue a refund or credit memo (handle in QuickBooks for now until credit memo support ships).');
  }

  const patch = {
    status:       'void',
    voided_at:    new Date().toISOString(),
    voided_by_id: AV_USER_ID,
    void_reason:  reason ?? null,
    updated_at:   new Date().toISOString(),
  };
  const { error: updErr } = await sb.from('invoices').update(patch).eq('id', id);
  if (updErr) {
    captureFailedIntent({ kind: 'void_invoice', payload: { id, reason }, jobId: invoice.job_id, message: updErr.message, resumable: true }).catch(() => {});
    throw updErr;
  }
  fireTodoEvent('invoice.voided', { invoiceId: id, jobId: invoice.job_id }).catch(() => {});

  if (invoice.draw_id) {
    const { data: draw } = await sb
      .from('draw_schedules')
      .select('invoiced_amount, status')
      .eq('id', invoice.draw_id)
      .single();

    if (draw) {
      const newInvoiced = Math.max(0, Number(draw.invoiced_amount) - Number(invoice.total_amount));
      const drawPatch = {
        invoiced_amount: newInvoiced,
        updated_at: new Date().toISOString(),
      };
      if (newInvoiced < 0.01 && draw.status === 'in_progress') drawPatch.status = 'planned';

      const { error: drawErr } = await sb
        .from('draw_schedules')
        .update(drawPatch)
        .eq('id', invoice.draw_id);
      if (drawErr) {
        captureFailedIntent({ kind: 'void_invoice_draw_rollup', payload: { id, draw_id: invoice.draw_id }, jobId: invoice.job_id, message: drawErr.message, resumable: true }).catch(() => {});
        console.warn(`Invoice ${id} voided but draw rollup reversal failed: ${drawErr.message}`);
      }
    }

    // Phase 3: reverse cascade — revert reimbursed transactions back to in_draw
    const { data: revertCount, error: revertErr } = await sb.rpc('reverse_draw_paid_cascade', {
      p_invoice_id: id,
    });
    if (revertErr) {
      // Log but don't fail — invoice is voided, transactions can be reconciled by hand
      console.error('reverse_draw_paid_cascade failed', revertErr);
    }
  }

  return { ...invoice, ...patch };
}

export async function sbDeleteInvoice(id) {
  if (!id) throw new Error('id required');
  const { data: existing, error: loadErr } = await sb.from('invoices').select('status, job_id').eq('id', id).single();
  if (loadErr) throw loadErr;
  if (!existing) throw new Error('Invoice not found');
  if (existing.status !== 'draft') throw new Error('Only draft invoices can be deleted. Void sent invoices instead.');
  const { error } = await sb.from('invoices').delete().eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'delete_invoice', payload: { id }, jobId: existing.job_id, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  fireTodoEvent('invoice.deleted', { invoiceId: id, jobId: existing.job_id }).catch(() => {});
  return true;
}

export async function sbSaveInvoiceLineItems(invoiceId, lineItems) {
  if (!invoiceId) throw new Error('invoiceId required');
  if (!Array.isArray(lineItems)) throw new Error('lineItems must be an array');

  await sb.from('invoice_line_items').delete().eq('invoice_id', invoiceId);
  if (lineItems.length === 0) return [];

  const rows = lineItems.map((li, idx) => ({
    tenant_id:    AV_TENANT,
    invoice_id:   invoiceId,
    description:  li.description,
    quantity:     li.quantity  ?? 1,
    unit:         li.unit      ?? null,
    unit_price:   li.unit_price,
    line_total:   li.line_total,
    source_type:  li.source_type ?? 'manual',
    source_id:    li.source_id   ?? null,
    phase:        li.phase       ?? null,
    display_order: li.display_order ?? idx,
  }));

  const { data, error } = await sb.from('invoice_line_items').insert(rows).select();
  if (error) {
    captureFailedIntent({ kind: 'save_invoice_line_items_insert', payload: { invoiceId, count: rows.length }, jobId: null, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  return data || [];
}

export async function sbSendInvoice(invoiceId) {
  if (!invoiceId) throw new Error('invoiceId required');
  const { data, error } = await sb.functions.invoke('send-invoice', {
    body: { invoice_id: invoiceId },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Failed to send invoice');
  fireTodoEvent('invoice.sent', { invoiceId, jobId: null }).catch(() => {});
  return data;
}

export async function sbRegenerateInvoicePaymentUrl(invoiceId) {
  if (!invoiceId) throw new Error('invoiceId required');
  const { data, error } = await sb.functions.invoke('regenerate-invoice-payment', {
    body: { invoice_id: invoiceId },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Failed to generate fresh payment link');
  return data.checkout_url;
}

export async function sbResendInvoice(invoiceId) {
  if (!invoiceId) throw new Error('invoiceId required');
  const { data, error } = await sb.functions.invoke('resend-invoice', {
    body: { invoice_id: invoiceId },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Failed to resend invoice');
  return data;
}

export async function sbBuildDrawPackage(drawId, jobId, coverNotes = null, fileRefs = []) {
  if (!drawId || !jobId) throw new Error('drawId and jobId required');
  const { data, error } = await sb.functions.invoke('build-draw-package', {
    body: { draw_id: drawId, job_id: jobId, cover_notes: coverNotes, file_refs: fileRefs },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Failed to build draw package');
  return data; // { signed_url, draw_package_id }
}

export async function sbSendDrawPackage(drawPackageId, recipientEmail, recipientLabel, message = null) {
  if (!drawPackageId) throw new Error('drawPackageId required');
  if (!recipientEmail) throw new Error('recipientEmail required');
  const { data, error } = await sb.functions.invoke('send-draw-package', {
    body: { draw_package_id: drawPackageId, recipient_email: recipientEmail, recipient_label: recipientLabel || null, message: message || null },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Failed to send draw package');
  return data; // { sent_to, label, pdf_url }
}

export async function sbLoadDrawPackagesForJob(jobId) {
  const { data } = await sb.from('draw_packages')
    .select('id, draw_id, status, generated_pdf_path, recipient_label, recipient_email, sent_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function sbSaveDrawPackageToFiles(jobId, drawPackageId, pdfPath, drawNumber) {
  if (!jobId || !drawPackageId || !pdfPath) return { ok: false, error: 'Missing required params' };
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };
  // Delete-then-insert to upsert by related_entity_id (no unique constraint on column)
  await sb.from('job_files').delete()
    .eq('related_entity_type', 'draw_package')
    .eq('related_entity_id', drawPackageId);
  const { data, error } = await sb.from('job_files').insert({
    tenant_id: AV_TENANT,
    job_id: jobId,
    uploaded_by_id: user.id,
    name: `Draw ${drawNumber} Package`,
    storage_path: pdfPath,
    storage_bucket: 'draw-packages',
    mime_type: 'application/pdf',
    category: 'Draws',
    client_visible: false,
    related_entity_type: 'draw_package',
    related_entity_id: drawPackageId,
    lifecycle_status: 'active',
  }).select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, file_id: data.id };
}

export async function sbGetDrawPackageSignedUrl(path, downloadName = null) {
  const opts = downloadName ? { download: downloadName } : {};
  const { data, error } = await sb.storage.from('draw-packages').createSignedUrl(path, 60 * 60 * 24 * 30, opts);
  if (error) throw error;
  return data.signedUrl;
}

export async function sbMarkInvoicePaid(invoiceId, payment) {
  if (!invoiceId) throw new Error('invoiceId required');
  if (!payment?.amount || payment.amount <= 0) throw new Error('Amount must be greater than zero');
  if (!payment?.payment_method) throw new Error('Payment method required');

  const { data: invoice, error: loadErr } = await sb
    .from('invoices')
    .select('id, tenant_id, job_id, draw_id, total_amount, amount_paid, status, invoice_number')
    .eq('id', invoiceId)
    .single();
  if (loadErr) throw loadErr;
  if (!invoice) throw new Error('Invoice not found');
  if (['draft', 'paid', 'void'].includes(invoice.status)) {
    throw new Error(`Cannot mark paid on a ${invoice.status} invoice`);
  }

  const paidAmount    = Number(payment.amount);
  const currentPaid   = Number(invoice.amount_paid);
  const totalAmount   = Number(invoice.total_amount);
  const newAmountPaid = currentPaid + paidAmount;

  if (newAmountPaid > totalAmount + 0.01) {
    const remaining = (totalAmount - currentPaid).toFixed(2);
    throw new Error(`Payment exceeds invoice balance — $${remaining} remaining`);
  }

  const dateISO = payment.date_paid ?? new Date().toISOString().slice(0, 10);
  const refNote = payment.reference ? ` (${payment.reference})` : '';

  const txRow = {
    tenant_id:     invoice.tenant_id,
    job_id:        invoice.job_id,
    invoice_id:    invoice.id,
    direction:     'in',
    type:          'client_payment',
    status:        'paid',
    amount:        paidAmount,
    description:   `Payment for Invoice ${invoice.invoice_number}${refNote}`,
    date_incurred: dateISO,
    date_paid:     dateISO,
    payment_method: payment.payment_method,
    notes:         payment.notes ?? null,
    created_by:    AV_USER_ID,
  };

  const { data: tx, error: txErr } = await sb
    .from('job_transactions')
    .insert(txRow)
    .select()
    .single();
  if (txErr) {
    captureFailedIntent({
      kind: 'mark_invoice_paid_tx',
      payload: txRow,
      jobId: invoice.job_id,
      message: txErr.message,
      resumable: true,
    }).catch(() => {});
    throw txErr;
  }

  const newStatus = newAmountPaid >= totalAmount - 0.01 ? 'paid' : 'partially_paid';
  const invPatch = {
    amount_paid: newAmountPaid,
    status:      newStatus,
    updated_at:  new Date().toISOString(),
  };
  if (newStatus === 'paid') invPatch.paid_at = new Date().toISOString();

  const { error: invErr } = await sb
    .from('invoices')
    .update(invPatch)
    .eq('id', invoice.id);
  if (invErr) {
    captureFailedIntent({
      kind: 'mark_invoice_paid_invoice_update',
      payload: { invoiceId: invoice.id, ...invPatch },
      jobId: invoice.job_id,
      message: invErr.message,
      resumable: true,
    }).catch(() => {});
    throw invErr;
  }

  // Sync linked payment_milestone: non-retainage → 'paid', retainage → 'released'
  if (newStatus === 'paid') {
    await sb.from('payment_milestones')
      .update({ status: 'paid' })
      .eq('invoice_id', invoice.id)
      .eq('status', 'invoiced')
      .eq('is_retainage', false)
      .catch(err => console.warn('[milestone] paid sync failed:', err.message));
    await sb.from('payment_milestones')
      .update({ status: 'released' })
      .eq('invoice_id', invoice.id)
      .eq('status', 'invoiced')
      .eq('is_retainage', true)
      .catch(err => console.warn('[milestone] retainage released sync failed:', err.message));
  }

  if (invoice.draw_id) {
    const { data: draw } = await sb
      .from('draw_schedules')
      .select('target_amount')
      .eq('id', invoice.draw_id)
      .single();
    if (draw) {
      // Atomic: flips paid_amount/status and (if is_retainage_release) zeros sibling
      // retainage_held in one transaction. p_min_invoiced_amount preserves the existing
      // gate: draw only reaches 'paid' when invoiced_amount >= target_amount too.
      await sb.rpc('mark_draw_paid_release_retainage', {
        p_draw_id:             invoice.draw_id,
        p_paid_amount:         paidAmount,
        p_min_invoiced_amount: Number(draw.target_amount),
      }).catch(err => console.warn('[draw] mark_draw_paid_release_retainage failed:', err?.message));
    }
  }

  // Phase 3: cascade — flip in_draw transactions to reimbursed when invoice fully paid
  if (invoice.draw_id && newStatus === 'paid') {
    const { data: cascadeCount, error: cascadeErr } = await sb.rpc('cascade_draw_paid_to_transactions', {
      p_invoice_id: invoice.id,
    });
    if (cascadeErr) {
      // Log but don't fail — invoice is paid, transactions can be reconciled by hand
      console.error('cascade_draw_paid_to_transactions failed', cascadeErr);
    }
    return { invoice: { ...invoice, ...invPatch }, transaction: tx, cascade_count: cascadeErr ? 0 : (cascadeCount || 0) };
  }

  return { invoice: { ...invoice, ...invPatch }, transaction: tx, cascade_count: 0 };
}

// ---------------------------------------------------------------------------
// Draw Payments (cost-plus: draw IS the billable document — no invoice needed)
// ---------------------------------------------------------------------------

export async function sbMarkDrawPaid(drawId, payment) {
  if (!drawId) throw new Error('drawId required');
  if (!payment?.amount || payment.amount <= 0) throw new Error('Amount must be greater than zero');
  if (!payment?.payment_method) throw new Error('Payment method required');

  const { data: draw, error: loadErr } = await sb
    .from('draw_schedules')
    .select('id, tenant_id, job_id, draw_number, title, target_amount, paid_amount, status')
    .eq('id', drawId)
    .single();
  if (loadErr) throw loadErr;
  if (!draw) throw new Error('Draw not found');
  if (draw.status === 'paid') throw new Error('Draw is already fully paid');
  if (draw.status === 'cancelled') throw new Error('Cannot mark a cancelled draw as paid');

  const paidAmount    = Number(payment.amount);
  const currentPaid   = Number(draw.paid_amount);
  const targetAmount  = Number(draw.target_amount);
  const newAmountPaid = currentPaid + paidAmount;

  if (newAmountPaid > targetAmount + 0.01) {
    const remaining = (targetAmount - currentPaid).toFixed(2);
    throw new Error(`Payment exceeds draw balance — $${remaining} remaining`);
  }

  const dateISO = payment.date_paid ?? new Date().toISOString().slice(0, 10);
  const refNote = payment.reference ? ` (${payment.reference})` : '';

  // invoice_id must stay null — sbLoadJobFinancialSummary + sbLoadClientActualSpend
  // both bucket inbound payments by `invoice_id IS NULL` for cost-plus jobs.
  const txRow = {
    tenant_id:      draw.tenant_id,
    job_id:         draw.job_id,
    draw_id:        drawId,
    invoice_id:     null,
    direction:      'in',
    type:           'client_payment',
    status:         'paid',
    amount:         paidAmount,
    description:    `Draw #${draw.draw_number} — ${draw.title} payment${refNote}`,
    date_incurred:  dateISO,
    date_paid:      dateISO,
    payment_method: payment.payment_method,
    notes:          payment.notes ?? null,
    created_by:     AV_USER_ID,
  };

  const { data: tx, error: txErr } = await sb
    .from('job_transactions')
    .insert(txRow)
    .select()
    .single();
  if (txErr) throw txErr;

  const { data: rpcResult, error: drawErr } = await sb.rpc('mark_draw_paid_release_retainage', {
    p_draw_id:     drawId,
    p_paid_amount: paidAmount,
    // p_min_invoiced_amount omitted — direct draw payment path, no invoice gate
  });
  if (drawErr) throw drawErr;

  const newStatus = rpcResult.new_status;
  return { tx, newStatus, newAmountPaid };
}

// ---------------------------------------------------------------------------
// Material Orders (EXECUTION_ARC Phase 2)
// ---------------------------------------------------------------------------

export async function sbCreateMaterialOrder(jobId, order) {
  if (!jobId) return { ok: false, error: 'jobId required', data: null };
  if (!order?.trade) return { ok: false, error: 'trade required', data: null };
  if (!Array.isArray(order?.materials)) return { ok: false, error: 'materials must be array', data: null };

  const hasQuote = order.supplier_name || order.quote_total || order.quoted_delivery_date;
  const initialStatus = hasQuote ? 'quoted' : 'planned';

  const row = {
    tenant_id: AV_TENANT,
    job_id: jobId,
    trade: order.trade,
    line_item_ids: Array.isArray(order.line_item_ids) ? order.line_item_ids : [],
    materials: order.materials,
    supplier_name: order.supplier_name ?? null,
    quote_total: order.quote_total ?? null,
    quoted_delivery_date: order.quoted_delivery_date ?? null,
    notes: order.notes ?? null,
    status: initialStatus,
    created_by_id: AV_USER_ID,
  };

  const { data, error } = await sb
    .from('material_orders')
    .insert(row)
    .select()
    .single();

  if (error) {
    captureFailedIntent({ kind: 'create_material_order', payload: row, jobId, message: error.message, resumable: true }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  fireTodoEvent('material_order.created', { jobId: data.job_id, orderId: data.id, trade: data.trade, status: data.status }).catch(() => {});
  return { ok: true, error: null, data };
}

export async function sbLoadMaterialOrdersForJob(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required', data: null };
  const { data, error } = await sb
    .from('material_orders')
    .select('*')
    .eq('job_id', jobId)
    .order('trade', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
}

export async function sbLoadMaterialOrder(id) {
  if (!id) throw new Error('id required');
  const { data, error } = await sb
    .from('material_orders')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function sbUpdateMaterialOrder(id, updates) {
  if (!id) throw new Error('id required');
  const { id: _id, tenant_id, job_id, created_at, created_by_id, ...patch } = updates || {};
  patch.updated_at = new Date().toISOString();

  if (patch.status) {
    const validStatuses = ['planned', 'quoted', 'ordered', 'delivered', 'installed', 'cancelled'];
    if (!validStatuses.includes(patch.status)) throw new Error(`Invalid material order status: ${patch.status}`);
  }

  if (patch.status === 'delivered' && !patch.actual_delivery_date) {
    patch.actual_delivery_date = new Date().toISOString().slice(0, 10);
  }

  // Photo gate: at least 1 delivery photo required
  if (patch.status === 'delivered') {
    const photoCount = await countPhotosForEntity(sb, 'material_order', id);
    if (photoCount === 0) {
      return { ok: false, error: 'At least 1 delivery photo is required.', data: null };
    }
  }

  const { data, error } = await sb
    .from('material_orders')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    captureFailedIntent({ kind: 'update_material_order', payload: { id, ...patch }, jobId: null, message: error.message, resumable: true }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  if (patch.status !== undefined) {
    fireTodoEvent('material_order.status_changed', { jobId: data.job_id, orderId: data.id, trade: data.trade, newStatus: data.status }).catch(() => {});
  }
  if (patch.status === 'delivered') {
    sbNotify(
      'material_delivered',
      `Materials delivered — ${data.trade || 'job'}`,
      `${data.supplier_name || 'Order'} delivered${data.actual_delivery_date ? ' ' + data.actual_delivery_date : ''}`,
      data.job_id,
      AV_USER_ID,
    ).catch(() => {});
    checkAndAutoInvoice(sb, AV_TENANT, AV_USER_ID, 'material_order.delivered', {
      jobId: data.job_id, trade: data.trade,
    }).then(fired => fired.forEach(f => fireTodoEvent('invoice.auto_drafted', { jobId: data.job_id, invoiceId: f.invoiceId, drawId: f.drawId, triggerLabel: f.triggerLabel }).catch(() => {})))
      .catch(err => console.warn('[autoInvoice] sbUpdateMaterialOrder hook failed:', err?.message));
  }
  if (patch.quoted_delivery_date !== undefined && data.quoted_delivery_date) {
    checkAndCreateSubStart(sb, AV_TENANT, AV_USER_ID, data.job_id, data.trade)
      .then(result => {
        if (result) {
          fireTodoEvent('schedule_item.auto_created', { jobId: data.job_id, trade: result.trade, scheduleItemId: result.id, startDate: result.scheduled_date }).catch(() => {});
        }
      })
      .catch(err => console.warn('[sbUpdateMaterialOrder] Phase 6 auto-create failed:', err?.message));
  }
  return { ok: true, data };
}

export async function sbDeleteMaterialOrder(id) {
  if (!id) throw new Error('id required');

  const { data: existing, error: loadErr } = await sb
    .from('material_orders')
    .select('status, job_id, trade')
    .eq('id', id)
    .single();
  if (loadErr) throw loadErr;
  if (!existing) throw new Error('Material order not found');
  if (existing.status !== 'planned') {
    throw new Error(`Only planned orders can be deleted. Use status='cancelled' for any other state.`);
  }

  const { error } = await sb.from('material_orders').delete().eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'delete_material_order', payload: { id }, jobId: null, message: error.message, resumable: true }).catch(() => {});
    throw error;
  }
  fireTodoEvent('material_order.deleted', { jobId: existing?.job_id, orderId: id, trade: existing?.trade, newStatus: null }).catch(() => {});
  return true;
}

// ─── Phase Advancement Gates (EXECUTION_ARC Phase 4a) ────────────────────────
// Gates check jobs.status transitions. job_phases trade rows (Demo, Framing, etc.)
// are a separate system driven by derivePhaseStatus — untouched here.

export async function sbCheckPhaseGates(jobId) {
  if (!jobId) throw new Error('jobId required');

  const { data: job, error: jobErr } = await sb
    .from('jobs')
    .select('status, phase_override_used, phase_override_reason, phase_override_at')
    .eq('id', jobId)
    .single();
  if (jobErr) throw jobErr;
  if (!job) throw new Error('Job not found');

  const currentPhase = job.status;
  const nextPhase = getNextPhase(currentPhase);

  if (!nextPhase) {
    return {
      currentPhase,
      currentPhaseLabel: PHASE_LABELS[currentPhase] ?? currentPhase,
      nextPhase: null,
      nextPhaseLabel: null,
      gates: [],
      allPassed: false,
      canAdvance: false,
      requiresOverride: false,
      overrideReason: null,
      lastOverride: job.phase_override_used ? {
        reason: job.phase_override_reason,
        at: job.phase_override_at,
      } : null,
      message: 'Job is at terminal phase — no further advancement.',
    };
  }

  const { gates, allPassed, requiresOverride, overrideReason } =
    await runGatesForTransition(jobId, currentPhase, nextPhase, sb);

  return {
    currentPhase,
    currentPhaseLabel: PHASE_LABELS[currentPhase] ?? currentPhase,
    nextPhase,
    nextPhaseLabel: PHASE_LABELS[nextPhase] ?? nextPhase,
    gates,
    allPassed,
    canAdvance: allPassed,
    requiresOverride,
    overrideReason,
    lastOverride: job.phase_override_used ? {
      reason: job.phase_override_reason,
      at: job.phase_override_at,
    } : null,
    message: null,
  };
}

export async function sbAdvancePhase(jobId, opts = {}) {
  // opts: { reason?: string }
  // Returns { ok, error, data } — never throws.
  // Gate-fail without reason returns ok:false with data.requiresOverride=true so callers can route to override UX.
  if (!jobId) return { ok: false, error: 'jobId required', data: null };

  let gateStatus;
  try {
    gateStatus = await sbCheckPhaseGates(jobId);
  } catch (e) {
    return { ok: false, error: e.message || 'Failed to check phase gates', data: null };
  }

  if (!gateStatus.nextPhase) {
    return {
      ok: false,
      error: 'Already at terminal phase — cannot advance further.',
      data: { terminal: true, currentPhase: gateStatus.currentPhase },
    };
  }

  const useOverride = !gateStatus.allPassed;
  if (useOverride && !opts.reason?.trim()) {
    const failing = gateStatus.gates.filter(g => !g.passed).map(g => g.label);
    const reason = failing.length
      ? `Gates failing: ${failing.join('; ')}`
      : (gateStatus.overrideReason ?? 'Manual override required for this transition');
    return {
      ok: false,
      error: `Cannot advance: ${reason}. Provide a reason to override.`,
      data: {
        requiresOverride: true,
        gates: gateStatus.gates,
        currentPhase: gateStatus.currentPhase,
        nextPhase: gateStatus.nextPhase,
      },
    };
  }

  const nowIso = new Date().toISOString();
  const patch = {
    status: gateStatus.nextPhase,
    phase_override_used: useOverride,
    phase_override_reason: useOverride ? opts.reason.trim() : null,
    phase_override_at: useOverride ? nowIso : null,
    phase_override_by_id: useOverride ? AV_USER_ID : null,
  };

  const { error: advErr } = await sb
    .from('jobs')
    .update(patch)
    .eq('id', jobId);

  if (advErr) {
    captureFailedIntent({
      kind: 'advance_phase',
      payload: { jobId, from: gateStatus.currentPhase, to: gateStatus.nextPhase, override: useOverride },
      jobId,
      message: advErr.message,
      resumable: true,
    }).catch(() => {});
    return { ok: false, error: advErr.message, data: null };
  }

  let jobRow = null;
  try { const { data } = await sb.from('jobs').select('address').eq('id', jobId).single(); jobRow = data; } catch (_) {}
  sbNotify(
    'phase_advanced',
    `Phase advanced — ${jobRow?.address || 'job'}`,
    `Moved to ${PHASE_LABELS[gateStatus.nextPhase] || gateStatus.nextPhase}${useOverride ? ' (override)' : ''}`,
    jobId,
    AV_USER_ID,
  ).catch(() => {});

  checkAndAutoInvoice(sb, AV_TENANT, AV_USER_ID, 'phase.advanced', {
    jobId, newPhase: gateStatus.nextPhase,
  }).then(fired => fired.forEach(f => fireTodoEvent('invoice.auto_drafted', { jobId, invoiceId: f.invoiceId, drawId: f.drawId, triggerLabel: f.triggerLabel }).catch(() => {})))
    .catch(err => console.warn('[autoInvoice] sbAdvancePhase hook failed:', err?.message));

  if (gateStatus.nextPhase === 'complete') {
    captureTradeActualsForJob(sb, AV_TENANT, jobId)
      .then(result => {
        if (result.captured > 0) {
          console.log(`[tradeActuals] captured ${result.captured} trades for job ${jobId}`);
        } else if (result.error) {
          console.warn(`[tradeActuals] no capture for job ${jobId}:`, result.error);
        }
      })
      .catch(err => console.warn('[tradeActuals] capture failed:', err?.message));
  }

  return {
    ok: true,
    error: null,
    data: {
      previousPhase: gateStatus.currentPhase,
      advancedTo: gateStatus.nextPhase,
      overrideUsed: useOverride,
      overrideReason: useOverride ? opts.reason.trim() : null,
    },
  };
}

// ─── scheduled_actions helpers (AGENT_OPS Phase 1.1) ─────────────────────────

export async function sbCreateScheduledAction({
  kind,
  fire_at,
  priority,
  target_user_id,
  related_job_id,
  related_todo_id,
  related_entity_type,
  related_entity_id,
  payload,
  rule_key,
  source,
} = {}) {
  if (!kind) return { ok: false, error: 'kind required', data: null };
  if (!fire_at) return { ok: false, error: 'fire_at required', data: null };

  const row = {
    tenant_id: AV_TENANT,
    created_by_id: AV_USER_ID,
    kind,
    fire_at,
    priority: priority ?? 'normal',
    source: source ?? 'agent',
    target_user_id: target_user_id ?? null,
    related_job_id: related_job_id ?? null,
    related_todo_id: related_todo_id ?? null,
    related_entity_type: related_entity_type ?? null,
    related_entity_id: related_entity_id ?? null,
    payload: payload ?? {},
    rule_key: rule_key ?? null,
  };

  const { data, error } = await sb
    .from('scheduled_actions')
    .insert(row)
    .select()
    .single();

  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

export async function sbListScheduledActionsForUser({
  window: win = 'today',
  include_completed = false,
  target_user_id,
} = {}) {
  const uid = target_user_id ?? AV_USER_ID;

  let q = sb
    .from('scheduled_actions')
    .select('*')
    .eq('target_user_id', uid)
    .order('fire_at', { ascending: true });

  if (!include_completed) {
    q = q.eq('status', 'scheduled');
  }

  if (win === 'today') {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    q = q.gte('fire_at', start.toISOString()).lte('fire_at', end.toISOString());
  } else if (win === 'this_week') {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    q = q.gte('fire_at', start.toISOString()).lte('fire_at', end.toISOString());
  }
  // win === 'all': no date filter

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
}

export async function sbCancelScheduledAction(id) {
  if (!id) return { ok: false, error: 'id required', data: null };

  const { data, error } = await sb
    .from('scheduled_actions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message, data: null };
  if (!data) return { ok: false, error: 'Row not found or not authorized', data: null };
  return { ok: true, error: null, data: { id: data.id } };
}

// ─── trade_material_lead_times helper (AGENT_OPS Phase 1.2) ──────────────────

export async function sbGetTradeLeadDays(trade) {
  if (!trade) return { ok: false, error: 'trade required', data: null };

  // 1. Tenant-specific override
  const { data: tenantRow, error: tenantErr } = await sb
    .from('trade_material_lead_times')
    .select('lead_days')
    .eq('tenant_id', AV_TENANT)
    .eq('trade', trade)
    .maybeSingle();
  if (tenantErr) return { ok: false, error: tenantErr.message, data: null };
  if (tenantRow) return { ok: true, error: null, data: tenantRow.lead_days };

  // 2. Platform default (tenant_id IS NULL)
  const { data: platformRow, error: platformErr } = await sb
    .from('trade_material_lead_times')
    .select('lead_days')
    .is('tenant_id', null)
    .eq('trade', trade)
    .maybeSingle();
  if (platformErr) return { ok: false, error: platformErr.message, data: null };
  if (platformRow) return { ok: true, error: null, data: platformRow.lead_days };

  // 3. Hardcoded fallback
  return { ok: true, error: null, data: 7 };
}

// ─── push_subscriptions helper (PUSH_NOTIFICATIONS_ARC Phase 4) ──────────────

export async function sbUpsertPushSubscription(sub) {
  if (!sub?.user_id || !sub?.channel) {
    return { ok: false, error: 'user_id and channel required' };
  }

  if (sub.channel === 'apns' && !sub.apns_token) {
    return { ok: false, error: 'apns_token required for channel=apns' };
  }
  if (sub.channel === 'web' && (!sub.endpoint || !sub.p256dh || !sub.auth)) {
    return { ok: false, error: 'endpoint+p256dh+auth required for channel=web' };
  }

  try {
    // Supabase JS upsert can't target partial unique indexes — read-then-write instead.
    let query = sb
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', sub.user_id)
      .eq('channel', sub.channel);

    if (sub.channel === 'apns') {
      query = query.eq('apns_token', sub.apns_token);
    } else {
      query = query.eq('endpoint', sub.endpoint);
    }

    const { data: existing, error: selErr } = await query.maybeSingle();
    if (selErr) return { ok: false, error: selErr.message };
    if (existing?.id) return { ok: true, data: existing };

    const payload = { user_id: sub.user_id, channel: sub.channel };
    if (sub.channel === 'apns') {
      payload.apns_token = sub.apns_token;
    } else {
      payload.endpoint = sub.endpoint;
      payload.p256dh = sub.p256dh;
      payload.auth = sub.auth;
    }

    const { data, error } = await sb
      .from('push_subscriptions')
      .insert(payload)
      .select('id')
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─── FIELD_OPUS_ARC ───────────────────────────────────────────────────────────

// Hard auth-ID gate. Field-Opus surface is visible only to this user.
// Both client-side gating AND DB RLS enforce this. Defense-in-depth.
export const FIELD_OPUS_USER_ID = '8171742a-b586-4f13-be61-744e191a1896';

// Single-thread-per-user v1. Stable thread ID derived from user ID
// so all Kalin's devices/sessions share one thread. Multi-thread deferred.
export const FIELD_OPUS_THREAD_ID = '11111111-1111-1111-1111-111111111111';

export async function sbLoadFieldOpusThread() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (user?.id !== FIELD_OPUS_USER_ID) {
      return { ok: false, error: 'forbidden' };
    }

    const { data, error } = await sb
      .from('field_opus_messages')
      .select('id, thread_id, role, content, meta, created_at')
      .eq('thread_id', FIELD_OPUS_THREAD_ID)
      .order('created_at', { ascending: true });

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data || [] };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sbAppendFieldOpusMessage({ role, content, meta }) {
  if (!role || !content) {
    return { ok: false, error: 'role and content required' };
  }
  if (!['user', 'assistant', 'system', 'dispatch_result'].includes(role)) {
    return { ok: false, error: `invalid role: ${role}` };
  }

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (user?.id !== FIELD_OPUS_USER_ID) {
      return { ok: false, error: 'forbidden' };
    }

    const { data, error } = await sb
      .from('field_opus_messages')
      .insert({
        thread_id: FIELD_OPUS_THREAD_ID,
        role,
        content,
        meta: meta || {},
      })
      .select('id, thread_id, role, content, meta, created_at')
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sbResetFieldOpusThread() {
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (user?.id !== FIELD_OPUS_USER_ID) {
      return { ok: false, error: 'forbidden' };
    }

    const { data, error } = await sb
      .from('field_opus_messages')
      .delete()
      .eq('thread_id', FIELD_OPUS_THREAD_ID)
      .select('id');

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { deleted: (data || []).length } };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ============================================================
// FLOOR_PLAN_LAYOUT_ARC Phase 5a — floor plan persistence + versioning
// ============================================================

/**
 * Create a new floor plan draft. Uploads PDF to storage, writes floor_plans row,
 * writes initial floor_plan_versions row (version 1).
 *
 * Caller generates pdfBlob via buildFloorPlanPDF(rawScan, job).output('blob') —
 * pdf generation is browser-side, supabase.js cannot do it.
 *
 * @param {object} args
 * @param {string|null} args.jobId
 * @param {string|null} args.contactId
 * @param {string} args.name
 * @param {object} args.rawScan
 * @param {Blob|Uint8Array} args.pdfBlob
 * @returns {Promise<{ok, error, data?: {id, pdf_url, version_number}}>}
 */
export async function sbCreateFloorPlan({ jobId, contactId, name, rawScan, pdfBlob }) {
  if (!name) return { ok: false, error: 'name required' };
  if (!rawScan) return { ok: false, error: 'rawScan required' };
  if (!pdfBlob) return { ok: false, error: 'pdfBlob required' };
  if (!jobId && !contactId) return { ok: false, error: 'jobId or contactId required' };

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'not authenticated' };

    // Copy normalized geometry from the scan record if present; else compute as fallback
    let normalizedGeometry = rawScan.normalized_geometry ?? null;
    if (!normalizedGeometry) {
      try {
        const normResult = normalizeFloorPlan({ rooms: rawScan.rooms || [], scanner_version: null });
        if (normResult.ok) normalizedGeometry = normResult.data;
        else console.warn('[normalize-scan] floor_plans fallback normalize error:', normResult.error);
      } catch (ne) {
        console.warn('[normalize-scan] floor_plans fallback normalize threw:', ne);
      }
    }

    const { data: fp, error: insErr } = await sb
      .from('floor_plans')
      .insert({
        tenant_id: AV_TENANT,
        job_id: jobId || null,
        contact_id: contactId || null,
        created_by: user.id,
        name,
        raw_scan: rawScan,
        normalized_geometry: normalizedGeometry,
        layout_overrides: {},
        current_pdf_version: 1,
        status: 'draft',
      })
      .select('id')
      .single();
    if (insErr) return { ok: false, error: insErr.message };

    const fpId = fp.id;
    const storagePath = `${AV_TENANT}/${fpId}/v1.pdf`;

    const { error: upErr } = await sb.storage
      .from('floor-plans')
      .upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: false });
    if (upErr) {
      await sb.from('floor_plans').delete().eq('id', fpId);
      return { ok: false, error: `upload failed: ${upErr.message}` };
    }

    const { data: signed, error: signErr } = await sb.storage
      .from('floor-plans')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (signErr) return { ok: false, error: signErr.message };

    const { error: updErr } = await sb
      .from('floor_plans')
      .update({ current_pdf_url: signed.signedUrl })
      .eq('id', fpId);
    if (updErr) return { ok: false, error: updErr.message };

    const { error: vErr } = await sb.from('floor_plan_versions').insert({
      floor_plan_id: fpId,
      tenant_id: AV_TENANT,
      version_number: 1,
      pdf_url: signed.signedUrl,
      layout_overrides_snapshot: {},
      raw_scan_snapshot: rawScan,
      created_by: user.id,
    });
    if (vErr) return { ok: false, error: vErr.message };

    return { ok: true, data: { id: fpId, pdf_url: signed.signedUrl, version_number: 1 } };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Load one floor plan with all its versions, newest version first.
 */
export async function sbLoadFloorPlan(id) {
  if (!id) return { ok: false, error: 'id required' };
  try {
    const [planRes, versionsRes] = await Promise.all([
      sb.from('floor_plans').select('*').eq('id', id).single(),
      sb.from('floor_plan_versions')
        .select('*')
        .eq('floor_plan_id', id)
        .order('version_number', { ascending: false }),
    ]);
    if (planRes.error) return { ok: false, error: planRes.error.message };
    if (versionsRes.error) return { ok: false, error: versionsRes.error.message };
    return { ok: true, data: { plan: planRes.data, versions: versionsRes.data || [] } };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Load all non-archived floor plans attached to a job, newest first.
 */
export async function sbLoadFloorPlansForJob(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required' };
  try {
    const { data, error } = await sb
      .from('floor_plans')
      .select('id, name, status, current_pdf_version, current_pdf_url, updated_at')
      .eq('job_id', jobId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data || [] };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Replace layout_overrides for a floor plan. Does NOT regenerate PDF —
 * caller triggers sbRegenerateFloorPlanPdf separately to write a new version.
 */
export async function sbUpdateFloorPlanOverrides(id, overrides) {
  if (!id) return { ok: false, error: 'id required' };
  if (typeof overrides !== 'object' || overrides === null) {
    return { ok: false, error: 'overrides must be object' };
  }
  try {
    const { error } = await sb
      .from('floor_plans')
      .update({ layout_overrides: overrides })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Regenerate the PDF for a floor plan. Caller provides the freshly generated pdfBlob
 * (pdf generation is browser-side). Uploads new PDF, bumps current_pdf_version,
 * writes a floor_plan_versions row.
 *
 * @param {string} id
 * @param {Blob|Uint8Array} pdfBlob
 * @returns {Promise<{ok, error, data?: {version_number, pdf_url}}>}
 */
export async function sbRegenerateFloorPlanPdf(id, pdfBlob) {
  if (!id) return { ok: false, error: 'id required' };
  if (!pdfBlob) return { ok: false, error: 'pdfBlob required' };
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'not authenticated' };

    const { data: plan, error: loadErr } = await sb
      .from('floor_plans')
      .select('id, tenant_id, current_pdf_version, raw_scan, layout_overrides')
      .eq('id', id)
      .single();
    if (loadErr) return { ok: false, error: loadErr.message };

    const nextVersion = (plan.current_pdf_version || 0) + 1;
    const storagePath = `${plan.tenant_id}/${id}/v${nextVersion}.pdf`;

    const { error: upErr } = await sb.storage
      .from('floor-plans')
      .upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: false });
    if (upErr) return { ok: false, error: `upload failed: ${upErr.message}` };

    const { data: signed, error: signErr } = await sb.storage
      .from('floor-plans')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (signErr) return { ok: false, error: signErr.message };

    const { error: updErr } = await sb
      .from('floor_plans')
      .update({ current_pdf_version: nextVersion, current_pdf_url: signed.signedUrl })
      .eq('id', id);
    if (updErr) return { ok: false, error: updErr.message };

    const { error: vErr } = await sb.from('floor_plan_versions').insert({
      floor_plan_id: id,
      tenant_id: plan.tenant_id,
      version_number: nextVersion,
      pdf_url: signed.signedUrl,
      layout_overrides_snapshot: plan.layout_overrides || {},
      raw_scan_snapshot: plan.raw_scan,
      created_by: user.id,
    });
    if (vErr) return { ok: false, error: vErr.message };

    return { ok: true, data: { version_number: nextVersion, pdf_url: signed.signedUrl } };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Mark a specific version as sent to recipients. Updates the version row's sent_to/sent_at
 * and flips floor_plans.status to 'sent' on first send.
 * Caller handles the actual email delivery (existing notify-email path).
 *
 * @param {string} planId
 * @param {number} versionNumber
 * @param {string[]} recipientEmails
 */
export async function sbSendFloorPlanVersion(planId, versionNumber, recipientEmails) {
  if (!planId) return { ok: false, error: 'planId required' };
  if (!Array.isArray(recipientEmails) || recipientEmails.length === 0) {
    return { ok: false, error: 'recipientEmails required (non-empty array)' };
  }
  try {
    const nowIso = new Date().toISOString();

    const { data: version, error: getErr } = await sb
      .from('floor_plan_versions')
      .select('id, sent_to')
      .eq('floor_plan_id', planId)
      .eq('version_number', versionNumber)
      .single();
    if (getErr) return { ok: false, error: getErr.message };

    const mergedRecipients = Array.from(new Set([...(version.sent_to || []), ...recipientEmails]));

    const { error: vErr } = await sb
      .from('floor_plan_versions')
      .update({ sent_to: mergedRecipients, sent_at: nowIso })
      .eq('id', version.id);
    if (vErr) return { ok: false, error: vErr.message };

    // Flip plan status to 'sent' only if still in draft
    const { error: pErr } = await sb
      .from('floor_plans')
      .update({ status: 'sent' })
      .eq('id', planId)
      .eq('status', 'draft');
    if (pErr) return { ok: false, error: pErr.message };

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Soft-delete a floor plan by setting status='archived'. Versions remain in DB.
 * Hard delete is intentionally not exposed in v1 — use SQL editor if needed.
 */
// ─── UNIFIED_FILES_ARC Phase 1 ────────────────────────────────────────────────
// New helpers for the unified job_files system.
// Old helpers (sbPhoto, sbUploadDoc, sbLoadDocs) kept intact for backward compat
// during Phase 3 migration window. Do NOT remove until Phase 3 ships.

/**
 * Upload a file to the unified job_files system.
 * Writes to the private 'job-files' bucket + inserts a job_files row.
 * If category is not provided, calls inferFileCategory (rule-based + phase-based).
 */
export async function sbUploadJobFile({
  jobId,
  file,
  category = null,
  subcategory = null,
  uploadSource = 'manual',
  fileTypeHint = null,
  relatedEntityType = null,
  relatedEntityId = null,
  clientVisible = false,
}) {
  if (!jobId || !file) return { ok: false, error: 'jobId + file required' };
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'not authenticated' };

    let resolvedCategory = category;
    let resolvedSubcategory = subcategory;
    let aiConfidence = null;
    let aiSuggested = null;

    if (!resolvedCategory) {
      const { inferFileCategory } = await import('./jobFiles/inferFileCategory.js');
      // queryFn: resolves current in-progress phase for entity-linked uploads
      const queryFn = async ({ jobId: jid }) => {
        const { data } = await sb
          .from('job_phases')
          .select('phase_name')
          .eq('job_id', jid)
          .eq('status', 'in_progress')
          .order('phase_order', { ascending: true })
          .limit(1)
          .maybeSingle();
        return data?.phase_name ?? null;
      };
      const inferred = await inferFileCategory({ file, jobId, uploadSource, fileTypeHint, queryFn, visionFn: _callVisionCategorizer });
      resolvedCategory = inferred.category;
      const isVisionLowConf = inferred.source === 'vision_lowconf';
      resolvedSubcategory = subcategory ?? (isVisionLowConf ? null : inferred.subcategory);
      aiConfidence = inferred.confidence < 1.0 ? inferred.confidence : null;
      // Low-conf: store AI suggestion for review; don't auto-file into subcategory folder
      aiSuggested = isVisionLowConf
        ? (inferred.subcategory ?? null)
        : ((inferred.source !== 'rule' && inferred.subcategory) ? inferred.subcategory : null);
    }

    const ext = (file.name || 'file').split('.').pop().toLowerCase() || 'bin';
    const fileId = crypto.randomUUID();
    const storagePath = `${AV_TENANT}/${jobId}/${fileId}.${ext}`;

    const { error: upErr } = await sb.storage
      .from('job-files')
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: `storage: ${upErr.message}` };

    const { data, error } = await sb.from('job_files').insert({
      tenant_id:               AV_TENANT,
      job_id:                  jobId,
      uploaded_by_id:          user.id,
      name:                    file.name || 'untitled',
      storage_path:            storagePath,
      storage_bucket:          'job-files',
      mime_type:               file.type || null,
      size_bytes:              file.size || null,
      category:                resolvedCategory,
      subcategory:             resolvedSubcategory,
      ai_confidence:           aiConfidence,
      ai_subcategory_suggested: aiSuggested,
      client_visible:          clientVisible,
      related_entity_type:     relatedEntityType,
      related_entity_id:       relatedEntityId,
    }).select().single();

    if (error) {
      await sb.storage.from('job-files').remove([storagePath]).catch(() => {});
      return { ok: false, error: error.message };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Load files for a job from the unified job_files system.
 * Optionally filtered by category and/or subcategory.
 */
export async function sbLoadJobFiles(jobId, { category = null, subcategory = null, limit = 100 } = {}) {
  if (!jobId) return { ok: false, error: 'jobId required', data: [] };
  try {
    let q = sb.from('job_files')
      .select('*')
      .eq('job_id', jobId)
      .eq('tenant_id', AV_TENANT)
      .eq('lifecycle_status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (category) q = q.eq('category', category);
    if (subcategory !== undefined && subcategory !== null) q = q.eq('subcategory', subcategory);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message, data: [] };
    return { ok: true, data: data || [] };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), data: [] };
  }
}

/**
 * Search files for a job across name, category, subcategory, mime_type,
 * and receipt metadata (vendor, description, notes, amount) from job_transactions.
 * Returns { ok, data, error } — data items may include _receipt_meta for receipt files.
 * Client-side filter; server fetches up to 500 files. Suitable for v1 job sizes.
 */
export async function sbSearchJobFiles(jobId, query) {
  if (!jobId) return { ok: false, error: 'jobId required', data: [] };
  const q = (query || '').trim().toLowerCase();
  if (!q) return sbLoadJobFiles(jobId, { limit: 200 });
  try {
    const { data: files, error } = await sb.from('job_files')
      .select('*')
      .eq('job_id', jobId)
      .eq('tenant_id', AV_TENANT)
      .eq('lifecycle_status', 'active')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return { ok: false, error: error.message, data: [] };

    // Batch-load job_transactions for receipt files so vendor/description are searchable
    const receiptIds = (files || [])
      .filter(f => f.category === 'Receipts' && f.related_entity_id)
      .map(f => f.related_entity_id);
    let txMap = {};
    if (receiptIds.length > 0) {
      const { data: txs } = await sb.from('job_transactions')
        .select('id, payer_or_payee_name, description, notes, amount')
        .in('id', receiptIds);
      txMap = Object.fromEntries((txs || []).map(t => [t.id, t]));
    }

    const filtered = (files || []).filter(f => {
      const haystack = [f.name, f.category, f.subcategory, f.mime_type];
      if (f.category === 'Receipts' && f.related_entity_id) {
        const tx = txMap[f.related_entity_id];
        if (tx) {
          haystack.push(tx.payer_or_payee_name, tx.description, tx.notes);
          if (tx.amount != null) haystack.push(String(tx.amount));
        }
      }
      return haystack.filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    }).map(f => {
      const tx = f.category === 'Receipts' && f.related_entity_id ? txMap[f.related_entity_id] : null;
      return tx ? { ...f, _receipt_meta: tx } : f;
    });

    return { ok: true, data: filtered };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), data: [] };
  }
}

/**
 * Share a folder bundle by emailing 7-day signed links for all files.
 * Calls send-files-bundle edge function which verifies tenant ownership.
 */
export async function sbShareFolderBundle({ fileIds, recipientEmail, recipientName, message, folderLabel }) {
  if (!fileIds?.length || !recipientEmail || !folderLabel) {
    return { ok: false, error: 'fileIds, recipientEmail, folderLabel required' };
  }
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { ok: false, error: 'not authenticated' };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-files-bundle`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileIds, recipientEmail, recipientName, message, folderLabel }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `Send failed: ${txt.slice(0, 200)}` };
    }
    return await res.json();
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Generate a signed URL for any job_file.
 * Works for all storage_bucket values (job-files, job-photos, job-documents).
 * Default expiry: 7 days.
 */
export async function sbSignJobFileUrl(jobFileId, expiresIn = 60 * 60 * 24 * 7) {
  if (!jobFileId) return { ok: false, error: 'jobFileId required' };
  try {
    const { data: file, error: rdErr } = await sb.from('job_files')
      .select('storage_path, storage_bucket')
      .eq('id', jobFileId)
      .single();
    if (rdErr) return { ok: false, error: rdErr.message };
    const { data, error } = await sb.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.storage_path, expiresIn);
    if (error) return { ok: false, error: error.message };
    return { ok: true, url: data.signedUrl };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Recategorize an existing job_file. Used by bulk-tag UI in Phase 2.
 */
export async function sbCategorizeJobFile(jobFileId, { category, subcategory = null }) {
  if (!jobFileId || !category) return { ok: false, error: 'jobFileId + category required' };
  try {
    const { error } = await sb.from('job_files')
      .update({ category, subcategory })
      .eq('id', jobFileId)
      .eq('tenant_id', AV_TENANT);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Delete a job_file and its storage object.
 * Best-effort storage cleanup — row delete is the source of truth.
 */
export async function sbDeleteJobFile(jobFileId) {
  if (!jobFileId) return { ok: false, error: 'jobFileId required' };
  try {
    const { data: file, error: rdErr } = await sb.from('job_files')
      .select('storage_path, storage_bucket')
      .eq('id', jobFileId)
      .single();
    if (rdErr) return { ok: false, error: rdErr.message };

    const { error: delErr } = await sb.from('job_files')
      .delete()
      .eq('id', jobFileId)
      .eq('tenant_id', AV_TENANT);
    if (delErr) return { ok: false, error: delErr.message };

    // Best-effort storage cleanup (don't fail if object already gone)
    await sb.storage.from(file.storage_bucket).remove([file.storage_path]).catch(() => {});

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sbDeleteFloorPlan(id) {
  if (!id) return { ok: false, error: 'id required' };
  try {
    const { error } = await sb
      .from('floor_plans')
      .update({ status: 'archived' })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function sbMarkTransactionsPaid({ transactionIds, paidDate } = {}) {
  if (!transactionIds || transactionIds.length === 0) {
    return { ok: false, error: 'No transactions selected' };
  }
  try {
    const today = paidDate || new Date().toISOString().slice(0, 10);
    const { data, error } = await sb
      .from('job_transactions')
      .update({ status: 'paid', date_paid: today })
      .in('id', transactionIds)
      .eq('status', 'pending')
      .select('id');
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { updatedCount: data?.length || 0 } };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ===== Cost-Plus =====

/**
 * Returns all unreimbursed outbound expense rows for a cost-plus job,
 * ordered by date_incurred ASC. Used by the draw composer and float cards.
 * Returns { ok, error, data: [...rows] }.
 */
export async function sbLoadUnreimbursedExpenses(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required', data: [] };

  const { data, error } = await sb
    .from('job_transactions')
    .select('id, job_id, date_incurred, type, amount, markup_pct, description, draw_number, status, created_at')
    .eq('job_id', jobId)
    .eq('direction', 'out')
    .eq('reimbursement_status', 'unreimbursed')
    .order('date_incurred', { ascending: true });

  if (error) return { ok: false, error: error.message, data: [] };
  return { ok: true, error: null, data: data || [] };
}

/**
 * Computes bucket + float math for a cost-plus job in one round trip.
 * bucket = sum of paid inbound rows with invoice_id IS NULL
 * unreimbursed = sum of direction='out', reimbursement_status='unreimbursed'
 * float = unreimbursed - bucket (positive = we're ahead of client; negative = bucket surplus)
 * Returns { ok, error, data: { bucket, unreimbursed, float } }.
 */
export async function sbGetBucketBalance(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required', data: null };

  const { data, error } = await sb
    .from('job_transactions')
    .select('direction, amount, invoice_id, status, reimbursement_status')
    .eq('job_id', jobId);

  if (error) return { ok: false, error: error.message, data: null };

  let bucket = 0;
  let unreimbursed = 0;
  for (const r of data || []) {
    const amt = Number(r.amount) || 0;
    if (r.direction === 'in' && r.invoice_id === null && r.status === 'paid') {
      bucket += amt;
    } else if (r.direction === 'out' && r.reimbursement_status === 'unreimbursed') {
      unreimbursed += amt;
    }
  }

  return {
    ok: true,
    error: null,
    data: {
      bucket: Number(bucket.toFixed(2)),
      unreimbursed: Number(unreimbursed.toFixed(2)),
      float: Number((unreimbursed - bucket).toFixed(2)),
    },
  };
}

export async function sbLoadJobDrawTotals(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required', data: null };
  const [{ data: job, error: jobErr }, { data: draws, error: drawErr }] = await Promise.all([
    sb.from('jobs').select('contract_value, retainage_pct').eq('id', jobId).single(),
    sb.from('draw_schedules').select('target_amount, retainage_held').eq('job_id', jobId).neq('status', 'voided'),
  ]);
  if (jobErr) return { ok: false, error: jobErr.message, data: null };
  if (drawErr) return { ok: false, error: drawErr.message, data: null };
  const total_drawn          = (draws || []).reduce((s, d) => s + Number(d.target_amount || 0), 0);
  const held_retainage_total = (draws || []).reduce((s, d) => s + Number(d.retainage_held || 0), 0);
  const contract_value       = Number(job.contract_value || 0);
  const retainage_pct        = Number(job.retainage_pct || 0);
  const billable_cap         = contract_value * (1 - retainage_pct / 100);
  const retainage_releasable = contract_value * (retainage_pct / 100);
  return { ok: true, error: null, data: { total_drawn, held_retainage_total, retainage_pct, billable_cap, retainage_releasable, contract_value } };
}

/**
 * Composes a cost-plus draw atomically: creates draw_schedules row,
 * draw_line_items rows, flips linked transactions to in_draw.
 * lineItems: [{ transaction_id, description, base_amount, markup_pct,
 *               markup_amount, total_with_markup, is_forward_looking,
 *               display_order, notes }]
 * Returns { ok, error, data: { draw_id, draw_number, line_count, tx_flipped } }.
 */
export async function sbComposeDraw({ jobId, title, description, targetAmount, applyBucket, lineItems, retainageHeld = 0, isRetainageRelease = false }) {
  if (!jobId) return { ok: false, error: 'jobId required', data: null };
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { ok: false, error: 'At least one line item required', data: null };
  }

  const { data, error } = await sb.rpc('compose_draw', {
    p_job_id:        jobId,
    p_title:         title || 'Draw',
    p_description:   description || null,
    p_target_amount: Number(targetAmount) || 0,
    p_apply_bucket:  applyBucket !== false,
    p_line_items:    lineItems,
  });

  if (error) return { ok: false, error: error.message, data: null };
  if (data?.draw_id && (retainageHeld > 0 || isRetainageRelease)) {
    await sb.from('draw_schedules').update({
      ...(retainageHeld > 0     && { retainage_held: retainageHeld }),
      ...(isRetainageRelease     && { is_retainage_release: true }),
    }).eq('id', data.draw_id);
  }
  return { ok: true, error: null, data };
}

/**
 * Voids a draw: reverses linked transactions to 'unreimbursed',
 * deletes draw_line_items, marks draw status='cancelled'.
 * Blocked if the draw has a paid invoice linked.
 * Returns { ok, error, data: { draw_id, tx_reverted, line_items_deleted } }.
 */
export async function sbVoidDraw(drawId) {
  if (!drawId) return { ok: false, error: 'drawId required', data: null };
  const { data, error } = await sb.rpc('void_draw', { p_draw_id: drawId });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

/**
 * Client-facing draw breakdown for a cost-plus job. Returns per-draw cards with
 * line items, summary math, and invoice status. Filters out cancelled draws and
 * draws whose invoice is in draft or void state (i.e. not yet sent to client).
 *
 * Invoice status enum: draft, sent, viewed, paid, partially_paid, overdue, void.
 * Client-visible statuses: sent, viewed, paid, partially_paid, overdue.
 *
 * Returns { ok, error, data: [{ draw, lineItems, invoice }] }
 */
export async function sbLoadClientDrawBreakdown(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required', data: [] };

  // Load non-cancelled draws for this job
  const { data: draws, error: drawsErr } = await sb
    .from('draw_schedules')
    .select('id, draw_number, title, status, target_amount, created_at')
    .eq('job_id', jobId)
    .neq('status', 'cancelled')
    .order('draw_number', { ascending: true });

  if (drawsErr) return { ok: false, error: drawsErr.message, data: [] };
  if (!draws || draws.length === 0) return { ok: true, error: null, data: [] };

  const drawIds = draws.map(d => d.id);

  // Load line items for these draws
  const { data: lineItems, error: liErr } = await sb
    .from('draw_line_items')
    .select('id, draw_id, transaction_id, description, base_amount, markup_pct, markup_amount, total_with_markup, is_forward_looking, display_order, notes')
    .in('draw_id', drawIds)
    .order('display_order', { ascending: true });

  if (liErr) return { ok: false, error: liErr.message, data: [] };

  // Load invoices linked to these draws
  const { data: invoices, error: invErr } = await sb
    .from('invoices')
    .select('id, draw_id, status, total_amount, paid_at, sent_at, created_at')
    .in('draw_id', drawIds);

  if (invErr) return { ok: false, error: invErr.message, data: [] };

  // Group line items by draw_id
  const linesByDraw = new Map();
  for (const li of lineItems || []) {
    if (!linesByDraw.has(li.draw_id)) linesByDraw.set(li.draw_id, []);
    linesByDraw.get(li.draw_id).push(li);
  }

  // Find the best invoice per draw (latest non-void, non-cancelled)
  const invoiceByDraw = new Map();
  for (const inv of invoices || []) {
    if (inv.status === 'void') continue; // skip voided invoices
    const existing = invoiceByDraw.get(inv.draw_id);
    if (!existing || new Date(inv.created_at) > new Date(existing.created_at)) {
      invoiceByDraw.set(inv.draw_id, inv);
    }
  }

  // Client filter: only show draws that have a sent/visible invoice (not draft)
  const HIDDEN_STATUSES = new Set(['draft', 'void']);
  const visible = draws
    .filter(d => {
      const inv = invoiceByDraw.get(d.id);
      if (!inv) return false; // no invoice → not client-visible yet
      return !HIDDEN_STATUSES.has(inv.status);
    })
    .map(d => ({
      draw: d,
      lineItems: linesByDraw.get(d.id) || [],
      invoice: invoiceByDraw.get(d.id),
    }));

  return { ok: true, error: null, data: visible };
}

/**
 * Loads actual-spend ledger for a cost-plus job.
 * Returns outbound paid transactions with job-level markup applied.
 * Accepts sb + tenantId as params — no direct supabase.js imports to avoid circular deps.
 *
 * Returns { ok, error, data: {
 *   transactions, cost_subtotal, material_subtotal, labor_subtotal,
 *   material_markup_pct, labor_markup_pct, markup_amount, marked_up_total,
 *   original_contract, co_total, current_total
 * }}
 */
export async function sbLoadClientActualSpend(sbClient, jobId, tenantId) {
  if (!jobId) return { ok: false, error: 'jobId required', data: null };

  const [paidOutboundResult, pendingOutboundResult, inboundResult, jobResult, pendingReviewResult, estResult] = await Promise.all([
    // Paid outbound — the ledger rows
    sbClient
      .from('job_transactions')
      .select('id, date_incurred, payer_or_payee_name, type, description, amount')
      .eq('job_id', jobId)
      .eq('tenant_id', tenantId)
      .eq('direction', 'out')
      .eq('status', 'paid')
      .order('date_incurred', { ascending: true }),
    // Pending outbound sub_payout/change_order — the accrual rows
    sbClient
      .from('job_transactions')
      .select('amount, type')
      .eq('job_id', jobId)
      .eq('tenant_id', tenantId)
      .eq('direction', 'out')
      .eq('status', 'pending')
      .in('type', ['sub_payout', 'change_order']),
    // Inbound paid with no invoice — client draw receipts (= paid_to_date)
    sbClient
      .from('job_transactions')
      .select('amount')
      .eq('job_id', jobId)
      .eq('tenant_id', tenantId)
      .eq('direction', 'in')
      .eq('status', 'paid')
      .is('invoice_id', null),
    sbClient
      .from('jobs')
      .select('contract_value, co_total, labor_markup_pct, material_markup_pct, default_markup_pct, pm_fee')
      .eq('id', jobId)
      .single(),
    // Pending-review sub_invoices (submitted but not yet approved) — potential additional work
    sbClient
      .from('sub_invoices')
      .select('amount')
      .eq('job_id', jobId)
      .eq('tenant_id', tenantId)
      .is('approved_at', null)
      .is('voided_at', null),
    // Original signed contract — lives in job_estimates.estimate_data.contract_total (nullable)
    // contract_value already includes marked-up CO prices so cannot be recovered by subtraction
    sbClient
      .from('job_estimates')
      .select('estimate_data')
      .eq('job_id', jobId)
      .maybeSingle(),
  ]);

  if (paidOutboundResult.error) return { ok: false, error: paidOutboundResult.error.message, data: null };
  if (jobResult.error) return { ok: false, error: jobResult.error.message, data: null };

  const txns = paidOutboundResult.data || [];
  const j = jobResult.data;

  const materialMarkupPct = Number(j.material_markup_pct ?? j.default_markup_pct ?? 0);
  const laborMarkupPct = Number(j.labor_markup_pct ?? j.default_markup_pct ?? 0);
  // authorized_contract = jobs.contract_value = original signed + all approved CO marked-up prices
  const authorizedContract = Number(j.contract_value ?? 0);
  const coTotal = Number(j.co_total ?? 0);
  // original_signed_contract from job_estimates — null when no row or field absent
  const estContractTotal = estResult.data?.estimate_data?.contract_total;
  const originalSignedContract = estContractTotal != null && estContractTotal !== '' ? Number(estContractTotal) || null : null;

  // Load per-category markup config for this tenant; falls back to trigger-equivalent defaults
  const categoryConfig = await sbLoadCategoryConfig(tenantId);
  const _cfg = categoryConfig ?? DEFAULT_CATEGORY_CONFIG;

  let materialSubtotal = 0;
  let laborSubtotal = 0;
  let markupAmount = 0;

  const transactions = txns.map(t => {
    const amt = Number(t.amount ?? 0);
    const mode = _cfg[normalizeCategoryKey(t.type)] ?? 'material_rate';
    if (mode === 'labor_rate') laborSubtotal += amt;
    else materialSubtotal += amt; // material_rate and flat both go to material display bucket
    markupAmount += amt * markupRateForCategory(t.type, { laborPct: laborMarkupPct, materialPct: materialMarkupPct, categoryConfig }) / 100;
    return {
      date: t.date_incurred,
      payee: t.payer_or_payee_name || t.description || '—',
      category: t.type,
      amount: amt,
    };
  });

  const costSubtotal = materialSubtotal + laborSubtotal;
  const markedUpTotal = costSubtotal + markupAmount;

  // Outstanding = approved-not-yet-paid accrual rows (drawn down by the sub-invoice RPCs)
  // Split by bucket so firmProjectedTotal uses per-category rates
  let pendingMarkupAmount = 0;
  const outstandingPending = (pendingOutboundResult.data || []).reduce((sum, t) => {
    const amt = Number(t.amount ?? 0);
    pendingMarkupAmount += amt * markupRateForCategory(t.type, { laborPct: laborMarkupPct, materialPct: materialMarkupPct, categoryConfig }) / 100;
    return sum + amt;
  }, 0);

  // paid_to_date = what the client has actually remitted (draw receipts)
  const paidToDate = (inboundResult.data || [])
    .reduce((sum, t) => sum + Number(t.amount ?? 0), 0);

  // potential_additional = submitted-but-unapproved sub invoices (not yet in firm_projected_total)
  const potentialAdditional = (pendingReviewResult.data || [])
    .reduce((sum, si) => sum + Number(si.amount ?? 0), 0);

  const pmFee = Number(j.pm_fee || 0);
  // firm_projected_total = paid cost + outstanding cost + per-category markup on both + pm_fee
  const totalCostBase = costSubtotal + outstandingPending;
  const firmProjectedTotal = totalCostBase + markupAmount + pendingMarkupAmount + pmFee;
  const remainingBalance = firmProjectedTotal - paidToDate;

  return {
    ok: true,
    error: null,
    data: {
      transactions,
      cost_subtotal: costSubtotal,
      material_subtotal: materialSubtotal,
      labor_subtotal: laborSubtotal,
      material_markup_pct: materialMarkupPct,
      labor_markup_pct: laborMarkupPct,
      markup_amount: markupAmount,
      marked_up_total: markedUpTotal,
      authorized_contract: authorizedContract,
      original_signed_contract: originalSignedContract,
      co_total: coTotal,
      current_total: markedUpTotal,
      paid_to_date: paidToDate,
      outstanding_pending: outstandingPending,
      potential_additional: potentialAdditional,
      firm_projected_total: firmProjectedTotal,
      remaining_balance: remainingBalance,
    },
  };
}

// ── ANTI_SURPRISE_ENGINE_ARC helpers ─────────────────────────────────────────

export async function sbLoadPlaybookItemsForWorkType(workType) {
  if (!workType) return { ok: false, error: 'workType required', data: null };
  const { data, error } = await sb
    .from('tenant_playbook_items')
    .select('*')
    .eq('tenant_id', AV_TENANT)
    .eq('work_type', workType)
    .order('sort_order');
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
}

export async function sbLoadPlaybookWorkTypes() {
  const { data, error } = await sb
    .from('tenant_playbook_items')
    .select('work_type')
    .eq('tenant_id', AV_TENANT)
    .order('work_type');
  if (error) return { ok: false, error: error.message, data: null };
  const types = [...new Set((data || []).map(r => r.work_type))];
  return { ok: true, error: null, data: types };
}

export async function sbGetWalkthroughPrepActions(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required', data: null };
  const { data, error } = await sb
    .from('scheduled_actions')
    .select('id, kind, status, fire_at, fired_at, payload, rule_key, created_at')
    .eq('related_job_id', jobId)
    .eq('kind', 'walkthrough_prep')
    .order('fire_at');
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
}

// ── PlaybookChecklist helpers (ANTI_SURPRISE_ENGINE_ARC Phase 1.5) ────────────

// Loads existing job_walkthrough_items for (jobId, workType).
// If none exist, seeds rows from tenant_playbook_items so state persists across opens.
export async function sbLoadOrCreateWalkthroughItems(jobId, workType) {
  if (!jobId || !workType) return { ok: false, error: 'jobId and workType required', data: null };

  const { data: existing, error: loadErr } = await sb
    .from('job_walkthrough_items')
    .select('*')
    .eq('job_id', jobId)
    .eq('work_type', workType)
    .order('sort_order');
  if (loadErr) return { ok: false, error: loadErr.message, data: null };
  if (existing?.length) return { ok: true, error: null, data: existing };

  // Seed from tenant playbook
  const { data: playbook, error: pbErr } = await sb
    .from('tenant_playbook_items')
    .select('id, label, photo_required, must_document, sort_order')
    .eq('tenant_id', AV_TENANT)
    .eq('work_type', workType)
    .order('sort_order');
  if (pbErr) return { ok: false, error: pbErr.message, data: null };
  if (!playbook?.length) return { ok: false, error: `No playbook items for: ${workType}`, data: null };

  const rows = playbook.map(p => ({
    tenant_id:       AV_TENANT,
    job_id:          jobId,
    work_type:       workType,
    playbook_item_id: p.id,
    label:           p.label,
    photo_required:  p.photo_required,
    must_document:   p.must_document,
    sort_order:      p.sort_order,
    status:          'pending',
  }));

  const { data: inserted, error: insertErr } = await sb
    .from('job_walkthrough_items')
    .insert(rows)
    .select();
  if (insertErr) return { ok: false, error: insertErr.message, data: null };
  return { ok: true, error: null, data: (inserted || []).sort((a, b) => a.sort_order - b.sort_order) };
}

export async function sbUpdateWalkthroughItem(itemId, updates) {
  if (!itemId) return { ok: false, error: 'itemId required', data: null };
  const patch = { ...updates, updated_at: new Date().toISOString() };
  if (updates.status && updates.status !== 'pending') {
    patch.completed_at = new Date().toISOString();
    patch.completed_by_id = AV_USER_ID;
  }
  const { data, error } = await sb
    .from('job_walkthrough_items')
    .update(patch)
    .eq('id', itemId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

// Returns all walkthroughs for a job: sources from scheduled_actions (canonical list,
// includes un-started) joined with job_walkthrough_items (progress state, lazily seeded).
// status: 'not_started' | 'in_progress' | 'complete'
export async function sbLoadJobWalkthroughs(jobId) {
  if (!jobId) return { ok: false, error: 'jobId required', data: null };

  const [{ data: actions, error: actErr }, { data: items, error: itemsErr }] = await Promise.all([
    sb.from('scheduled_actions')
      .select('id, payload, status')
      .eq('related_job_id', jobId)
      .eq('kind', 'walkthrough_prep')
      .order('created_at'),
    sb.from('job_walkthrough_items')
      .select('work_type, status, must_document')
      .eq('job_id', jobId),
  ]);
  if (actErr) return { ok: false, error: actErr.message, data: null };
  if (itemsErr) return { ok: false, error: itemsErr.message, data: null };

  // Group items by work_type
  const byWorkType = {};
  for (const item of (items || [])) {
    const k = item.work_type;
    if (!byWorkType[k]) byWorkType[k] = { total: 0, resolved: 0, mustDocPending: 0 };
    byWorkType[k].total++;
    if (item.status !== 'pending') byWorkType[k].resolved++;
    if (item.must_document && item.status === 'pending') byWorkType[k].mustDocPending++;
  }

  const walkthroughs = (actions || []).map(action => {
    const p  = action.payload || {};
    const wt = p.work_type || '';
    const stats = byWorkType[wt];
    const itemCount  = Number(p.item_count || 0);
    const mustDocCount = Number(p.must_doc || 0);

    let wStatus = 'not_started';
    if (stats) {
      if (stats.resolved === stats.total && stats.total > 0 && stats.mustDocPending === 0) {
        wStatus = 'complete';
      } else {
        wStatus = 'in_progress';
      }
    }

    return {
      work_type:      wt,
      action_id:      action.id,
      item_count:     itemCount,
      must_doc_count: mustDocCount,
      resolved:       stats?.resolved || 0,
      total:          stats?.total    || itemCount,
      must_doc_pending: stats?.mustDocPending ?? (wStatus === 'not_started' ? mustDocCount : 0),
      status:         wStatus,
    };
  }).sort((a, b) => a.work_type.localeCompare(b.work_type));

  return { ok: true, error: null, data: walkthroughs };
}

// ── Owner Home Dashboard rollup (ROLE_DASHBOARDS_ARC Phase 1) ────────────────
//
// Single call returning the full Owner Home payload — all KPI tiles, monthly
// revenue series, active jobs, company health counts, and AI insights.
// Role-parameterized design: tenantId + role scope enforced here; other role
// variants will add to this function rather than creating parallel helpers.
// Returns { ok, error, data: { kpis, monthlyRevenue, activeJobs, health, aiInsights } }
//
export async function sbLoadOwnerDashboard(tenantId) {
  if (!tenantId) return { ok: false, error: 'tenantId required', data: null };

  const now     = new Date();
  const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyAgo    = new Date(now - 30 * 86400000).toISOString();
  const sixtyAgo     = new Date(now - 60 * 86400000).toISOString();
  const sixMonthsAgo = new Date(now - 183 * 86400000).toISOString();
  const today        = now.toISOString().slice(0, 10);

  const [
    pipelineRes,
    receivablesRes,
    mtdTxnRes,
    revSeriesRes,
    activeJobsRes,
    allJobsRes,
    behindItemsRes,
    engineTodosRes,
    trendTxnRes,
    openTodosRes,
  ] = await Promise.all([
    sb.from('jobs').select('id, address, status, contract_value, cost_plus, phase_pct_complete')
      .eq('tenant_id', tenantId).in('status', ['contract', 'in_progress', 'final_touches']),

    sb.from('invoices').select('total_amount, amount_paid, status, due_date')
      .eq('tenant_id', tenantId).not('status', 'in', '("paid","void")'),

    sb.from('job_transactions').select('direction, amount, status, type')
      .eq('tenant_id', tenantId).gte('created_at', monthStart),

    sb.from('job_transactions').select('direction, amount, status, created_at')
      .eq('tenant_id', tenantId).gte('created_at', sixMonthsAgo),

    sb.from('jobs').select('id, address, status, phase_pct_complete, contract_value, cost_plus, updated_at')
      .eq('tenant_id', tenantId).in('status', ['contract', 'in_progress', 'final_touches'])
      .order('updated_at', { ascending: false }).limit(10),

    sb.from('jobs').select('id, status').eq('tenant_id', tenantId),

    sb.from('schedule_items').select('job_id').eq('tenant_id', tenantId)
      .eq('status', 'scheduled').lt('scheduled_date', today),

    sb.from('todos').select('id, type, job_id, title, payload')
      .eq('tenant_id', tenantId).eq('status', 'open').eq('source', 'engine')
      .eq('type', 'walkthrough_prep').limit(20),

    sb.from('job_transactions').select('direction, amount, status, created_at')
      .eq('tenant_id', tenantId).gte('created_at', sixtyAgo),

    sb.from('todos').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'open'),
  ]);

  const errs = [pipelineRes, receivablesRes, mtdTxnRes, revSeriesRes, activeJobsRes,
    allJobsRes, behindItemsRes, engineTodosRes, trendTxnRes]
    .map(r => r.error?.message).filter(Boolean);
  if (errs.length) return { ok: false, error: errs[0], data: null };

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const pipelineJobs  = pipelineRes.data || [];
  const pipelineValue = pipelineJobs.reduce((s, j) => s + Number(j.contract_value || 0), 0);

  const invoices      = receivablesRes.data || [];
  const openReceivables = invoices.reduce((s, inv) =>
    s + Math.max(0, Number(inv.total_amount || 0) - Number(inv.amount_paid || 0)), 0);

  const mtdTxns      = mtdTxnRes.data || [];
  const collectedMtd = mtdTxns.filter(t => t.direction === 'in' && t.status === 'paid')
    .reduce((s, t) => s + Number(t.amount), 0);
  const costsMtd     = mtdTxns.filter(t => t.direction === 'out')
    .reduce((s, t) => s + Number(t.amount), 0);
  const grossProfitMtd = collectedMtd - costsMtd;

  // ── Monthly revenue series ────────────────────────────────────────────────
  const revMap = {};
  for (const t of (revSeriesRes.data || [])) {
    const d   = new Date(t.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!revMap[key]) revMap[key] = { month: key, revenue: 0, costs: 0 };
    if (t.direction === 'in' && t.status === 'paid') revMap[key].revenue += Number(t.amount);
    if (t.direction === 'out') revMap[key].costs += Number(t.amount);
  }
  const monthlyRevenue = Object.values(revMap).sort((a, b) => a.month.localeCompare(b.month));

  // ── 30-day trend (collected only — point-in-time KPIs don't have trend) ──
  const trendTxns   = trendTxnRes.data || [];
  const thirtyAgoMs = new Date(now - 30 * 86400000).getTime();
  const last30 = trendTxns.filter(t => t.direction === 'in' && t.status === 'paid' && new Date(t.created_at) >= thirtyAgoMs)
    .reduce((s, t) => s + Number(t.amount), 0);
  const prior30 = trendTxns.filter(t => t.direction === 'in' && t.status === 'paid' && new Date(t.created_at) < thirtyAgoMs)
    .reduce((s, t) => s + Number(t.amount), 0);
  const collectedTrend = prior30 > 0 ? Math.round(((last30 - prior30) / prior30) * 100) : null;

  // ── Company health ────────────────────────────────────────────────────────
  const allJobs      = allJobsRes.data || [];
  const activeProjects = allJobs.filter(j => ['contract', 'in_progress', 'final_touches'].includes(j.status)).length;
  const newLeads     = allJobs.filter(j => j.status === 'lead').length;
  const estimates    = allJobs.filter(j => j.status === 'proposal').length;

  const activeJobIds = new Set(pipelineJobs.map(j => j.id));
  const behindJobIds = new Set((behindItemsRes.data || []).filter(i => activeJobIds.has(i.job_id)).map(i => i.job_id));
  const jobsBehind   = behindJobIds.size;

  // ── AI insights ───────────────────────────────────────────────────────────
  const engineTodos     = engineTodosRes.data || [];
  const walkthroughsPending = engineTodos.filter(t => t.type === 'walkthrough_prep').length;

  // ── Thumbnails for active jobs (first photo per job) ─────────────────────
  const jobIds = (activeJobsRes.data || []).map(j => j.id);
  let photoMap = {};
  if (jobIds.length > 0) {
    const { data: photos } = await sb
      .from('photos')
      .select('job_id, url')
      .eq('tenant_id', tenantId)
      .in('job_id', jobIds)
      .order('created_at', { ascending: true });
    (photos || []).forEach(p => {
      if (!photoMap[p.job_id] && p.url) photoMap[p.job_id] = p.url;
    });
  }

  const activeJobsWithThumbs = (activeJobsRes.data || []).map(j => ({
    ...j,
    thumbnail_url: photoMap[j.id] || null,
  }));

  return {
    ok: true,
    error: null,
    data: {
      kpis: { pipelineValue, openReceivables, collectedMtd, grossProfitMtd, collectedTrend },
      monthlyRevenue,
      activeJobs: activeJobsWithThumbs,
      health: { activeProjects, newLeads, estimates, jobsBehind },
      aiInsights: {
        walkthroughsPending,
        jobsBehind,
        openTodos: openTodosRes.count ?? 0,
        walkthroughTodos: (engineTodosRes.data || []).map(t => ({
          id: t.id,
          job_id: t.job_id,
          work_type: t.payload?.work_type || t.title?.split(' walkthrough')[0] || 'Walkthrough',
          title: t.title,
        })),
      },
    },
  };
}

// ── Project Detail enrichment (ROLE_DASHBOARDS_ARC) ─────────────────────────
// Loads phases, financial KPIs, next milestone, thumbnail, and PM contact for
// the ProjectDetailHeader. Self-contained; caller passes jobId + assignedPmId.
// Returns { ok, error, data: { phases, paid_to_date, next_milestone, thumbnail_url, pm_profile } }
export async function sbLoadProjectDetail(jobId, assignedPmId) {
  if (!jobId) return { ok: false, error: 'jobId required', data: null };
  try {
    const today = new Date().toISOString().slice(0, 10);
    const baseQueries = [
      sb.from('job_phases').select('id,phase_name,phase_order,status').eq('job_id', jobId).order('phase_order', { ascending: true }),
      sb.from('job_transactions').select('direction,status,amount').eq('job_id', jobId),
      sb.from('schedule_items').select('id,title,type,scheduled_date,status,is_milestone').eq('job_id', jobId).neq('status', 'cancelled').order('scheduled_date', { ascending: true }),
      sb.from('photos').select('url').eq('job_id', jobId).order('created_at', { ascending: true }).limit(1),
    ];
    const [phasesRes, txnsRes, schedRes, photoRes, pmRes] = await Promise.all([
      ...baseQueries,
      assignedPmId
        ? sb.from('profiles').select('id,full_name,email,phone').eq('id', assignedPmId).single()
        : Promise.resolve({ data: null }),
    ]);

    const paid_to_date = (txnsRes.data || [])
      .filter(t => t.direction === 'in' && t.status === 'paid')
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    // Next milestone: first non-complete inspection or milestone item, prefer future dates
    const milestones = (schedRes.data || []).filter(s =>
      s.status !== 'complete' && (s.is_milestone || s.type === 'inspection' || s.type === 'milestone')
    );
    const nextMilestone = milestones.find(s => s.scheduled_date >= today) || milestones[0] || null;

    return {
      ok: true, error: null,
      data: {
        phases: phasesRes.data || [],
        paid_to_date,
        next_milestone: nextMilestone,
        thumbnail_url: photoRes.data?.[0]?.url || null,
        pm_profile: pmRes.data || null,
      },
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e), data: null };
  }
}

// ── Projects List (ROLE_DASHBOARDS_ARC) ─────────────────────────────────────
// Loads all jobs for tenant with enriched fields for the Projects list view.
// Returns { ok, error, data: Job[] } where each job has:
//   open_todos (count), thumbnail_url (first photo or null), pm_name (string or null)
export async function sbLoadProjectsList(tenantId) {
  if (!tenantId) return { ok: false, error: 'tenantId required', data: null };
  try {
    const [jobsRes, todosRes] = await Promise.all([
      sb.from('jobs')
        .select('id, address, status, contract_value, phase_pct_complete, created_at, assigned_pm, assigned_rep, cost_plus, co_total')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
      sb.from('todos')
        .select('job_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
        .not('job_id', 'is', null),
    ]);
    if (jobsRes.error) return { ok: false, error: jobsRes.error.message, data: null };

    const jobs = jobsRes.data || [];
    const jobIds = jobs.map(j => j.id);

    // Open todo counts per job
    const todoMap = {};
    (todosRes.data || []).forEach(t => {
      todoMap[t.job_id] = (todoMap[t.job_id] || 0) + 1;
    });

    // First photo per job (job-photos bucket is public — url is already full URL)
    let photoMap = {};
    if (jobIds.length > 0) {
      const { data: photos } = await sb
        .from('photos')
        .select('job_id, url')
        .eq('tenant_id', tenantId)
        .in('job_id', jobIds)
        .order('created_at', { ascending: true });
      (photos || []).forEach(p => {
        if (!photoMap[p.job_id] && p.url) photoMap[p.job_id] = p.url;
      });
    }

    // PM names from profiles
    const pmIds = [...new Set(jobs.map(j => j.assigned_pm).filter(Boolean))];
    let pmMap = {};
    if (pmIds.length > 0) {
      const { data: pms } = await sb.from('profiles').select('id, full_name').in('id', pmIds);
      (pms || []).forEach(pm => { pmMap[pm.id] = pm.full_name; });
    }

    return {
      ok: true,
      error: null,
      data: jobs.map(j => ({
        ...j,
        open_todos: todoMap[j.id] || 0,
        thumbnail_url: photoMap[j.id] || null,
        pm_name: j.assigned_pm ? (pmMap[j.assigned_pm] || null) : null,
      })),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e), data: null };
  }
}

// Returns job_files rows attached to the given walkthrough item IDs.
export async function sbLoadWalkthroughItemPhotos(itemIds) {
  if (!itemIds?.length) return { ok: true, error: null, data: [] };
  const { data, error } = await sb
    .from('job_files')
    .select('id, related_entity_id, name, mime_type, created_at')
    .eq('related_entity_type', 'job_walkthrough_item')
    .in('related_entity_id', itemIds)
    .eq('lifecycle_status', 'active')
    .order('created_at');
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
}
