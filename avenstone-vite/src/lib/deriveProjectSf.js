/**
 * Derives the best available project SF for AI estimator pricing.
 * Accepts `sb` as a parameter — never imports from supabase.js (circular-import rule).
 *
 * Positive-SF predicate contract:
 *   Only rooms actively scoped (scope_tag present AND !== 'not_in_scope') contribute.
 *   A scoped job whose rooms all have areaSf 0 falls through to job.sqft — "scope rows
 *   exist" alone is NOT sufficient to return source:'scope'. This prevents re-introducing
 *   the silent-HIGH-tier bug for jobs scanned without geometry data.
 *
 * @returns {{ sf: number, source: 'scope'|'job'|'none', roomCount: number }}
 */
export async function deriveProjectSf(sb, jobId, job) {
  try {
    const [scansRes, scopeRes] = await Promise.all([
      sb.from('job_lidar_scans')
        .select('id, rooms')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(5),
      sb.from('job_room_scopes')
        .select('room_id, scope_tag')
        .eq('job_id', jobId),
    ]);

    // Flatten scan rooms into { roomId, areaSf }
    const rooms = [];
    for (const scan of (scansRes.data || [])) {
      (scan.rooms || []).forEach((room, idx) => {
        rooms.push({ roomId: `${scan.id}_${idx}`, areaSf: room.sqft ?? 0 });
      });
    }

    // Build scope map: roomId → scope_tag
    const scopeMap = new Map((scopeRes.data || []).map(r => [r.room_id, r.scope_tag]));

    // Sum only rooms actively scoped to something other than 'not_in_scope'.
    // Rooms with no scope row at all are "undecided" — exclude from sum.
    let sum = 0, count = 0;
    for (const { roomId, areaSf } of rooms) {
      const tag = scopeMap.get(roomId);
      if (tag && tag !== 'not_in_scope') { sum += areaSf; count++; }
    }

    // Positive-SF predicate — "scope rows exist" is not enough; sum must be > 0
    if (sum > 0) return { sf: sum, source: 'scope', roomCount: count };
    if (Number(job.sqft) > 0) return { sf: Number(job.sqft), source: 'job', roomCount: 0 };
    return { sf: 0, source: 'none', roomCount: 0 };
  } catch (e) {
    console.error('deriveProjectSf error:', e);
    if (Number(job.sqft) > 0) return { sf: Number(job.sqft), source: 'job', roomCount: 0 };
    return { sf: 0, source: 'none', roomCount: 0 };
  }
}
