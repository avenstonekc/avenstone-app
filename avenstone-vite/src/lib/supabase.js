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
export const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ';
const FN = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1';
export const INVITE_URL        = `${FN}/send-invite`;
export const CLIENT_LINK_URL   = `${FN}/send-client-link`;
export const BID_INVITE_URL    = `${FN}/send-bid-invite`;
export const PAYMENT_LINK_URL  = `${FN}/create-payment-link`;
export const AI_ESTIMATOR_URL  = `${FN}/ai-estimator`;
export const CONTRACT_EMAIL_URL = `${FN}/send-contract-email`;
export const NOTIFY_REALTOR_URL = `${FN}/notify-realtor`;
export const authHeader = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` });
export const AI_COMPANION_URL       = `${FN}/ai-companion`;
export const AI_HOME_URL            = `${FN}/ai-home-companion`;
export const PROCESS_TRANSCRIPT_URL = `${FN}/process-transcript`;
export const AI_ERROR_LOGGER_URL    = `${FN}/ai-error-logger`;

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
        photos: (ph || []).map(p => ({ id: p.id, type: p.type, url: p.url, name: p.name })),
        activity: nt || [], change_orders: co || [],
      };
    }));
  } catch (e) { console.error(e); return null; }
};

export const sbUpd = async (id, ch) => {
  try {
    const ok = ['status','scope','sqft','client_name','client_phone','client_email','assigned_rep','assigned_subs','contract_value','co_total','target_completion','contract_signed','contract_signed_at','client_notify','referring_realtor_name','referring_realtor_phone','referring_realtor_email'];
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
    const row = { id: Date.now().toString() + Math.random(), job_id: jid, tenant_id: AV_TENANT, type: file.type.startsWith('video') ? 'video' : 'photo', url, name: file.name };
    await sb.from('photos').insert(row);
    return { id: row.id, type: row.type, url, name: file.name };
  } catch (e) { console.error(e); return null; }
};

export const sbCO = async co => {
  try {
    const { data, error } = await sb.from('change_orders').insert({ ...co, tenant_id: AV_TENANT }).select().single();
    return error ? null : data;
  } catch (e) { return null; }
};
export const sbUpdCO = async (id, ch) => { try { await sb.from('change_orders').update(ch).eq('id', id); } catch (e) {} };

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

export const sbLoadDocs = async jid => {
  const { data } = await sb.from('job_documents').select('*').eq('job_id', jid).order('created_at', { ascending: false });
  return data || [];
};
export const sbUploadDoc = async (jid, file, fileType) => {
  try {
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${jid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: ue } = await sb.storage.from('job-documents').upload(path, file, { contentType: file.type, upsert: false });
    if (ue) { console.error('Doc upload error:', ue); return { error: ue.message || 'Upload failed' }; }
    const { data: ud } = sb.storage.from('job-documents').getPublicUrl(path);
    const { data: existing } = await sb.from('job_documents').select('version').eq('job_id', jid).eq('name', file.name).order('version', { ascending: false }).limit(1);
    const version = (existing && existing.length ? existing[0].version : 0) + 1;
    const row = { job_id: jid, tenant_id: AV_TENANT, name: file.name, file_url: ud.publicUrl, file_type: fileType || 'other', version, client_visible: false };
    const { data: inserted, error: ie } = await sb.from('job_documents').insert(row).select().single();
    if (ie) return { error: ie.message || 'Save failed' };
    return { doc: inserted };
  } catch (e) { return { error: e.message || 'Unknown error' }; }
};
export const sbDelDoc = async doc => {
  try {
    const path = doc.file_url?.split('/job-documents/')[1];
    if (path) await sb.storage.from('job-documents').remove([path]);
    await sb.from('job_documents').delete().eq('id', doc.id);
  } catch (e) { console.error(e); }
};
export const sbToggleDocVisible = async (id, val) => { await sb.from('job_documents').update({ client_visible: val }).eq('id', id); };

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
export const sbLoadSubITBs = async subId => {
  const { data } = await sb.from('itb_invitees').select('itb:invitations_to_bid(*,responses:bid_responses(*),job:jobs(id,address,status))').eq('sub_id', subId);
  return (data || []).map(d => d.itb).filter(Boolean);
};
export const sbSubmitBid = async (itbId, amount, notes, quoteFile) => {
  let quote_file_url = null, quote_file_name = null, quote_file_size = null;
  if (quoteFile) {
    const path = `${AV_USER_ID}/${itbId}/${quoteFile.name}`;
    const { data: up } = await sb.storage.from('bid-quotes').upload(path, quoteFile, { upsert: true });
    if (up) {
      const { data: pub } = sb.storage.from('bid-quotes').getPublicUrl(path);
      quote_file_url = pub?.publicUrl || null;
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
  const { data } = await sb.from('payments').select('*,created_by_profile:profiles!payments_created_by_fkey(full_name)').eq('job_id', jid).order('created_at', { ascending: false });
  return data || [];
};
export const sbCreatePaymentLink = async p => {
  const res = await fetch(PAYMENT_LINK_URL, { method: 'POST', headers: authHeader(), body: JSON.stringify(p) });
  return res.json();
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
