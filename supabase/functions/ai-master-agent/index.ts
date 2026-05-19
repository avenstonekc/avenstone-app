
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
  type: "select" | "radio_per_item";
  label: string;
  options: CardOption[];
  items?: CardItem[]; // radio_per_item only
}

interface PendingCard {
  id: string;
  prompt: string;
  questions: CardQuestion[];
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
]);

// Elicitation registry — tools that emit a pending_card when required input is
// absent from the tool call. Registry-driven (arc decision #3): the tool declares
// when elicitation is needed; the agent doesn't decide.
// Each entry: (input) → PendingCard | null. Returning null means input is complete;
// fall through to CONFIRM_TOOLS. The null path is the loop guard — without it the
// card fires again on the post-card re-call that carries the answered field.
const ELICIT_TOOLS: Record<string, (input: Record<string, unknown>) => PendingCard | null> = {
  log_receipt: (input) => {
    if (input.type && typeof input.type === "string") return null; // type already present
    return {
      id: crypto.randomUUID(),
      prompt: "What type of expense is this?",
      questions: [
        {
          id: "type",
          type: "select",
          label: "Expense category",
          options: [
            { value: "material_purchase", label: "Materials" },
            { value: "fuel", label: "Fuel" },
            { value: "permit", label: "Permit / Inspection" },
            { value: "sub_payout", label: "Sub Payout" },
            { value: "vendor_payment", label: "Vendor Payment" },
            { value: "commission", label: "Commission" },
            { value: "equipment_rental", label: "Equipment Rental" },
            { value: "other_expense", label: "Other Expense" },
          ],
        },
      ],
    };
  },
};

// ─── Tool definitions (Claude tool use schema) ────────────────────────────────

