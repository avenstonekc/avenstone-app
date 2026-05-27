export class PhotoRequirementError extends Error {
  constructor(msg) { super(msg); this.name = 'PhotoRequirementError'; }
}

/**
 * Count photos for a given entity, reading from job_files (slice 6/12 migration).
 * material_order is NOT in _JF_VALID_ENTITY_TYPES — those photos were never
 * dual-written to job_files, so we fall back to the legacy photos table for that type.
 * All other entity types (schedule_item, daily_log, change_order, etc.) read job_files.
 */
export async function countPhotosForEntity(sb, entityType, entityId, category = null) {
  if (entityType === 'material_order') {
    // Fallback: material_order photos not in job_files — read legacy table
    let q = sb
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('related_entity_type', entityType)
      .eq('related_entity_id', entityId);
    if (category) q = q.eq('category', category);
    const { count, error } = await q;
    return error ? 0 : (count ?? 0);
  }
  const { count, error } = await sb
    .from('job_files')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'Photos')
    .eq('related_entity_type', entityType)
    .eq('related_entity_id', entityId)
    .eq('lifecycle_status', 'active');
  if (error) return 0;
  return count ?? 0;
}
