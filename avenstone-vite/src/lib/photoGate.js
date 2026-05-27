export class PhotoRequirementError extends Error {
  constructor(msg) { super(msg); this.name = 'PhotoRequirementError'; }
}

export async function countPhotosForEntity(sb, entityType, entityId, category = null) {
  let q = sb
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('related_entity_type', entityType)
    .eq('related_entity_id', entityId);
  if (category) q = q.eq('category', category);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}
