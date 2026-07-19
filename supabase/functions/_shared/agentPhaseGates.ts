// AVEN_MERGE_ARC B6.1 Slice 1 — single source of truth for the job-phase order + gate logic that
// ai-master-agent and ai-field-agent both ran (previously duplicated byte-for-byte in each fn; the
// D3 divergence risk). Extraction is behavior-preserving: this IS the code both fns already ran.
// Mirrors phaseGates.js (authoritative UI copy) — keep the two in sync until a shared runtime exists.

export const PHASE_ORDER = ["lead", "proposal", "contract", "in_progress", "final_touches", "complete"];
export const PHASE_LABELS: Record<string, string> = {
  lead: "Lead", proposal: "Proposal", contract: "Contract",
  in_progress: "In Progress", final_touches: "Final Touches", complete: "Complete",
};
export const MANUAL_ONLY_PHASES = new Set(["proposal→contract", "final_touches→complete"]);

export function getNextPhase(current: string): string | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

// deno-lint-ignore no-explicit-any
export async function runGatesForTransition(jobId: string, fromPhase: string, toPhase: string, sb: any) {
  const key = `${fromPhase}→${toPhase}`;
  if (MANUAL_ONLY_PHASES.has(key)) {
    return { gates: [], allPassed: false, requiresOverride: true };
  }
  const checks: Array<() => Promise<{ key: string; label: string; passed: boolean }>> = [];
  if (key === "lead→proposal") {
    checks.push(async () => {
      const { count } = await sb.from("job_room_scopes").select("*", { count: "exact", head: true }).eq("job_id", jobId);
      return { key: "scope_tagged", label: "Scope tagged on at least one room", passed: (count ?? 0) > 0 };
    });
    checks.push(async () => {
      const { count } = await sb.from("consultation_sessions").select("*", { count: "exact", head: true }).eq("job_id", jobId);
      return { key: "consultation_logged", label: "Consultation session logged", passed: (count ?? 0) > 0 };
    });
  } else if (key === "contract→in_progress") {
    checks.push(async () => {
      const { data } = await sb.from("jobs").select("contract_signed").eq("id", jobId).single();
      return { key: "contract_signed", label: "Contract signed", passed: !!data?.contract_signed };
    });
    checks.push(async () => {
      const { count } = await sb.from("job_transactions").select("*", { count: "exact", head: true })
        .eq("job_id", jobId).in("type", ["client_payment", "client_deposit"]).eq("direction", "in").eq("status", "paid");
      return { key: "deposit_paid", label: "Client payment received", passed: (count ?? 0) > 0 };
    });
    // SCOPE_TO_ESTIMATE Phase D — mirror of checkSelectionsConfirmed (phaseGates.js). is_selection
    // fields for the job's project type (from the default room label) must all have a confirmed answer;
    // zero applicable → passes. C3 (SCOPE_PREFILL P4b): a bare scope_prefill auto-answer
    // (source='scope_prefill', confirmed_by=null) must NOT satisfy the gate — only rep/client picks or
    // human-confirmed prefills count. phaseGates.js is authoritative; keep identical.
    checks.push(async () => {
      const pass = { key: "selections_confirmed", label: "Client selections confirmed", passed: true };
      const { data: rooms } = await sb.from("job_rooms").select("label")
        .eq("job_id", jobId).order("created_at", { ascending: true }).limit(1);
      const pt = (rooms?.[0]?.label || "").toLowerCase();
      if (!pt) return pass;
      const { data: fields } = await sb.from("scope_checklists").select("field_key")
        .eq("project_type", pt).eq("is_selection", true).eq("active", true);
      const applicable = [...new Set((fields || []).map((f: any) => f.field_key))];
      if (!applicable.length) return pass;
      const { data: confirmedRows } = await sb.from("job_scope_answers").select("field_key, source, confirmed_by")
        .eq("job_id", jobId).eq("status", "confirmed");
      // C3 rule: scope_prefill auto-answers do not satisfy the lock until a human confirms them.
      const confirmed = new Set((confirmedRows || [])
        .filter((r: any) => r.source !== "scope_prefill" || r.confirmed_by)
        .map((r: any) => r.field_key));
      const unconfirmed = applicable.filter((fk) => !confirmed.has(fk));
      const lockedN = applicable.length - unconfirmed.length;
      return {
        key: "selections_confirmed",
        label: unconfirmed.length
          ? `Client selections locked (${lockedN} of ${applicable.length}) — unconfirmed: ${unconfirmed.join(", ")}`
          : `Client selections locked (${applicable.length} of ${applicable.length})`,
        passed: unconfirmed.length === 0,
      };
    });
  } else if (key === "in_progress→final_touches") {
    checks.push(async () => {
      const { count } = await sb.from("schedule_items").select("*", { count: "exact", head: true })
        .eq("job_id", jobId).eq("type", "sub_start").neq("status", "complete").neq("status", "cancelled");
      return { key: "all_sub_starts_complete", label: "All sub start schedule items complete", passed: (count ?? 0) === 0 };
    });
  } else {
    return { gates: [], allPassed: true, requiresOverride: false };
  }
  const gates = await Promise.all(checks.map((fn) => fn()));
  const allPassed = gates.every((g) => g.passed);
  return { gates, allPassed, requiresOverride: !allPassed };
}
