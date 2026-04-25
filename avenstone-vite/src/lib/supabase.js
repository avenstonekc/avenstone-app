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
export const AI_INTAKE_URL              = `${FN}/ai-intake`;
export const AI_PM_NIGHTLY_URL          = `${FN}/ai-pm-nightly`;
export const AI_PM_URL                  = `${FN}/ai-project-manager`;
export const AI_COMPANION_URL           = `${FN}/ai-companion`;
export const AI_HOME_URL                = `${FN}/ai-home-companion`;
export const PROCESS_TRANSCRIPT_URL     = `${FN}/process-transcript`;
export const GENERATE_ESTIMATE_URL      = `${FN}/generate-estimate-from-session`;
export const AI_ERROR_LOGGER_URL        = `${FN}/ai-error-logger`;
export const AI_FIELD_AGENT_URL         = `${FN}/ai-field-agent`;
export const MEASURE_GUIDE_URL          = `${FN}/measure-guide`;
export const AI_SUB_ONBOARD_URL         = `${FN}/ai-sub-onboard`;
export const AI_SUB_PRICING_URL         = `${FN}/ai-sub-pricing`;
export const AI_MASTER_URL              = `${FN}/ai-master-agent`;
export const ADDRESS_AUTOCOMPLETE_URL   = `${FN}/address-autocomplete`;
export const GET_CONTRACTOR_PROFILE_URL = `${FN}/get-contractor-profile`;
export const GET_JOB_STATUS_URL         = `${FN}/get-job-status`;

// ─── Jobs ─────────────────────────────────────────────────────────────────────
export const sbSave = async j => {
  try {
    await sb.from('jobs').upsert({
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
  } catch (e) { console.error(e); }
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
  } catch (e) {}
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
  } catch (e) {}
};

export const sbNote = async (jid, content, author) => {
  try {
    const { data, error } = await sb.from('job_notes').insert({ job_id: jid, tenant_id: AV_TENANT, content, author, created_at: new Date().toISOString() }).select().single();
    return error ? null : data;
  } catch (e) { return null; }
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
    await sb.from('photos').update({ label: label || null }).eq('id', photoId);
    return true;
  } catch (e) { console.error(e); return false; }
};

export const sbCO = async co => {
  try {
    const { data, error } = await sb.from('change_orders').insert({ ...co, tenant_id: AV_TENANT }).select().single();
    return error ? null : data;
  } catch (e) { return null; }
};
export const sbUpdCO = async (id, ch) => { try { await sb.from('change_orders').update(ch).eq('id', id); } catch (e) {} };
export const getJobCoTotal = (job) => Number(job?.co_total || 0);

// ─── Phases ───────────────────────────────────────────────────────────────────
export const DEFAULT_PHASES = ['Demo','Framing','Rough MEP','Insulation','Drywall','Paint','Flooring','Trim','Fixtures','Punch List'];
export const sbLoadPhases = async jid => {
  const { data } = await sb.from('job_phases').select('*').eq('job_id', jid).order('phase_order', { ascending: true });
  return data || [];
};
export const sbSavePhase = async ph => {
  const { data, error } = await sb.from('job_phases').upsert(ph).select().single();
  return error ? null : data;
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
    await sb.from('job_documents').delete().eq('id', doc.id);
  } catch (e) { console.error(e); }
};
export const sbToggleDocVisible = async (id, val) => { await sb.from('job_documents').update({ client_visible: val }).eq('id', id); };

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
  return { data, error };
};
export const sbUpdCostItem = async (id, ch) => {
  const { data, error } = await sb.from('job_cost_items').update(ch).eq('id', id).select().single();
  return { data, error };
};
export const sbDelCostItem = async id => sb.from('job_cost_items').delete().eq('id', id);
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
  return { data, error };
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
  return { data, error };
};
export const sbDelCostInvoice = async id => sb.from('job_transactions').delete().eq('id', id);
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
  await sb.from('notifications').update({ read: true }).in('id', ids);
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

