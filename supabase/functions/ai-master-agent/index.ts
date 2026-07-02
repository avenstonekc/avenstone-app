
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkAndAutoInvoice } from "../_shared/autoInvoice.ts";
import { captureTradeActualsForJob } from "../_shared/tradeActuals.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// ── Trade string normalization — mirrors src/lib/tradeUtils.js ───────────────
// Edge fn can't import frontend code; inline the same two-pass logic so the
// canonical form is enforced on any trade string the agent writes to schedule_items.
// KEEP IN SYNC with TRADE_ALIASES in src/lib/tradeUtils.js.
const _TRADE_ALIASES: Record<string, string> = {
  "Garage doors": "Garage door",
};
function canonicalizeTrade(trade: string): string {
  const normalized = trade.replace(/-([A-Z])/g, " - $1").replace(/\s{2,}/g, " ").trim();
  return _TRADE_ALIASES[normalized] ?? normalized;
}

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
        .eq("job_id", jobId).in("type", ["client_payment", "client_deposit"]).eq("direction", "in").eq("status", "paid");
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
  "upload_company_file",
  "record_deposit",
  "compose_draw",
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

const SCHEDULE_ITEM_TYPE_OPTIONS: CardOption[] = [
  { value: "sub_start", label: "Sub Start" },
  { value: "material_delivery", label: "Material Delivery" },
  { value: "inspection", label: "Inspection" },
  { value: "milestone", label: "Milestone" },
  { value: "site_visit", label: "Site Visit" },
  { value: "delay", label: "Delay" },
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
  record_deposit: [
    { field: "job_id", type: "select", label: "Job", dynamic_options: "active_jobs" },
    { field: "amount", type: "text", label: "Amount ($)" },
  ],
  compose_draw: [
    { field: "job_id", type: "select", label: "Job", dynamic_options: "active_jobs" },
  ],
  add_contact: [
    { field: "full_name", type: "text", label: "Full name" },
  ],
  send_client_portal: [
    { field: "job_id", type: "select", label: "Job", dynamic_options: "active_jobs" },
    { field: "email", type: "text", label: "Client email" },
    { field: "password", type: "text", label: "Portal password (min 6 chars — share this with the client)" },
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
  create_schedule_item: [
    { field: "job_id", type: "select", label: "Job", dynamic_options: "active_jobs" },
    { field: "title", type: "text", label: "Event title" },
    { field: "type", type: "select", label: "Event type", options: SCHEDULE_ITEM_TYPE_OPTIONS },
    { field: "scheduled_date", type: "text", label: "Date (YYYY-MM-DD)" },
  ],
  // Intentionally skipped: update_job, update_phase (technical-ID + object-payload
  // required fields — model gets these from prior tool calls, not user prompts).
  // Intentionally skipped: notify_team_member — single required field (message) is
  // always present in chat input; executor guard at line ~1152 is sufficient.
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
    name: "get_job_financials",
    description: "Get the financial summary for a specific job: contract value, received/paid to date, paid out, outstanding approved sub invoices, retainage held, projected profit and margin, and bucket credit (cost-plus) or client owes (fixed-price). Also returns the 5 most recent transactions. Use when the user asks about money, what's owed, what's been paid, outstanding amounts, draw balance, or finances on a job. Numbers match the Financials tab exactly.",
    input_schema: {
      type: "object",
      properties: {
        job_id:   { type: "string", description: "Job UUID. Use context job if available; prefer this over job_name." },
        job_name: { type: "string", description: "Search by address or client name when job_id is unknown." },
      },
    },
  },
  {
    name: "get_schedule",
    description: "Get upcoming schedule items and job-phase events within a time window. Use when the user asks about upcoming work, what's scheduled, what's next week, calendar items, sub starts, deliveries, or milestones.",
    input_schema: {
      type: "object",
      properties: {
        job_name:     { type: "string", description: "Filter to a specific job by address or client name (optional). Omit to see schedule across all jobs." },
        horizon_days: { type: "number", description: "Days ahead to look. Default 14. Max 90." },
      },
    },
  },
  {
    name: "get_open_todos",
    description: "Get open todos assigned to or created for the calling user, plus unassigned tenant todos. Use when the user asks what they need to do, what's on their list, their pending action items, or their todos.",
    input_schema: {
      type: "object",
      properties: {
        job_name: { type: "string", description: "Filter to todos on a specific job (optional)." },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Filter by priority level (optional)." },
      },
    },
  },
  {
    name: "get_alerts",
    description: "Get what needs immediate attention: open vigilance/engine-sourced todos grouped by type, plus alert-type notifications from the last 7 days. Use when the user asks 'what needs my attention', 'what should I focus on today', 'what's urgent', 'what needs me', or 'what did the system flag'.",
    input_schema: {
      type: "object",
      properties: {},
    },
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
        financial_model: { type: "string", enum: ["flip", "cost_plus", "fixed_bid"], description: "Billing model. flip = owner-financed, reimbursed via draws, margin tracked vs sale price (ARV). cost_plus = client billed for actual costs + markup via draws. fixed_bid = client billed on a fixed payment schedule. Defaults to fixed_bid." },
        arv: { type: "number", description: "After-repair value in dollars. Flip jobs only — the projected sale price used to compute margin. Optional at creation; can be set later." },
        cost_plus: { type: "boolean", description: "Legacy field — prefer financial_model. True only when financial_model=cost_plus. Maintained for backward compat." },
        labor_markup_pct: { type: "number", description: "Markup % on labor expenses (sub_payout, labor types). Required when financial_model=cost_plus. e.g. 15 for 15%." },
        material_markup_pct: { type: "number", description: "Markup % on material/other expenses (material_purchase, fuel, permits, etc.). Required when financial_model=cost_plus. e.g. 20 for 20%." },
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
    description: "Provision client portal access for a job. Sets an email+password login so the client can sign in at avenstone-app.vercel.app. Does NOT send an email — give the client their credentials manually. Use when a PM or owner asks to 'set up client access', 'create a client login', or 'give the client portal access'.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        email: { type: "string" },
        client_name: { type: "string" },
        password: { type: "string", description: "Password for the client's portal login (min 6 characters). The PM sets this and shares it with the client directly." },
      },
      required: ["job_id", "email", "password"],
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
        fields: { type: "object", description: "Keys: status (pending/in_progress/complete), start_date, end_date, name, description, assigned_sub_id (UUID of the sub to assign to this phase)" },
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
  {
    name: "upload_company_file",
    description: "Uploads a company-level compliance document (COI, license, W-9, bond) from an attached image or PDF. Owner/PM only. Haiku extracts expiration date, policy number, and issuer automatically from the attached document. Use when the user attaches a document and mentions uploading, saving, updating, or filing it — e.g. 'save this insurance cert', 'upload our new COI', 'log this W-9', 'here's the new bond'.",
    input_schema: {
      type: "object",
      properties: {
        file_type: { type: "string", description: "Document type label. Common values: COI, General Liability, Workers Comp, Bond, License, W-9, Other." },
        expiration_date: { type: "string", description: "Expiration date YYYY-MM-DD. Vision extracts this from the document; override only if the user specifies a different date." },
        policy_number: { type: "string", description: "Policy number, license number, or bond number from the document. Optional — vision extracts if present." },
        issuer: { type: "string", description: "Insurer, surety, or licensing authority that issued the document. Optional — vision extracts if visible." },
        visible_to_subs: { type: "boolean", description: "Whether subs can see this document in their portal. Default false unless user explicitly says subs should see it." },
        visible_to_clients: { type: "boolean", description: "Whether clients can see this document. Default false unless user explicitly says clients should see it." },
      },
      required: ["file_type"],
    },
  },
  {
    name: "record_deposit",
    description: "Record a client deposit payment for a cost-plus job. Lands as an inbound transaction with no invoice link — adds to the bucket balance. Use when client hands over a check, ACH, or cash before a draw invoice is created. Do NOT use log_payment for cost-plus deposits — that is for standard contract invoices. Owner/PM only.",
    input_schema: {
      type: "object",
      properties: {
        job_id:         { type: "string", description: "Job ID. Use active job context if available." },
        amount:         { type: "number", description: "Deposit amount in USD." },
        description:    { type: "string", description: "e.g. 'Initial deposit — signed contract · Ref: 1042'. Include the check/ACH reference number here if provided. Defaults to 'Client deposit' if omitted." },
        payment_method: { type: "string", description: "check, ach, card, cash, wire, other" },
      },
      required: ["job_id", "amount"],
    },
  },
  {
    name: "compose_draw",
    description: "Compose a cost-plus draw for a job — auto-loads all unreimbursed expenses and current bucket balance, then generates a draw draft for your review. Use when owner says 'compose a draw', 'bill the client for expenses', or 'generate a draw invoice'. Only works on cost-plus jobs. Owner/PM only.",
    input_schema: {
      type: "object",
      properties: {
        job_id:       { type: "string", description: "Job ID. Use active job context if available." },
        title:        { type: "string", description: "Draw title, e.g. 'Draw 2 — May work'. Defaults to 'Draw' if omitted." },
        apply_bucket: { type: "boolean", description: "Whether to offset the draw by existing bucket credit. Defaults to true." },
      },
      required: ["job_id"],
    },
  },
];

