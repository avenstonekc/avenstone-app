
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// ─── Tool definitions (Claude tool use schema) ────────────────────────────────

const TOOLS = [
  {
    name: "get_jobs",
    description: "List jobs for this tenant. Optionally filter by status.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by job status: lead, bid_sent, active, demo, framing, rough_mep, drywall, finish, punch, complete, on_hold. Omit for all." },
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
    description: "Add a note to a job.",
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
    name: "create_phase",
    description: "Add a schedule phase to a job.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        name: { type: "string", description: "Phase name, e.g. 'Framing', 'Drywall', 'Final inspection'" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        assigned_sub_id: { type: "string", description: "UUID of sub to assign (optional)" },
        description: { type: "string" },
      },
      required: ["job_id", "name"],
    },
  },
  {
    name: "update_phase",
    description: "Update an existing schedule phase — status, dates, notes.",
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
    name: "create_change_order",
    description: "Create a change order on a job.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        amount: { type: "number", description: "Dollar amount. Negative for credits." },
      },
      required: ["job_id", "title", "amount"],
    },
  },
  {
    name: "create_payment",
    description: "Add a payment draw / milestone to a job's payment schedule.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        amount: { type: "number" },
        description: { type: "string", description: "e.g. 'Foundation draw', 'Final payment'" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["job_id", "amount", "description"],
    },
  },
  {
    name: "assign_sub",
    description: "Assign an existing subcontractor to a job.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        sub_id: { type: "string", description: "UUID of the sub from profiles table" },
      },
      required: ["job_id", "sub_id"],
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
          .select("id, address, client_name, status, contract_value, target_completion, start_date, assigned_rep, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(Number(input.limit) || 30);
        if (input.status) q = q.eq("status", String(input.status));
        const { data } = await q;
        return { jobs: data || [], count: (data || []).length };
      }

      case "get_job_details": {
        const [jobRes, notesRes, phasesRes, paymentsRes, cosRes, subsRes] = await Promise.all([
          sb.from("jobs").select("*").eq("id", input.job_id).single(),
          sb.from("job_notes").select("*").eq("job_id", input.job_id).order("created_at", { ascending: false }).limit(10),
          sb.from("job_phases").select("*").eq("job_id", input.job_id).order("phase_order"),
          sb.from("payments").select("*").eq("job_id", input.job_id),
          sb.from("change_orders").select("*").eq("job_id", input.job_id),
          sb.from("job_subs").select("*, profile:profiles(id,full_name,trade,phone,email)").eq("job_id", input.job_id),
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
          sb.from("schedule_phases").select("job_id, name, end_date, status")
            .lt("end_date", today).not("status", "eq", "complete").limit(20),
          sb.from("payments").select("job_id, amount, due_date, description")
            .eq("status", "pending").lt("due_date", today).limit(20),
          sb.from("change_orders").select("job_id, title, amount")
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
          full_name: input.full_name,
          email: input.email || null,
          phone: input.phone || null,
          type: input.type || "client",
          notes: input.notes || null,
          job_id: input.job_id || null,
          created_by: userId,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        return { success: true, contact_id: data.id, name: data.full_name };
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
        const { data, error } = await sb.from("job_notes").insert({
          tenant_id: tenantId,
          job_id: input.job_id,
          content: input.content,
          author_id: userId,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        return { success: true, note_id: data.id };
      }

      case "create_phase": {
        const { data: existing } = await sb.from("job_phases").select("phase_order").eq("job_id", input.job_id).order("phase_order", { ascending: false }).limit(1).single();
        const nextOrder = (existing?.phase_order || 0) + 1;
        const { data, error } = await sb.from("job_phases").insert({
          tenant_id: tenantId,
          job_id: input.job_id,
          name: input.name,
          start_date: input.start_date || null,
          end_date: input.end_date || null,
          assigned_sub_id: input.assigned_sub_id || null,
          description: input.description || null,
          status: "pending",
          phase_order: nextOrder,
        }).select().single();
        if (error) return { error: error.message };
        return { success: true, phase_id: data.id, name: data.name };
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

      case "create_change_order": {
        const { data, error } = await sb.from("change_orders").insert({
          tenant_id: tenantId,
          job_id: input.job_id,
          title: input.title,
          description: input.description || null,
          amount: input.amount,
          status: "pending",
          created_by: userId,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        // Update job co_total
        const { data: job } = await sb.from("jobs").select("co_total").eq("id", input.job_id).single();
        await sb.from("jobs").update({ co_total: (Number(job?.co_total) || 0) + Number(input.amount) }).eq("id", input.job_id);
        return { success: true, co_id: data.id, amount: data.amount };
      }

      case "create_payment": {
        const { data, error } = await sb.from("payments").insert({
          tenant_id: tenantId,
          job_id: input.job_id,
          amount: input.amount,
          description: input.description,
          due_date: input.due_date || null,
          status: "pending",
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) return { error: error.message };
        return { success: true, payment_id: data.id, amount: data.amount };
      }

      case "assign_sub": {
        const { error } = await sb.from("job_subs").upsert({
          tenant_id: tenantId,
          job_id: input.job_id,
          sub_id: input.sub_id,
        }, { onConflict: "job_id,sub_id" });
        if (error) return { error: error.message };
        return { success: true };
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

async function runAgentLoop(
  sb: ReturnType<typeof createClient>,
  tenantId: string,
  userId: string,
  userRole: string,
  userName: string,
  messages: Array<{ role: string; content: unknown }>,
  maxIterations = 6
): Promise<{ response: string; actions: Array<{ tool: string; input: unknown; result: unknown }> }> {

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const systemPrompt = `You are the Avenstone Master Agent — the AI that controls the entire Avenstone construction management platform. You have direct access to the database and take real actions, not suggestions.

User: ${userName} (${userRole})
Today: ${today}
Tenant: ${tenantId}

WHAT YOU CAN DO:
- Read: jobs, team, dashboard snapshot, job details
- Write: create jobs, update jobs, add contacts, send portal links, invite people, add notes, create phases, update phases, create change orders, add payment draws, assign subs, send notifications, write to knowledge base

HOW TO BEHAVE:
- Act immediately. Don't ask "should I do X?" — just do it and tell them what you did.
- If you need a job ID or sub ID to complete a task, call get_jobs or get_team first to find it.
- When you take multiple actions, report each one clearly: "✓ Created job · ✓ Added note · ✓ Notified team"
- If something fails, say what failed and why.
- If a request is ambiguous in a way that would cause you to take the wrong action, ask ONE clarifying question.
- Never mention Claude or Anthropic.
- You are the operating system of this business. Act like it.`;

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
        max_tokens: 4096,
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
      const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];

      for (const block of (data.content as Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown> }>)) {
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
    const { user_id, tenant_id, role, full_name, message, conversation_history } = await req.json();

    if (!user_id || !tenant_id || !message) {
      return new Response(JSON.stringify({ error: "Missing user_id, tenant_id, or message" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Build message history
    const history = (conversation_history || []).slice(-20);
    const messages: Array<{ role: string; content: unknown }> = [
      ...history,
      { role: "user", content: message },
    ];

    const { response, actions } = await runAgentLoop(
      sb, tenant_id, user_id, role || "owner", full_name || "User", messages
    );

    return new Response(
      JSON.stringify({ response, actions }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