// ─── Subs ─────────────────────────────────────────────────────────────────────
export const COMMON_TRADES = ['Electrical','Plumbing','HVAC','Framing','Drywall','Roofing','Flooring','Painting','Concrete','Masonry','Insulation','Cabinets','Tile','Landscaping','General Labor','Other'];
export const sbLoadSubDirectory = async () => {
  const { data } = await sb.from('profiles').select('*').eq('tenant_id', AV_TENANT).eq('role', 'sub').order('full_name');
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
export const sbAssignSub = async (jid, subId) => {
  const { data } = await sb.from('job_subs').insert({ tenant_id: AV_TENANT, job_id: jid, sub_id: subId }).select().single();
  return data;
};
export const sbUnassignSub = async (jid, subId) => sb.from('job_subs').delete().eq('job_id', jid).eq('sub_id', subId);

// ─── Messages ─────────────────────────────────────────────────────────────────
export const sbLoadMessages = async jid => {
  const { data } = await sb.from('job_messages').select('*,sender:profiles(id,full_name,role)').eq('job_id', jid).order('created_at', { ascending: true });
  return data || [];
};
export const sbPostMessage = async (jid, content) => {
  const { data } = await sb.from('job_messages').insert({ tenant_id: AV_TENANT, job_id: jid, sender_id: AV_USER_ID, content }).select('*,sender:profiles(id,full_name,role)').single();
  return data;
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
  const { data } = await sb.from('staff_messages').insert({ tenant_id: AV_TENANT, job_id: jid, sender_id: AV_USER_ID, content }).select('*,sender:profiles(id,full_name,role)').single();
  return data;
};

// ─── Invitations to Bid ───────────────────────────────────────────────────────
export const sbLoadITBs = async jid => {
  const { data } = await sb.from('invitations_to_bid').select('*,invitees:itb_invitees(id,email,sub_id,profile:profiles(full_name,trade)),responses:bid_responses(*)').eq('job_id', jid).order('created_at', { ascending: false });
  return data || [];
};
export const sbCreateITB = async itb => {
  const { data } = await sb.from('invitations_to_bid').insert({ ...itb, tenant_id: AV_TENANT, created_by: AV_USER_ID }).select().single();
  return data;
};
export const sbUpdateITB = async (id, ch) => sb.from('invitations_to_bid').update(ch).eq('id', id);
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
  const { data } = await sb.from('itb_invitees').select('itb:invitations_to_bid(*,responses:bid_responses(*),job:jobs(id,address,status))').eq('sub_id', subId);
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
  const { data } = await sb.from('bid_responses').upsert({ tenant_id: AV_TENANT, invitation_id: itbId, sub_id: AV_USER_ID, amount: Number(amount) || null, notes: notes || null, quote_file_url, quote_file_name, quote_file_size, status: 'submitted', submitted_at: new Date().toISOString() }, { onConflict: 'invitation_id,sub_id' }).select().single();
  return data;
};
export const sbUpdateBidStatus = async (id, status) => sb.from('bid_responses').update({ status }).eq('id', id);

// ─── Client link ──────────────────────────────────────────────────────────────
export const sbSendClientLink = async (email, clientName, jobAddress, jobId) => {
  const res = await fetch(CLIENT_LINK_URL, { method: 'POST', headers: authHeader(), body: JSON.stringify({ email, client_name: clientName, job_address: jobAddress, job_id: jobId, tenant_id: AV_TENANT }) });
  return res.json();
};

// ─── Sub pricing ──────────────────────────────────────────────────────────────
export const sbLoadSubPricing = async (subId) => {
  const { data } = await sb.from('sub_pricing').select('*').eq('sub_id', subId).order('trade').order('item_label');
  return data || [];
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
    const { data, error } = await sb.from('job_phases').update({ status }).eq('id', id).eq('assigned_sub_id', AV_USER_ID).select().single();
    return error ? null : data;
  } catch (e) { console.error('sbSubUpdatePhase', e); return null; }
};
export const sbSubSubmitCO = async ({ job_id, tenant_id, title, description, amount }) => {
  try {
    const { data, error } = await sb.from('change_orders').insert({
      id: crypto.randomUUID(), job_id, tenant_id,
      title, description: description || null,
      amount: amount ? Number(amount) : 0,
      status: 'pending', created_at: new Date().toISOString(),
    }).select().single();
    return error ? null : data;
  } catch (e) { console.error('sbSubSubmitCO', e); return null; }
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
  return error ? null : data;
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
  return { data, error };
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
  const { data } = await sb.from('daily_logs').insert({ ...log, tenant_id: AV_TENANT, author_id: AV_USER_ID }).select('*,author:profiles(full_name,role)').single();
  return data;
};

