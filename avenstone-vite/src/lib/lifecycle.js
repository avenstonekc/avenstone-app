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
