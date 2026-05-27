/**
 * COMPANY_FILES_ARC Phase 1 — helpers for tenant-level compliance document storage.
 *
 * All helpers:
 *  - Return { ok, error, data } — never throw
 *  - Include tenant_id explicitly on every INSERT (Principle 11)
 *  - Use { ok, error, data } canonical shape (Principle 9)
 *
 * Storage bucket: 'company-files' (private — signed URLs only, 7-day expiry)
 * Path convention: <tenant_id>/<type_slug>/<file_id>.<ext>
 *   type_slug = type.toLowerCase().replace(/[^a-z0-9]+/g, '-')
 *
 * Phase deferred (not in this file yet):
 *  - sbLoadCompanyFilesForSub — Phase 3b (sub portal direct query) — SHIPPED
 *  - sbScheduleCompanyFileExpirations — Phase 5 — SHIPPED
 *  - sbCancelCompanyFileScheduledActions — Phase 5 — SHIPPED
 *  - sbCreateJobCompanyFileRefs — Phase 3a (virtual job_files rows at job creation) — SHIPPED
 */

import { sb, AV_TENANT, AV_USER_ID } from './supabase.js';

const BUCKET = 'company-files';
const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 7; // 7 days

// ─── Internal ─────────────────────────────────────────────────────────────────

function typeSlug(type) {
  return (type || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Upload a file to 'company-files' bucket and insert a company_files row.
 *
 * @param {object} params
 * @param {File}    params.file
 * @param {string}  params.category       'Insurance'|'License'|'Tax'|'Legal'|'Compliance'|'Template'|'Other'
 * @param {string}  params.type           Canonical label e.g. "GL Insurance"
 * @param {object}  [params.metadata]     { issuer, policyNumber, effectiveDate, expirationDate, extractedFields }
 * @param {string[]} [params.visibleToRoles]  Subset of ['owner','project_manager','sales_rep','sub','client']
 * @returns {Promise<{ok:boolean, error?:string, data?:{id:string, storagePath:string}}>}
 */
export async function sbUploadCompanyFile({
  file,
  category,
  type,
  metadata = {},
  visibleToRoles = [],
}) {
  if (!file || !category || !type) {
    return { ok: false, error: 'file, category, and type are required' };
  }
  try {
    const ext = (file.name || 'file').split('.').pop().toLowerCase() || 'bin';
    const fileId = crypto.randomUUID();
    const slug = typeSlug(type);
    const storagePath = `${AV_TENANT}/${slug}/${fileId}.${ext}`;

    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (upErr) return { ok: false, error: `storage: ${upErr.message}` };

    const { data, error } = await sb.from('company_files').insert({
      id:               fileId,
      tenant_id:        AV_TENANT,
      uploaded_by_id:   AV_USER_ID,
      name:             file.name,
      storage_path:     storagePath,
      storage_bucket:   BUCKET,
      mime_type:        file.type || null,
      size_bytes:       file.size || null,
      category,
      type,
      issuer:           metadata.issuer           || null,
      policy_number:    metadata.policyNumber     || null,
      effective_date:   metadata.effectiveDate    || null,
      expiration_date:  metadata.expirationDate   || null,
      extracted_fields: metadata.extractedFields  || {},
      visible_to_roles: visibleToRoles,
      lifecycle_status: 'active',
    }).select('id, storage_path').single();

    if (error) {
      // Best-effort cleanup if DB insert fails
      await sb.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      return { ok: false, error: error.message };
    }
    // Phase 5 — schedule expiration watchdog rows if expiration_date provided (non-blocking)
    if (metadata.expirationDate) {
      sbScheduleCompanyFileExpirations(data.id, metadata.expirationDate).catch(() => {});
    }
    return { ok: true, data: { id: data.id, storagePath: data.storage_path } };
  } catch (e) {
    return { ok: false, error: e.message || 'sbUploadCompanyFile failed' };
  }
}

/**
 * Load all active company_files for the current tenant.
 * Ordered by category, then type label.
 *
 * @returns {Promise<{ok:boolean, error?:string, data?:Array}>}
 */
export async function sbLoadCompanyFiles() {
  try {
    const { data, error } = await sb
      .from('company_files')
      .select('*')
      .eq('tenant_id', AV_TENANT)
      .eq('lifecycle_status', 'active')
      .order('category', { ascending: true })
      .order('type', { ascending: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data || []).map(mapRow) };
  } catch (e) {
    return { ok: false, error: e.message || 'sbLoadCompanyFiles failed' };
  }
}

/**
 * Load a single company_file by id.
 *
 * @param {string} id
 * @returns {Promise<{ok:boolean, error?:string, data?:object}>}
 */
export async function sbGetCompanyFile(id) {
  if (!id) return { ok: false, error: 'id required' };
  try {
    const { data, error } = await sb
      .from('company_files')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: mapRow(data) };
  } catch (e) {
    return { ok: false, error: e.message || 'sbGetCompanyFile failed' };
  }
}

/**
 * Update metadata on an existing company_file.
 * Updateable fields: name, issuer, policyNumber, effectiveDate, expirationDate,
 *   visibleToRoles, category, type.
 *
 * @param {object} params
 * @param {string}  params.id
 * @param {object}  params.updates  Subset of updatable fields (camelCase)
 * @returns {Promise<{ok:boolean, error?:string, data?:object}>}
 */
export async function sbUpdateCompanyFile({ id, updates = {} }) {
  if (!id) return { ok: false, error: 'id required' };
  try {
    const patch = {};
    if (updates.name             !== undefined) patch.name             = updates.name;
    if (updates.issuer           !== undefined) patch.issuer           = updates.issuer;
    if (updates.policyNumber     !== undefined) patch.policy_number    = updates.policyNumber;
    if (updates.effectiveDate    !== undefined) patch.effective_date   = updates.effectiveDate;
    if (updates.expirationDate   !== undefined) patch.expiration_date  = updates.expirationDate;
    if (updates.visibleToRoles   !== undefined) patch.visible_to_roles = updates.visibleToRoles;
    if (updates.category         !== undefined) patch.category         = updates.category;
    if (updates.type             !== undefined) patch.type             = updates.type;
    if (updates.extractedFields  !== undefined) patch.extracted_fields = updates.extractedFields;

    if (Object.keys(patch).length === 0) return { ok: false, error: 'No updatable fields provided' };

    const { data, error } = await sb
      .from('company_files')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', AV_TENANT)
      .select('*')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: mapRow(data) };
  } catch (e) {
    return { ok: false, error: e.message || 'sbUpdateCompanyFile failed' };
  }
}