// ─── AI Estimator ─────────────────────────────────────────────────────────────
export const sbLoadEstimate = async jid => {
  const { data } = await sb.from('job_estimates').select('*').eq('job_id', jid).single();
  return data || null;
};
export const sbSaveEstimate = async (jid, messages) => {
  const { data } = await sb.from('job_estimates').upsert({ job_id: jid, tenant_id: AV_TENANT, messages, updated_at: new Date().toISOString() }, { onConflict: 'job_id' }).select().single();
  return data;
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
export const sbSetUserActive = async (id, val) => sb.from('profiles').update({ is_active: val }).eq('id', id);
export const sbSetUserRole = async (id, role) => sb.from('profiles').update({ role }).eq('id', id);
export const sbSaveCommission = async (id, pct, dollar) => sb.from('profiles').update({ commission_pct: Number(pct) || 0, commission_dollar: Number(dollar) || 0 }).eq('id', id);

// ─── Contacts (CRM) ───────────────────────────────────────────────────────────
export const CONTACT_STATUSES = ['new','contacted','qualified','customer','lost'];
export const CONTACT_SOURCES = ['manual','website','referral','facebook','instagram','google','ghl','other'];

export const sbLoadContacts = async () => {
  const { data } = await sb.from('contacts').select('*').eq('tenant_id', AV_TENANT).order('created_at', { ascending: false });
  return data || [];
};
export const sbSaveContact = async c => {
  const { data, error } = await sb.from('contacts').insert({ ...c, tenant_id: AV_TENANT, created_at: new Date().toISOString() }).select().single();
  return { data, error };
};
export const sbUpdContact = async (id, ch) => {
  const { data, error } = await sb.from('contacts').update(ch).eq('id', id).select().single();
  return { data, error };
};
export const sbDelContact = async id => sb.from('contacts').delete().eq('id', id);
export const sbLoadContactMessages = async contactId => {
  const { data } = await sb.from('contact_messages').select('*').eq('contact_id', contactId).order('created_at', { ascending: true });
  return data || [];
};

// ─── LiDAR Scans ─────────────────────────────────────────────────────────────
export const sbSaveJobLidarScan = async ({ jobId, rooms, totalSqft, captureMode, heightMeters, heightSource, heightPoints, gpsLatitude, gpsLongitude, gpsAccuracy, qualityScore, qualityGrade, qualityDeductions, outlineData }) => {
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
  }).select().single();
  return { data, error };
};
export const sbGetJobLidarScans = async jobId => {
  const { data } = await sb.from('job_lidar_scans').select('*').eq('job_id', jobId).order('created_at', { ascending: false });
  return data || [];
};
export const sbSaveLidarScan = async ({ contactId, rooms, totalSqft, captureMode, heightMeters, heightSource, heightPoints, gpsLatitude, gpsLongitude, gpsAccuracy, qualityScore, qualityGrade, qualityDeductions, outlineData }) => {
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
  }).select().single();
  return { data, error };
};
export const sbGetContactLidarScans = async contactId => {
  const { data } = await sb.from('contact_lidar_scans').select('*').eq('contact_id', contactId).order('created_at', { ascending: false });
  return data || [];
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
  return { data, error };
};
export const sbUpdMaterial = async (id, ch) => {
  const { data, error } = await sb.from('job_materials').update(ch).eq('id', id).select().single();
  return { data, error };
};
export const sbDelMaterial = async id => sb.from('job_materials').delete().eq('id', id);

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

// ─── Daily Tasks ──────────────────────────────────────────────────────────────
export const sbLoadDailyTasks = (userId) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  return sb.from('daily_tasks').select('*').eq('user_id', userId).eq('completed', false).gte('task_date', sevenDaysAgo).order('task_date', { ascending: false }).then(r => r.data || []);
};
