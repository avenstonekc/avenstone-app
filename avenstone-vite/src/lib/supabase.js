import { createClient } from '@supabase/supabase-js';
import { runGatesForTransition, getNextPhase, PHASE_LABELS } from './phaseGates.js';
import { runTodoEngine } from './todoEngine.js';
import { checkAndCreateSubStart } from './scheduleAutoCreate.js';
import { checkAndAutoInvoice } from './autoInvoice.js';
import { countPhotosForEntity } from './photoGate.js';
import { getTemplateItems } from './siteVisitTemplates.js';
import { captureTradeActualsForJob } from './tradeActuals.js';

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
export const CLIENT_LINK_URL   = `${FN}/send-client-link`;
export const BID_INVITE_URL    = `${FN}/send-bid-invite`;
export const PAYMENT_LINK_URL  = `${FN}/create-payment-link`;
export const AI_ESTIMATOR_URL  = `${FN}/ai-estimator`;
export const CONTRACT_EMAIL_URL = `${FN}/send-contract-email`;
export const NOTIFY_REALTOR_URL = `${FN}/notify-realtor`;
export const NOTIFY_EMAIL_URL   = `${FN}/notify-email`;
export const authHeader = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` });
export const AI_PM_NIGHTLY_URL          = `${FN}/ai-pm-nightly`;
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
      const [{ data: ph }, { data: nt }, { data: co }] = await Promise.all([
        sb.from('photos').select('*').eq('job_id', j.id).order('created_at', { ascending: true }),
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
        client_user_id: j.client_user_id || null,
        photos: (ph || []).map(p => ({ id: p.id, type: p.type, url: p.url, name: p.name, label: p.label || null })),
        activity: nt || [], change_orders: co || [],
      };
    }));
  } catch (e) { console.error(e); return null; }
};

export const sbUpd = async (id, ch) => {
  try {
    const ok = ['status','scope','sqft','client_name','client_phone','client_email','assigned_rep','assigned_subs','contract_value','co_total','target_completion','contract_signed','contract_signed_at','client_notify','referring_realtor_name','referring_realtor_phone','referring_realtor_email','cost_plus','default_markup_pct'];
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

export const sbPhoto = async (jid, file, entityType, entityId) => {
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${jid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: ue } = await sb.storage.from('job-photos').upload(path, file, { contentType: file.type, upsert: false });
    if (ue) { console.error('[sbPhoto] upload failed:', ue.message); return { ok: false, error: ue.message, data: null }; }
    const { data: ud } = sb.storage.from('job-photos').getPublicUrl(path);
    const url = ud.publicUrl;
    const row = {
      job_id: jid, tenant_id: AV_TENANT,
      type: file.type.startsWith('video') ? 'video' : 'photo',
      url, name: file.name,
      ...(entityType ? { related_entity_type: entityType } : {}),
      ...(entityId   ? { related_entity_id:   entityId }   : {}),
    };
    const { data: inserted, error: ie } = await sb.from('photos').insert(row).select('id').single();
    if (ie) { console.error('[sbPhoto] insert failed:', ie.message); return { ok: false, error: ie.message, data: null }; }
    return { ok: true, error: null, data: { id: inserted?.id, type: row.type, url, name: file.name } };
  } catch (e) {
    console.error('[sbPhoto]', e);
    return { ok: false, error: e.message || 'Photo save failed', data: null };
  }
};

export const sbCountPhotosForEntity = async (entityType, entityId) => {
  return countPhotosForEntity(sb, entityType, entityId);
};

export const sbLoadPhotosForEntity = async (entityType, entityId) => {
  const { data } = await sb.from('photos')
    .select('id, url, name, type, created_at')
    .eq('related_entity_type', entityType)
    .eq('related_entity_id', entityId)
    .order('created_at', { ascending: true });
  return data || [];
};

export const sbLabelPhoto = async (jobId, photoId, label) => {
  try {
    if (label) await sb.from('photos').update({ label: null }).eq('job_id', jobId).eq('label', label).neq('id', photoId);
    const { error } = await sb.from('photos').update({ label: label || null }).eq('id', photoId);
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
export const getJobCoTotal = (job) => Number(job?.co_total || 0);

// ─── Phases ───────────────────────────────────────────────────────────────────
export const DEFAULT_PHASES = ['Demo','Framing','Rough MEP','Insulation','Drywall','Paint','Flooring','Trim','Fixtures','Punch List'];
export const sbLoadPhases = async jid => {
  const { data } = await sb.from('job_phases').select('*').eq('job_id', jid).order('phase_order', { ascending: true });
  return data || [];
};
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

export const sbLoadDocs = async jid => {
  const { data } = await sb.from('job_documents').select('*').eq('job_id', jid).order('created_at', { ascending: false });
  if (!data || !data.length) return [];
  return Promise.all(data.map(async doc => {
    const signed_url = await docSignedUrl(docPathFromUrl(doc.file_url));
    return { ...doc, signed_url };
  }));
};
export const sbUploadDoc = async (jid, file, fileType) => {
  try {
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${jid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: ue } = await sb.storage.from('job-documents').upload(path, file, { contentType: file.type, upsert: false });
    if (ue) { console.error('Doc upload error:', ue); return { error: ue.message || 'Upload failed' }; }
    const { data: existing } = await sb.from('job_documents').select('version').eq('job_id', jid).eq('name', file.name).order('version', { ascending: false }).limit(1);
    const version = (existing && existing.length ? existing[0].version : 0) + 1;
    const row = { job_id: jid, tenant_id: AV_TENANT, name: file.name, file_url: path, file_type: fileType || 'other', version, client_visible: false };
    const { data: inserted, error: ie } = await sb.from('job_documents').insert(row).select().single();
    if (ie) return { error: ie.message || 'Save failed' };
    const signed_url = await docSignedUrl(path);
    return { doc: { ...inserted, signed_url } };
  } catch (e) { return { error: e.message || 'Unknown error' }; }
};
export const sbDelDoc = async doc => {
  try {
    const path = docPathFromUrl(doc.file_url);
    if (path) await sb.storage.from('job-documents').remove([path]);
    const { error } = await sb.from('job_documents').delete().eq('id', doc.id);
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
export const sbToggleDocVisible = async (id, val) => {
  try {
    const { error } = await sb.from('job_documents').update({ client_visible: val }).eq('id', id);
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
  if (!ids.length) return;
  await sb.from('notifications').update({ read: true }).in('id', ids).catch(err => console.error('[sbMarkNotifsRead]', err));
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


// ─── Client link ──────────────────────────────────────────────────────────────
export const sbSendClientLink = async (email, clientName, jobAddress, jobId) => {
  const res = await fetch(CLIENT_LINK_URL, { method: 'POST', headers: authHeader(), body: JSON.stringify({ email, client_name: clientName, job_address: jobAddress, job_id: jobId, tenant_id: AV_TENANT }) });
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
export const sbLoadJobDocuments = async (jobId) => {
  const { data } = await sb.from('job_documents').select('*').eq('job_id', jobId).order('created_at', { ascending: false });
  return data || [];
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
      submitted_by_id: AV_USER_ID, submitted_by_role: 'sub',
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
  const { data } = await sb.from('daily_logs').select('*,author:profiles(full_name,role)').eq('job_id', jid).order('log_date', { ascending: false });
  return data || [];
};
export const sbSubmitDailyLog = async log => {
  const { data, error } = await sb.from('daily_logs').insert({ ...log, tenant_id: AV_TENANT, author_id: AV_USER_ID }).select('*,author:profiles(full_name,role)').single();
  if (error) {
    captureFailedIntent({ kind: 'daily_log_save', payload: {}, jobId: log.job_id || null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
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
  q = q.order('date_incurred', { ascending: false });
  const { data } = await q;
  return data || [];
};
export const sbLoadJobFinancialSummary = async (jobId, { contractValue = 0, coTotal = 0 } = {}) => {
  const { data } = await sb.from('job_transactions').select('direction,amount,status,lien_waiver_required,lien_waiver_url').eq('job_id', jobId).neq('status', 'void');
  if (!data) return { total_in: 0, total_out: 0, outstanding: 0, lien_waivers_missing: 0, contract_total: 0, client_owes: 0 };
  const total_in = data.filter(t => t.direction === 'in' && t.status === 'paid').reduce((s, t) => s + Number(t.amount || 0), 0);
  const total_out = data.filter(t => t.direction === 'out' && t.status === 'paid').reduce((s, t) => s + Number(t.amount || 0), 0);
  const outstanding = data.filter(t => t.direction === 'in' && t.status === 'pending').reduce((s, t) => s + Number(t.amount || 0), 0);
  const lien_waivers_missing = data.filter(t => t.lien_waiver_required && !t.lien_waiver_url).length;
  const contract_total = Number(contractValue || 0) + Number(coTotal || 0);
  const client_owes = contract_total - total_in;
  return { total_in, total_out, outstanding, lien_waivers_missing, contract_total, client_owes };
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
export const sbSaveEstimateLineItems = async (jobId, estimateId, items) => {
  await sb.from('estimate_line_items').delete().eq('job_id', jobId);
  if (!items || !items.length) return { error: null };
  const rows = items.map((it, i) => ({
    tenant_id:    AV_TENANT,
    job_id:       jobId,
    estimate_id:  estimateId || null,
    phase:        it.phase        || null,
    category:     it.category     || null,
    trade:        it.trade        || null,
    description:  it.description  || it.trade || 'Line item',
    quantity:     Number(it.quantity   ?? it.qty ?? 1),
    unit:         it.unit         || null,
    unit_cost:    Number(it.unit_cost  ?? it.amount ?? 0),
    markup_pct:   Number(it.markup_pct ?? 0),
    display_order: i,
    notes:        it.notes        || null,
    created_by:   AV_USER_ID,
  }));
  const { error } = await sb.from('estimate_line_items').insert(rows);
  return { error };
};
export const sbLoadEstimateLineItems = async (jobId) => {
  const { data } = await sb.from('estimate_line_items').select('*').eq('job_id', jobId).order('display_order');
  return data || [];
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
      multiplier:        1,
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
  return { ok: true, error: null, data };
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
  const table = isJob ? 'job_lidar_scans' : 'contact_lidar_scans';
  const { error } = await sb.from(table).update({ edit_overrides: editOverrides }).eq('id', scanId);
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
  create_user_todo: 'Create Todo', update_todo: 'Update Todo',
};
export const captureFailedIntent = async ({ kind, payload = {}, jobId = null, message = '', resumable = true }) => {
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
    }).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, todoId: data.id };
  } catch (e) { return { ok: false, error: e.message }; }
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
      .order('created_at');
    if (error) throw error;
    return { ok: true, error: null, data: data || [] };
  } catch (e) {
    return { ok: false, error: e.message, data: [] };
  }
};

export const sbCreateScheduleItem = async (payload) => {
  try {
    const row = {
      ...payload,
      tenant_id:           AV_TENANT,
      created_by_id:       AV_USER_ID,
      // coalesce empty strings → null at write boundary (sweep 2 pattern)
      scheduled_date:      payload.scheduled_date      || null,
      scheduled_end_date:  payload.scheduled_end_date  || null,
      assigned_sub_id:     payload.assigned_sub_id     || null,
      trade:               payload.trade               || null,
    };
    const { data, error } = await sb
      .from('schedule_items')
      .insert(row)
      .select('*, assigned_sub:profiles!assigned_sub_id(id, full_name)')
      .single();
    if (error) throw error;
    if (payload.type === 'sub_start') {
      await derivePhaseStatus(payload.job_id, AV_TENANT).catch(() => {});
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
      scheduled_end_date: patch.scheduled_end_date !== undefined ? (patch.scheduled_end_date || null) : undefined,
      assigned_sub_id:    patch.assigned_sub_id    !== undefined ? (patch.assigned_sub_id    || null) : undefined,
      trade:              patch.trade              !== undefined ? (patch.trade              || null) : undefined,
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

  const updates = [];
  for (const phase of phases) {
    // Never decrement from complete
    if (phase.status === 'complete') continue;

    const trades = phaseToTrades[phase.phase_name];
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
  if (job?.assigned_pm_id) ids.add(job.assigned_pm_id);
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
  if (Number(invoice.amount_paid) > 0.01) {
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

  if (invoice.draw_id) {
    const { data: draw } = await sb
      .from('draw_schedules')
      .select('target_amount, invoiced_amount, paid_amount, status')
      .eq('id', invoice.draw_id)
      .single();
    if (draw) {
      const newDrawPaid = Number(draw.paid_amount) + paidAmount;
      const drawPatch = {
        paid_amount: newDrawPaid,
        updated_at:  new Date().toISOString(),
      };
      if (
        newDrawPaid >= Number(draw.target_amount) - 0.01 &&
        Number(draw.invoiced_amount) >= Number(draw.target_amount) - 0.01
      ) {
        drawPatch.status = 'paid';
      }
      await sb.from('draw_schedules').update(drawPatch).eq('id', invoice.draw_id);
    }
  }

  return { invoice: { ...invoice, ...invPatch }, transaction: tx };
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

  const { data: jobRow } = await sb.from('jobs').select('address').eq('id', jobId).single().catch(() => ({ data: null }));
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
