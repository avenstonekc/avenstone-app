export class PhotoRequirementError extends Error {
  constructor(msg) { super(msg); this.name = 'PhotoRequirementError'; }
}

/**
 * Count photos for a given entity, reading from job_files.
 * slice 7/12: material_order added to _JF_VALID_ENTITY_TYPES in supabase.js —
 * all entity types now read from job_files. Legacy photos table fallback removed.
 */
export async function countPhotosForEntity(sb, entityType, entityId, category = null) {
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