/**
 * Set visible_to_roles on a company_file.
 * Valid values: 'owner', 'project_manager', 'sales_rep', 'sub', 'client'.
 *
 * @param {string}   id
 * @param {string[]} roles  New full array (replaces, not appends)
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function sbSetCompanyFileRoles(id, roles) {
  if (!id) return { ok: false, error: 'id required' };
  const valid = new Set(['owner', 'project_manager', 'sales_rep', 'sub', 'client']);
  const invalid = (roles || []).filter(r => !valid.has(r));
  if (invalid.length) return { ok: false, error: `Invalid role(s): ${invalid.join(', ')}` };
  try {
    const { error } = await sb
      .from('company_files')
      .update({ visible_to_roles: roles || [] })
      .eq('id', id)
      .eq('tenant_id', AV_TENANT);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'sbSetCompanyFileRoles failed' };
  }
}

/**
 * Archive a company_file (soft-delete). Sets lifecycle_status='archived', archived_at=now().
 * Does NOT delete virtual job_files rows — audit trail preserved.
 *
 * @param {string} id
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function sbArchiveCompanyFile(id) {
  if (!id) return { ok: false, error: 'id required' };
  try {
    const { error } = await sb
      .from('company_files')
      .update({ lifecycle_status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', AV_TENANT);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'sbArchiveCompanyFile failed' };
  }
}

/**
 * Replace a company_file: archive the existing active row, insert a new one.
 * Sets replaced_by_id on the old row.
 *
 * Phase 5 wires watchdog: sbCancelCompanyFileScheduledActions(existingId) before this call,
 * then sbScheduleCompanyFileExpirations(newId, ...) after, once those helpers exist.
 *
 * Atomic-ish: archives first, then inserts. If insert fails, un-archives the old row.
 *
 * @param {object} params
 * @param {string}  params.existingId  ID of the currently active row to replace
 * @param {File}    params.file        New file to upload
 * @param {string}  params.category
 * @param {string}  params.type
 * @param {object}  [params.metadata]
 * @param {string[]} [params.visibleToRoles]
 * @returns {Promise<{ok:boolean, error?:string, data?:{id:string, storagePath:string, archivedId:string}}>}
 */
