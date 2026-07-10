// Model B — lifecycle rollup (Phase 1: derive-only, no writes).
//
// deriveStatusFromPhases maps a job's job_phases rows to the jobs.status vocab.
// Pure function — no supabase import, no side effects; callers pass data in.
// Phase 1 uses this ONLY for shadow comparison (LifecycleAuditScr). Nothing
// writes jobs.status from this yet — that is Phase 3.
//
// Vocab (jobs_status_canonical CHECK): lead, proposal, contract, in_progress,
// final_touches, complete, on_hold. `on_hold` is a lateral overlay with no
// phase representation — it is NOT derivable from phases and must be passed in
// via options.onHold.

// job_phases.phase_name → jobs.status. Keyed to DEFAULT_PHASES (supabase.js).
// The five construction phases (Demo…Finishes) all roll up to in_progress.
export const PHASE_STATUS_MAP = {
  'Lead':          'lead',
  'Proposal':      'proposal',
  'Contract':      'contract',
  'Demo':          'in_progress',
  'Rough-ins':     'in_progress',
  'Inspections':   'in_progress',
  'Drywall':       'in_progress',
  'Finishes':      'in_progress',
  'Final touches': 'final_touches',
  'Complete':      'complete',
};

const ADVANCED = new Set(['in_progress', 'complete']); // a phase that is underway or done

/**
 * Derive the lifecycle status implied by a job's phase rows.
 * Rule: the status of the FURTHEST (highest phase_order) phase that is not
 * `not_started`. All-not_started → 'lead'. on_hold overlay short-circuits.
 *
 * @param {Array<{phase_name:string, phase_order:number, status:string}>} phases
 * @param {{onHold?: boolean}} [options]
 * @returns {{status: string|null, reason: string|null}}
 *   status = derived jobs.status, or null when it cannot be derived.
 *   reason = null on a clean derive, else why (null status, or overlay note).
 *   Never throws on missing/malformed input.
 */
export function deriveStatusFromPhases(phases, options = {}) {
  // on_hold is a lateral pause — not encoded in phases; caller signals it.
  if (options && options.onHold) {
    return { status: 'on_hold', reason: 'on_hold overlay (not derivable from phases)' };
  }
  if (!Array.isArray(phases) || phases.length === 0) {
    return { status: null, reason: 'no phase rows' };
  }
  // Keep only well-formed, known rows — skip malformed without throwing.
  const valid = phases.filter(
    (p) =>
      p &&
      typeof p.phase_order === 'number' &&
      typeof p.phase_name === 'string' &&
      Object.prototype.hasOwnProperty.call(PHASE_STATUS_MAP, p.phase_name),
  );
  if (valid.length === 0) {
    return { status: null, reason: 'no valid phase rows (bad phase_order/phase_name or unknown phase)' };
  }
  const advanced = valid.filter((p) => ADVANCED.has(p.status));
  if (advanced.length === 0) {
    return { status: 'lead', reason: 'all phases not_started' };
  }
  const furthest = advanced.reduce((a, b) => (b.phase_order > a.phase_order ? b : a));
  return { status: PHASE_STATUS_MAP[furthest.phase_name], reason: null };
}

/**
 * Shadow comparison helper: does the stored status agree with the derived one?
 * @returns {{derived: string|null, agree: boolean, reason: string|null}}
 */
export function compareStatus(storedStatus, phases, options = {}) {
  const { status: derived, reason } = deriveStatusFromPhases(phases, options);
  return { derived, agree: derived === storedStatus, reason };
}

// ── Phase 2: advance pre-construction phase rows on lifecycle events ──────────
// The three pre-construction phases whose rows nothing used to advance.
export const LIFECYCLE_PHASES = ['Lead', 'Proposal', 'Contract'];

const _RANK = { not_started: 0, in_progress: 1, complete: 2 };

// event → the floor state each pre-construction phase must reach. Each event sets
// the FULL prefix (a later event corrects a skipped earlier one) — forward-only.
export const LIFECYCLE_EVENT_TARGETS = {
  created:           { Lead: 'in_progress' },
  proposal_sent:     { Lead: 'complete', Proposal: 'in_progress' },
  estimate_accepted: { Lead: 'complete', Proposal: 'complete', Contract: 'in_progress' },
  contract_signed:   { Lead: 'complete', Proposal: 'complete', Contract: 'complete' },
};

/**
 * Advance a job's Lead/Proposal/Contract phase rows to at least the state a
 * lifecycle event implies. Forward-only (never regresses complete → earlier) and
 * idempotent (re-firing is a no-op). Does NOT touch jobs.status — Phase 2 only
 * makes job_phases tell the truth; the rollup measures convergence.
 *
 * Pure per the no-supabase-import rule: the caller passes its own `sb` client
 * (browser sb, or a service-role client in an edge fn). Never throws.
 *
 * @param sb        a supabase client (browser or service-role)
 * @param tenantId  tenant uuid (explicit — do not rely on RLS default)
 * @param jobId     job id (text)
 * @param event     'created' | 'proposal_sent' | 'estimate_accepted' | 'contract_signed'
 * @param actorId   uuid to stamp into started_by_id / completed_by_id (nullable)
 * @returns {{ok: boolean, advanced: Array<{phase,to}>, error: string|null}}
 */
export async function markLifecyclePhases(sb, tenantId, jobId, event, actorId = null) {
  const targets = LIFECYCLE_EVENT_TARGETS[event];
  if (!targets) return { ok: false, advanced: [], error: `unknown lifecycle event: ${event}` };
  try {
    const { data: rows, error } = await sb
      .from('job_phases')
      .select('id, phase_name, status, started_at, completed_at')
      .eq('job_id', String(jobId))
      .eq('tenant_id', tenantId)
      .in('phase_name', LIFECYCLE_PHASES);
    if (error) return { ok: false, advanced: [], error: error.message };

    const nowIso = new Date().toISOString();
    const advanced = [];
    for (const [name, target] of Object.entries(targets)) {
      const row = (rows || []).find((r) => r.phase_name === name);
      if (!row) continue; // not seeded yet — caller seeds first; nothing to advance
      if ((_RANK[target] ?? 0) <= (_RANK[row.status] ?? 0)) continue; // forward-only / no-op

      const patch = { status: target };
      if (!row.started_at) { patch.started_at = nowIso; patch.started_by_id = actorId; }
      if (target === 'complete') { patch.completed_at = row.completed_at || nowIso; patch.completed_by_id = actorId; }

      // Guard the WHERE so a concurrent writer that already advanced this row wins —
      // never regress: →complete only touches non-complete rows; →in_progress only
      // touches still-not_started rows.
      let upd = sb.from('job_phases').update(patch).eq('id', row.id).eq('tenant_id', tenantId);
      upd = target === 'complete' ? upd.neq('status', 'complete') : upd.eq('status', 'not_started');
      const { data: verify, error: uErr } = await upd.select('id, phase_name, status');
      if (uErr) { console.error(`markLifecyclePhases ${event}/${name}:`, uErr.message); continue; }
      if (verify && verify.length) advanced.push({ phase: name, to: target });
    }
    return { ok: true, advanced, error: null };
  } catch (e) {
    return { ok: false, advanced: [], error: e?.message || 'markLifecyclePhases failed' };
  }
}