const TOOLS = [
  {
    name: "get_jobs",
    description: "List jobs for this tenant. Optionally filter by status.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by job lifecycle status: lead, proposal, contract, in_progress, final_touches, complete, on_hold. Omit for all." },
        limit: { type: "number", description: "Max results (default 30)" },
      },
    },
  },
  {
    name: "get_job_details",
    description: "Get full details of a specific job — notes, phases, payments, change orders, subs, photos count.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "UUID of the job" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "get_team",
    description: "List all staff and subs — names, roles, trades, emails.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_dashboard",
    description: "Get a snapshot of what needs attention: overdue phases, unpaid draws, pending change orders, stale jobs.",
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
          enum: ["material_purchase", "fuel", "permit", "sub_payout", "vendor_payment", "commission", "other_expense", "equipment_rental"],
          description: "Expense category. Omit when unknown — the system will prompt the user to select.",
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
        assigned_to_user_id: { type: "string", description: "Whom to assign (optional, defaults to caller)." },
        due_date: { type: "string", description: "Optional ISO date (YYYY-MM-DD)." },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Optional priority." },
      },
      required: ["title"],
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
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  sb: ReturnType<typeof createClient>,
  tenantId: string,
  userId: string,
  toolName: string,
  input: Record<string, unknown>
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
        const { data, error } = await q;
        if (error) return { error: error.message, jobs: [], count: 0 };
        return { jobs: data || [], count: (data || []).length };
      }

      case "get_job_details": {
        const [jobRes, notesRes, phasesRes, paymentsRes, cosRes, subsRes] = await Promise.all([
          sb.from("jobs").select("*").eq("id", input.job_id).single(),
          sb.from("job_notes").select("*").eq("job_id", input.job_id).order("created_at", { ascending: false }).limit(10),
          sb.from("job_phases").select("*").eq("job_id", input.job_id).order("phase_order"),
          sb.from("payments").select("*").eq("job_id", input.job_id),
          sb.from("change_orders").select("*").eq("job_id", input.job_id),
          sb.from("job_sub_engagements")
            .select("id, trade, status, bid_type, sub:profiles!sub_id(id,full_name,trade,phone,email)")
            .eq("job_id", input.job_id)
            .not("status", "in", "(completed,declined,withdrawn,removed)"),
        ]);
        return {
          job: jobRes.data,
          notes: notesRes.data || [],
          phases: phasesRes.data || [],
          payments: paymentsRes.data || [],
          change_orders: cosRes.data || [],
          subs: subsRes.data || [],
        };
      }

      case "get_team": {
        const { data } = await sb.from("profiles")
          .select("id, full_name, role, trade, email, phone")
          .eq("tenant_id", tenantId)
          .order("role").order("full_name");
        return { team: data || [] };
      }

      case "get_dashboard": {
        const today = new Date().toISOString().slice(0, 10);
        const [jobsRes, overdueRes, unpaidRes, pendingCOsRes] = await Promise.all([
          sb.from("jobs").select("id, address, status, contract_value").eq("tenant_id", tenantId)
            .not("status", "in", '("complete","on_hold","lead")'),
          sb.from("schedule_items").select("job_id, title, scheduled_end_date, status")
            .eq("tenant_id", tenantId)
            .lt("scheduled_end_date", today)
            .not("status", "in", '("complete","cancelled")')
            .limit(20),
          sb.from("payments").select("job_id, amount, due_date, description")
            .eq("status", "pending").lt("due_date", today).limit(20),
          sb.from("change_orders").select("job_id, description, amount")
            .eq("tenant_id", tenantId).eq("status", "pending").limit(20),
        ]);
        return {
          active_jobs: jobsRes.data || [],
          overdue_phases: overdueRes.data || [],
          unpaid_draws: unpaidRes.data || [],
          pending_change_orders: pendingCOsRes.data || [],
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
        // commission, other_expense, other_income.
        const ALLOWED_OUT = new Set([
          "material_purchase", "fuel", "permit", "sub_payout",
          "vendor_payment", "commission", "other_expense", "equipment_rental",
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
        const row: Record<string, unknown> = {
          tenant_id: tenantId,
          title,
          notes: input.notes ? String(input.notes).trim() : null,
          type: "user_task",
          source: "manual",
          status: "open",
          job_id: input.job_id || null,
          assigned_to_user_id: input.assigned_to_user_id || userId,
          created_by_id: userId,
          due_date: input.due_date || null,
          priority: input.priority || null,
        };
        const { data, error } = await sb.from("todos").insert(row).select().single();
        if (error) return { error: error.message };
        return { success: true, todo_id: (data as any).id, title: (data as any).title };
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

// Money verbs append the spelled-out amount inline so a wrong digit reads
// obviously wrong on the Confirm card. Non-money verbs get a plain summary.
function describeConfirmAction(tool: string, input: any): string {
  switch (tool) {
    case "log_payment":
      return `Log ${fmtMoney(input.amount)} (${amountToWords(input.amount)}) client payment${input.description ? ` — ${input.description}` : ""}.`;
    case "log_receipt":
      return `Log ${fmtMoney(input.amount)} (${amountToWords(input.amount)}) expense — ${input.description}${input.vendor ? ` (${input.vendor})` : ""}.`;
    case "submit_change_order":
      return `Submit ${fmtMoney(input.amount)} (${amountToWords(input.amount)}) change order — ${input.description}.`;
    case "add_todo": {
      const bits: string[] = [`Add todo: "${input.title}"`];
      if (input.due_date) bits.push(`due ${input.due_date}`);
      if (input.priority) bits.push(`${input.priority} priority`);
      return bits.join(" · ") + ".";
    }
    case "create_job": {
      const bits: string[] = [`Create job at ${input.address}`];
      if (input.client_name) bits.push(`client ${input.client_name}`);
      if (input.scope) bits.push(`scope: ${input.scope}`);
      if (input.contract_value) bits.push(`${fmtMoney(input.contract_value)} contract`);
      return bits.join(" · ") + ".";
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
  maxIterations = 3
): Promise<{
  response: string;
  actions: Array<{ tool: string; input: unknown; result: unknown }>;
  pending_action?: { tool: string; input: unknown; description: string };
  pending_card?: PendingCard; // Phase 2+ tools set this; Phase 1 wiring only
}> {

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const systemPrompt = `You are the Avenstone Master Agent — the AI that controls the entire Avenstone construction management platform. You have direct access to the database and take real actions, not suggestions.

User: ${userName} (${userRole})
Today: ${today}
Tenant: ${tenantId}

WHAT YOU CAN DO:
- Read: jobs, team, dashboard snapshot, job details
- Write: create jobs, update jobs, add contacts, send portal links, invite people, add notes, add todos (action items), advance lifecycle phase, update trade phases, submit change orders, log payments, log receipts, send notifications, write to knowledge base

HOW TO BEHAVE:
- Act immediately. Don't ask "should I do X?" — just do it and tell them what you did.
- If you need a job ID or sub ID to complete a task, call get_jobs or get_team first to find it.
- When you take multiple actions, report each one clearly: "✓ Created job · ✓ Added note · ✓ Notified team"
- If something fails, say what failed and why.
- If a request is ambiguous in a way that would cause you to take the wrong action, ask ONE clarifying question.
- For confirm-gated write tools (log_payment, log_receipt, submit_change_order, add_todo, create_job): describe what's about to happen in one plain sentence and call the tool. The system surfaces a confirmation card automatically — do NOT ask the user to confirm via text first ("Confirm?", "Should I proceed?", etc.). The card IS the confirmation. Do not assume the action ran until you receive the tool_result. If the user's freeform message lacks fields the tool requires (e.g. amount, address, title), ask one clarifying question before calling the tool — never invent values.
- Currency formatting: ALWAYS write dollar amounts with two decimal places. "$542.50" not "$542.5". "$1,000.00" not "$1000". Applies to text responses, action descriptions, summaries, and any reference to a monetary value.
- For advance_phase: if gates fail and the user did not give an override reason, do NOT pass override_reason. The tool result will list failing gates; relay them and ask if the user wants to override.
- TODO vs NOTE: an action item ("call back X", "follow up", "remind me", "don't forget", "schedule Y", "todo") goes to add_todo. Passive context attached to a job ("FYI…", "the client said…", "noted that…", "for the record…") goes to add_note. When in doubt and the user said "todo", pick add_todo. After writing a todo, the success message should say "Todo added" — never "Note added."
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
  • Otherwise → omit type; the category card will prompt the user
- Do not include image_data or image_mime in your log_receipt input — the server attaches the receipt photo automatically when one was provided. Just call log_receipt with the financial fields.
- Call log_receipt directly with the extracted fields once you've matched the job. The pending_action confirmation card surfaces automatically — the user reviews and confirms via the card. Do NOT ask the user to confirm via text first.
- The confirmation card description should lead with the matched job address (the most prominent field), then vendor, amount, and PO. Example: "Log $142.37 expense at 123 Test Flow Dr — Home Depot (PO 26-002)."
- If the user's text message conflicts with what you read on the receipt, the user's text wins.

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

      // Elicitation check — fires BEFORE confirm so missing fields are collected
      // first; the post-card re-call (which carries the answered field) falls
      // through to CONFIRM_TOOLS normally. Elicitor returns null when already present.
      const elicitBlock = blocks.find((b) => b.type === "tool_use" && b.name && b.name in ELICIT_TOOLS);
      if (elicitBlock && elicitBlock.name) {
        const card = ELICIT_TOOLS[elicitBlock.name](elicitBlock.input || {});
        if (card) {
          const text = blocks.find((b) => b.type === "text")?.text ?? "I need a bit more info before logging this.";
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
          const result = await executeTool(sb, tenantId, userId, block.name, block.input || {});
          actions.push({ tool: block.name, input: block.input, result });
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
    const { user_id, tenant_id, role, full_name, message, conversation_history, pending_action, confirmed, card_response } = await req.json();

    if (!user_id || !tenant_id) {
      return new Response(JSON.stringify({ error: "Missing user_id or tenant_id" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Confirmed action path: skip Claude, run executor directly ─────────────
    // (pending_action / confirmed — yes/no confirmation surface, unchanged)
    if (confirmed && pending_action?.tool) {
      const result = await executeTool(sb, tenant_id, user_id, pending_action.tool, pending_action.input || {});
      const action = { tool: pending_action.tool, input: pending_action.input, result };
      const response = (result as any)?.error
        ? `${pending_action.description || pending_action.tool}: failed — ${(result as any).error}`
        : `Done. ${pending_action.description || ""}`.trim();
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
      const history = (conversation_history || []).slice(-20);
      const { response, actions, pending_action: pa, pending_card: pc } = await runAgentLoop(
        sb, tenant_id, user_id, role || "owner", full_name || "User", history,
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
      sb, tenant_id, user_id, role || "owner", full_name || "User", messages,
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
