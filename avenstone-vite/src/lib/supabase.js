import { createClient } from '@supabase/supabase-js';

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

export const sbPhoto = async (jid, file) => {
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${jid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: ue } = await sb.storage.from('job-photos').upload(path, file, { contentType: file.type, upsert: false });
    if (ue) { console.error(ue); return null; }
    const { data: ud } = sb.storage.from('job-photos').getPublicUrl(path);
    const url = ud.publicUrl;
    const row = { job_id: jid, tenant_id: AV_TENANT, type: file.type.startsWith('video') ? 'video' : 'photo', url, name: file.name };
    const { data: inserted } = await sb.from('photos').insert(row).select('id').single();
    return { id: inserted?.id, type: row.type, url, name: file.name };
  } catch (e) { console.error(e); return null; }
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
export const sbLoadJobSubs = async jid => {
  const { data } = await sb.from('job_subs').select('*,profile:profiles(id,full_name,email,trade,phone)').eq('job_id', jid);
  return data || [];
};
export const sbAssignSub = async (jid, subId, jobAddress = '') => {
  const { data, error } = await sb.from('job_subs').insert({ tenant_id: AV_TENANT, job_id: jid, sub_id: subId }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'sub_assign', payload: { subId }, jobId: jid, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  sbNotify('assigned_to_job', 'Sub Assigned', `A sub was assigned to ${jobAddress || 'a job'}`, jid, subId).catch(() => {});
  return { ok: true, error: null, data };
};
export const sbUnassignSub = async (jid, subId) => {
  const { error } = await sb.from('job_subs').delete().eq('job_id', jid).eq('sub_id', subId);
  if (error) {
    captureFailedIntent({ kind: 'sub_unassign', payload: { subId }, jobId: jid, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
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

// ─── Quote Requests ───────────────────────────────────────────────────────────
export const sbLoadQuoteRequests = async jid => {
  const { data } = await sb.from('quote_requests').select('*,invitees:itb_invitees(id,email,sub_id,profile:profiles(full_name,trade)),responses:bid_responses(*)').eq('job_id', jid).order('created_at', { ascending: false });
  return data || [];
};
export const sbCreateQuoteRequest = async itb => {
  const { data, error } = await sb.from('quote_requests').insert({ ...itb, tenant_id: AV_TENANT, created_by: AV_USER_ID }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'quote_request_save', payload: {}, jobId: itb.job_id || null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbUpdateQuoteRequest = async (id, ch) => {
  const { data, error } = await sb.from('quote_requests').update(ch).eq('id', id).select().single();
  if (error) {
    captureFailedIntent({ kind: 'quote_request_save', payload: { id }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
// Backward-compat aliases
export const sbLoadITBs = sbLoadQuoteRequests;
export const sbCreateITB = sbCreateQuoteRequest;
export const sbUpdateITB = sbUpdateQuoteRequest;
export const sbSendBidInvite = async (itb, email, name) => {
  const res = await fetch(BID_INVITE_URL, { method: 'POST', headers: authHeader(), body: JSON.stringify({ email, sub_name: name || '', job_address: itb._jobAddress || '', trade: itb.trade || '', description: itb.description || '', budget_range: itb.budget_range || '', due_date: itb.due_date || '', itb_id: itb.id, tenant_id: AV_TENANT }) });
  return res.json();
};
const bidQuotePath = url => {
  if (!url) return null;
  if (url.startsWith('http')) return url.split('/bid-quotes/')[1] || null;
  return url;
};
export const sbLoadSubITBs = async subId => {
  const { data } = await sb.from('itb_invitees').select('itb:quote_requests(*,responses:bid_responses(*),job:jobs(id,address,status))').eq('sub_id', subId);
  const itbs = (data || []).map(d => d.itb).filter(Boolean);
  await Promise.all(itbs.flatMap(itb => (itb.responses || []).map(async r => {
    if (r.quote_file_url) {
      const path = bidQuotePath(r.quote_file_url);
      if (path) {
        const { data: s } = await sb.storage.from('bid-quotes').createSignedUrl(path, 3600);
        if (s?.signedUrl) r.quote_file_url = s.signedUrl;
      }
    }
  })));
  return itbs;
};
export const sbSubmitBid = async (itbId, amount, notes, quoteFile) => {
  let quote_file_url = null, quote_file_name = null, quote_file_size = null;
  if (quoteFile) {
    const path = `${AV_USER_ID}/${itbId}/${quoteFile.name}`;
    const { data: up } = await sb.storage.from('bid-quotes').upload(path, quoteFile, { upsert: true });
    if (up) {
      quote_file_url = path;
      quote_file_name = quoteFile.name;
      quote_file_size = quoteFile.size;
    }
  }
  const { data, error } = await sb.from('bid_responses').upsert({ tenant_id: AV_TENANT, invitation_id: itbId, sub_id: AV_USER_ID, amount: Number(amount) || null, notes: notes || null, quote_file_url, quote_file_name, quote_file_size, status: 'submitted', submitted_at: new Date().toISOString() }, { onConflict: 'invitation_id,sub_id' }).select().single();
  if (error) {
    captureFailedIntent({ kind: 'bid_submit', payload: { itbId }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message, data: null };
  }
  return { ok: true, error: null, data };
};
export const sbUpdateBidStatus = async (id, status) => {
  const { error } = await sb.from('bid_responses').update({ status }).eq('id', id);
  if (error) {
    captureFailedIntent({ kind: 'bid_status_update', payload: { id, status }, jobId: null, message: error.message, resumable: false }).catch(() => {});
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
};

export const sbLoadSubsTabData = async (jobId) => {
  const [jobSubsRes, quoteReqRes] = await Promise.all([
    sb.from('job_subs').select('*,profile:profiles(id,full_name,email,trade,phone)').eq('job_id', jobId),
    sb.from('quote_requests').select('*,invitees:itb_invitees(id,email,sub_id,profile:profiles(full_name,trade)),responses:bid_responses(*)').eq('job_id', jobId).order('created_at', { ascending: false }),
  ]);
  return {
    jobSubs: jobSubsRes.data || [],
    quoteRequests: quoteReqRes.data || [],
  };
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
  if (!error && data?.type === 'sub_payout' && data?.payer_or_payee_id) {
    sbAutoEnrollSubInSequences(data.payer_or_payee_id, 'payment_made', AV_TENANT).catch(console.error);
  }
  return { data, error };
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

// ─── Todos ────────────────────────────────────────────────────────────────────
export const sbLoadMyTodos = async () => {
  const { data, error } = await sb.from('todos')
    .select('*, job:jobs(id, address, client_name)')
    .eq('target_user_id', AV_USER_ID)
    .in('status', ['pending', 'snoozed'])
    .order('severity', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) console.error('sbLoadMyTodos', error);
  return data || [];
};
export const sbCountPendingTodos = async () => {
  const { count, error } = await sb.from('todos')
    .select('id', { count: 'exact', head: true })
    .eq('target_user_id', AV_USER_ID)
    .eq('status', 'pending')
    .or('snoozed_until.is.null,snoozed_until.lt.' + new Date().toISOString());
  if (error) console.error('sbCountPendingTodos', error);
  return count || 0;
};
export const sbCreateTodo = async ({ targetUserId, title, body, type, severity = 'medium', jobId = null, sourceTable = null, sourceId = null, dueAt = null }) => {
  const { data, error } = await sb.from('todos').insert({
    tenant_id: AV_TENANT, target_user_id: targetUserId,
    title, body, type, severity, job_id: jobId,
    source_table: sourceTable, source_id: sourceId, due_at: dueAt,
  }).select().single();
  if (error) console.error('sbCreateTodo', error);
  return data;
};
export const sbSnoozeTodo = async (id, snoozeHours) => {
  const snoozedUntil = new Date(Date.now() + snoozeHours * 60 * 60 * 1000).toISOString();
  const { error } = await sb.from('todos').update({ status: 'snoozed', snoozed_until: snoozedUntil }).eq('id', id);
  if (error) console.error('sbSnoozeTodo', error);
};
export const sbDismissTodo = async (id) => {
  const { error } = await sb.from('todos').update({ status: 'dismissed', dismissed_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('sbDismissTodo', error);
};
export const sbCompleteTodo = async (id) => {
  const { error } = await sb.from('todos').update({ status: 'done', completed_at: new Date().toISOString(), completed_by: AV_USER_ID }).eq('id', id);
  if (error) console.error('sbCompleteTodo', error);
};
export const sbResolveTodosBySource = async (sourceTable, sourceId) => {
  const { error } = await sb.from('todos')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('source_table', sourceTable).eq('source_id', sourceId).eq('status', 'pending');
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
};
export const captureFailedIntent = async ({ kind, payload = {}, jobId = null, message = '', resumable = true }) => {
  try {
    if (!VALID_KINDS.has(kind)) return { ok: false, error: 'invalid kind' };
    const kindLabel = KIND_LABEL[kind] || kind;
    const { data, error } = await sb.from('todos').insert({
      tenant_id: AV_TENANT,
      target_user_id: AV_USER_ID,
      title: `Resume: ${kindLabel}`,
      body: message || 'Save failed — tap Resume to retry.',
      type: 'failed_intent',
      severity: 'medium',
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
    .select('id, payload, target_user_id')
    .eq('type', 'failed_intent')
    .gte('created_at', since);
  if (error) return { total: 0, byKind: {}, byUser: {} };
  const byKind = {};
  const byUser = {};
  (data || []).forEach(t => {
    const k = t.payload?.kind || 'unknown';
    byKind[k] = (byKind[k] || 0) + 1;
    byUser[t.target_user_id] = (byUser[t.target_user_id] || 0) + 1;
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

export const sbLoadPricingApprovals = (tenant_id) =>
  sb.from('sub_pricing_changes').select('*, profiles(full_name)').eq('tenant_id', tenant_id).eq('status', 'pending_owner').order('created_at', { ascending: false }).then(r => r.data || []);

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

// ─── Material Orders ──────────────────────────────────────────────────────────
export const sbLoadMaterialOrders = async (jobId) => {
  const { data, error } = await sb.from('material_orders')
    .select('*, estimate_line_item:estimate_line_items(*)')
    .eq('job_id', jobId)
    .order('expected_at', { nullsFirst: false });
  if (error) console.error('sbLoadMaterialOrders', error);
  return data || [];
};
export const sbCreateMaterialOrder = async (order) => {
  const { data, error } = await sb.from('material_orders').insert({
    tenant_id: AV_TENANT,
    created_by: AV_USER_ID,
    ...order,
  }).select().single();
  if (error) console.error('sbCreateMaterialOrder', error);
  return data;
};
export const sbUpdateMaterialOrder = async (id, updates) => {
  const { data, error } = await sb.from('material_orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) console.error('sbUpdateMaterialOrder', error);
  return data;
};

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
      .select('type, job_id, tenant_id')
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
    return { ok: true, error: null };
  } catch (e) {
    captureFailedIntent({ kind: 'schedule_item_delete', payload: { id }, jobId: null, message: e.message }).catch(() => {});
    return { ok: false, error: e.message };
  }
};

export const sbLoadScheduleItemsForSub = async (subId) => {
  try {
    // Get all job_ids this sub is assigned to
    const { data: assignments } = await sb
      .from('job_subs')
      .select('job_id')
      .eq('sub_id', subId);
    const jobIds = (assignments || []).map(a => a.job_id);

    // Items directly assigned to the sub OR on any job the sub is on
    let q = sb
      .from('schedule_items')
      .select('*, assigned_sub:profiles!assigned_sub_id(id, full_name)')
      .neq('status', 'cancelled')
      .order('scheduled_date', { nullsFirst: false });

    if (jobIds.length > 0) {
      q = q.or(`assigned_sub_id.eq.${subId},job_id.in.(${jobIds.join(',')})`);
    } else {
      q = q.eq('assigned_sub_id', subId);
    }

    const { data, error } = await q;
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
  if (item.assigned_sub_id) ids.add(item.assigned_sub_id);
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
  return { ok: true, error: null, data };
};

export const sbLoadEngagementsForJob = async jobId => {
  if (!jobId) return { ok: false, error: 'jobId is required', data: null };
  const { data, error } = await sb
    .from('job_sub_engagements')
    .select('*, sub:profiles!sub_id(id, full_name, email, phone), invited_by:profiles!invited_by_id(id, full_name)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
};

export const sbLoadEngagementsForSub = async subId => {
  if (!subId) return { ok: false, error: 'subId is required', data: null };
  const { data, error } = await sb
    .from('job_sub_engagements')
    .select('*, job:jobs!job_id(id, address, status)')
    .eq('sub_id', subId)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
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