export async function sbReplaceCompanyFile({
  existingId,
  file,
  category,
  type,
  metadata = {},
  visibleToRoles,
}) {
  if (!existingId || !file || !category || !type) {
    return { ok: false, error: 'existingId, file, category, and type are required' };
  }
  try {
    // Step 1: Archive the old row
    const archiveRes = await sbArchiveCompanyFile(existingId);
    if (!archiveRes.ok) return { ok: false, error: `Archive failed: ${archiveRes.error}` };

    // Step 2: Upload new row — inherit visibleToRoles from old row if not provided
    let resolvedRoles = visibleToRoles;
    if (resolvedRoles === undefined) {
      const oldRes = await sbGetCompanyFile(existingId);
      resolvedRoles = oldRes.ok ? (oldRes.data?.visibleToRoles || []) : [];
    }

    const uploadRes = await sbUploadCompanyFile({ file, category, type, metadata, visibleToRoles: resolvedRoles });
    if (!uploadRes.ok) {
      // Undo the archive if the new insert fails
      await sb.from('company_files')
        .update({ lifecycle_status: 'active', archived_at: null })
        .eq('id', existingId)
        .eq('tenant_id', AV_TENANT)
        .catch(() => {});
      return { ok: false, error: `Insert failed: ${uploadRes.error}` };
    }

    // Step 3: Wire replaced_by_id on the old row
    await sb.from('company_files')
      .update({ replaced_by_id: uploadRes.data.id })
      .eq('id', existingId)
      .eq('tenant_id', AV_TENANT)
      .catch(() => {}); // non-critical — just a pointer for history browsing

    // Phase 5 — cancel old scheduled_actions after successful replace (non-blocking)
    // New file's scheduled_actions were already written by sbUploadCompanyFile above.
    sbCancelCompanyFileScheduledActions(existingId).catch(() => {});

    return {
      ok: true,
      data: {
        id:         uploadRes.data.id,
        storagePath: uploadRes.data.storagePath,
        archivedId: existingId,
      },
    };
  } catch (e) {
    return { ok: false, error: e.message || 'sbReplaceCompanyFile failed' };
  }
}

/**
 * Generate a signed URL for a company_file.
 * Takes the storage_path directly (not the row id).
 * Default expiry: 7 days (blueprint Locked Decision 9).
 *
 * @param {string} storagePath  The value of company_files.storage_path
 * @param {number} [expiresIn]  Seconds until expiry — default 7 days
 * @returns {Promise<{ok:boolean, error?:string, url?:string}>}
 */
export async function sbSignCompanyFileUrl(storagePath, expiresIn = SIGNED_URL_EXPIRY) {
  if (!storagePath) return { ok: false, error: 'storagePath required' };
  try {
    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresIn);
    if (error) return { ok: false, error: error.message };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { ok: false, error: e.message || 'sbSignCompanyFileUrl failed' };
  }
}

// ─── Phase 5 — Watchdog helpers ───────────────────────────────────────────────

/**
 * Phase 5 — Write 3 scheduled_actions rows for a company file's expiration date.
 * Thresholds: 30d (medium), 14d (high), 0d/day-of (high).
 * Called automatically by sbUploadCompanyFile when metadata.expirationDate is set.
 *
 * @param {string} companyFileId  UUID of the company_files row
 * @param {string} expirationDate ISO date string 'YYYY-MM-DD'
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function sbScheduleCompanyFileExpirations(companyFileId, expirationDate) {
  if (!companyFileId || !expirationDate) return { ok: false, error: 'companyFileId and expirationDate required' };
  try {
    const exp = new Date(expirationDate);
    if (isNaN(exp.getTime())) return { ok: false, error: 'Invalid expirationDate' };

    const subDays = (date, d) => new Date(date.getTime() - d * 86400000).toISOString();

    const rows = [
      {
        tenant_id:           AV_TENANT,
        kind:                'reminder',
        status:              'scheduled',
        priority:            'medium',
        fire_at:             subDays(exp, 30),
        created_by_id:       AV_USER_ID,
        target_user_id:      AV_USER_ID,
        related_entity_type: 'company_file',
        related_entity_id:   companyFileId,
        rule_key:            `cf_exp_30d_${companyFileId}`,
        source:              'system',
        payload:             { company_file_id: companyFileId, days_out: 30 },
      },
      {
        tenant_id:           AV_TENANT,
        kind:                'reminder',
        status:              'scheduled',
        priority:            'high',
        fire_at:             subDays(exp, 14),
        created_by_id:       AV_USER_ID,
        target_user_id:      AV_USER_ID,
        related_entity_type: 'company_file',
        related_entity_id:   companyFileId,
        rule_key:            `cf_exp_14d_${companyFileId}`,
        source:              'system',
        payload:             { company_file_id: companyFileId, days_out: 14 },
      },
      {
        tenant_id:           AV_TENANT,
        kind:                'reminder',
        status:              'scheduled',
        priority:            'high',
        fire_at:             exp.toISOString(),
        created_by_id:       AV_USER_ID,
        target_user_id:      AV_USER_ID,
        related_entity_type: 'company_file',
        related_entity_id:   companyFileId,
        rule_key:            `cf_exp_0d_${companyFileId}`,
        source:              'system',
        payload:             { company_file_id: companyFileId, days_out: 0 },
      },
    ];

    const { error } = await sb.from('scheduled_actions').insert(rows);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'sbScheduleCompanyFileExpirations failed' };
  }
}

/**
 * Phase 5 — Cancel pending scheduled_actions rows for a company file.
 * Called by sbReplaceCompanyFile after successful replace.
 *
 * @param {string} companyFileId  UUID of the company_files row being replaced/archived
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function sbCancelCompanyFileScheduledActions(companyFileId) {
  if (!companyFileId) return { ok: false, error: 'companyFileId required' };
  try {
    const { error } = await sb
      .from('scheduled_actions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('related_entity_type', 'company_file')
      .eq('related_entity_id', companyFileId)
      .eq('status', 'scheduled');
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'sbCancelCompanyFileScheduledActions failed' };
  }
}

/**
 * Phase 3b — Sub portal direct read.
 * Returns all active company files where 'sub' = ANY(visible_to_roles) for the current tenant.
 * Tenant scope is enforced by RLS (cf_tenant_select — all tenant members can SELECT).
 * visible_to_roles filter is applied at query time, not enforced by RLS.
 *
 * @returns {Promise<{ok:boolean, error?:string, data?:Array}>}
 */
