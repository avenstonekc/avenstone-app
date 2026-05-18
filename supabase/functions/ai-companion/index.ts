
import { createClient } from "npm:@supabase/supabase-js@2";
// v3 — real tool use (Option B)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const ERROR_LOGGER_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-error-logger`;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function logAIError(payload: {
  function_name: string;
  error_type?: string;
  error_message: string;
  user_input?: string;
  ai_raw_response?: string;
  job_id?: string;
  user_id?: string;
  tenant_id?: string;
  metadata?: Record<string, unknown>;
}) {
  fetch(ERROR_LOGGER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(payload),
  }).catch(() => {/* swallow */});
}

const TOOLS = [
  {
    name: "add_note",
    description: "Add a note to the job. Use this when the user asks you to log, record, or note something about the job.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The note text to add" },
      },
      required: ["content"],
    },
  },
  {
    name: "update_job",
    description: "Update job fields like status, target_completion, description, or assigned_rep.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "New job status" },
        target_completion: { type: "string", description: "Target completion date (YYYY-MM-DD)" },
        description: { type: "string", description: "Updated job description" },
        assigned_rep: { type: "string", description: "Name of assigned sales rep" },
      },
    },
  },
  {
    name: "create_change_order",
    description: "Create a change order on this job. Use when the user asks to log a change, add a CO, or record extra work.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string", description: "What the change entails" },
        amount: { type: "number", description: "Dollar amount of the change order" },
      },
      required: ["description", "amount"],
    },
  },
  {
    name: "notify_team",
    description: "Send a notification to all owners and project managers on this tenant. Use when something urgent needs their attention.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short notification title" },
        body: { type: "string", description: "Full notification message" },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "add_knowledge",
    description: "Save a piece of company-specific knowledge so all AI agents remember it going forward.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category like 'pricing', 'process', 'client_comms', 'materials'" },
        content: { type: "string", description: "The knowledge to save" },
      },
      required: ["category", "content"],
    },
  },
  {
    name: "escalate_to_owner",
    description: "Route a question or decision to the owner when you need human judgment, approval, or information you don't have. Use for anything outside your authority or genuinely ambiguous.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The specific question or decision that needs owner input" },
        context: { type: "string", description: "Relevant background so the owner has what they need to answer" },
      },
      required: ["question"],
    },
    cache_control: { type: "ephemeral" },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: { job_id: string; tenant_id: string; user_id: string; sb: ReturnType<typeof createClient> }
): Promise<string> {
  const { job_id, tenant_id, user_id, sb } = ctx;

  try {
    if (name === "add_note") {
      const { error } = await sb.from("job_notes").insert({
        job_id,
        tenant_id,
        content: input.content,
        author: user_id,
      });
      if (error) return `Error adding note: ${error.message}`;
      return `Note added: "${input.content}"`;
    }

    if (name === "update_job") {
      const updates: Record<string, unknown> = {};
      if (input.status) updates.status = input.status;
      if (input.target_completion) updates.target_completion = input.target_completion;
      if (input.description) updates.description = input.description;
      if (input.assigned_rep) updates.assigned_rep = input.assigned_rep;
      if (!Object.keys(updates).length) return "No fields to update.";
      const { error } = await sb.from("jobs").update(updates).eq("id", job_id);
      if (error) return `Error updating job: ${error.message}`;
      return `Job updated: ${Object.keys(updates).join(", ")}`;
    }

    if (name === "create_change_order") {
      const { error } = await sb.from("change_orders").insert({
        job_id,
        tenant_id,
        description: input.description || "",
        amount: input.amount,
        status: "pending",
      });
      if (error) return `Error creating change order: ${error.message}`;
      // Also bump job's co_total
      const { data: job } = await sb.from("jobs").select("co_total, contract_value").eq("id", job_id).single();
      if (job) {
        await sb.from("jobs").update({ co_total: (Number(job.co_total) || 0) + Number(input.amount) }).eq("id", job_id);
      }
      return `Change order created: "${input.description}" for $${input.amount}`;
    }

    if (name === "notify_team") {
      const { data: team } = await sb
        .from("profiles")
        .select("id")
        .eq("tenant_id", tenant_id)
        .in("role", ["owner", "project_manager"]);
      if (!team?.length) return "No team members to notify.";
      await sb.from("notifications").insert(
        team.map((u: { id: string }) => ({
          tenant_id,
          user_id: u.id,
          job_id,
          type: "ai_companion_alert",
          title: input.title,
          body: input.body,
          read: false,
        }))
      );
      return `Notification sent to ${team.length} team member(s).`;
    }

    if (name === "add_knowledge") {
      const { error } = await sb.from("ai_knowledge").insert({
        tenant_id,
        category: input.category,
        content: input.content,
        active: true,
        created_by: user_id,
      });
      if (error) return `Error saving knowledge: ${error.message}`;
      return `Knowledge saved in category "${input.category}".`;
    }

    if (name === "escalate_to_owner") {
      await sb.from("owner_escalations").insert({
        tenant_id,
        job_id,
        source_agent: "ai-companion",
        question: input.question,
        context: input.context || "",
        status: "pending",
      });
      const { data: owners } = await sb.from("profiles").select("id").eq("tenant_id", tenant_id).eq("role", "owner");
      if (owners?.length) {
        await sb.from("notifications").insert(
          owners.map((o: { id: string }) => ({
            tenant_id,
            user_id: o.id,
            job_id,
            type: "owner_escalation",
            title: "AI needs your input",
            body: (input.question as string).slice(0, 120),
            read: false,
          }))
        );
      }
      return `Question escalated to owner: "${input.question}"`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Tool execution error: ${String(e)}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { job_id, user_id, role, message, tenant_id } = await req.json();

    if (!job_id || !user_id || !role || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: job_id, user_id, role, message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: jobCheck, error: jobCheckErr } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", job_id)
      .single();

    if (jobCheckErr || !jobCheck) {
      return new Response(
        JSON.stringify({ error: `Job not found: ${job_id}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load or create companion record
    let { data: companion } = await supabase
      .from("job_ai_companions")
      .select("*")
      .eq("job_id", job_id)
      .eq("user_id", user_id)
      .eq("role", role)
      .single();

    if (!companion) {
      const { data: newCompanion, error: insertErr } = await supabase
        .from("job_ai_companions")
        .insert({ job_id, user_id, role, tenant_id, conversation_history: [], job_snapshot: {} })
        .select()
        .single();

      if (insertErr || !newCompanion) {
        return new Response(
          JSON.stringify({ error: "Failed to create AI companion record", detail: insertErr?.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      companion = newCompanion;
    }

    // Load full job context in parallel
    const [
      { data: job },
      { data: notes },
      { data: changeOrders },
      { data: payments },
      { data: phases },
      { data: subs },
      { data: materials },
      { data: knowledge },
      { data: subPerf },
      { data: budgetItems },
    ] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", job_id).single(),
      supabase.from("job_notes").select("*").eq("job_id", job_id).order("created_at", { ascending: false }).limit(10),
      supabase.from("change_orders").select("*").eq("job_id", job_id),
      supabase.from("job_transactions").select("*").eq("job_id", job_id),
      supabase.from("schedule_phases").select("*").eq("job_id", job_id).order("start_date"),
      supabase.from("job_subs").select("*, profiles(full_name, phone)").eq("job_id", job_id),
      supabase.from("job_materials").select("*").eq("job_id", job_id).order("created_at"),
      supabase.from("ai_knowledge").select("category, content").eq("tenant_id", tenant_id).eq("active", true).limit(20),
      supabase.from("sub_performance").select("sub_id, trade, score, jobs_completed, phases_late, cos_caused").eq("tenant_id", tenant_id),
      supabase.from("estimate_line_items").select("phase,trade,description,client_price,total_cost").eq("job_id", job_id),
    ]);

    const coTotal = changeOrders?.reduce((s: number, co: any) => s + (co.amount ?? 0), 0) ?? 0;
    const totalIn = (payments || []).filter((t: any) => t.direction === 'in' && t.status === 'paid').reduce((s: number, t: any) => s + (t.amount ?? 0), 0);
    const totalOut = (payments || []).filter((t: any) => t.direction === 'out' && t.status === 'paid').reduce((s: number, t: any) => s + (t.amount ?? 0), 0);
    const outstanding = (payments || []).filter((t: any) => t.direction === 'in' && t.status === 'pending').reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

    // Budget vs actual summary
    const totalBudget = (budgetItems || []).reduce((s: number, li: any) => s + Number(li.client_price ?? li.total_cost ?? 0), 0);
    const paidOut = (payments || []).filter((t: any) => t.direction === 'out' && t.status === 'paid');
    const phaseBudgetMap: Record<string, number> = {};
    for (const li of (budgetItems || []) as any[]) {
      if (!li.phase) continue;
      const key = li.phase.trim().toLowerCase();
      phaseBudgetMap[key] = (phaseBudgetMap[key] || 0) + Number(li.client_price ?? li.total_cost ?? 0);
    }
    const phaseActualMap: Record<string, number> = {};
    for (const t of paidOut as any[]) {
      if (!t.phase) continue;
      const key = t.phase.trim().toLowerCase();
      phaseActualMap[key] = (phaseActualMap[key] || 0) + Number(t.amount || 0);
    }
    const phaseBreakdown = Object.entries(phaseBudgetMap).map(([phase, budget]) => {
      const actual = phaseActualMap[phase] || 0;
      const pct = budget > 0 ? Math.round((actual / budget) * 100) : 0;
      return `  ${phase}: budget $${budget.toLocaleString()} / actual $${actual.toLocaleString()} (${pct}%)`;
    }).join('\n');

    const jobContext = `
JOB DETAILS
-----------
Address: ${job?.address ?? "N/A"}
Client: ${job?.client_name ?? "N/A"}
Status: ${job?.status ?? "N/A"}
Contract Value: $${(job?.contract_value ?? 0).toLocaleString()}
Change Orders Total: $${coTotal.toLocaleString()}
Income Received (Paid): $${totalIn.toLocaleString()}
Expenses Paid Out: $${totalOut.toLocaleString()}
Outstanding (Unpaid Invoices): $${outstanding.toLocaleString()}
Balance vs Contract: $${((job?.contract_value ?? 0) + coTotal - totalIn).toLocaleString()}
${totalBudget > 0 ? `Total Budget (Estimate): $${totalBudget.toLocaleString()}
Total Actual Spend: $${totalOut.toLocaleString()}
Budget Variance: $${(totalBudget - totalOut).toLocaleString()}
${phaseBreakdown ? `Phase Budget Breakdown:\n${phaseBreakdown}` : ''}` : ''}
Start Date: ${job?.start_date ?? "N/A"}
Target Completion: ${job?.target_completion ?? "N/A"}
Description: ${job?.description ?? "N/A"}

SCHEDULE PHASES
---------------
${phases?.map((p: any) => `• ${p.name}: ${p.status} (${p.start_date ?? "?"} → ${p.end_date ?? "?"})`).join("\n") || "None"}

ASSIGNED SUBS
-------------
${subs?.map((s: any) => {
  const name = s.profiles?.full_name ?? "Unknown";
  const trade = s.trade ?? "N/A";
  const perf = (subPerf || []).find((p: any) => p.sub_id === s.sub_id && p.trade === trade);
  if (perf) {
    return `• ${name} — ${trade} (📊 score: ${perf.score} | ${perf.jobs_completed} jobs | ${perf.phases_late} late phases)`;
  }
  return `• ${name} — ${trade} (${s.profiles?.phone ?? "no phone"})`;
}).join("\n") || "None"}

CHANGE ORDERS
-------------
${changeOrders?.map((co: any) => `• ${co.description ?? "N/A"}: $${(co.amount ?? 0).toLocaleString()} — ${co.status ?? "N/A"}`).join("\n") || "None"}

MATERIALS & ORDERS
------------------
${(() => {
  if (!materials?.length) return "None tracked.";
  const today = new Date();
  return materials.map((m: any) => {
    let urgency = "";
    if (m.expected_delivery && (m.status === "needed" || m.status === "ordered")) {
      const diff = Math.ceil((new Date(m.expected_delivery).getTime() - today.getTime()) / 86400000);
      if (diff < 0) urgency = ` ⚠️ OVERDUE by ${Math.abs(diff)} days`;
      else if (diff <= 7) urgency = ` ⚠️ due in ${diff} days`;
    }
    return `• ${m.name}${m.phase ? ` (${m.phase})` : ""}: ${m.status}${m.supplier ? ` — ${m.supplier}` : ""}${m.expected_delivery ? ` — delivery ${m.expected_delivery}` : ""}${urgency}`;
  }).join("\n");
})()}

RECENT NOTES
------------
${notes?.map((n: any) => `• [${n.created_at?.slice(0, 10)}] ${n.content}`).join("\n") || "None"}`.trim();

    const knowledgeBlock = knowledge?.length
      ? "\n\nCOMPANY KNOWLEDGE:\n" + knowledge.map((k: any) => `[${k.category.toUpperCase()}] ${k.content}`).join("\n")
      : "";

    const systemPrompt = `You are the Avenstone AI Companion — an expert construction project assistant built into the Avenstone job management platform.

You are speaking with the job's ${role.replace("_", " ")}. Give direct, practical, and confident answers. Be concise unless detail is needed. Never mention Claude or Anthropic — you are the Avenstone AI.

YOU CAN TAKE REAL ACTIONS using your tools. When asked to add a note, create a change order, update the job, or notify the team — do it immediately. Don't ask for confirmation unless the action is irreversible and ambiguous. After taking an action, tell the user what you did.

Available tools: add_note, update_job, create_change_order, notify_team, add_knowledge, escalate_to_owner.

When asked to "brief me on this job", respond with a structured summary covering: current status, financial position, active phases, key risks, and what's next.

CURRENT JOB CONTEXT:
${jobContext}${knowledgeBlock}`;

    const history: any[] = companion?.conversation_history ?? [];
    const recentHistory = history.slice(-20);

    const toolCtx = { job_id, tenant_id, user_id, sb: supabase };
    const actions_taken: Array<{ tool: string; result: string }> = [];

    // Agentic loop — max 5 iterations
    let messages: any[] = [
      ...recentHistory,
      { role: "user", content: message },
    ];
    let finalReply = "";
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

    for (let i = 0; i < 5; i++) {
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
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
          messages,
        }),
      });

      const data = await anthropicRes.json();

      if (!anthropicRes.ok || data.error) {
        const errMsg = data.error?.message ?? `Anthropic API error ${anthropicRes.status}`;
        logAIError({ function_name: "ai-companion", error_type: "anthropic_api_error", error_message: errMsg, user_input: message, job_id, user_id, tenant_id });
        return new Response(
          JSON.stringify({ error: "AI service error", detail: errMsg }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Append assistant response to messages
      messages.push({ role: "assistant", content: data.content });

      if (data.stop_reason === "end_turn") {
        // Extract text reply
        finalReply = data.content?.find((b: any) => b.type === "text")?.text ?? "";
        break;
      }

      if (data.stop_reason === "tool_use") {
        const toolUses = data.content.filter((b: any) => b.type === "tool_use");
        const toolResults: any[] = [];

        for (const tu of toolUses) {
          const result = await executeTool(tu.name, tu.input, toolCtx);
          actions_taken.push({ tool: tu.name, result });
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
        }

        messages.push({ role: "user", content: toolResults });
      } else {
        // Unexpected stop reason — break
        finalReply = data.content?.find((b: any) => b.type === "text")?.text ?? "";
        break;
      }
    }

    if (!finalReply) {
      finalReply = "Done — I've taken the requested actions.";
    }

    // Save updated conversation history (text messages only, strip tool blocks)
    const cleanHistory = messages
      .filter((m: any) => typeof m.content === "string" && m.content.trim())
      .slice(-40);

    // Append final assistant reply
    const updatedHistory = [
      ...cleanHistory,
      { role: "assistant", content: finalReply },
    ];

    await supabase
      .from("job_ai_companions")
      .update({ conversation_history: updatedHistory, updated_at: new Date().toISOString() })
      .eq("id", companion.id);

    return new Response(
      JSON.stringify({ reply: finalReply, actions_taken, companion_id: companion.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    logAIError({
      function_name: "ai-companion",
      error_type: "unhandled_exception",
      error_message: (err as Error).message ?? String(err),
    });
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
