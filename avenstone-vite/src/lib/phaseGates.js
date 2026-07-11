// IMPORTANT: Phase gate logic is duplicated inline in both edge functions
// (ai-master-agent and ai-field-agent) since Deno can't import frontend code.
// Any change here must also be applied to those edge fn copies. See:
// - supabase/functions/ai-master-agent/index.ts
// - supabase/functions/ai-field-agent/index.ts
//
// DIVERGENCE (SCOPE_TO_ESTIMATE Phase C2, 2026-07-11): checkSelectionsConfirmed
// (contract→in_progress) is present HERE (UI path via PhaseAdvanceCard) but NOT yet
// mirrored in the two edge copies — the agent's advance_phase won't enforce the
// selections lock until synced. Scoped out of C2 (touches: phaseGates.js only);
// sync the two edge fns as a follow-up.
//
// Phase advancement gate definitions for the Anti-Surprise Engine (EXECUTION_ARC Phase 4a).
//
// ARCHITECTURE: jobs.status IS the lifecycle phase tracker.
// job_phases rows are TRADE phases (Demo, Framing, etc.) auto-driven by derivePhaseStatus
// via schedule_items — a separate system this module never touches.
//
// Gate functions accept (jobId, sb) so this module never imports from supabase.js,
// avoiding circular dependencies.

// ── Phase order ───────────────────────────────────────────────────────────────

export const PHASE_ORDER = [
  'lead', 'proposal', 'contract', 'in_progress', 'final_touches', 'complete',
];

export const PHASE_LABELS = {
  lead:          'Lead',
  proposal:      'Proposal',
  contract:      'Contract',
  in_progress:   'In Progress',
  final_touches: 'Final Touches',
  complete:      'Complete',
};

export function getNextPhase(current) {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

export function getPreviousPhase(current) {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx <= 0) return null;
  return PHASE_ORDER[idx - 1];
}

// ── Gate check functions ──────────────────────────────────────────────────────
// Each returns { key, label, passed, message? }

async function checkScopeTagged(jobId, sb) {
  const { count } = await sb
    .from('job_room_scopes')
    .select('*', { count: 'exact', head: true })
    .eq('job_id', jobId);
  return {
    key: 'scope_tagged',
    label: 'Scope tagged on at least one room',
    passed: (count ?? 0) > 0,
  };
}

async function checkConsultationLogged(jobId, sb) {
  const { count } = await sb
    .from('consultation_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('job_id', jobId);
  return {
    key: 'consultation_logged',
    label: 'Consultation session logged',
    passed: (count ?? 0) > 0,
  };
}

async function checkContractSigned(jobId, sb) {
  const { data } = await sb
    .from('jobs')
    .select('contract_signed')
    .eq('id', jobId)
    .single();
  return {
    key: 'contract_signed',
    label: 'Contract signed',
    passed: !!data?.contract_signed,
  };
}

async function checkDepositPaid(jobId, sb) {
  // Any inbound client payment recorded against this job (client_payment or client_deposit)
  const { count } = await sb
    .from('job_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .in('type', ['client_payment', 'client_deposit'])
    .eq('direction', 'in')
    .eq('status', 'paid');
  return {
    key: 'deposit_paid',
    label: 'Client payment received',
    passed: (count ?? 0) > 0,
  };
}

async function checkAllSubStartsComplete(jobId, sb) {
  // Count sub_start schedule items that are not complete or cancelled
  const { count } = await sb
    .from('schedule_items')
    .select('*', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('type', 'sub_start')
    .neq('status', 'complete')
    .neq('status', 'cancelled');
  return {
    key: 'all_sub_starts_complete',
    label: 'All sub start schedule items complete',
    passed: (count ?? 0) === 0,
    // Note: 0 incomplete is a pass even when no sub_starts exist — PM can override if needed
  };
}

// SCOPE_TO_ESTIMATE Phase C2 — Demo/selections gate. Demo (a trade phase) has no interactive
// gate point (trade phases are schedule-driven via derivePhaseStatus), so the selections lock is
// enforced at the lifecycle boundary the PM passes through before construction: contract→in_progress.
// Applicable = is_selection fields for the job's project type (derived from the default room label,
// as the Selections tab does); unconfirmed = those without a confirmed answer row. Zero applicable
// → passes silently. The failing label names the unconfirmed fields so the override card reads well.
async function checkSelectionsConfirmed(jobId, sb) {
  const pass = { key: 'selections_confirmed', label: 'Client selections confirmed', passed: true };
  const { data: rooms } = await sb
    .from('job_rooms').select('label').eq('job_id', jobId)
    .order('created_at', { ascending: true }).limit(1);
  const pt = (rooms?.[0]?.label || '').toLowerCase();
  if (!pt) return pass;

  const { data: fields } = await sb
    .from('scope_checklists').select('field_key')
    .eq('project_type', pt).eq('is_selection', true).eq('active', true);
  const applicable = [...new Set((fields || []).map(f => f.field_key))];
  if (!applicable.length) return pass;

  const { data: confirmedRows } = await sb
    .from('job_scope_answers').select('field_key')
    .eq('job_id', jobId).eq('status', 'confirmed');
  const confirmed = new Set((confirmedRows || []).map(r => r.field_key));
  const unconfirmed = applicable.filter(fk => !confirmed.has(fk));
  const lockedN = applicable.length - unconfirmed.length;

  return {
    key: 'selections_confirmed',
    label: unconfirmed.length
      ? `Client selections locked (${lockedN} of ${applicable.length}) — unconfirmed: ${unconfirmed.join(', ')}`
      : `Client selections locked (${applicable.length} of ${applicable.length})`,
    passed: unconfirmed.length === 0,
    message: unconfirmed.length ? `Unconfirmed selections: ${unconfirmed.join(', ')}` : undefined,
  };
}

// ── Transition gate map ───────────────────────────────────────────────────────
// Only transitions with clean data sources are listed.
// Absent transitions with MANUAL_ONLY get requiresOverride:true from the runner.
// Absent transitions that can proceed freely get allPassed:true from the runner.

const TRANSITION_GATES = {
  'lead→proposal':            [checkScopeTagged, checkConsultationLogged],
  'contract→in_progress':     [checkContractSigned, checkDepositPaid, checkSelectionsConfirmed],
  'in_progress→final_touches': [checkAllSubStartsComplete],
};

// No clean automated gate for these transitions today.
// Runner returns requiresOverride:true with an explanatory message.
const MANUAL_ONLY = new Set([
  'proposal→contract',       // Proposal acceptance not yet a schema event
  'final_touches→complete',  // Final invoice paid not yet a schema signal
]);

// ── Public runner ─────────────────────────────────────────────────────────────

export async function runGatesForTransition(jobId, fromPhase, toPhase, sb) {
  const key = `${fromPhase}→${toPhase}`;

  if (MANUAL_ONLY.has(key)) {
    return {
      gates: [],
      allPassed: false,
      requiresOverride: true,
      overrideReason: 'No automatic gates defined for this transition — PM judgement required.',
    };
  }

  const gateFns = TRANSITION_GATES[key];
  if (!gateFns) {
    // Transition not in either map — proceed freely (ungated)
    return { gates: [], allPassed: true, requiresOverride: false, overrideReason: null };
  }

  const gates = await Promise.all(gateFns.map(fn => fn(jobId, sb)));
  const allPassed = gates.every(g => g.passed);
  return { gates, allPassed, requiresOverride: !allPassed, overrideReason: null };
}
