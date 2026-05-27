
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// ── Canonical phase model — mirrored from src/lib/phaseGates.js ──────────────
// IMPORTANT: this gate logic is a port of avenstone-vite/src/lib/phaseGates.js.
// Both copies must stay in sync. Same comment in ai-field-agent/index.ts.
// Edge fn can't import frontend code; keep this in sync if PHASE_ORDER ever changes.
const PHASE_ORDER = ["lead", "proposal", "contract", "in_progress", "final_touches", "complete"];
const PHASE_LABELS: Record<string, string> = {
  lead: "Lead", proposal: "Proposal", contract: "Contract",
  in_progress: "In Progress", final_touches: "Final Touches", complete: "Complete",
};
const MANUAL_ONLY_PHASES = new Set(["proposal→contract", "final_touches→complete"]);

function getNextPhase(current: string): string | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

async function runGatesForTransition(jobId: string, fromPhase: string, toPhase: string, sb: any) {
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
        .eq("job_id", jobId).eq("type", "client_payment").eq("direction", "in").eq("status", "paid");
      return { key: "deposit_paid", label: "Client payment received", passed: (count ?? 0) > 0 };
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

// ── Notification helper — mirrors sbNotify in src/lib/supabase.js ────────────
async function notifyTenantStaff(sb: any, tenantId: string, excludeId: string, payload: {
  type: string; title: string; body: string; jobId?: string;
}) {
  try {
    const { data } = await sb.from("profiles").select("id")
      .eq("tenant_id", tenantId).in("role", ["owner", "project_manager", "sales_rep"]);
    const targets = (data || []).map((p: any) => p.id).filter((id: string) => id !== excludeId);
    if (!targets.length) return;
    await sb.from("notifications").insert(
      targets.map((uid: string) => ({
        tenant_id: tenantId, user_id: uid, job_id: payload.jobId ?? null,
        type: payload.type, title: payload.title, body: payload.body,
        read: false, email_sent: false, sms_sent: false,
      })),
    );
  } catch (e) { console.error("[ai-master-agent notify]", e); }
}

// ─── Agent Card types ─────────────────────────────────────────────────────────
//
// pending_card / card_response — structured elicitation surface.
// See avenstone-vite/src/lib/agentCards.js for the JS-side contract and full
// control-flow notes. The TypeScript shapes here must stay in sync with that file.
//
// card_response re-enters via the main handler BEFORE the hasContent check.
// The client appends the formatted answers as a user turn to conversationHistory
// BEFORE sending, so the history already ends with
//   [assistant: card question text] → [user: formatted answers].
// The handler passes that history to runAgentLoop unchanged — no extra user
// message is appended. Claude sees the complete context and calls the tool.
//
// This path is intentionally separate from confirmed:true (which skips Claude).
// card_response MUST go through runAgentLoop so the model can use the answers.

interface CardOption {
  value: string;
  label: string;
}

interface CardItem {
  id: string;
  label: string;
}

interface CardQuestion {
  id: string;
  type: "select" | "radio_per_item" | "text";
  label: string;
  options: CardOption[]; // [] for text; required for select + radio_per_item
  items?: CardItem[]; // radio_per_item only
  optional?: boolean;  // submit allowed without an answer; default false
}

interface PendingCard {
  id: string;
  prompt: string;
  questions: CardQuestion[];
  // Optional server-side context echoed back by the client in card_response.
  // Used by Phase 5 gate-resolution to carry job_id + failing gates between
  // cards without round-tripping through Claude. Never rendered.
  meta?: Record<string, unknown>;
}

// Confirmation whitelist — every write verb that creates a row or moves money
// goes through the Confirm card. The card IS the chokepoint; the agent never
// writes silently. Read tools (get_*) are excluded by definition.
const CONFIRM_TOOLS = new Set([
  "log_payment",
  "log_receipt",
  "submit_change_order",
  "add_todo",
  "create_job",
  "notify_team_member",
  "create_schedule_item",
  "log_sub_invoice",
  "log_sub_payment",
  "approve_sub_invoice",
]);

// ── REQUIRED_FIELDS registry (Phase 4) ───────────────────────────────────────
// Generalized pre-execution elicitation. Replaces Phase 2's bespoke ELICIT_TOOLS
// (which had a hand-written elicitor per tool). Each write tool declares the
// fields it needs from the user; one generic validator (validateRequiredFields)
// inspects the tool call, collects every missing field, and emits ONE
// pending_card (form-shape, one question per gap). Not N cards, not N text
// turns. card_response → answers merge into tool input → tool re-called.
//
// type ∈ {select, text} for v1. dynamic_options='active_jobs' is expanded to
// the user's active job list at card-emit time (label = address — client —
// status, value = job_id) so the disambiguation card pattern works for any
// tool that needs a job. Static options live on the field spec directly.
type FieldSpec = {
  field: string;        // key in tool input
  type: "select" | "text";
  label: string;        // shown on card
  options?: CardOption[]; // static select options (omit for text)
  dynamic_options?: "active_jobs";
};

const RECEIPT_TYPE_OPTIONS: CardOption[] = [
  { value: "material_purchase", label: "Materials" },
  { value: "fuel", label: "Fuel" },
  { value: "permit", label: "Permit / Inspection" },
  { value: "sub_payout", label: "Sub Payout" },
  { value: "vendor_payment", label: "Vendor Payment" },
  { value: "commission", label: "Commission" },
  { value: "equipment_rental", label: "Equipment Rental" },
  { value: "labor", label: "Labor (hourly)" },
  { value: "other_expense", label: "Other Expense" },
];

const REQUIRED_FIELDS: Record<string, FieldSpec[]> = {
  log_payment: [
    { field: "amount", type: "text", label: "Amount ($)" },
    { field: "job_id", type: "select", label: "Job", dynamic_options: "active_jobs" },
  ],
  log_receipt: [
    { field: "amount", type: "text", label: "Amount ($)" },
    { field: "job_id", type: "select", label: "Job", dynamic_options: "active_jobs" },
    { field: "type", type: "select", label: "Expense category", options: RECEIPT_TYPE_OPTIONS },
  ],
  submit_change_order: [
    { field: "job_id", type: "select", label: "Job", dynamic_options: "active_jobs" },
    { field: "amount", type: "text", label: "Amount ($)" },
    { field: "description", type: "text", label: "Description" },
  ],
  add_todo: [
    { field: "title", type: "text", label: "What to do" },
  ],
  create_job: [
    { field: "address", type: "text", label: "Job address" },
  ],
  add_contact: [
    { field: "full_name", type: "text", label: "Full name" },
  ],
  send_client_portal: [
    { field: "job_id", type: "select", label: "Job", dynamic_options: "active_jobs" },
    { field: "email", type: "text", label: "Client email" },
  ],
  invite_person: [
    { field: "email", type: "text", label: "Email" },
    { field: "full_name", type: "text", label: "Full name" },
    { field: "role", type: "select", label: "Role", options: [
      { value: "owner", label: "Owner" },
      { value: "project_manager", label: "Project Manager" },
      { value: "sales_rep", label: "Sales Rep" },
      { value: "sub", label: "Sub" },
    ] },
  ],
  add_note: [
    { field: "job_id", type: "select", label: "Job", dynamic_options: "active_jobs" },
    { field: "content", type: "text", label: "Note" },
  ],
  advance_phase: [
    { field: "job_id", type: "select", label: "Job", dynamic_options: "active_jobs" },
  ],
  notify_team: [
    { field: "title", type: "text", label: "Title" },
    { field: "body", type: "text", label: "Message" },
  ],
  add_knowledge: [
    { field: "category", type: "text", label: "Category" },
    { field: "content", type: "text", label: "Content" },
  ],
  // Intentionally skipped: update_job, update_phase (technical-ID + object-payload
  // required fields — model gets these from prior tool calls, not user prompts).
};

function isMissing(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}

async function validateRequiredFields(
  sb: ReturnType<typeof createClient>,
  tenantId: string,
  toolName: string,
  input: Record<string, unknown>,
  contextJobId = "",
): Promise<PendingCard | null> {
  const spec = REQUIRED_FIELDS[toolName];
  if (!spec) return null;

  const gaps = spec.filter((f) => isMissing(input[f.field]));
  if (gaps.length === 0) return null; // loop guard — every required field present

  // Resolve any dynamic_options up front (one DB hit max, only if needed).
  let activeJobOptions: CardOption[] | null = null;
  if (gaps.some((g) => g.dynamic_options === "active_jobs")) {
    const { data } = await sb.from("jobs")
      .select("id, address, client_name, status")
      .eq("tenant_id", tenantId)
      .not("status", "in", "(complete,on_hold)")
      .order("created_at", { ascending: false })
      .limit(50);
    activeJobOptions = (data || []).map((j: any) => ({
      value: String(j.id),
      label: [j.address, j.client_name, j.status].filter(Boolean).join(" — "),
    }));
  }

  const questions: CardQuestion[] = gaps.map((g) => {
    if (g.type === "text") {
      return { id: g.field, type: "text", label: g.label, options: [] };
    }
    const options = g.dynamic_options === "active_jobs"
      ? (activeJobOptions || [])
      : (g.options || []);
    return { id: g.field, type: "select", label: g.label, options };
  });

  return {
    id: crypto.randomUUID(),
    prompt: "I need a bit more info before I can run this.",
    questions,
  };
}

// Post-execution elicitation registry — tools where the card is triggered by
// inspecting the tool RESULT (not missing input). Parallel to ELICIT_TOOLS but
// fires inside the tool-execution loop, after executeTool returns, before the
// tool_result is fed back to Claude. Returning null means proceed normally.
// Loop guard: the card answer re-enters as a new user turn in conversation_history
// — on re-entry the model has the selected value and calls the next tool directly.
const POST_EXECUTE_ELICIT: Record<
  string,
  (input: Record<string, unknown>, result: Record<string, unknown>) => PendingCard | null
> = {
  advance_phase: (input, result) => {
    // Phase 5: when gates fail without an override_reason the executor returns
    // requires_override + failing_gates. Surface Card A (gate resolution) so
    // the user can redirect / leave open / override-with-structured-reason
    // instead of seeing a raw error message.
    if (!(result.requires_override === true)) return null;
    const jobId = String(input.job_id || "");
    const failing = (result.failing_gates as string[]) || [];
    // Executor maps phase keys to labels before returning; recover the raw keys
    // via reverse lookup so PHASE_LABELS map calls in card text are consistent.
    const labelToKey: Record<string, string> = {};
    for (const [k, v] of Object.entries(PHASE_LABELS)) labelToKey[v] = k;
    const currentPhase = labelToKey[String(result.current_phase || "")] || String(result.current_phase || "");
    const nextPhase = labelToKey[String(result.next_phase || "")] || String(result.next_phase || "");
    return buildGateResolutionCardA(jobId, currentPhase, nextPhase, failing);
  },
  get_jobs: (input, result) => {
    if (!input.search || typeof input.search !== "string" || !input.search.trim()) return null;
    const jobs = ((result.jobs as Array<Record<string, unknown>>) || []);
    if (jobs.length <= 1) return null; // 0 = not found (model handles via text); 1 = unambiguous
    return {
      id: crypto.randomUUID(),
      prompt: `Multiple jobs match "${String(input.search).trim()}" — which one did you mean?`,
      questions: [{
        id: "job_id",
        type: "select",
        label: "Select a job",
        options: [
          ...jobs.map((j) => {
            const parts = [j.address, j.client_name, j.status].filter(Boolean);
            return { value: String(j.id), label: parts.join(" — ") };
          }),
          { value: "__none__", label: "None of these" },
        ],
      }],
    };
  },
};

// ── Phase 5: gate resolution card flow (advance_phase) ───────────────────────
// When advance_phase runs and gates fail, the agent emits a Card A with three
// action choices (override LAST per arc guard rail). The user picks; the
// card_response dispatches:
//   - redirect_schedule → text turn, no advance
//   - leave_open        → text turn, no advance
//   - override          → emit Card B (reason select + optional detail text)
// Card B submit → executor runs with override_reason; jobs.phase_override_*
// audit columns are stamped via the existing write path.
// Multi-card flow plumbing uses pending_card.meta as an opaque echo channel —
// the client doesn't render it but does send it back unchanged in card_response.
// This avoids a Claude round-trip on every step.

const GATE_OVERRIDE_REASONS: CardOption[] = [
  { value: "work_done_not_marked", label: "Work was done but never marked" },
  { value: "schedule_changed",     label: "Schedule changed" },
  { value: "client_decision",      label: "Client decision" },
  { value: "other",                label: "Other" },
];

function buildGateResolutionCardA(
  jobId: string,
  currentPhase: string,
  nextPhase: string,
  failingGates: string[],
): PendingCard {
  const blockingList = failingGates.length
    ? failingGates.map((g) => `• ${g}`).join("\n")
    : "• Manual review required.";
  return {
    id: crypto.randomUUID(),
    prompt: `Cannot advance ${PHASE_LABELS[currentPhase] || currentPhase} → ${PHASE_LABELS[nextPhase] || nextPhase}. Blocking:\n${blockingList}\n\nHow do you want to proceed?`,
    questions: [{
      id: "gate_action",
      type: "select",
      label: "Choose an action",
      options: [
        { value: "redirect_schedule", label: "Open the Schedule tab to mark blocking items complete" },
        { value: "leave_open",        label: "Leave the phase open" },
        { value: "override",          label: "Override and advance anyway" },
      ],
    }],
    meta: {
      kind: "gate_resolution",
      job_id: jobId,
      current_phase: currentPhase,
      next_phase: nextPhase,
      failing_gates: failingGates,
    },
  };
}

function buildGateOverrideCardB(jobId: string, currentPhase: string, nextPhase: string): PendingCard {
  return {
    id: crypto.randomUUID(),
    prompt: `Override ${PHASE_LABELS[currentPhase] || currentPhase} → ${PHASE_LABELS[nextPhase] || nextPhase}. Pick a reason — this is stamped to the audit trail.`,
    questions: [
      {
        id: "reason",
        type: "select",
        label: "Override reason",
        options: GATE_OVERRIDE_REASONS,
      },
      {
        id: "detail",
        type: "text",
        label: "Additional detail (optional)",
        options: [],
        optional: true,
      },
    ],
    meta: {
      kind: "gate_override",
      job_id: jobId,
      current_phase: currentPhase,
      next_phase: nextPhase,
    },
  };
}

// ─── Tool definitions (Claude tool use schema) ────────────────────────────────

const TOOLS = [
  {
    name: "get_jobs",
    description: "List jobs for this tenant. Use `search` when the user names a specific job (by address or client name) — a disambiguation card surfaces automatically when multiple matches are found. Omit `search` when browsing all jobs.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search by address or client name — use when the user names a specific job. Omit when browsing all jobs." },
        status: { type: "string", description: "Filter by job lifecycle status: lead, proposal, contract, in_progress, final_touches, complete, on_hold. Omit for all." },
        limit: { type: "number", description: "Max results (default 30)" },
      },
    },
  },
  {
    name: "get_team",
    description: "List all staff and subs — names, roles, trades, emails.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_job",
    description: "Create a new job record.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Job site address" },
        client_name: { type: "string" },
        client_email: { type: "string" },
        client_phone: { type: "string" },
        status: { type: "string", description: "Initial status, default 'lead'" },
        scope: { type: "string", description: "Brief scope description" },
        contract_value: { type: "number" },
        target_completion: { type: "string", description: "YYYY-MM-DD" },
        assigned_rep: { type: "string", description: "Full name of sales rep" },
      },
      required: ["address"],
    },
  },
  {
    name: "update_job",
    description: "Update any field(s) on an existing job.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        fields: {
          type: "object",
          description: "Key-value pairs to update. Valid keys: status, client_name, client_email, client_phone, contract_value, co_total, target_completion, scope, assigned_rep, assigned_subs, start_date, description, name",
        },
      },
      required: ["job_id", "fields"],
    },
  },
  {
    name: "add_contact",
    description: "Add a new contact (client, lead, realtor, etc.) to the contacts table.",
    input_schema: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        type: { type: "string", description: "contact type: client, lead, realtor, vendor" },
        notes: { type: "string" },
        job_id: { type: "string", description: "Associate with a job if relevant" },
      },
      required: ["full_name"],
    },
  },
  {
    name: "send_client_portal",
    description: "Send a magic link to a client so they can access their job portal.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        email: { type: "string" },
        client_name: { type: "string" },
      },
      required: ["job_id", "email"],
    },
  },
  {
    name: "invite_person",
    description: "Invite a new staff member or subcontractor by email. They receive an invite email and get an account.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string" },
        full_name: { type: "string" },
        role: { type: "string", description: "owner, project_manager, sales_rep, sub" },
        trade: { type: "string", description: "Required for subs. E.g. Roofing, Electrical" },
        phone: { type: "string" },
      },
      required: ["email", "full_name", "role"],
    },
  },
  {
    name: "add_note",
    description: "Add a note to a job. Auto-applies (no confirmation).",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        content: { type: "string" },
      },
      required: ["job_id", "content"],
    },
  },
  {
    name: "advance_phase",
    description: "Advance a job to the next lifecycle phase (lead → proposal → contract → in_progress → final_touches → complete). Checks gates; returns failing gates if not passed. Auto-applies when gates pass.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        override_reason: { type: "string", description: "Required only when gates fail and the user agreed to override." },
      },
      required: ["job_id"],
    },
  },
  {
    name: "update_phase",
    description: "Update an existing trade-phase row (Demo, Framing, etc.) on a job — status, dates, notes. This is for trade phases, not the job lifecycle.",
    input_schema: {
      type: "object",
      properties: {
        phase_id: { type: "string" },
        fields: { type: "object", description: "Keys: status (pending/in_progress/complete), start_date, end_date, name, description" },
      },
      required: ["phase_id", "fields"],
    },
  },
  {
    name: "submit_change_order",
    description: "Submit a change order on a job. Requires confirmation.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        description: { type: "string" },
        amount: { type: "number", description: "Dollar amount. Negative for credits." },
      },
      required: ["job_id", "description", "amount"],
    },
  },
  {
    name: "log_payment",
    description: "Record an inbound client payment for a job (deposit, draw, final). Requires confirmation.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        amount: { type: "number" },
        description: { type: "string", description: "e.g. 'Deposit', 'Draw 2', 'Final payment'" },
        payment_method: { type: "string", description: "check, ach, card, cash, wire, other" },
      },
      required: ["job_id", "amount"],
    },
  },
  {
    name: "log_receipt",
    description: "Record an outbound expense (material purchase, fuel, permit, sub payout, etc). Do NOT include image_data or image_mime — the system attaches the receipt photo automatically when the user provided one.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        amount: { type: "number" },
        description: { type: "string", description: "What was purchased / who was paid" },
        vendor: { type: "string", description: "Vendor or payee name" },
        type: {
          type: "string",
          enum: ["material_purchase", "fuel", "permit", "sub_payout", "vendor_payment", "commission", "other_expense", "equipment_rental", "labor"],
          description: "Expense category. Omit when unknown — the missing-field card collects it from the user.",
        },
      },
      required: ["job_id", "amount", "description"],
    },
  },
  {
    name: "notify_team",
    description: "Send an in-app notification to all staff on this tenant, or to a specific user.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        job_id: { type: "string", description: "Associate with a job (optional)" },
        user_id: { type: "string", description: "Send to specific user only (optional, omit for all staff)" },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "add_todo",
    description: "Add a todo (action item) for a user. Use this for any 'remind me', 'don't forget', 'follow up', 'call back', 'schedule', or other action-item intent. Distinct from add_note — todos are tracked tasks with due dates and priorities; notes are passive context. If the user says 'add a todo' / 'add to my todo list' / 'remind me to X', ALWAYS pick this tool, not add_note.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The todo title — what needs doing." },
        notes: { type: "string", description: "Optional context (defaults to null)." },
        job_id: { type: "string", description: "Associate with a job (optional). Omit for personal todos." },
        assignee_id: { type: "string", description: "UUID of the team member to assign this todo to; omit to assign to yourself." },
        due_date: { type: "string", description: "Optional ISO date (YYYY-MM-DD)." },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level; defaults to medium." },
      },
      required: ["title"],
    },
  },
  {
    name: "notify_team_member",
    description: "Send a direct in-app alert to a specific team member right now. Use for urgent internal messages: 'tell the PM we have a leak', 'let the owner know the inspector arrived'. Internal only — does not reach clients or subs who aren't engaged on a job. Single recipient per call; call multiple times for multiple people.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message text to send." },
        target_user_id: { type: "string", description: "UUID of the specific team member to notify. Use this when you know the person." },
        target_role_on_job: { type: "string", enum: ["pm", "owner"], description: "Notify by role on a job: 'pm' = the job's assigned PM, 'owner' = the tenant owner. Requires related_job_id when 'pm'." },
        related_job_id: { type: "string", description: "Associate with a specific job. Required when target_role_on_job='pm'." },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level. Defaults to 'high'. High priority also sends an email." },
        also_create_todo: { type: "boolean", description: "Also create a todo for the recipient as a follow-up action item. You MUST still identify the recipient via target_user_id or target_role_on_job — these fields are required even when also_create_todo is true." },
      },
      required: ["message"],
    },
  },
  {
    name: "create_schedule_item",
    description: "Create a scheduled event on a job's calendar. Use when the user says things like 'schedule garage door guy for Monday', 'add tile delivery next Tuesday', 'put framing inspection on Friday', or 'create a milestone for drywall complete'. Resolves dates relative to today. Can invite a sub by name (fuzzy match on team). Optionally links to a job phase.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Required. Job this event belongs to. Infer from context; ask if unclear." },
        title: { type: "string", description: "Required. Short title. E.g. 'Garage door install', 'Tile delivery', 'Framing inspection'." },
        type: {
          type: "string",
          enum: ["material_delivery", "sub_start", "site_visit", "inspection", "milestone", "delay"],
          description: "Required. sub_start = a sub starts work. material_delivery = material delivery. inspection = code inspection. milestone = phase milestone (auto-flags is_milestone). site_visit = walkthrough or meeting. delay = schedule slip note.",
        },
        scheduled_date: { type: "string", description: "Required. ISO date YYYY-MM-DD. Resolve relative phrases ('Monday', 'next Tuesday', 'in 3 days') to absolute dates." },
        scheduled_end_date: { type: "string", description: "Optional. ISO date. End date for multi-day events." },
        scheduled_time: { type: "string", description: "Optional. HH:MM 24-hour. Omit for all-day events." },
        duration_days: { type: "integer", description: "Optional. Default 1. Working days the task takes." },
        trade: { type: "string", description: "Optional. MUST be a canonical trade string from the tenant's active trade taxonomy (e.g. 'Framing', 'Tile - Floor', 'Tile - Wall / shower', 'Cabinets / vanities - Install', 'Plumbing - Finish / fixtures'). If the user describes a trade in freeform ('garage door install', 'paint the bathroom'), infer the closest canonical match. If uncertain, omit — the schedule modal will infer from title or sub assignment." },
        sub_search: { type: "string", description: "Optional. If user names a sub ('garage door guy', 'John', 'ABC Tile'), pass that here — system fuzzy-matches team profiles." },
        phase_search: { type: "string", description: "Optional. If user implies a phase ('for the framing phase', 'drywall milestone'), pass the phase name — system fuzzy-matches job_phases." },
        is_milestone: { type: "boolean", description: "Optional. Set true to make this a client-visible milestone. Auto-set when type='milestone'." },
        notify_client: { type: "boolean", description: "Override default. Default: true when type='milestone', false otherwise." },
        notify_sub: { type: "boolean", description: "Override default. Default: true when a sub is matched via sub_search, false otherwise." },
        notes: { type: "string", description: "Optional. Free-text notes or instructions." },
      },
      required: ["job_id", "title", "type", "scheduled_date"],
    },
  },
  {
    name: "add_knowledge",
    description: "Write a new entry to the company AI knowledge base. Use this when you learn something worth remembering — a preference, policy, pricing insight, or lesson from a job.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "e.g. pricing, scheduling, clients, subs, estimating, communication" },
        content: { type: "string", description: "The knowledge to store. Be specific and actionable." },
      },
      required: ["category", "content"],
    },
    cache_control: { type: "ephemeral" },
  },
  {
    name: "log_sub_invoice",
    description: "Records a new sub-contractor invoice for a job. Use when user mentions a sub sent an invoice or bill. Lands in Pending Review until owner/PM approves.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job ID. Use the active job context if available." },
        sub_name: { type: "string", description: "Name of the subcontractor." },
        amount: { type: "number", description: "Total invoice amount in USD." },
        invoice_number: { type: "string", description: "Invoice number if user mentioned one. Omit to auto-generate." },
        invoice_date: { type: "string", description: "ISO date YYYY-MM-DD. Default today if not specified." },
        due_date: { type: "string", description: "ISO date YYYY-MM-DD. Optional." },
        description: { type: "string", description: "Short description of work invoiced." },
      },
      required: ["job_id", "sub_name", "amount"],
    },
  },
  {
    name: "log_sub_payment",
    description: "Records a payment made to a sub against an existing approved invoice. Use when user mentions paying a sub or writing a check to a sub. If sub has multiple unpaid invoices, ask which before calling this tool.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job ID. Use active job context." },
        sub_name: { type: "string", description: "Name of the sub being paid." },
        amount: { type: "number", description: "Payment amount in USD." },
        method: { type: "string", enum: ["check", "ach", "cash", "card", "other"], description: "Payment method." },
        reference: { type: "string", description: "Check number, ACH confirmation, or transaction ID. Optional." },
        paid_date: { type: "string", description: "ISO date YYYY-MM-DD. Default today." },
        invoice_id: { type: "string", description: "UUID of specific invoice to pay. Required if sub has multiple unpaid invoices." },
        notes: { type: "string", description: "Optional notes." },
      },
      required: ["job_id", "sub_name", "amount", "method"],
    },
  },
  {
    name: "approve_sub_invoice",
    description: "Approves a sub invoice in pending_review status. Owner/PM only. Use when user explicitly approves an invoice from a sub.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job ID." },
        sub_name: { type: "string", description: "Name of the sub whose invoice to approve." },
        invoice_id: { type: "string", description: "UUID of specific invoice. Required if sub has multiple pending invoices on this job." },
      },
      required: ["job_id", "sub_name"],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  sb: ReturnType<typeof createClient>,
  tenantId: string,
  userId: string,
  toolName: string,
  input: Record<string, unknown>,
  userRole = "owner",
): Promise<Record<string, unknown>> {
  try {
    switch (toolName) {

      case "get_jobs": {
        let q = sb.from("jobs")
          .select("id, address, client_name, status, contract_value, target_completion, assigned_rep, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(Number(input.limit) || 30);
        if (input.status) q = q.eq("status", String(input.status));
        if (input.search && typeof input.search === "string" && input.search.trim()) {
          const term = input.search.trim().replace(/%/g, "\\%");
          q = q.or(`address.ilike.%${term}%,client_name.ilike.%${term}%`);
        }
        const { data, error } = await q;
        if (error) return { error: error.message, jobs: [], count: 0 };
        return { jobs: data || [], count: (data || []).length };
      }

      case "get_team": {
        const { data } = await sb.from("profiles")
          .select("id, full_name, role, trade, email, phone")
          .eq("tenant_id", tenantId)
          .order("role").order("full_name");
        return { team: data || [] };
      }

      case "create_job": {
        const { data, error } = await sb.from("jobs").insert({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          address: input.address,
          client_name: input.client_name || null,
          client_email: input.client_email || null,
          client_phone: input.client_phone || null,
          status: input.status || "lead",
          scope: input.scope || null,
          contract_value: input.contract_value || 0,
          target_completion: input.target_completion || null,
          assigned_rep: input.assigned_rep || null,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        return { success: true, job_id: data.id, address: data.address, status: data.status };
      }

      case "update_job": {
        const allowed = ["status","client_name","client_email","client_phone","contract_value","co_total","target_completion","scope","assigned_rep","assigned_subs","start_date","description","name"];
        const update: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input.fields as Record<string, unknown>)) {
          if (allowed.includes(k)) update[k] = v;
        }
        const { error } = await sb.from("jobs").update(update).eq("id", input.job_id).eq("tenant_id", tenantId);
        if (error) return { error: error.message };
        return { success: true, updated_fields: Object.keys(update) };
      }

      case "add_contact": {
        const { data, error } = await sb.from("contacts").insert({
          tenant_id: tenantId,
          name: input.full_name,
          email: input.email || null,
          phone: input.phone || null,
          type: input.type || "client",
          notes: input.notes || null,
          job_id: input.job_id || null,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        return { success: true, contact_id: data.id, name: data.name };
      }

      case "send_client_portal": {
        const { data: job } = await sb.from("jobs").select("address").eq("id", input.job_id).single();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-client-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
          body: JSON.stringify({
            email: input.email,
            client_name: input.client_name || "",
            job_address: job?.address || "",
            job_id: input.job_id,
            tenant_id: tenantId,
          }),
        });
        const json = await res.json();
        return res.ok ? { success: true, email_sent_to: input.email } : { error: json.error || "Send failed" };
      }

      case "invite_person": {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
          body: JSON.stringify({
            email: input.email,
            full_name: input.full_name,
            role: input.role,
            trade: input.trade || "",
            phone: input.phone || "",
            tenant_id: tenantId,
          }),
        });
        const json = await res.json();
        return res.ok ? { success: true, user_id: json.user_id, invited: input.email } : { error: json.error || "Invite failed" };
      }

      case "add_note": {
        // Mirrors sbCreateNote contract: insert via author (text) + fire note_posted notification.
        const { data: prof } = await sb.from("profiles").select("full_name").eq("id", userId).single();
        const author = (prof as any)?.full_name || "Master Agent";
        const { data, error } = await sb.from("job_notes").insert({
          tenant_id: tenantId,
          job_id: input.job_id,
          content: input.content,
          author,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        const { data: jrow } = await sb.from("jobs").select("address").eq("id", input.job_id).single();
        const title = (jrow as any)?.address ? `Note on ${(jrow as any).address}` : "New job note";
        notifyTenantStaff(sb, tenantId, userId, {
          type: "note_posted", title, body: String(input.content).slice(0, 120), jobId: String(input.job_id),
        }).catch(() => {});
        return { success: true, note_id: (data as any).id };
      }

      case "advance_phase": {
        // Mirrors sbAdvancePhase contract: writes to jobs.status, gate-fail without reason returns requiresOverride payload.
        const { data: job } = await sb.from("jobs").select("id, status").eq("id", input.job_id).single();
        if (!job) return { error: "Job not found." };
        const currentPhase = (job as any).status as string;
        const nextPhase = getNextPhase(currentPhase);
        if (!nextPhase) {
          return { error: `${PHASE_LABELS[currentPhase] || currentPhase} is the final phase.`, terminal: true };
        }
        const { gates, allPassed, requiresOverride } = await runGatesForTransition(String(input.job_id), currentPhase, nextPhase, sb);
        const useOverride = !allPassed;
        const overrideReason = (input.override_reason as string | undefined)?.trim();
        if (useOverride && !overrideReason) {
          const failing = gates.filter((g) => !g.passed).map((g) => g.label);
          return {
            error: `Cannot advance: gates failing — ${failing.join("; ") || "manual override required"}.`,
            requires_override: true,
            failing_gates: failing,
            current_phase: PHASE_LABELS[currentPhase] || currentPhase,
            next_phase: PHASE_LABELS[nextPhase] || nextPhase,
          };
        }
        const nowIso = new Date().toISOString();
        const { error } = await sb.from("jobs").update({
          status: nextPhase,
          phase_override_used: useOverride,
          phase_override_reason: useOverride ? overrideReason : null,
          phase_override_at: useOverride ? nowIso : null,
          phase_override_by_id: useOverride ? userId : null,
        }).eq("id", input.job_id);
        if (error) return { error: error.message };
        return {
          success: true,
          from_phase: PHASE_LABELS[currentPhase] || currentPhase,
          to_phase: PHASE_LABELS[nextPhase] || nextPhase,
          override: useOverride,
        };
      }

      case "update_phase": {
        const allowed = ["status","start_date","end_date","name","description","assigned_sub_id"];
        const update: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input.fields as Record<string, unknown>)) {
          if (allowed.includes(k)) update[k] = v;
        }
        const { error } = await sb.from("job_phases").update(update).eq("id", input.phase_id);
        if (error) return { error: error.message };
        return { success: true, updated: Object.keys(update) };
      }

      case "submit_change_order": {
        // Mirrors sbCreateChangeOrder contract: auto co_number + sbNotify('co_submitted').
        const { count } = await sb.from("change_orders").select("id", { count: "exact", head: true }).eq("job_id", input.job_id);
        const coNumber = `CO-${String((count || 0) + 1).padStart(3, "0")}`;
        const { data, error } = await sb.from("change_orders").insert({
          tenant_id: tenantId,
          job_id: input.job_id,
          co_number: coNumber,
          description: input.description,
          amount: Number(input.amount),
          status: "pending",
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        const { data: jrow } = await sb.from("jobs").select("address").eq("id", input.job_id).single();
        const title = (jrow as any)?.address ? `New CO on ${(jrow as any).address}` : `New change order ${coNumber}`;
        const body = `${coNumber}: ${input.description} — $${Number(input.amount).toLocaleString()}`;
        notifyTenantStaff(sb, tenantId, userId, { type: "co_submitted", title, body, jobId: String(input.job_id) }).catch(() => {});
        return { success: true, co_id: (data as any).id, co_number: coNumber, amount: (data as any).amount };
      }

      case "log_payment": {
        const { data, error } = await sb.from("job_transactions").insert({
          tenant_id: tenantId,
          job_id: input.job_id,
          direction: "in",
          type: "client_payment",
          amount: Number(input.amount),
          description: input.description || null,
          payment_method: input.payment_method || null,
          status: "paid",
          date_paid: new Date().toISOString().slice(0, 10),
          created_by: userId,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        return { success: true, transaction_id: (data as any).id, amount: (data as any).amount };
      }

      case "log_receipt": {
        // Type from agent input or default. Constraint job_transactions_type_check
        // restricts to: client_payment, client_deposit, client_refund, sub_payout,
        // vendor_payment, material_purchase, equipment_rental, permit, fuel,
        // commission, other_expense, other_income, labor.
        const ALLOWED_OUT = new Set([
          "material_purchase", "fuel", "permit", "sub_payout",
          "vendor_payment", "commission", "other_expense", "equipment_rental", "labor",
        ]);
        const rawType = String(input.type ?? "");
        if (!ALLOWED_OUT.has(rawType)) {
          return { error: `Missing or invalid expense type "${rawType}". Category card should have collected this — check elicitation flow.` };
        }
        const txType = rawType;
        const { data, error } = await sb.from("job_transactions").insert({
          tenant_id: tenantId,
          job_id: input.job_id,
          direction: "out",
          type: txType,
          amount: Number(input.amount),
          description: input.description,
          payer_or_payee_name: input.vendor || null,
          status: "paid",
          date_paid: new Date().toISOString().slice(0, 10),
          created_by: userId,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        const txId = (data as any).id;

        // Best-effort receipt photo upload — mirrors sbUploadReceipt path/bucket
        // shape so TransactionModal renders it in the existing Receipt slot.
        let receiptPath: string | null = null;
        let receiptError: string | null = null;
        if (input.image_data && input.image_mime) {
          try {
            const mime = String(input.image_mime);
            const ext = (mime.split("/")[1] || "jpg").toLowerCase();
            const path = `${input.job_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const bytes = Uint8Array.from(atob(String(input.image_data)), (c) => c.charCodeAt(0));
            const { error: upErr } = await sb.storage.from("job-receipts").upload(path, bytes, { contentType: mime, upsert: false });
            if (upErr) { receiptError = upErr.message; }
            else {
              receiptPath = path;
              const { error: updErr } = await sb.from("job_transactions").update({ receipt_url: path }).eq("id", txId);
              if (updErr) receiptError = updErr.message;
            }
          } catch (e) {
            receiptError = String(e);
          }
        }

        // Best-effort dual-write: receipt file → job_files so it appears in FilesTab
        if (receiptPath) {
          try {
            await sb.from("job_files").insert({
              tenant_id: tenantId,
              job_id: String(input.job_id),
              uploaded_by_id: userId,
              name: `Receipt - ${String((input as any).vendor || input.description || "expense")}`,
              storage_path: receiptPath,
              storage_bucket: "job-receipts",
              mime_type: (input as any).image_mime ? String((input as any).image_mime) : "image/jpeg",
              category: "Receipts",
              subcategory: null,
              client_visible: false,
              related_entity_type: "job_transaction",
              related_entity_id: txId,
            });
          } catch (e) {
            console.warn("[log_receipt dual-write to job_files]", String(e));
          }
        }

        return {
          success: true,
          transaction_id: txId,
          amount: (data as any).amount,
          type: txType,
          receipt_attached: !!receiptPath,
          receipt_error: receiptError,
        };
      }

      case "notify_team": {
        let targetIds: string[] = [];
        if (input.user_id) {
          targetIds = [String(input.user_id)];
        } else {
          const { data } = await sb.from("profiles")
            .select("id").eq("tenant_id", tenantId)
            .in("role", ["owner", "project_manager", "sales_rep"]);
          targetIds = (data || []).map((p: { id: string }) => p.id).filter(id => id !== userId);
        }
        if (!targetIds.length) return { success: true, notified: 0 };
        await sb.from("notifications").insert(
          targetIds.map(uid => ({
            tenant_id: tenantId,
            user_id: uid,
            job_id: input.job_id || null,
            type: "master_agent",
            title: String(input.title),
            body: String(input.body),
            read: false,
            email_sent: false,
            sms_sent: false,
          }))
        );
        return { success: true, notified: targetIds.length };
      }

      case "add_todo": {
        // Mirrors sbCreateUserTodo contract: writes to todos with type=user_task, source=manual.
        const title = String(input.title || "").trim();
        if (!title) return { error: "title required" };
        const assigneeId = input.assignee_id ? String(input.assignee_id) : userId;
        const priority = (input.priority && ["low", "medium", "high"].includes(String(input.priority)))
          ? String(input.priority) : "medium";

        // Role gate: owner/pm can assign to anyone; rep/sub cannot cross-assign (no
        // assigned_pm_id mapping in profiles schema — Phase 2.2 flag).
        let callerName = "";
        if (assigneeId !== userId) {
          const { data: caller } = await sb.from("profiles").select("role, full_name").eq("id", userId).single();
          const callerRole = (caller as any)?.role ?? "";
          callerName = (caller as any)?.full_name ?? "Your team";
          if (callerRole !== "owner" && callerRole !== "project_manager") {
            if (callerRole === "sales_rep") {
              return { error: "Rep-to-PM delegation requires an assigned_pm_id mapping in profiles, which isn't configured yet. Assign this todo to yourself, or ask your owner or PM to delegate it." };
            }
            return { error: "You don't have permission to assign todos to other people." };
          }
        }

        const row: Record<string, unknown> = {
          tenant_id: tenantId,
          title,
          notes: input.notes ? String(input.notes).trim() : null,
          type: "user_task",
          source: "manual",
          status: "open",
          job_id: input.job_id || null,
          assigned_to_user_id: assigneeId,
          created_by_id: userId,
          due_date: input.due_date || null,
          priority,
        };
        const { data, error } = await sb.from("todos").insert(row).select().single();
        if (error) return { error: error.message };

        // Notify assignee when delegated to another person.
        if (assigneeId !== userId) {
          try {
            const { error: delegateNotifErr } = await sb.from("notifications").insert({
              tenant_id: tenantId,
              user_id: assigneeId,
              type: "todo_delegated",
              title: "New to-do assigned to you",
              body: `${callerName} assigned you: "${title}"`,
              job_id: input.job_id ? String(input.job_id) : null,
              read: false,
              email_sent: priority !== "high",  // high = email fires; medium/low = skipped
            });
            if (delegateNotifErr) console.error("[add_todo] delegation notification failed:", assigneeId, delegateNotifErr.message);
          } catch (e) {
            console.error("[add_todo] delegation notification error:", assigneeId, e);
          }
        }

        return { success: true, todo_id: (data as any).id, title: (data as any).title };
      }

      case "notify_team_member": {
        const message = String(input.message || "").trim();
        if (!message) return { error: "message required" };

        const priority = (input.priority && ["low", "medium", "high"].includes(String(input.priority)))
          ? String(input.priority) : "high";

        const { data: caller } = await sb.from("profiles").select("role, full_name").eq("id", userId).single();
        const callerRole = (caller as any)?.role ?? "";
        const callerName = (caller as any)?.full_name ?? "Your team";

        if (callerRole === "sales_rep") {
          return { error: "Sales reps cannot send direct team alerts. Ask your PM or owner to send this message." };
        }

        // Resolve target — pre-fetch injected _resolved_target_id on confirm path;
        // fall back to target_user_id or role resolution for direct executor calls.
        let targetId: string | null = input._resolved_target_id
          ? String(input._resolved_target_id)
          : (input.target_user_id ? String(input.target_user_id) : null);

        if (!targetId && input.target_role_on_job) {
          const roleOnJob = String(input.target_role_on_job);
          if (roleOnJob === "pm" && input.related_job_id) {
            const { data: jb } = await sb.from("jobs").select("assigned_pm").eq("id", String(input.related_job_id)).maybeSingle();
            targetId = (jb as any)?.assigned_pm ?? null;
          } else if (roleOnJob === "owner") {
            const { data: op } = await sb.from("profiles").select("id").eq("tenant_id", tenantId).eq("role", "owner").limit(1).maybeSingle();
            targetId = (op as any)?.id ?? null;
          }
        }

        if (!targetId) {
          return { error: "Could not resolve recipient. Provide target_user_id or target_role_on_job (with related_job_id for 'pm')." };
        }

        // Sub gate: must have active engagement on the job; target must be the job's PM.
        if (callerRole === "sub") {
          if (!input.related_job_id) {
            return { error: "Subs can only alert the PM on a specific job. Provide related_job_id." };
          }
          const { count } = await sb.from("job_sub_engagements")
            .select("*", { count: "exact", head: true })
            .eq("job_id", String(input.related_job_id))
            .eq("sub_id", userId)
            .eq("status", "active");
          if (!count || count === 0) {
            return { error: "You don't have an active engagement on this job." };
          }
          const { data: jb } = await sb.from("jobs").select("assigned_pm").eq("id", String(input.related_job_id)).maybeSingle();
          const pmId = (jb as any)?.assigned_pm;
          if (!pmId) return { error: "This job has no assigned PM to notify." };
          if (targetId !== pmId) return { error: "Subs can only alert the assigned PM on a job." };
        }

        const { error: notifErr } = await sb.from("notifications").insert({
          tenant_id: tenantId,
          user_id: targetId,
          type: "team_alert",
          title: `Message from ${callerName}`,
          body: message,
          job_id: input.related_job_id ? String(input.related_job_id) : null,
          read: false,
          email_sent: priority !== "high",  // high = email fires; medium/low = skipped
        });
        if (notifErr) return { error: notifErr.message };

        if (input.also_create_todo) {
          try {
            const { error: todoErr } = await sb.from("todos").insert({
              tenant_id: tenantId,
              title: message.slice(0, 200),
              notes: `Alert from ${callerName}`,
              type: "user_task",
              source: "manual",
              status: "open",
              job_id: input.related_job_id || null,
              assigned_to_user_id: targetId,
              created_by_id: userId,
              priority,
            });
            if (todoErr) console.error("[notify_team_member] also_create_todo failed:", targetId, todoErr.message);
          } catch (e) {
            console.error("[notify_team_member] also_create_todo error:", targetId, e);
          }
        }

        return { success: true, notified_user_id: targetId };
      }

      case "create_schedule_item": {
        const jobId = String(input.job_id || "");
        const title = String(input.title || "");
        const itemType = String(input.type || "site_visit");
        const scheduledDate = String(input.scheduled_date || "");
        const isMilestone = !!input.is_milestone || itemType === "milestone";

        // Resolve phase_id from phase_search
        let phaseId: string | null = null;
        let phaseNote = "";
        if (input.phase_search) {
          const { data: phases } = await sb.from("job_phases").select("id, phase_name").eq("job_id", jobId);
          const search = String(input.phase_search).toLowerCase();
          const match = (phases || []).find((p: any) =>
            (p.phase_name || "").toLowerCase().includes(search) ||
            search.includes((p.phase_name || "").toLowerCase().slice(0, 4))
          );
          if (match) {
            phaseId = (match as any).id;
            phaseNote = ` Linked to phase '${(match as any).phase_name}'.`;
          } else {
            phaseNote = ` (Couldn't match phase '${input.phase_search}' — skipped.)`;
          }
        }

        // Resolve sub from profiles (role=sub), fuzzy match on full_name
        let assignedSubId: string | null = null;
        let subNote = "";
        if (input.sub_search) {
          const { data: subs } = await sb.from("profiles").select("id, full_name").eq("tenant_id", tenantId).eq("role", "sub");
          const search = String(input.sub_search).toLowerCase();
          const match = (subs || []).find((s: any) => {
            const n = (s.full_name || "").toLowerCase();
            return n.includes(search) || search.includes(n.split(" ")[0]);
          });
          if (match) {
            assignedSubId = (match as any).id;
            subNote = ` Invited ${(match as any).full_name}.`;
          } else {
            subNote = ` (Couldn't find sub matching '${input.sub_search}' — created without invitee.)`;
          }
        }

        // Build insert payload
        const insertPayload: Record<string, unknown> = {
          tenant_id: tenantId,
          job_id: jobId,
          title,
          type: itemType,
          scheduled_date: scheduledDate,
          status: "scheduled",
          is_milestone: isMilestone,
          notify_client: typeof input.notify_client === 'boolean' ? input.notify_client : isMilestone,
          notify_sub: typeof input.notify_sub === 'boolean' ? input.notify_sub : !!assignedSubId,
        };
        if (input.scheduled_end_date) insertPayload.scheduled_end_date = String(input.scheduled_end_date);
        if (input.scheduled_time) insertPayload.scheduled_time = String(input.scheduled_time);
        if (typeof input.duration_days === "number") insertPayload.duration_days = input.duration_days;
        if (input.trade) insertPayload.trade = String(input.trade);
        if (phaseId) insertPayload.phase_id = phaseId;
        if (input.notes) insertPayload.notes = String(input.notes);
        if (assignedSubId) insertPayload.assigned_sub_id = assignedSubId;

        const { data: created, error: createErr } = await sb
          .from("schedule_items")
          .insert(insertPayload)
          .select("id, title, scheduled_date")
          .single();

        if (createErr || !created) {
          return { ok: false, error: `Failed to create schedule item: ${createErr?.message || "unknown"}` };
        }

        // Add invitee row if sub resolved
        let inviteNote = "";
        if (assignedSubId) {
          const { error: invErr } = await sb.from("schedule_item_invitees").insert({
            tenant_id: tenantId,
            schedule_item_id: (created as any).id,
            invitee_user_id: assignedSubId,
            status: "invited",
            invited_by: userId,
          });
          inviteNote = invErr
            ? ` (Invite insert failed: ${invErr.message})`
            : " Sub can accept/decline in their app.";
        }

        // Audit log
        await sb.from("schedule_change_log").insert({
          tenant_id: tenantId,
          schedule_item_id: (created as any).id,
          job_id: jobId,
          change_kind: "created",
          new_value: insertPayload,
          changed_by_id: userId,
          reason: "Master Agent create_schedule_item",
        });

        const dateStr = new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "long", month: "short", day: "numeric",
        });

        return {
          ok: true,
          schedule_item_id: (created as any).id,
          summary: `Created '${title}' for ${dateStr}.${phaseNote}${subNote}${inviteNote}`,
        };
      }

      case "add_knowledge": {
        const { data, error } = await sb.from("ai_knowledge").insert({
          tenant_id: tenantId,
          category: input.category,
          content: input.content,
          active: true,
          created_by: userId,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        return { success: true, knowledge_id: data.id, category: data.category };
      }

      case "log_sub_invoice": {
        // 1. Resolve sub_contact_id from sub_name
        const { data: siContacts } = await sb
          .from("contacts")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .eq("type", "sub")
          .ilike("name", `%${String(input.sub_name)}%`);

        let subContactId: string;
        if (!siContacts || siContacts.length === 0) {
          // Auto-create minimal contact (matches UI combobox behavior)
          const { data: newContact, error: createErr } = await sb
            .from("contacts")
            .insert({ name: String(input.sub_name).trim(), type: "sub", tenant_id: tenantId })
            .select("id")
            .single();
          if (createErr || !newContact) return { error: `Could not create sub contact: ${createErr?.message}` };
          subContactId = (newContact as any).id;
        } else if (siContacts.length > 1) {
          const names = siContacts.map((c: any) => c.name).join(", ");
          return { error: `Multiple subs match "${input.sub_name}": ${names}. Please be more specific.` };
        } else {
          subContactId = (siContacts[0] as any).id;
        }

        // 2. Auto-generate invoice number if not provided
        let invoiceNumber = input.invoice_number ? String(input.invoice_number) : null;
        let autoGenerated = false;
        if (!invoiceNumber) {
          const { count: invCount } = await sb
            .from("sub_invoices")
            .select("id", { count: "exact", head: true })
            .eq("job_id", input.job_id)
            .eq("sub_contact_id", subContactId)
            .is("voided_at", null);
          const nameSlug = String(input.sub_name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20);
          const jobShort = String(input.job_id).slice(-6);
          invoiceNumber = `${nameSlug}-${jobShort}-${(invCount || 0) + 1}`;
          autoGenerated = true;
        }

        // 3. Insert sub_invoice
        const siToday = new Date().toISOString().split("T")[0];
        const { data: inv, error: invErr } = await sb
          .from("sub_invoices")
          .insert({
            tenant_id: tenantId,
            job_id: input.job_id,
            sub_contact_id: subContactId,
            invoice_number: invoiceNumber,
            auto_generated_number: autoGenerated,
            invoice_date: input.invoice_date || siToday,
            due_date: input.due_date || null,
            amount: Number(input.amount),
            description: input.description || null,
            submitted_via: "master_agent",
            created_by_id: userId,
          })
          .select("id, invoice_number")
          .single();

        if (invErr) return { error: `Failed to log invoice: ${invErr.message}` };
        return { success: `Invoice ${(inv as any).invoice_number} from ${input.sub_name} for $${Number(input.amount).toFixed(2)} logged. Pending review.` };
      }

      case "log_sub_payment": {
        // 1. Resolve sub contact
        const { data: spContacts } = await sb
          .from("contacts")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .eq("type", "sub")
          .ilike("name", `%${String(input.sub_name)}%`);

        if (!spContacts?.length) return { error: `No sub found matching "${input.sub_name}".` };
        if (spContacts.length > 1) return { error: `Multiple subs match "${input.sub_name}": ${spContacts.map((c: any) => c.name).join(", ")}. Be more specific.` };
        const spSubContactId = (spContacts[0] as any).id;
        const spSubName = (spContacts[0] as any).name;

        // 2. Resolve invoice
        let spInvoiceId = input.invoice_id ? String(input.invoice_id) : null;
        if (!spInvoiceId) {
          const { data: invoices } = await sb
            .from("sub_invoices")
            .select("id, invoice_number, amount")
            .eq("job_id", input.job_id)
            .eq("sub_contact_id", spSubContactId)
            .is("voided_at", null)
            .eq("disputed", false)
            .not("approved_at", "is", null);

          if (!invoices?.length) return { error: `No approved unpaid invoices from ${spSubName} on this job. Log and approve the invoice first.` };
          if (invoices.length > 1) {
            const list = invoices.map((i: any) => `${i.invoice_number} ($${Number(i.amount).toFixed(2)})`).join(", ");
            return { error: `Multiple unpaid invoices from ${spSubName}: ${list}. Specify which invoice with invoice_id.` };
          }
          spInvoiceId = (invoices[0] as any).id;
        }

        // 3. Call RPC (Phase 4a atomic function)
        const spToday = new Date().toISOString().split("T")[0];
        const { data: rpcResult, error: rpcErr } = await sb.rpc("add_sub_invoice_payment_with_ledger", {
          p_sub_invoice_id: spInvoiceId,
          p_amount: Number(input.amount),
          p_paid_date: input.paid_date || spToday,
          p_method: input.method,
          p_reference: input.reference || null,
          p_notes: input.notes || null,
        });

        if (rpcErr) return { error: `Payment failed: ${rpcErr.message}` };
        const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
        return { success: `Payment of $${Number(input.amount).toFixed(2)} to ${spSubName} recorded. Invoice status: ${(row as any)?.new_status ?? "updated"}.` };
      }

      case "approve_sub_invoice": {
        // 1. Role check
        if (!["owner", "project_manager"].includes(userRole)) {
          return { error: "Only owner or project manager can approve sub invoices." };
        }

        // 2. Resolve sub contact
        const { data: apContacts } = await sb
          .from("contacts")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .eq("type", "sub")
          .ilike("name", `%${String(input.sub_name)}%`);

        if (!apContacts?.length) return { error: `No sub found matching "${input.sub_name}".` };
        if (apContacts.length > 1) return { error: `Multiple subs match "${input.sub_name}": ${apContacts.map((c: any) => c.name).join(", ")}. Be more specific.` };
        const apSubContactId = (apContacts[0] as any).id;
        const apSubName = (apContacts[0] as any).name;

        // 3. Resolve invoice
        let apInvoiceId = input.invoice_id ? String(input.invoice_id) : null;
        if (!apInvoiceId) {
          const { data: apInvoices } = await sb
            .from("sub_invoices")
            .select("id, invoice_number, amount, invoice_date, description")
            .eq("job_id", input.job_id)
            .eq("sub_contact_id", apSubContactId)
            .is("voided_at", null)
            .is("approved_at", null)
            .eq("disputed", false);

          if (!apInvoices?.length) return { error: `No pending invoices from ${apSubName} on this job.` };
          if (apInvoices.length > 1) {
            const list = apInvoices.map((i: any) => `${i.invoice_number} ($${Number(i.amount).toFixed(2)})`).join(", ");
            return { error: `Multiple pending invoices from ${apSubName}: ${list}. Specify which with invoice_id.` };
          }
          apInvoiceId = (apInvoices[0] as any).id;
        }

        // 4. Approve
        const apNow = new Date().toISOString();
        const { error: appErr } = await sb
          .from("sub_invoices")
          .update({ approved_at: apNow, approved_by_id: userId })
          .eq("id", apInvoiceId)
          .is("voided_at", null)
          .is("approved_at", null);

        if (appErr) return { error: `Approval failed: ${appErr.message}` };
        return { success: `Invoice from ${apSubName} approved. Ready for payment.` };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (e) {
    return { error: String(e) };
  }
}

// ─── Agentic loop ─────────────────────────────────────────────────────────────

// Pull the most recent base64 image block out of the conversation. Used to stash
// receipt photos into log_receipt's pending_action so the model never has to (and
// can't) emit a 200KB+ base64 string through tool_use input.
function extractLatestUserImage(
  msgs: Array<{ role: string; content: unknown }>,
): { data: string; mime: string } | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    for (const block of m.content as Array<any>) {
      if (
        block?.type === "image" &&
        block?.source?.type === "base64" &&
        typeof block.source.data === "string" &&
        typeof block.source.media_type === "string"
      ) {
        return { data: block.source.data, mime: block.source.media_type };
      }
    }
  }
  return null;
}

// Always two decimal places for currency (accounting convention). Do NOT switch
// back to plain toLocaleString() — it strips trailing zeros ($542.5 instead of
// $542.50) and breaks both confirmation cards and inline replies.
function fmtMoney(n: unknown): string {
  return `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Currency words — VOICE_AGENT money-safety read-back. Ported from the retired
// avenstone-vite/src/lib/labelParser.js (deleted in ee5e3c0). Confirm cards for
// money verbs render the digit form AND the spelled-out form so a misheard or
// fat-fingered amount surfaces before the row is written.
const _ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const _TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const _TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function _under1000(n: number): string {
  let out = "";
  if (n >= 100) {
    out += _ONES[Math.floor(n / 100)] + " hundred";
    n %= 100;
    if (n > 0) out += " ";
  }
  if (n >= 20) {
    out += _TENS[Math.floor(n / 10)];
    if (n % 10 > 0) out += "-" + _ONES[n % 10];
  } else if (n >= 10) {
    out += _TEENS[n - 10];
  } else if (n > 0) {
    out += _ONES[n];
  }
  return out;
}

function amountToWords(amt: unknown): string {
  const num = Number(amt);
  if (amt == null || Number.isNaN(num)) return "";
  const n = Math.floor(Math.abs(num));
  const cents = Math.round((Math.abs(num) - n) * 100);
  if (n === 0 && cents === 0) return "zero dollars";
  const parts: string[] = [];
  if (n >= 1_000_000) parts.push(_under1000(Math.floor(n / 1_000_000)) + " million");
  if ((n % 1_000_000) >= 1_000) parts.push(_under1000(Math.floor((n % 1_000_000) / 1_000)) + " thousand");
  if (n % 1_000 > 0) parts.push(_under1000(n % 1_000));
  let words = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!words) words = "zero";
  words += n === 1 ? " dollar" : " dollars";
  if (cents > 0) words += " and " + (cents < 10 ? "oh " : "") + _under1000(cents) + (cents === 1 ? " cent" : " cents");
  return words;
}

function describeConfirmAction(tool: string, input: any): string {
  switch (tool) {
    case "log_payment":
      return `Log ${fmtMoney(input.amount)} client payment${input.description ? ` — ${input.description}` : ""}.`;
    case "log_receipt":
      return `Log ${fmtMoney(input.amount)} expense — ${input.description}${input.vendor ? ` (${input.vendor})` : ""}.`;
    case "submit_change_order":
      return `Submit ${fmtMoney(input.amount)} change order — ${input.description}.`;
    case "add_todo": {
      const prefix = input._assignee_name
        ? `Add to-do for ${input._assignee_name}: "${input.title}"`
        : `Add to-do: "${input.title}"`;
      const prio = String(input.priority || "medium");
      const bits: string[] = [prefix, `${prio} priority`];
      if (input.due_date) bits.push(`due ${input.due_date}`);
      return bits.join(" · ") + ".";
    }
    case "create_job": {
      const bits: string[] = [`Create job at ${input.address}`];
      if (input.client_name) bits.push(`client ${input.client_name}`);
      if (input.scope) bits.push(`scope: ${input.scope}`);
      if (input.contract_value) bits.push(`${fmtMoney(input.contract_value)} contract`);
      return bits.join(" · ") + ".";
    }
    case "notify_team_member": {
      const target = input._target_name ? String(input._target_name) : "team member";
      const prio = String(input.priority || "high");
      const msg = String(input.message || "").slice(0, 60);
      const bits: string[] = [`Notify ${target}: "${msg}"`];
      bits.push(`${prio} priority`);
      if (input._job_address) bits.push(`re: ${input._job_address}`);
      if (input.also_create_todo) bits.push("also creates to-do");
      return bits.join(" · ") + ".";
    }
    case "create_schedule_item": {
      const bits: string[] = [`Schedule '${String(input.title || "")}' for ${String(input.scheduled_date || "")}`];
      if (input.trade) bits.push(String(input.trade));
      if (input.sub_search) bits.push(`sub: ${input.sub_search}`);
      if (input.phase_search) bits.push(`phase: ${input.phase_search}`);
      if (input.is_milestone || input.type === "milestone") bits.push("milestone");
      return bits.join(" · ") + ".";
    }
    case "log_sub_invoice": {
      const invNum = input.invoice_number ? String(input.invoice_number) : "auto-generate";
      const invDate = input.invoice_date ? String(input.invoice_date) : new Date().toISOString().split("T")[0];
      return `Log invoice from ${input.sub_name} for ${fmtMoney(input.amount)} (${amountToWords(input.amount)}). Invoice #${invNum}. Date: ${invDate}.`;
    }
    case "log_sub_payment": {
      const ref = input.reference ? String(input.reference) : "—";
      return `Record ${input.method} payment of ${fmtMoney(input.amount)} (${amountToWords(input.amount)}) to ${input.sub_name}. Reference: ${ref}.`;
    }
    case "approve_sub_invoice":
      return `Approve invoice from ${input.sub_name} on job ${String(input.job_id || "")}.`;
    default:
      return "Perform this action.";
  }
}

async function runAgentLoop(
  sb: ReturnType<typeof createClient>,
  tenantId: string,
  userId: string,
  userRole: string,
  userName: string,
  messages: Array<{ role: string; content: unknown }>,
  maxIterations = 3,
  contextJobId = "",
  contextJobLabel = "",
): Promise<{
  response: string;
  actions: Array<{ tool: string; input: unknown; result: unknown }>;
  pending_action?: { tool: string; input: unknown; description: string };
  pending_card?: PendingCard; // Phase 2+ tools set this; Phase 1 wiring only
}> {

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const contextLine = contextJobId
    ? `\nContext job: ${contextJobLabel || contextJobId} (id: ${contextJobId})`
    : "";
  const systemPrompt = `You are the Avenstone Master Agent — the AI that controls the entire Avenstone construction management platform. You have direct access to the database and take real actions, not suggestions.

User: ${userName} (${userRole})
Today: ${today}
Tenant: ${tenantId}${contextLine}

WHAT YOU CAN DO:
- Read: jobs, team
- Write: create jobs, update jobs, add contacts, send portal links, invite people, add notes, add todos (action items), advance lifecycle phase, update trade phases, submit change orders, log payments, log receipts, log sub invoices, log sub payments, approve sub invoices, send notifications, write to knowledge base, create schedule items

HOW TO BEHAVE:
- Act immediately. Don't ask "should I do X?" — just do it and tell them what you did.
- If you need a job ID and the user named a specific job, call get_jobs with search=<the name or address fragment>. A disambiguation card surfaces automatically when multiple matches are found — don't ask in text. If you need a sub ID, call get_team first.
- When you take multiple actions, report each one clearly: "✓ Created job · ✓ Added note · ✓ Notified team"
- If something fails, say what failed and why.
- If a request is ambiguous in a way that would cause you to take the wrong action, ask ONE clarifying question.
- For confirm-gated write tools (log_payment, log_receipt, submit_change_order, add_todo, create_job, create_schedule_item, log_sub_invoice, log_sub_payment, approve_sub_invoice): describe what's about to happen in one plain sentence and call the tool. The system surfaces a confirmation card automatically — do NOT ask the user to confirm via text first ("Confirm?", "Should I proceed?", etc.). The card IS the confirmation. Do not assume the action ran until you receive the tool_result.
- Missing required fields: call the tool with whatever fields you have. If any required field is missing, the system surfaces a missing-field card automatically — do NOT ask in text first ("What's the amount?", "Which job?", etc.). Never invent values to fill gaps; just call the tool and let the card collect the rest.
- Currency formatting: ALWAYS write dollar amounts with two decimal places. "$542.50" not "$542.5". "$1,000.00" not "$1000". Applies to text responses, action descriptions, summaries, and any reference to a monetary value.
- For advance_phase: do NOT pass override_reason. Just call the tool with the job_id. If gates fail, the system surfaces a gate-resolution card automatically (redirect to Schedule / leave open / override-with-structured-reason). Do not ask in text whether to override — the card IS the prompt.
- TODO vs NOTE: an action item ("call back X", "follow up", "remind me", "don't forget", "schedule Y", "todo") goes to add_todo. Passive context attached to a job ("FYI…", "the client said…", "noted that…", "for the record…") goes to add_note. When in doubt and the user said "todo", pick add_todo. After writing a todo, the success message should say "Todo added" — never "Note added."
- If a context job is set (shown in the header above), treat it as the implicit default job for any tool that needs a job_id, unless the user explicitly names a different job. The system pre-fills job_id automatically — do not ask for it when context is set.
- Never mention Claude or Anthropic.
- You are the operating system of this business. Act like it.

RECEIPT FROM PHOTO:
When the user attaches an image of a receipt, extract: vendor name, total amount, date, and PO number.
- The PO on Avenstone receipts is in YY-NNN format (e.g. "26-014", "26-002"). It may be labeled "PO", "PO#", "P.O.", "Job", or "Job#".
- ALWAYS call get_jobs with the PO to find the matching job before calling log_receipt.
  • 0 matches → do NOT call log_receipt; ask the user which job this belongs to.
  • 1 match → proceed with that job_id.
  • 2+ matches → do NOT call log_receipt; list the candidates (address + PO) and ask which one.
- If no PO is visible on the receipt, or your confidence in the PO is low, ask the user which job before calling log_receipt.
- Vendor → transaction type inference (Avenstone GC defaults):
  • Home Depot, Lowe's, Menards, Ace, lumber yards, plumbing supply, electrical supply → material_purchase
  • Gas stations (Shell, BP, Phillips 66, QuikTrip, Casey's, etc.) → fuel
  • City permit office, building department → permit
  • Otherwise → omit type; the missing-field card prompts the user
- Do not include image_data or image_mime in your log_receipt input — the server attaches the receipt photo automatically when one was provided. Just call log_receipt with the financial fields.
- Call log_receipt directly with the extracted fields once you've matched the job. The pending_action confirmation card surfaces automatically — the user reviews and confirms via the card. Do NOT ask the user to confirm via text first.
- The confirmation card description should lead with the matched job address (the most prominent field), then vendor, amount, and PO. Example: "Log $142.37 expense at 123 Test Flow Dr — Home Depot (PO 26-002)."
- If the user's text message conflicts with what you read on the receipt, the user's text wins.

SCHEDULING
When the user says things like "schedule [sub/event] for [day]" or "add [event] to [job]'s calendar", use create_schedule_item.
- Resolve dates relative to today: "Monday" = next Monday, "tomorrow" = today + 1, "in 3 days" = today + 3. Always produce an ISO YYYY-MM-DD date.
- Infer type from context: "[sub/trade] starts" or "[person] coming Monday" = sub_start. "[material] delivery" = material_delivery. "[code/city] inspection" = inspection. "Milestone" or phase-complete event = milestone. Walkthrough/meeting = site_visit. Schedule slip = delay.
- Match the job from conversation context. If no job is clear, call get_jobs with a search term. If still ambiguous, ASK once before scheduling.
- If the user names a sub ("garage door guy", "John", "ABC Tile"), pass it as sub_search — system fuzzy-matches team profiles.
- If the user implies a phase ("for the framing phase", "drywall milestone"), pass it as phase_search.
- After the confirmation card is approved, tell the user what got scheduled, including date, any sub invited, and any phase linked.
- Do NOT call this tool speculatively — only when the user is explicitly asking for something to be scheduled.

SUB INVOICE WORKFLOW
Sub invoice workflow: When user mentions a sub sent an invoice or bill, use log_sub_invoice. When user mentions paying a sub, use log_sub_payment — if multiple unpaid invoices exist for that sub, ask which before calling. When user explicitly approves a sub invoice, use approve_sub_invoice (owner/PM only). Do not invent sub names — if unclear, ask the user to confirm spelling first. Void and dispute actions are UI-only; tell user to use FinancialsTab if they ask.

DIAGNOSTIC REPORTING STYLE

When the user asks you to inspect, audit, test, or report on app data or behavior:

1. Distinguish what you OBSERVED (returned by a tool) from what you INFERRED (a pattern, guess, or extrapolation). Always label these.

2. Attach a confidence label to each finding:
   - VERIFIED — confirmed by a successful tool call returning the expected shape
   - OBSERVED — a tool returned this; you did not interpret beyond the raw return
   - INFERRED — you noticed a pattern, but it could be legitimate workflow or test data
   - UNKNOWN — you don't have visibility (test data history, schema changes, intent)

3. Frame recommendations as questions, not prescriptions. Say "worth investigating: is this a duplicate or two distinct jobs at the same address?" — not "Rec: add duplicate detection."

4. No consultant-style formatting. No "Diagnostic Report" titles, no checkmark/emoji headers, no structured "Rec:" blocks. Plain prose findings only.

5. When you don't have enough context to determine root cause (test data history, schema changes, intent), say so explicitly: "I see X, but I can't tell from here whether this is a bug or legacy test data."

6. Default to underconfidence. A finding labeled "I think this might be a duplicate" is more useful than a confident-sounding "duplicate detected" that turns out to be legitimate workflow.`;

  const actions: Array<{ tool: string; input: unknown; result: unknown }> = [];
  let currentMessages = [...messages];

  for (let i = 0; i < maxIterations; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        tools: TOOLS,
        messages: currentMessages,
      }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      return { response: `AI error: ${data.error?.message ?? res.status}`, actions };
    }

    // Add Claude's response to message history
    currentMessages.push({ role: "assistant", content: data.content });

    if (data.stop_reason === "end_turn") {
      const text = (data.content as Array<{ type: string; text?: string }>)
        .find(c => c.type === "text")?.text ?? "";
      return { response: text, actions };
    }

    if (data.stop_reason === "tool_use") {
      const blocks = data.content as Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }>;

      // Pre-fill job_id from context in any tool block whose REQUIRED_FIELDS spec
      // declares job_id with dynamic_options:"active_jobs" and the field is missing.
      // Must happen before validateRequiredFields AND executeTool/confirmBlock so all
      // three paths (elicitation skip, confirm card, executor) see the same filled input.
      // add_todo has no job_id field spec → correctly skipped (job-less todos valid).
      if (contextJobId) {
        for (const block of blocks) {
          if (block.type === "tool_use" && block.name && block.id) {
            const fieldSpec = REQUIRED_FIELDS[block.name];
            if (
              fieldSpec?.some((f) => f.field === "job_id" && f.dynamic_options === "active_jobs") &&
              isMissing((block.input || {} as any).job_id)
            ) {
              block.input = { ...(block.input || {}), job_id: contextJobId };
            }
          }
        }
      }

      // Missing-field validation (Phase 4) — fires BEFORE confirm so every gap
      // is collected first; the post-card re-call (carrying the answered fields)
      // falls through to CONFIRM_TOOLS normally. validateRequiredFields returns
      // null when every required field is present — the loop guard.
      const elicitBlock = blocks.find((b) => b.type === "tool_use" && b.name && b.name in REQUIRED_FIELDS);
      if (elicitBlock && elicitBlock.name) {
        const card = await validateRequiredFields(sb, tenantId, elicitBlock.name, elicitBlock.input || {}, contextJobId);
        if (card) {
          const text = blocks.find((b) => b.type === "text")?.text ?? "I need a bit more info before I can run this.";
          return { response: text, actions, pending_card: card };
        }
      }

      // Money verbs require user confirmation. If any pending block is a confirm-tool,
      // break out of the agent loop and surface a pending_action to the client.
      const confirmBlock = blocks.find((b) => b.type === "tool_use" && b.name && CONFIRM_TOOLS.has(b.name));
      if (confirmBlock && confirmBlock.name) {
        const inputObj: Record<string, unknown> = { ...(confirmBlock.input || {}) };
        // log_receipt: stash the user's receipt photo server-side into pending_action.
        // Vision content blocks aren't accessible to the model as copyable text — if we
        // ask Claude to forward image_data through tool_use input, max_tokens truncates
        // and the loop dies with "Max iterations reached". Inject from currentMessages.
        if (confirmBlock.name === "log_receipt" && !inputObj.image_data) {
          const img = extractLatestUserImage(currentMessages);
          if (img) {
            inputObj.image_data = img.data;
            inputObj.image_mime = img.mime;
          }
        }
        // add_todo: pre-fetch assignee name so Confirm card readback shows "Add todo for [Name]".
        if (confirmBlock.name === "add_todo" && inputObj.assignee_id && String(inputObj.assignee_id) !== userId) {
          const { data: ap } = await sb.from("profiles").select("full_name").eq("id", String(inputObj.assignee_id)).maybeSingle();
          if (ap) inputObj._assignee_name = (ap as any).full_name;
        }
        // notify_team_member: resolve _resolved_target_id, _target_name, _job_address for Confirm card.
        if (confirmBlock.name === "notify_team_member") {
          let resolvedTargetId = inputObj.target_user_id ? String(inputObj.target_user_id) : null;
          if (!resolvedTargetId && inputObj.target_role_on_job) {
            const roleOnJob = String(inputObj.target_role_on_job);
            if (roleOnJob === "pm" && inputObj.related_job_id) {
              const { data: jb } = await sb.from("jobs").select("assigned_pm").eq("id", String(inputObj.related_job_id)).maybeSingle();
              resolvedTargetId = (jb as any)?.assigned_pm ?? null;
            } else if (roleOnJob === "owner") {
              const { data: op } = await sb.from("profiles").select("id").eq("tenant_id", tenantId).eq("role", "owner").limit(1).maybeSingle();
              resolvedTargetId = (op as any)?.id ?? null;
            }
          }
          if (resolvedTargetId) {
            inputObj._resolved_target_id = resolvedTargetId;
            const { data: tp } = await sb.from("profiles").select("full_name").eq("id", resolvedTargetId).maybeSingle();
            if (tp) inputObj._target_name = (tp as any).full_name;
          }
          if (inputObj.related_job_id) {
            const { data: jr } = await sb.from("jobs").select("address").eq("id", String(inputObj.related_job_id)).maybeSingle();
            if (jr) inputObj._job_address = (jr as any).address;
          }
        }
        const description = describeConfirmAction(confirmBlock.name, inputObj);
        const text = blocks.find((b) => b.type === "text")?.text ?? `${description} Confirm to run.`;
        return {
          response: text,
          actions,
          pending_action: { tool: confirmBlock.name, input: inputObj, description },
        };
      }

      const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];

      for (const block of blocks) {
        if (block.type === "tool_use" && block.name && block.id) {
          const result = await executeTool(sb, tenantId, userId, block.name, block.input || {}, userRole);
          actions.push({ tool: block.name, input: block.input, result });

          // Post-execution elicitation: inspect the result and emit a card if needed.
          // Returns early — tool_result is NOT fed back to Claude. The card answer
          // re-enters via card_response as a fresh user turn in conversation_history,
          // so the model sees [assistant: question] → [user: answers] and proceeds.
          if (block.name in POST_EXECUTE_ELICIT) {
            const card = POST_EXECUTE_ELICIT[block.name](block.input || {}, result);
            if (card) {
              const text = blocks.find((b) => b.type === "text")?.text ?? "I found multiple matches — which one did you mean?";
              return { response: text, actions, pending_card: card };
            }
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      currentMessages.push({ role: "user", content: toolResults });
      // Continue the loop so Claude can process results and decide next steps
    } else {
      // Unexpected stop reason
      break;
    }
  }

  return { response: "Max iterations reached — some actions may be incomplete.", actions };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { user_id, tenant_id, role, full_name, message, conversation_history, pending_action, confirmed, card_response, context_job_id } = await req.json();

    if (!user_id || !tenant_id) {
      return new Response(JSON.stringify({ error: "Missing user_id or tenant_id" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Resolve context job once — used by both runAgentLoop call sites below.
    // Silently dropped if the job doesn't exist or belongs to a different tenant.
    let ctxJobId = "";
    let ctxJobLabel = "";
    if (context_job_id && typeof context_job_id === "string" && context_job_id.length > 0) {
      const { data: ctxJob } = await sb.from("jobs")
        .select("address, client_name")
        .eq("id", context_job_id)
        .eq("tenant_id", tenant_id)
        .maybeSingle();
      if (ctxJob) {
        ctxJobId = context_job_id;
        ctxJobLabel = [ctxJob.address, ctxJob.client_name].filter(Boolean).join(" — ");
      }
    }

    // ── Confirmed action path: skip Claude, run executor directly ─────────────
    // (pending_action / confirmed — yes/no confirmation surface, unchanged)

    function buildDoneMessage(tool: string, input: Record<string, unknown>): string {
      if (tool === "add_todo" && input._assignee_name) {
        return `Done — added to ${input._assignee_name}'s list.`;
      }
      if (tool === "notify_team_member" && input._target_name) {
        return `Done — ${input._target_name} notified.`;
      }
      return "Done.";
    }

    if (confirmed && pending_action?.tool) {
      const result = await executeTool(sb, tenant_id, user_id, pending_action.tool, pending_action.input || {}, role || "owner");
      const action = { tool: pending_action.tool, input: pending_action.input, result };
      const confirmedInput = pending_action.input || {};
      const response = (result as any)?.error
        ? `${pending_action.description || pending_action.tool}: failed — ${(result as any).error}`
        : buildDoneMessage(pending_action.tool, confirmedInput);
      return new Response(
        JSON.stringify({ response, actions: [action] }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Card response path: answers already in conversation_history ───────────
    // The client appended { role:'user', content: formatCardAnswers(...) } to
    // conversation_history BEFORE sending, so the history already ends with
    //   [assistant: card question text] → [user: formatted answers].
    // Run runAgentLoop with that history unchanged — no extra user message.
    // This path is intentionally separate from confirmed:true. The model must
    // receive the structured answers and decide the tool call itself.
    if (card_response && typeof card_response === "object") {
      const cr = card_response as { card_id?: string; answers?: Record<string, unknown>; meta?: Record<string, unknown> };
      const meta = cr.meta || {};
      const answers = cr.answers || {};

      // Phase 5: gate-resolution multi-card flow. meta.kind routes the response
      // deterministically — these branches do NOT call Claude.
      if (meta.kind === "gate_resolution") {
        const jobId = String(meta.job_id || "");
        const currentPhase = String(meta.current_phase || "");
        const nextPhase = String(meta.next_phase || "");
        const action = String(answers.gate_action || "");
        if (action === "redirect_schedule") {
          return new Response(JSON.stringify({
            response: `Open this job's Schedule tab to mark the blocking items complete, then ask me to advance the phase again. Nothing was changed.`,
            actions: [],
          }), { headers: { ...CORS, "Content-Type": "application/json" } });
        }
        if (action === "leave_open") {
          return new Response(JSON.stringify({
            response: `Leaving the phase at ${PHASE_LABELS[currentPhase] || currentPhase}. Nothing was changed.`,
            actions: [],
          }), { headers: { ...CORS, "Content-Type": "application/json" } });
        }
        if (action === "override") {
          const cardB = buildGateOverrideCardB(jobId, currentPhase, nextPhase);
          return new Response(JSON.stringify({
            response: cardB.prompt,
            actions: [],
            pending_card: cardB,
          }), { headers: { ...CORS, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({
          response: "I didn't recognize that action. Nothing was changed.",
          actions: [],
        }), { headers: { ...CORS, "Content-Type": "application/json" } });
      }

      if (meta.kind === "gate_override") {
        const jobId = String(meta.job_id || "");
        const reasonValue = String(answers.reason || "");
        const reasonOpt = GATE_OVERRIDE_REASONS.find((o) => o.value === reasonValue);
        const reasonLabel = reasonOpt ? reasonOpt.label : reasonValue || "Override";
        const detailRaw = typeof answers.detail === "string" ? answers.detail.trim() : "";
        const override_reason = detailRaw ? `${reasonLabel} — ${detailRaw}` : reasonLabel;
        const result = await executeTool(sb, tenant_id, user_id, "advance_phase", {
          job_id: jobId,
          override_reason,
        });
        const action = { tool: "advance_phase", input: { job_id: jobId, override_reason }, result };
        const response = (result as any)?.error
          ? `Advance failed — ${(result as any).error}`
          : `Phase advanced from ${(result as any).from_phase} to ${(result as any).to_phase} with override. Reason logged: "${override_reason}".`;
        return new Response(JSON.stringify({ response, actions: [action] }),
          { headers: { ...CORS, "Content-Type": "application/json" } });
      }

      const history = (conversation_history || []).slice(-20);
      const { response, actions, pending_action: pa, pending_card: pc } = await runAgentLoop(
        sb, tenant_id, user_id, role || "owner", full_name || "User", history, 3, ctxJobId, ctxJobLabel,
      );
      return new Response(
        JSON.stringify({ response, actions, pending_action: pa, pending_card: pc }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Allow string OR content array (multimodal: image + text blocks)
    const hasContent =
      (typeof message === "string" && message.trim().length > 0) ||
      (Array.isArray(message) && message.length > 0);
    if (!hasContent) {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Build message history. Content can be a string or an array of blocks
    // (text + image) — pass through unchanged so vision works.
    const history = (conversation_history || []).slice(-20);
    const messages: Array<{ role: string; content: unknown }> = [
      ...history,
      { role: "user", content: message },
    ];

    const { response, actions, pending_action: pa, pending_card: pc } = await runAgentLoop(
      sb, tenant_id, user_id, role || "owner", full_name || "User", messages, 3, ctxJobId, ctxJobLabel,
    );

    return new Response(
      JSON.stringify({ response, actions, pending_action: pa, pending_card: pc }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