// ─── Shared job resolver ─────────────────────────────────────────────────────
// Single source of truth for fuzzy job lookup by name/address/PO.
// Used by read verbs (get_job_financials, get_schedule, get_open_todos).
// Write verbs pre-resolve via get_jobs + the POST_EXECUTE_ELICIT card.
async function resolveJobByName(
  sb: ReturnType<typeof createClient>,
  tenantId: string,
  term: string,
): Promise<{ id: string } | { error: string; matches?: { id: string; address: string; client_name: string | null }[] }> {
  const escaped = term.trim().replace(/%/g, "\\%");
  const { data } = await sb.from("jobs")
    .select("id, address, client_name")
    .eq("tenant_id", tenantId)
    .or(`address.ilike.%${escaped}%,client_name.ilike.%${escaped}%,po_number.ilike.%${escaped}%`)
    .limit(5);
  if (!data?.length) return { error: `No job found matching "${term}".` };
  if (data.length > 1) return {
    error: `Multiple jobs match "${term}" — be more specific.`,
    matches: (data as any[]).map((j) => ({ id: j.id, address: j.address, client_name: j.client_name })),
  };
  return { id: (data[0] as any).id };
}

// ─── Shared sub resolvers ────────────────────────────────────────────────────
// Two helpers because subs exist as two different entities:
//   resolveSubContact — external sub companies in the contacts table (invoice verbs)
//   resolveSubProfile — internal team members with role='sub' in profiles (schedule_item)
// Both mirror resolveJobByName: DB-level ilike, tenant-scoped, { id, name } / { error, matches? }.

async function resolveSubContact(
  sb: ReturnType<typeof createClient>,
  tenantId: string,
  term: string,
): Promise<{ id: string; name: string } | { error: string; matches?: { id: string; name: string }[] }> {
  const escaped = term.trim().replace(/%/g, "\\%");
  const { data } = await sb.from("contacts")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("type", "sub")
    .ilike("name", `%${escaped}%`)
    .limit(5);
  if (!data?.length) return { error: `No sub found matching "${term}".` };
  if (data.length > 1) return {
    error: `Multiple subs match "${term}": ${(data as any[]).map((c) => c.name).join(", ")}. Be more specific.`,
    matches: (data as any[]).map((c) => ({ id: c.id, name: c.name })),
  };
  return { id: (data[0] as any).id, name: (data[0] as any).name };
}