export async function sbLoadCompanyFilesForSub() {
  try {
    const { data, error } = await sb
      .from('company_files')
      .select('id, tenant_id, name, storage_path, storage_bucket, mime_type, category, type, issuer, expiration_date, lifecycle_status, created_at')
      .contains('visible_to_roles', ['sub'])
      .eq('lifecycle_status', 'active')
      .order('category', { ascending: true })
      .order('type', { ascending: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data || []).map(mapRow) };
  } catch (e) {
    return { ok: false, error: e.message || 'sbLoadCompanyFilesForSub failed' };
  }
}

/**
 * Phase 3a — Job creation hook.
 * After a new job row is committed, call this to insert virtual job_files rows
 * for every active company file where 'client' = ANY(visible_to_roles).
 *
 * Non-critical path: caller should not await this or block job creation on its result.
 * Failure is logged but does not roll back the job.
 *
 * @param {string} jobId    The newly created job id (TEXT — matches job_files.job_id)
 * @param {string} tenantId The tenant UUID
 * @returns {Promise<{ok:boolean, error?:string, data?:{attached:number}}>}
 */
export async function sbCreateJobCompanyFileRefs(jobId, tenantId) {
  if (!jobId || !tenantId) return { ok: false, error: 'jobId and tenantId required' };
  try {
    const { data: files, error: loadErr } = await sb
      .from('company_files')
      .select('id, tenant_id, name, storage_path, storage_bucket, mime_type, category')
      .eq('tenant_id', tenantId)
      .eq('lifecycle_status', 'active')
      .contains('visible_to_roles', ['client']);

    if (loadErr) return { ok: false, error: loadErr.message };
    if (!files || files.length === 0) return { ok: true, data: { attached: 0 } };

    const rows = files.map(cf => ({
      tenant_id:           cf.tenant_id,
      job_id:              jobId,
      name:                cf.name,
      storage_path:        cf.storage_path,
      storage_bucket:      cf.storage_bucket,
      mime_type:           cf.mime_type || null,
      category:            'Communications',
      subcategory:         SUBCATEGORY_FOR[cf.category] ?? 'Compliance',
      client_visible:      true,
      related_entity_type: 'company_file',
      related_entity_id:   cf.id,
    }));

    const { error: insErr } = await sb.from('job_files').insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, data: { attached: rows.length } };
  } catch (e) {
    return { ok: false, error: e.message || 'sbCreateJobCompanyFileRefs failed' };
  }
}

const SUBCATEGORY_FOR = {
  Insurance:  'Insurance',
  License:    'License',
  Tax:        'Tax',
  // Legal, Compliance, Template, Other → 'Compliance'
};

// ─── Internal row mapper ───────────────────────────────────────────────────────

function mapRow(r) {
  return {
    id:               r.id,
    tenantId:         r.tenant_id,
    uploadedById:     r.uploaded_by_id,
    name:             r.name,
    storagePath:      r.storage_path,
    storageBucket:    r.storage_bucket,
    mimeType:         r.mime_type,
    sizeBytes:        r.size_bytes,
    category:         r.category,
    type:             r.type,
    issuer:           r.issuer,
    policyNumber:     r.policy_number,
    effectiveDate:    r.effective_date,
    expirationDate:   r.expiration_date,
    extractedFields:  r.extracted_fields,
    visibleToRoles:   r.visible_to_roles || [],
    lifecycleStatus:  r.lifecycle_status,
    archivedAt:       r.archived_at,
    replacedById:     r.replaced_by_id,
    createdAt:        r.created_at,
    updatedAt:        r.updated_at,
  };
}