async function resolveSubProfile(
  sb: ReturnType<typeof createClient>,
  tenantId: string,
  term: string,
): Promise<{ id: string; name: string } | { error: string; matches?: { id: string; name: string }[] }> {
  const escaped = term.trim().replace(/%/g, "\\%");
  const { data } = await sb.from("profiles")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .eq("role", "sub")
    .ilike("full_name", `%${escaped}%`)
    .limit(5);
  if (!data?.length) return { error: `No sub profile found matching "${term}".` };
  if (data.length > 1) return {
    error: `Multiple subs match "${term}": ${(data as any[]).map((p) => p.full_name).join(", ")}. Be more specific.`,
    matches: (data as any[]).map((p) => ({ id: p.id, name: p.full_name })),
  };
  return { id: (data[0] as any).id, name: (data[0] as any).full_name };
}

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
          q = q.or(`address.ilike.%${term}%,client_name.ilike.%${term}%,po_number.ilike.%${term}%`);
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

      // ── READ TOOLS — no confirmation, no write paths ──────────────────────────

      case "get_job_financials": {
        // 1. Resolve job
        let gjfJobId = input.job_id ? String(input.job_id) : null;
        if (!gjfJobId && input.job_name) {
          const rjb = await resolveJobByName(sb, tenantId, String(input.job_name));
          if ("error" in rjb) return rjb;
          gjfJobId = rjb.id;
        }
        if (!gjfJobId) return { error: "Provide job_id or job_name." };

        // 2. Load job metadata (pm_fee required for projected_profit parity with Financials tab)
        const { data: gjfJob } = await sb.from("jobs")
          .select("address, cost_plus, contract_value, co_total, labor_markup_pct, material_markup_pct, pm_fee")
          .eq("id", gjfJobId).eq("tenant_id", tenantId).single();
        if (!gjfJob) return { error: "Job not found." };

        const gjfR2 = (n: number) => Math.round(n * 100) / 100;
        const gjfCostPlus = (gjfJob as any).cost_plus === true;
        const gjfCV  = Number((gjfJob as any).contract_value || 0);
        const gjfCO  = Number((gjfJob as any).co_total || 0);
        const gjfLP    = Number((gjfJob as any).labor_markup_pct || 0);
        const gjfMP    = Number((gjfJob as any).material_markup_pct || 0);
        const gjfPMFee = Number((gjfJob as any).pm_fee || 0);

        // 3. Load transactions (all non-void)
        const { data: gjfTxs } = await sb.from("job_transactions")
          .select("id, direction, amount, status, type, invoice_id, date_incurred, description, reimbursement_status, created_at")
          .eq("job_id", gjfJobId).neq("status", "void")
          .order("created_at", { ascending: false });
        const txs = (gjfTxs || []) as any[];

        // 4. Core aggregates — mirrors sbLoadJobFinancialSummary bucketing exactly
        // Fixed-price PERMANENT RULE: contract_total = CV + CO (co_total for fixed-price only)
        const contract_total = gjfR2(gjfCostPlus ? gjfCV : gjfCV + gjfCO);
        const total_out = gjfR2(txs.filter(t => t.direction === "out" && t.status === "paid").reduce((s, t) => s + Number(t.amount || 0), 0));

        // Inlined markup-type classification: sub_payout / labor / commission → labor rate; everything else → material rate
        const GJF_LABOR_TYPES = new Set(["sub_payout", "labor", "commission"]);

        let result: Record<string, unknown> = {
          job: (gjfJob as any).address,
          billing_model: gjfCostPlus ? "cost-plus" : "fixed-price",
          contract_value: gjfR2(gjfCV),
          co_adjustments: gjfR2(gjfCO),
          contract_total,
        };

        if (gjfCostPlus) {
          // bucket = inbound paid with no invoice link (client deposits)
          const bucket = gjfR2(txs.filter(t => t.direction === "in" && t.invoice_id === null && t.status === "paid").reduce((s, t) => s + Number(t.amount || 0), 0));
          const outstanding_pending = gjfR2(txs.filter(t => t.direction === "out" && t.status === "pending" && (t.type === "sub_payout" || t.type === "change_order")).reduce((s, t) => s + Number(t.amount || 0), 0));
          const allCostTxs = txs.filter(t => t.direction === "out" && (t.status === "paid" || (t.status === "pending" && (t.type === "sub_payout" || t.type === "change_order"))));
          const projected_markup = gjfR2(allCostTxs.reduce((sum: number, t: any) => {
            const rate = GJF_LABOR_TYPES.has(t.type) ? gjfLP : gjfMP;
            return sum + Number(t.amount || 0) * rate / 100;
          }, 0));
          // projected_profit = markup + PM fee — matches the Financials tab Projected Profit card exactly
          const projected_profit = gjfR2(projected_markup + gjfPMFee);
          const { data: retainRows } = await sb.from("draw_schedules")
            .select("retainage_held").eq("job_id", gjfJobId).neq("status", "voided");
          const retainage_held = gjfR2((retainRows || []).reduce((s: number, d: any) => s + Number(d.retainage_held || 0), 0));
          const bucket_balance = gjfR2(bucket - (total_out + outstanding_pending));
          result = {
            ...result,
            received_deposits: bucket,
            paid_out: total_out,
            outstanding_pending,
            retainage_held,
            projected_profit,   // headline — matches the Financials tab card (markup + PM fee)
            projected_markup,   // sub-field: cost markup earned
            pm_fee: gjfPMFee,   // sub-field: PM fee component
            bucket_balance,
            ...(bucket_balance >= 0
              ? { bucket_credit: bucket_balance, note: "client has prepaid credit" }
              : { client_owes: gjfR2(Math.abs(bucket_balance)), note: "request a draw" }),
          };
        } else {
          const total_in    = gjfR2(txs.filter(t => t.direction === "in" && t.status === "paid").reduce((s, t) => s + Number(t.amount || 0), 0));
          const pending_out = gjfR2(txs.filter(t => t.direction === "out" && t.status === "pending").reduce((s, t) => s + Number(t.amount || 0), 0));
          const client_owes = gjfR2(contract_total - total_in);
          result = {
            ...result,
            received: total_in,
            paid_out: total_out,
            pending_out,
            client_owes,
          };
        }

        // 5 most recent transactions (already sorted desc)
        result.recent_transactions = txs.slice(0, 5).map((t: any) => ({
          date: t.date_incurred || t.created_at?.slice(0, 10),
          type: t.type,
          direction: t.direction,
          amount: gjfR2(Number(t.amount || 0)),
          status: t.status,
          description: t.description || null,
        }));

        return result;
      }

      case "get_schedule": {
        const horizonDays = Math.min(Number(input.horizon_days) || 14, 90);
        const today = new Date().toISOString().slice(0, 10);
        const end = new Date(Date.now() + horizonDays * 86_400_000).toISOString().slice(0, 10);

        // Optional job filter via fuzzy match
        let gsJobId: string | null = null;
        if (input.job_name) {
          const rjb = await resolveJobByName(sb, tenantId, String(input.job_name));
          if ("error" in rjb) return rjb;
          gsJobId = rjb.id;
        }

        let q = sb.from("schedule_items")
          .select("id, title, type, trade, scheduled_date, scheduled_end_date, status, job_id")
          .eq("tenant_id", tenantId)
          .neq("status", "cancelled")
          .gte("scheduled_date", today)
          .lte("scheduled_date", end)
          .order("scheduled_date", { ascending: true })
          .limit(20);
        if (gsJobId) q = (q as any).eq("job_id", gsJobId);
        const { data: gsItems } = await q;

        // Resolve job labels
        const gsJobIds = [...new Set(((gsItems || []) as any[]).map((i: any) => i.job_id).filter(Boolean))];
        const gsJobMap: Record<string, string> = {};
        if (gsJobIds.length) {
          const { data: gsJobRows } = await sb.from("jobs").select("id, address, client_name").in("id", gsJobIds);
          for (const j of (gsJobRows || []) as any[]) {
            gsJobMap[j.id] = j.client_name ? `${j.address} — ${j.client_name}` : j.address;
          }
        }

        return {
          horizon_days: horizonDays,
          from: today,
          to: end,
          count: (gsItems || []).length,
          items: ((gsItems || []) as any[]).map((i: any) => ({
            date:     i.scheduled_date,
            end_date: i.scheduled_end_date || null,
            title:    i.title,
            type:     i.type,
            trade:    i.trade || null,
            status:   i.status,
            job:      gsJobMap[i.job_id] || i.job_id,
          })),
        };
      }

      case "get_open_todos": {
        // Optional job filter
        let gotJobId: string | null = null;
        if (input.job_name) {
          const rjb = await resolveJobByName(sb, tenantId, String(input.job_name));
          if ("error" in rjb) return rjb;
          gotJobId = rjb.id;
        }

        let q = sb.from("todos")
          .select("id, title, priority, source, status, job_id, due_date, created_at, notes")
          .eq("tenant_id", tenantId)
          .eq("status", "open")
          .or(`user_id.eq.${userId},user_id.is.null`)
          .order("created_at", { ascending: true })
          .limit(20);
        if (gotJobId) q = (q as any).eq("job_id", gotJobId);
        if (input.priority) q = (q as any).eq("priority", String(input.priority));
        const { data: gotTodos } = await q;

        // Resolve job labels
        const gotJobIds = [...new Set(((gotTodos || []) as any[]).map((t: any) => t.job_id).filter(Boolean))];
        const gotJobMap: Record<string, string> = {};
        if (gotJobIds.length) {
          const { data: gotJobRows } = await sb.from("jobs").select("id, address").in("id", gotJobIds);
          for (const j of (gotJobRows || []) as any[]) gotJobMap[j.id] = j.address;
        }

        const gotNow = Date.now();
        return {
          count: (gotTodos || []).length,
          todos: ((gotTodos || []) as any[]).map((t: any) => ({
            id:       t.id,
            title:    t.title,
            priority: t.priority,
            source:   t.source || "manual",
            job:      t.job_id ? (gotJobMap[t.job_id] || t.job_id) : null,
            due_date: t.due_date || null,
            age_days: Math.floor((gotNow - new Date(t.created_at).getTime()) / 86_400_000),
            notes:    t.notes || null,
          })),
        };
      }

      case "get_alerts": {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

        // Open vigilance / engine todos (tenant-wide, not user-scoped — alerts affect the whole org)
        const { data: gaTodos } = await sb.from("todos")
          .select("id, title, priority, source, job_id, created_at")
          .eq("tenant_id", tenantId)
          .eq("status", "open")
          .in("source", ["vigilance", "engine"])
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20);

        // Recent alert-type notifications (last 7 days)
        const GA_ALERT_TYPES = [
          "no_daily_log", "lien_waiver_missing", "budget_overrun", "consultation_stale",
          "payment_overdue", "estimate_no_proposal_24h", "walkthrough_prep",
        ];
        const { data: gaNotifs } = await sb.from("notifications")
          .select("id, type, title, body, job_id, created_at, read")
          .eq("tenant_id", tenantId)
          .in("type", GA_ALERT_TYPES)
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(20);

        // Resolve job labels
        const gaJobIds = [...new Set([
          ...((gaTodos || []) as any[]).map((t: any) => t.job_id),
          ...((gaNotifs || []) as any[]).map((n: any) => n.job_id),
        ].filter(Boolean))];
        const gaJobMap: Record<string, string> = {};
        if (gaJobIds.length) {
          const { data: gaJobRows } = await sb.from("jobs").select("id, address").in("id", gaJobIds);
          for (const j of (gaJobRows || []) as any[]) gaJobMap[j.id] = j.address;
        }

        const gaNow = Date.now();
        return {
          open_alerts: ((gaTodos || []) as any[]).map((t: any) => ({
            title:    t.title,
            priority: t.priority,
            source:   t.source,
            job:      t.job_id ? (gaJobMap[t.job_id] || t.job_id) : null,
            age_days: Math.floor((gaNow - new Date(t.created_at).getTime()) / 86_400_000),
          })),
          recent_notifications: ((gaNotifs || []) as any[]).map((n: any) => ({
            type:  n.type,
            title: n.title,
            body:  n.body,
            job:   n.job_id ? (gaJobMap[n.job_id] || n.job_id) : null,
            date:  n.created_at?.slice(0, 10),
            read:  n.read,
          })),
        };
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
          financial_model: (input.financial_model as string) || (input.cost_plus ? "cost_plus" : "fixed_bid"),
          cost_plus: input.financial_model === "cost_plus" || input.cost_plus === true,
          arv: input.financial_model === "flip" && input.arv != null ? Number(input.arv) : null,
          labor_markup_pct: (input.financial_model === "cost_plus" || input.cost_plus) ? Number(input.labor_markup_pct ?? 0) : null,
          material_markup_pct: (input.financial_model === "cost_plus" || input.cost_plus) ? Number(input.material_markup_pct ?? 0) : null,
          default_markup_pct: (input.financial_model === "cost_plus" || input.cost_plus) ? Number(input.labor_markup_pct ?? input.material_markup_pct ?? 0) : null,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        try {
          const DEFAULT_PHASES_SEED = ['Lead','Proposal','Contract','Demo','Rough-ins','Inspections','Drywall','Finishes','Final touches','Complete'];
          await sb.from("job_phases").insert(
            DEFAULT_PHASES_SEED.map((name, i) => ({
              tenant_id: tenantId,
              job_id: data.id,
              phase_name: name,
              phase_order: i + 1,
              status: "not_started",
            }))
          );
        } catch (_) {}
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
        // Re-pointed 2026-07-02: calls create-client-login (canonical password path) instead of
        // send-client-link (retired magic-link path). BEHAVIOR CHANGE: no email is sent to the
        // client — the PM must share the credentials (email + password) directly. Mirror of
        // InfoTab ClientLoginButton / sbCreateClientLogin in avenstone-vite/src/lib/supabase.js.
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-client-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
          body: JSON.stringify({
            email: input.email,
            password: input.password,
            client_name: input.client_name || "",
            job_id: input.job_id,
            tenant_id: tenantId,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) return { error: json.error || "create-client-login failed" };
        // Verify: read back the provisioned profile row to confirm the login was created.
        const { data: profile } = await sb.from("profiles")
          .select("id, tenant_id, role, email")
          .eq("id", json.user_id)
          .eq("tenant_id", tenantId)
          .single();
        if (!profile) return { error: "Login provisioned but profile verification failed" };
        return {
          ok: true,
          user_id: json.user_id,
          email: json.email,
          role: (profile as any).role,
          tenant_id: (profile as any).tenant_id,
          note: "Login provisioned. No email was sent — share the email and password with the client directly.",
        };
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
        // Side effects — mirrors sbAdvancePhase: notification, auto-invoice, trade actuals.
        let jobAddress = "";
        try { const { data: jAddr } = await sb.from("jobs").select("address").eq("id", input.job_id).single(); jobAddress = (jAddr as any)?.address || ""; } catch (_) {}
        notifyTenantStaff(sb, tenantId, userId, {
          type: "phase_advanced",
          title: `Phase advanced — ${jobAddress || "job"}`,
          body: `Moved to ${PHASE_LABELS[nextPhase] || nextPhase}${useOverride ? " (override)" : ""}`,
          jobId: String(input.job_id),
        }).catch(() => {});
        checkAndAutoInvoice(sb, tenantId, userId, "phase.advanced", {
          jobId: String(input.job_id), newPhase: nextPhase,
        }).catch((err: any) => console.warn("[autoInvoice] ai-master-agent advance_phase hook failed:", err?.message));
        if (nextPhase === "complete") {
          captureTradeActualsForJob(sb, tenantId, String(input.job_id))
            .catch((err: any) => console.warn("[tradeActuals] ai-master-agent capture failed:", err?.message));
        }
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

        // Resolve sub via shared helper (DB-level ilike on profiles, role='sub', tenant-scoped)
        let assignedSubId: string | null = null;
        let subNote = "";
        if (input.sub_search) {
          const rsp = await resolveSubProfile(sb, tenantId, String(input.sub_search));
          if ("error" in rsp) {
            subNote = ` (Couldn't find sub matching '${input.sub_search}' — created without invitee.)`;
          } else {
            assignedSubId = rsp.id;
            subNote = ` Invited ${rsp.name}.`;
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
        if (input.trade) insertPayload.trade = canonicalizeTrade(String(input.trade));
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
        // 1. Resolve sub_contact_id from sub_name via shared helper
        const rsi = await resolveSubContact(sb, tenantId, String(input.sub_name));
        let subContactId: string;
        if ("error" in rsi) {
          if (rsi.matches) {
            // Multi-match — surface error, do not create
            return { error: rsi.error };
          }
          // Zero match — auto-create minimal contact (matches UI combobox behavior)
          const { data: newContact, error: createErr } = await sb
            .from("contacts")
            .insert({ name: String(input.sub_name).trim(), type: "sub", tenant_id: tenantId })
            .select("id")
            .single();
          if (createErr || !newContact) return { error: `Could not create sub contact: ${createErr?.message}` };
          subContactId = (newContact as any).id;
        } else {
          subContactId = rsi.id;
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
        // 1. Resolve sub contact via shared helper
        const rsp2 = await resolveSubContact(sb, tenantId, String(input.sub_name));
        if ("error" in rsp2) return { error: rsp2.error };
        const spSubContactId = rsp2.id;
        const spSubName = rsp2.name;

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

        // 2. Resolve sub contact via shared helper
        const rap = await resolveSubContact(sb, tenantId, String(input.sub_name));
        if ("error" in rap) return { error: rap.error };
        const apSubContactId = rap.id;
        const apSubName = rap.name;

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

      case "upload_company_file": {
        if (userRole !== "owner" && userRole !== "project_manager") {
          return { error: "Owner or PM role required to upload company files." };
        }

        const cfType      = String(input.file_type || "Other");
        const cfExp       = input.expiration_date ? String(input.expiration_date)  : null;
        const cfPolicy    = input.policy_number   ? String(input.policy_number)    : null;
        const cfIssuer    = input.issuer          ? String(input.issuer)           : null;
        const cfToSubs    = Boolean(input.visible_to_subs);
        const cfToClients = Boolean(input.visible_to_clients);
        const imgData     = input._image_data ? String(input._image_data) : null;
        const imgMime     = input._image_mime ? String(input._image_mime) : "image/jpeg";
        const isPdfFile   = Boolean(input._is_pdf);

        if (!imgData) {
          return { error: "No document attached. Please attach an image or PDF of the company document first." };
        }

        // Derive category from type
        const CF_CATEGORY_MAP: Record<string, string> = {
          "coi": "Insurance", "general liability": "Insurance", "gl insurance": "Insurance",
          "workers comp": "Insurance", "workers compensation": "Insurance", "umbrella": "Insurance",
          "bond": "Insurance", "surety bond": "Insurance",
          "license": "License", "contractor license": "License", "trade license": "License",
          "w-9": "Tax", "w9": "Tax",
        };
        const cfCategory = CF_CATEGORY_MAP[cfType.toLowerCase()] ?? "Compliance";

        // Build visible_to_roles
        const cfVisibleToRoles: string[] = [];
        if (cfToSubs)    cfVisibleToRoles.push("sub");
        if (cfToClients) cfVisibleToRoles.push("client");

        // Decode base64 and upload to storage
        const cfFileId   = crypto.randomUUID();
        const cfExt      = isPdfFile ? "pdf" : (imgMime.split("/")[1] || "jpg");
        const cfTypeSlug = cfType.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
        const cfPath     = `${tenantId}/${cfTypeSlug}/${cfFileId}.${cfExt}`;

        const cfBin   = atob(imgData);
        const cfBytes = new Uint8Array(cfBin.length);
        for (let b = 0; b < cfBin.length; b++) cfBytes[b] = cfBin.charCodeAt(b);

        const { error: cfUpErr } = await sb.storage
          .from("company-files")
          .upload(cfPath, cfBytes, { contentType: imgMime, upsert: false });
        if (cfUpErr) return { error: `Upload failed: ${cfUpErr.message}` };

        // Archive any existing active file of same type for this tenant
        await sb.from("company_files")
          .update({ lifecycle_status: "archived", archived_at: new Date().toISOString() })
          .eq("tenant_id", tenantId)
          .eq("type", cfType)
          .eq("lifecycle_status", "active");

        // Insert new company_files row
        const { error: cfInsErr } = await sb.from("company_files").insert({
          id:               cfFileId,
          tenant_id:        tenantId,
          uploaded_by_id:   userId,
          name:             `${cfType} — uploaded via agent`,
          storage_path:     cfPath,
          storage_bucket:   "company-files",
          mime_type:        imgMime,
          category:         cfCategory,
          type:             cfType,
          issuer:           cfIssuer,
          policy_number:    cfPolicy,
          expiration_date:  cfExp,
          extracted_fields: {},
          visible_to_roles: cfVisibleToRoles,
          lifecycle_status: "active",
        });

        if (cfInsErr) {
          await sb.storage.from("company-files").remove([cfPath]).catch(() => {});
          return { error: `Database insert failed: ${cfInsErr.message}` };
        }

        // Schedule watchdog rows if expiration_date set (non-blocking)
        if (cfExp) {
          const cfExpMs = new Date(cfExp).getTime();
          const cfScheduleRows = [
            { daysOut: 30, ruleKey: `cf_exp_30d_${cfFileId}`, priority: "medium" },
            { daysOut: 14, ruleKey: `cf_exp_14d_${cfFileId}`, priority: "high"   },
            { daysOut: 0,  ruleKey: `cf_exp_0d_${cfFileId}`,  priority: "high"   },
          ];
          for (const s of cfScheduleRows) {
            const cfFireAt = new Date(cfExpMs - s.daysOut * 86_400_000).toISOString();
            sb.from("scheduled_actions").insert({
              tenant_id:           tenantId,
              kind:                "reminder",
              status:              "scheduled",
              priority:            s.priority,
              rule_key:            s.ruleKey,
              fire_at:             cfFireAt,
              source:              "system",
              related_entity_type: "company_file",
              related_entity_id:   cfFileId,
              payload:             { company_file_id: cfFileId, days_out: s.daysOut },
              created_by_id:       userId,
            }).then(({ error: saErr }: { error: unknown }) => {
              if (saErr) console.warn(`[upload_company_file] schedule row failed: ${saErr}`);
            });
          }
        }

        const cfBits: string[] = [`${cfType} uploaded`];
        if (cfExp)    cfBits.push(`expires ${cfExp}`);
        if (cfIssuer) cfBits.push(cfIssuer);
        if (cfVisibleToRoles.length > 0) cfBits.push(`visible to: ${cfVisibleToRoles.join(", ")}`);
        return { success: cfBits.join(" · ") };
      }

      case "record_deposit": {
        if (!["owner", "project_manager"].includes(userRole)) {
          return { error: "Only owner or project manager can record client deposits." };
        }
        const { data: rdJob } = await sb.from("jobs")
          .select("address")
          .eq("id", input.job_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (!rdJob) return { error: "Job not found." };
        let rdDesc = input.description ? String(input.description) : null;
        if (!rdDesc) rdDesc = `Client deposit${(rdJob as any).address ? ` — ${(rdJob as any).address}` : ""}`;
        const { data: rdTx, error: rdErr } = await sb.from("job_transactions").insert({
          tenant_id:      tenantId,
          job_id:         input.job_id,
          direction:      "in",
          type:           "client_deposit",
          amount:         Number(input.amount),
          description:    rdDesc,
          payment_method: input.payment_method || null,
          status:         "paid",
          invoice_id:     null,
          date_paid:      new Date().toISOString().slice(0, 10),
          created_by:     userId,
          created_at:     new Date().toISOString(),
        }).select("id, amount").single();
        if (rdErr) return { error: rdErr.message };
        return { success: true, transaction_id: (rdTx as any).id, amount: (rdTx as any).amount };
      }

      case "compose_draw": {
        if (!["owner", "project_manager"].includes(userRole)) {
          return { error: "Only owner or project manager can compose draws." };
        }

        const cdRound2 = (n: number) => Math.round(n * 100) / 100;
        const CD_TYPE_LABELS: Record<string, string> = {
          sub_payout: "Sub Payout", labor: "Labor", material_purchase: "Material Purchase",
          fuel: "Fuel", permit: "Permit", commission: "Commission", other_expense: "Other Expense",
        };

        // On confirm path, _line_items is pre-built by the confirmBlock hydration.
        // On direct call path (rare), build them here.
        let cdLineItems: unknown[] = [];
        let cdNetDue = 0;

        if (Array.isArray(input._line_items) && (input._line_items as any[]).length > 0) {
          cdLineItems = input._line_items as unknown[];
          cdNetDue = Number(input._net_due || 0);
        } else {
          // Direct path: load job, check cost_plus, load expenses
          const { data: cdJob } = await sb.from("jobs")
            .select("cost_plus")
            .eq("id", input.job_id)
            .eq("tenant_id", tenantId)
            .maybeSingle();
          if (!(cdJob as any)?.cost_plus) {
            return { error: "This job is not set up for cost-plus billing." };
          }
          const { data: cdExpenses } = await sb.from("job_transactions")
            .select("id, type, amount, markup_pct, description")
            .eq("job_id", input.job_id)
            .eq("direction", "out")
            .eq("reimbursement_status", "unreimbursed")
            .order("date_incurred", { ascending: true });
          if (!cdExpenses || (cdExpenses as any[]).length === 0) {
            return { error: "No unreimbursed expenses found for this job." };
          }
          cdLineItems = (cdExpenses as any[]).map((e: any, idx: number) => {
            const base = Number(e.amount) || 0;
            const pct = Number(e.markup_pct) || 0;
            const markupAmt = cdRound2(base * pct / 100);
            return {
              transaction_id: e.id,
              description: e.description || CD_TYPE_LABELS[e.type] || e.type,
              base_amount: base, markup_pct: pct, markup_amount: markupAmt,
              total_with_markup: cdRound2(base + markupAmt),
              is_forward_looking: false, display_order: idx, notes: null,
            };
          });
          const cdGross = cdRound2((cdLineItems as any[]).reduce((s: number, r: any) => s + r.total_with_markup, 0));
          const { data: cdTxRows } = await sb.from("job_transactions")
            .select("direction, amount, invoice_id, status")
            .eq("job_id", input.job_id)
            .neq("status", "void");
          let cdBucket = 0;
          for (const r of (cdTxRows || []) as any[]) {
            if (r.direction === "in" && r.invoice_id === null && r.status === "paid") {
              cdBucket += Number(r.amount) || 0;
            }
          }
          cdBucket = cdRound2(cdBucket);
          const cdApplyBucket = input.apply_bucket !== false;
          cdNetDue = cdApplyBucket ? cdRound2(Math.max(0, cdGross - cdBucket)) : cdGross;
        }

        const { data: cdRpc, error: cdErr } = await sb.rpc("compose_draw", {
          p_job_id:        input.job_id,
          p_title:         input.title ? String(input.title) : "Draw",
          p_description:   null,
          p_target_amount: cdNetDue,
          p_apply_bucket:  input.apply_bucket !== false,
          p_line_items:    cdLineItems,
        });
        if (cdErr) return { error: cdErr.message };
        const cdResult = Array.isArray(cdRpc) ? cdRpc[0] : cdRpc;
        const cdDrawId = (cdResult as any)?.draw_id;
        // Post-write verification: confirm draw_schedules row actually landed.
        if (cdDrawId) {
          const { data: cdVerify, error: cdVerifyErr } = await sb
            .from("draw_schedules")
            .select("id")
            .eq("id", cdDrawId)
            .single();
          if (cdVerifyErr || !cdVerify) {
            return { error: "Draw composed but row not confirmed in DB — possible RLS block." };
          }
        }
        return {
          success: true,
          draw_id:     cdDrawId,
          draw_number: (cdResult as any)?.draw_number,
          line_count:  (cdResult as any)?.line_count,
          target:      cdNetDue,
        };
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

// Company-file extraction system prompt — used inline in runAgentLoop for upload_company_file.
// Mirrors ai-extract-company-file/index.ts but embedded to avoid inter-function HTTP call.
const CF_EXTRACT_PROMPT = `You are extracting fields from a contractor compliance document (insurance certificate, license, bond, or tax form). Return ONLY valid JSON, no preamble, no markdown fences, no commentary.

Schema:
{
  "type": "COI" | "General Liability" | "Workers Comp" | "Bond" | "License" | "W-9" | "Other" | null,
  "expiration_date": "YYYY-MM-DD" | null,
  "policy_number": string | null,
  "issuer": string | null
}

Rules:
- type: "COI" = Certificate of Insurance (any kind). "Workers Comp" = workers compensation. "Bond" = surety bond. "License" = contractor/trade license. "W-9" = IRS W-9. "General Liability" = stand-alone GL policy. "Other" if unclear.
- Dates must be ISO 8601 YYYY-MM-DD; return null if year cannot be determined.
- policy_number: policy, license, or bond number — the primary document ID.
- issuer: the insurance company, surety, or licensing authority (NOT the contractor holding it).
- Return null for any field not present or not determinable.`;

// Extends extractLatestUserImage to also capture PDF document blocks (type="document").
// Used for upload_company_file which accepts both image snapshots and PDF uploads.
function extractLatestUserFile(
  msgs: Array<{ role: string; content: unknown }>,
): { data: string; mime: string; isPdf: boolean } | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    for (const block of m.content as Array<any>) {
      // PDF document block — Anthropic beta format
      if (
        block?.type === "document" &&
        block?.source?.type === "base64" &&
        typeof block.source.data === "string"
      ) {
        return { data: block.source.data, mime: "application/pdf", isPdf: true };
      }
      // Image block
      if (
        block?.type === "image" &&
        block?.source?.type === "base64" &&
        typeof block.source.data === "string" &&
        typeof block.source.media_type === "string"
      ) {
        return { data: block.source.data, mime: block.source.media_type, isPdf: false };
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
      if (input._job_address) bits.push(`on ${String(input._job_address)}`);
      return bits.join(" · ") + ".";
    }
    case "create_job": {
      const lines: string[] = [`Create job: ${input.address || '(no address)'}`];
      if (input.client_name) lines.push(`  Client: ${input.client_name}`);
      if (input.contract_value) lines.push(`  Contract value: $${Number(input.contract_value).toFixed(2)}`);
      const fm = (input.financial_model as string) || (input.cost_plus ? "cost_plus" : "fixed_bid");
      if (fm === "flip") {
        lines.push(`  Model: Flip${input.arv ? ` (ARV $${Number(input.arv).toFixed(0)})` : ''}`);
      } else if (fm === "cost_plus") {
        const lp = Number(input.labor_markup_pct ?? 0);
        const mp = Number(input.material_markup_pct ?? 0);
        lines.push(`  Model: Cost-Plus (labor ${lp}%, material ${mp}%)`);
      } else {
        lines.push(`  Model: Fixed Bid`);
      }
      if (input.status) lines.push(`  Status: ${input.status}`);
      if (input.scope) lines.push(`  Scope: ${String(input.scope).slice(0, 80)}${String(input.scope).length > 80 ? '...' : ''}`);
      return lines.join('\n');
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
    case "upload_company_file": {
      const cfDescBits: string[] = [`Upload ${String(input.file_type || "document")}`];
      if (input.issuer)          cfDescBits.push(String(input.issuer));
      if (input.expiration_date) cfDescBits.push(`expires ${String(input.expiration_date)}`);
      if (input.policy_number)   cfDescBits.push(`#${String(input.policy_number)}`);
      const cfVis: string[] = [];
      if (input.visible_to_subs)    cfVis.push("subs");
      if (input.visible_to_clients) cfVis.push("clients");
      if (cfVis.length > 0) cfDescBits.push(`visible to ${cfVis.join(" + ")}`);
      return cfDescBits.join(" · ") + ".";
    }
    case "record_deposit": {
      const rdBits: string[] = [`Record ${fmtMoney(input.amount)} (${amountToWords(input.amount)}) deposit`];
      if (input._job_address) rdBits.push(String(input._job_address));
      if (input.description)  rdBits.push(String(input.description));
      rdBits.push("Bucket balance increases by this amount.");
      return rdBits.join(" · ") + ".";
    }
    case "compose_draw": {
      const cdCount = Number(input._expense_count || 0);
      const cdGrossStr = fmtMoney(input._gross);
      const cdBucket = Number(input._bucket || 0);
      const cdNetDue = Number(input._net_due || 0);
      const cdNetStr = fmtMoney(cdNetDue);
      const cdAddr = input._job_address ? ` for ${String(input._job_address)}` : "";
      const cdTitle = input.title ? ` "${String(input.title)}"` : "";
      const cdBucketBit = cdBucket > 0 ? ` · bucket offset -${fmtMoney(cdBucket)}` : "";
      return `Compose draw${cdAddr}${cdTitle}: ${cdCount} expense${cdCount !== 1 ? "s" : ""}, gross ${cdGrossStr}${cdBucketBit}, draw target ${cdNetStr} (${amountToWords(cdNetDue)}).`;
    }
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
  contextScreen = "",   // lightweight screen context — injected as first message, not in cached prefix
): Promise<{
  response: string;
  actions: Array<{ tool: string; input: unknown; result: unknown }>;
  pending_action?: { tool: string; input: unknown; description: string };
  pending_card?: PendingCard; // Phase 2+ tools set this; Phase 1 wiring only
}> {

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const systemPrompt = `# ── AVEN CORE IDENTITY (same base as ai-estimator) ──
You are Aven — Avenstone's AI. You have direct access to the database and take real actions, not suggestions. Never mention Claude, Anthropic, or any AI platform.

VOICE & BEHAVIOR:
- Fewest questions: infer from job data, team, AI Knowledge, and screen context. Ask only what genuinely can't be inferred. One short question max; if you can act, act.
- Task-focused: answer the request and stop. No tangents, no explaining unrelated features, no scope creep.
- Terse: short and direct. Read intent generously — don't bounce questions back over phrasing. No preamble, no filler, no recapping.
- Anti-surprise: flag real gaps or risks in ONE line when you spot them. Not a lecture.

# ── MASTER AGENT EXTENSION ──

PROBLEM MAPPING:
When the user states a generic problem ("I keep forgetting to follow up with clients", "I always lose track of sub payments"), map it to the feature that solves it and propose the concrete action concisely ("Set a reminder — daily or weekly?"). Don't explain the feature. Don't ask open-ended questions. One clear action offer.

User: ${userName} (${userRole})
Today: ${today}
Tenant: ${tenantId}

WHAT YOU CAN DO:
- Read: jobs, team, job financials, schedule, open todos, alerts
- Write: create jobs, update jobs, add contacts, send portal links, invite people, add notes, add todos (action items), advance lifecycle phase, update trade phases, submit change orders, log payments, log receipts, log sub invoices, log sub payments, approve sub invoices, send notifications, write to knowledge base, create schedule items, upload company files, record client deposits (cost-plus), compose cost-plus draws

ANSWERING QUESTIONS WITH READ TOOLS:
- When the user asks about money, finances, what's owed, what's been paid, outstanding amounts, draw balance, or bucket credit on a job → call get_job_financials. Numbers come directly from the database and match the Financials tab exactly. Do NOT say "check the Financials tab" when you can answer it directly.
- When the user asks what's scheduled, what's next, what's coming up, upcoming subs or deliveries, or calendar items → call get_schedule.
- When the user asks what they need to do, what's on their list, their todos, pending action items → call get_open_todos.
- When the user asks "what needs my attention", "what should I focus on", "what's urgent", or "what did the system flag" → call get_alerts.
- PREFER calling a read tool over saying you don't know. Saying "I can't see your schedule" or "you'll need to check the app" when you have tools to answer is wrong.

HOW TO BEHAVE:
- If you need a job ID and the user named a specific job, call get_jobs with search=<the name or address fragment>. A disambiguation card surfaces automatically when multiple matches are found — don't ask in text. If you need a sub ID, call get_team first.
- When you take multiple actions, report each one clearly: "✓ Created job · ✓ Added note · ✓ Notified team"
- If something fails, say what failed and why.
- If a request is ambiguous in a way that would cause you to take the wrong action, ask ONE clarifying question.
- For confirm-gated write tools (log_payment, log_receipt, submit_change_order, add_todo, create_job, notify_team_member, create_schedule_item, log_sub_invoice, log_sub_payment, approve_sub_invoice, upload_company_file, record_deposit, compose_draw): describe what's about to happen in one plain sentence and call the tool. The system surfaces a confirmation card automatically — do NOT ask the user to confirm via text first ("Confirm?", "Should I proceed?", etc.). The card IS the confirmation. Do not assume the action ran until you receive the tool_result.
- Missing required fields: call the tool with whatever fields you have. If any required field is missing, the system surfaces a missing-field card automatically — do NOT ask in text first ("What's the amount?", "Which job?", etc.). Never invent values to fill gaps; just call the tool and let the card collect the rest.
- Currency formatting: ALWAYS write dollar amounts with two decimal places. "$542.50" not "$542.5". "$1,000.00" not "$1000". Applies to text responses, action descriptions, summaries, and any reference to a monetary value.
- For advance_phase: do NOT pass override_reason. Just call the tool with the job_id. If gates fail, the system surfaces a gate-resolution card automatically (redirect to Schedule / leave open / override-with-structured-reason). Do not ask in text whether to override — the card IS the prompt.
- TODO vs NOTE: an action item ("call back X", "follow up", "remind me", "don't forget", "schedule Y", "todo") goes to add_todo. Passive context attached to a job ("FYI…", "the client said…", "noted that…", "for the record…") goes to add_note. When in doubt and the user said "todo", pick add_todo. After writing a todo, the success message should say "Todo added" — never "Note added."
- If a context job is set (shown in the opening [Context] message), treat it as the implicit default job for any tool that needs a job_id, unless the user explicitly names a different job. The system pre-fills job_id automatically — do not ask for it when context is set. When resolving "this job" / "here" / no job ref, always use the context job.

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

COMPANY FILE WORKFLOW
When the user attaches an image or PDF and mentions insurance, license, bond, W-9, COI, or any company compliance document, use upload_company_file. Vision extracts expiration date, policy number, and issuer automatically from the attached document — do NOT ask the user for those fields if the document was attached. Only ask if (a) the document type is genuinely ambiguous after reading it, or (b) the user explicitly wants to override an extracted value. Owner/PM only — if a rep or sub asks, explain that company file uploads require owner or PM access.

INTENT RESOLUTION

When the user's message contains multiple possible actions, do NOT fire multiple tool calls in one response. Pick the PRIMARY action (the one most directly stated as an imperative) and fire ONLY that one. If unsure which action is primary, ask the user briefly which to do first.

Examples:
- "Create a job at 123 Main and log a receipt from Home Depot" → fire create_job ONLY. After it confirms, ask the user to re-send the receipt request.
- "Add a todo to call Mike and create a new job" → ask the user "Which first — the todo or the job?"

This rule does NOT apply to internal helper calls (e.g. get_jobs to resolve a PO match before log_receipt) — those are reads that support a single user-intent verb.

COST-PLUS DRAW WORKFLOW
record_deposit is for cost-plus jobs only. Use when a client hands over a check, ACH, or cash before a draw invoice is created — the payment lands as a bucket credit (inbound, no invoice link). Do NOT use log_payment for cost-plus deposits — log_payment is for standard contract invoices. Owner/PM only.

compose_draw is for cost-plus jobs only. Use when the owner says "compose a draw", "bill the client for expenses", "generate a draw", or similar. The system auto-loads all unreimbursed expenses and the current bucket balance, then surfaces a confirmation card showing expense count, gross total, bucket offset, and draw target. On confirm, the draw draft is created and transactions are flipped to in_draw. Owner/PM only — if a rep asks, explain the role requirement. After the draw is confirmed, tell the owner the draw number so they can proceed to invoice creation in the Financials tab. Do NOT call compose_draw on standard (non-cost-plus) jobs — the system will reject it. If the job is not cost-plus, explain how the Financials tab handles standard invoicing instead.

When creating a job via create_job, set financial_model to the appropriate value:
  - financial_model: "flip" — for house flips (owner-financed, reimbursed via draws, tracked against ARV). Optionally include arv (numeric, the projected sale price in dollars).
  - financial_model: "cost_plus" — for client-billed cost-plus jobs. ALWAYS also set labor_markup_pct and material_markup_pct.
  - financial_model: "fixed_bid" — default; client billed on a fixed payment schedule.

If the user gives a single markup percentage ("set it at 25%"), apply that percentage to BOTH labor and material. If they specify different rates ("15% labor, 20% material"), split accordingly. NEVER create a cost_plus job without both markup rates populated — the cost-plus state machine relies on them.

For flips: "create a flip at 123 Main" → financial_model="flip". If they mention a sale price or ARV, set arv to that number.

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

  // Prepend screen context as first message — replaces system-prompt contextLine.
  // Refreshed per request (not accumulated); does not touch the system+tools cache breakpoint.
  // Include job_id in the label so the model can use it directly in tool calls without guessing.
  const ctxJobPart = contextJobLabel
    ? `${contextJobLabel} (job_id: ${contextJobId})`
    : contextJobId || "";
  const ctxLabel = contextScreen
    ? (contextJobId && !contextScreen.includes(contextJobId) ? `${contextScreen} (job_id: ${contextJobId})` : contextScreen)
    : (ctxJobPart ? `Viewing job: ${ctxJobPart}` : "");
  let currentMessages: Array<{ role: string; content: unknown }> = ctxLabel
    ? [{ role: "user", content: `[Context] ${ctxLabel}` }, ...messages]
    : [...messages];

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
      // Read tools (no REQUIRED_FIELDS entry) also get job_id pre-filled when context is set.
      const READ_CTX_TOOLS = new Set(["get_job_financials", "get_schedule"]);
      if (contextJobId) {
        for (const block of blocks) {
          if (block.type === "tool_use" && block.name && block.id) {
            // Write tools — REQUIRED_FIELDS-driven pre-fill
            const fieldSpec = REQUIRED_FIELDS[block.name];
            if (
              fieldSpec?.some((f) => f.field === "job_id" && f.dynamic_options === "active_jobs") &&
              isMissing((block.input || {} as any).job_id)
            ) {
              block.input = { ...(block.input || {}), job_id: contextJobId };
            }
            // Read tools — inject job_id when no job_id AND no job_name given
            if (READ_CTX_TOOLS.has(block.name)) {
              const inp = (block.input || {}) as any;
              if (!inp.job_id && !inp.job_name) {
                block.input = { ...inp, job_id: contextJobId };
              }
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
        // upload_company_file: extract fields from attached image/PDF via inline Haiku call.
        // File data is stashed in _image_data/_image_mime/_is_pdf so the executor can upload
        // to storage. Inline extraction avoids inter-function JWT forwarding complexity.
        if (confirmBlock.name === "upload_company_file") {
          const cfFileBlock = extractLatestUserFile(currentMessages);
          if (cfFileBlock) {
            const cfExtractHdrs: Record<string, string> = {
              "x-api-key": ANTHROPIC_KEY,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            };
            if (cfFileBlock.isPdf) cfExtractHdrs["anthropic-beta"] = "pdfs-2024-09-25";
            const cfContentBlock = cfFileBlock.isPdf
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: cfFileBlock.data } }
              : { type: "image",    source: { type: "base64", media_type: cfFileBlock.mime,            data: cfFileBlock.data } };
            try {
              const cfExtractRes = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: cfExtractHdrs,
                body: JSON.stringify({
                  model: "claude-haiku-4-5-20251001",
                  max_tokens: 512,
                  system: CF_EXTRACT_PROMPT,
                  messages: [{ role: "user", content: [cfContentBlock, { type: "text", text: "Extract the document fields." }] }],
                }),
              });
              if (cfExtractRes.ok) {
                const cfExtractData = await cfExtractRes.json();
                const rawCf: string = cfExtractData?.content?.[0]?.text ?? "{}";
                const matchCf = rawCf.match(/\{[\s\S]*\}/);
                // deno-lint-ignore no-explicit-any
                const extr: Record<string, any> = JSON.parse(matchCf?.[0] ?? "{}");
                // Merge Haiku findings — agent-provided values win (user can override)
                if (extr.type           && !inputObj.file_type)       inputObj.file_type       = extr.type;
                if (extr.expiration_date && !inputObj.expiration_date) inputObj.expiration_date = extr.expiration_date;
                if (extr.policy_number  && !inputObj.policy_number)   inputObj.policy_number   = extr.policy_number;
                if (extr.issuer         && !inputObj.issuer)           inputObj.issuer          = extr.issuer;
              }
            } catch (cfExtractErr) {
              console.warn("[upload_company_file] Haiku extraction failed:", cfExtractErr);
            }
            // Stash file bytes for executor — never ask Claude to forward base64 through tool input
            inputObj._image_data = cfFileBlock.data;
            inputObj._image_mime = cfFileBlock.mime;
            inputObj._is_pdf     = cfFileBlock.isPdf;
          }
        }
        // record_deposit: pre-fetch job address for Confirm card readback.
        if (confirmBlock.name === "record_deposit" && inputObj.job_id) {
          const { data: rdJobCard } = await sb.from("jobs").select("address").eq("id", String(inputObj.job_id)).maybeSingle();
          if (rdJobCard) inputObj._job_address = (rdJobCard as any).address;
        }
        // compose_draw: load unreimbursed expenses + bucket, compute line items + net due.
        // If job is not cost-plus or has no expenses, abort early with a text response.
        if (confirmBlock.name === "compose_draw") {
          const cdJobId = String(inputObj.job_id || "");
          if (cdJobId) {
            const { data: cdJobCard } = await sb.from("jobs")
              .select("address, cost_plus")
              .eq("id", cdJobId)
              .eq("tenant_id", tenantId)
              .maybeSingle();
            if (!(cdJobCard as any)?.cost_plus) {
              const jobLabel = (cdJobCard as any)?.address || cdJobId;
              return {
                response: `${jobLabel} is not set up for cost-plus billing. compose_draw only works on cost-plus jobs.`,
                actions,
              };
            }
            const cdR2 = (n: number) => Math.round(n * 100) / 100;
            const CD_TLABELS: Record<string, string> = {
              sub_payout: "Sub Payout", labor: "Labor", material_purchase: "Material Purchase",
              fuel: "Fuel", permit: "Permit", commission: "Commission", other_expense: "Other Expense",
            };
            const { data: cdExp } = await sb.from("job_transactions")
              .select("id, type, amount, markup_pct, description")
              .eq("job_id", cdJobId)
              .eq("direction", "out")
              .eq("reimbursement_status", "unreimbursed")
              .order("date_incurred", { ascending: true });
            if (!cdExp || (cdExp as any[]).length === 0) {
              return {
                response: "No unreimbursed expenses found on this job — nothing to draw.",
                actions,
              };
            }
            const cdItems = (cdExp as any[]).map((e: any, idx: number) => {
              const base = Number(e.amount) || 0;
              const pct = Number(e.markup_pct) || 0;
              const markupAmt = cdR2(base * pct / 100);
              return {
                transaction_id: e.id,
                description: e.description || CD_TLABELS[e.type] || e.type,
                base_amount: base, markup_pct: pct, markup_amount: markupAmt,
                total_with_markup: cdR2(base + markupAmt),
                is_forward_looking: false, display_order: idx, notes: null,
              };
            });
            const cdGross = cdR2(cdItems.reduce((s, r) => s + r.total_with_markup, 0));
            const { data: cdTxCard } = await sb.from("job_transactions")
              .select("direction, amount, invoice_id, status")
              .eq("job_id", cdJobId)
              .neq("status", "void");
            let cdBucketVal = 0;
            for (const r of (cdTxCard || []) as any[]) {
              if (r.direction === "in" && r.invoice_id === null && r.status === "paid") {
                cdBucketVal += Number(r.amount) || 0;
              }
            }
            cdBucketVal = cdR2(cdBucketVal);
            const cdApplyBkt = inputObj.apply_bucket !== false;
            const cdNetDue = cdApplyBkt ? cdR2(Math.max(0, cdGross - cdBucketVal)) : cdGross;
            inputObj._line_items     = cdItems;
            inputObj._gross          = cdGross;
            inputObj._bucket         = cdBucketVal;
            inputObj._net_due        = cdNetDue;
            inputObj._expense_count  = cdItems.length;
            inputObj._job_address    = (cdJobCard as any).address || "";
          }
        }
        // add_todo: pre-fetch assignee name so Confirm card readback shows "Add todo for [Name]".
        if (confirmBlock.name === "add_todo" && inputObj.assignee_id && String(inputObj.assignee_id) !== userId) {
          const { data: ap } = await sb.from("profiles").select("full_name").eq("id", String(inputObj.assignee_id)).maybeSingle();
          if (ap) inputObj._assignee_name = (ap as any).full_name;
        }
        // add_todo: show context job address in Confirm card so wrong resolution is visible
        // before commit. If job_id isn't a valid UUID (model used name string), override
        // with contextJobId. Always fetch address for the card description.
        if (confirmBlock.name === "add_todo" && contextJobId) {
          const atProvidedId = inputObj.job_id ? String(inputObj.job_id) : "";
          const atIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(atProvidedId);
          if (!atIsUuid) inputObj.job_id = contextJobId;
          const atResolvedId = atIsUuid ? atProvidedId : contextJobId;
          const { data: atJob } = await sb.from("jobs").select("address").eq("id", atResolvedId).maybeSingle();
          if (atJob) inputObj._job_address = (atJob as any).address;
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
    const { user_id, tenant_id, role, full_name, message, conversation_history, pending_action, confirmed, card_response, context_job_id, context_screen } = await req.json();

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

      const ctxScreenStr = context_screen ? String(context_screen) : (ctxJobLabel ? `Viewing: ${ctxJobLabel}` : "");
      const history = (conversation_history || []).slice(-20);
      const { response, actions, pending_action: pa, pending_card: pc } = await runAgentLoop(
        sb, tenant_id, user_id, role || "owner", full_name || "User", history, 3, ctxJobId, ctxJobLabel, ctxScreenStr,
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

    const ctxScreenFinal = context_screen ? String(context_screen) : (ctxJobLabel ? `Viewing: ${ctxJobLabel}` : "");
    const { response, actions, pending_action: pa, pending_card: pc } = await runAgentLoop(
      sb, tenant_id, user_id, role || "owner", full_name || "User", messages, 3, ctxJobId, ctxJobLabel, ctxScreenFinal,
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
