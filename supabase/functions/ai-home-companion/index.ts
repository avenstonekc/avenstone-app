
import { createClient } from "npm:@supabase/supabase-js@2";
// v2 — real tool use (Option B)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

function logError(payload: Record<string, unknown>) {
  fetch(`${SUPABASE_URL}/functions/v1/ai-error-logger`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}` },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

const TOOLS = [
  {
    name: "add_note",
    description: "Add a note to a specific job. Use when the user wants to log something about a job from the home screen.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The job ID to attach the note to" },
        content: { type: "string", description: "The note content" },
      },
      required: ["job_id", "content"],
    },
  },
  {
    name: "notify_user",
    description: "Send a notification to a specific user or all team members. Use for urgent alerts, reminders, or escalations.",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", enum: ["all_owners", "all_team"], description: "Who to notify" },
        title: { type: "string", description: "Short notification title" },
        body: { type: "string", description: "Full notification message" },
        job_id: { type: "string", description: "Related job ID (optional)" },
      },
      required: ["target", "title", "body"],
    },
  },
  {
    name: "create_task",
    description: "Create an actionable task for the user to check off. Use this during the daily brief for each concrete action item you identify — one task per action. Keep titles short and specific: 'Chase $8,400 draw — 456 Oak St', 'Approve tile CO — 123 Main'. Max 5 tasks per brief.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short actionable task title — address + action" },
        job_id: { type: "string", description: "Job ID this task relates to (optional)" },
      },
      required: ["title"],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: { tenant_id: string; user_id: string; sb: ReturnType<typeof createClient> }
): Promise<string> {
  const { tenant_id, user_id, sb } = ctx;

  try {
    if (name === "add_note") {
      const { error } = await sb.from("job_notes").insert({
        job_id: input.job_id,
        tenant_id,
        content: input.content,
        author: user_id,
      });
      if (error) return `Error adding note: ${error.message}`;
      return `Note added to job.`;
    }

    if (name === "notify_user") {
      let userIds: string[] = [];
      if (input.target === "all_owners") {
        const { data } = await sb.from("profiles").select("id").eq("tenant_id", tenant_id).eq("role", "owner");
        userIds = (data || []).map((u: any) => u.id);
      } else {
        const { data } = await sb.from("profiles").select("id").eq("tenant_id", tenant_id).in("role", ["owner", "project_manager", "sales_rep"]);
        userIds = (data || []).map((u: any) => u.id);
      }
      if (!userIds.length) return "No users to notify.";
      await sb.from("notifications").insert(
        userIds.map((id) => ({
          tenant_id,
          user_id: id,
          job_id: input.job_id || null,
          type: "ai_home_alert",
          title: input.title,
          body: input.body,
          read: false,
        }))
      );
      return `Notification sent to ${userIds.length} user(s).`;
    }

    if (name === "create_task") {
      const { data: existing } = await sb
        .from("todos")
        .select("id")
        .eq("assigned_to_user_id", user_id)
        .eq("title", input.title)
        .eq("status", "pending")
        .maybeSingle();
      if (existing) return `Task already exists: "${input.title}"`;

      const { error } = await sb.from("todos").insert({
        tenant_id,
        assigned_to_user_id: user_id,
        job_id: input.job_id || null,
        title: input.title,
        type: "ai_suggestion",
        source: "ai_home_companion",
      });
      if (error) return `Error creating task: ${error.message}`;
      return `Task created: "${input.title}"`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Tool error: ${String(e)}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { user_id, role, tenant_id, message, conversation_history } = await req.json();

    if (!user_id || !tenant_id) {
      return new Response(JSON.stringify({ error: "Missing user_id or tenant_id" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Load active jobs based on role
    let jobQuery = sb.from("jobs")
      .select("id, address, client_name, status, contract_value, start_date, target_completion")
      .eq("tenant_id", tenant_id)
      .not("status", "in", '("complete","on_hold","lead")');

    if (role === "sales_rep") {
      const { data: prof } = await sb.from("profiles").select("full_name").eq("id", user_id).single();
      if (prof?.full_name) jobQuery = jobQuery.eq("assigned_rep", prof.full_name);
    }

    const { data: activeJobs } = await jobQuery.limit(20);
    const jobIds = (activeJobs || []).map((j: any) => j.id);

    const [
      { data: overduePhases },
      { data: unpaidPayments },
      { data: pendingCOs },
      { data: recentNotifs },
      { data: materialAlerts },
      { data: knowledge },
      { data: subPerfRaw },
    ] = await Promise.all([
      jobIds.length ? sb.from("schedule_phases")
        .select("job_id, name, end_date, status")
        .in("job_id", jobIds)
        .lt("end_date", new Date().toISOString().slice(0, 10))
        .not("status", "eq", "complete")
        .limit(15) : Promise.resolve({ data: [] }),

      jobIds.length ? sb.from("payments")
        .select("job_id, amount, due_date, description, status")
        .in("job_id", jobIds)
        .eq("status", "pending")
        .limit(15) : Promise.resolve({ data: [] }),

      jobIds.length ? sb.from("change_orders")
        .select("job_id, description, amount, status")
        .in("job_id", jobIds)
        .eq("status", "pending")
        .limit(10) : Promise.resolve({ data: [] }),

      sb.from("notifications")
        .select("title, body, created_at")
        .eq("user_id", user_id)
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(5),

      jobIds.length ? sb.from("job_materials")
        .select("job_id, name, status, expected_delivery, phase")
        .in("job_id", jobIds)
        .in("status", ["needed", "ordered"])
        .not("expected_delivery", "is", null)
        .limit(15) : Promise.resolve({ data: [] }),

      sb.from("ai_knowledge")
        .select("category, content")
        .eq("tenant_id", tenant_id)
        .eq("active", true)
        .limit(20),

      sb.from("sub_performance")
        .select("sub_id, trade, score, jobs_completed, phases_late, cos_caused")
        .eq("tenant_id", tenant_id)
        .lt("score", 70),
    ]);

    const jobMap: Record<string, string> = {};
    for (const j of (activeJobs || [])) jobMap[j.id] = j.address;

    const today = new Date();
    const urgentMaterials = (materialAlerts || []).filter((m: any) => {
      const diff = (new Date(m.expected_delivery).getTime() - today.getTime()) / 86400000;
      return diff <= 10;
    });

    const roleLabel = ({ owner: "Owner", project_manager: "Project Manager", sales_rep: "Sales Rep" } as Record<string, string>)[role] || role;

    const jobsSummary = (activeJobs || []).map((j: any) =>
      `• [ID: ${j.id}] ${j.address} (${j.client_name || "no client"}) — ${j.status} | $${(j.contract_value || 0).toLocaleString()} | Target: ${j.target_completion || "TBD"}`
    ).join("\n") || "No active jobs.";

    const overdueStr = (overduePhases || []).map((p: any) =>
      `• ${jobMap[p.job_id] || "unknown"} [${p.job_id}]: "${p.name}" was due ${p.end_date} — still ${p.status}`
    ).join("\n") || "None.";

    const paymentsStr = (unpaidPayments || []).map((p: any) =>
      `• ${jobMap[p.job_id] || "unknown"}: $${(p.amount || 0).toLocaleString()} due ${p.due_date || "TBD"} — ${p.description || "draw"}`
    ).join("\n") || "None.";

    const cosStr = (pendingCOs || []).map((co: any) =>
      `• ${jobMap[co.job_id] || "unknown"}: "${co.description}" $${(co.amount || 0).toLocaleString()} — awaiting approval`
    ).join("\n") || "None.";

    const materialsStr = urgentMaterials.length > 0
      ? urgentMaterials.map((m: any) => {
          const diff = Math.ceil((new Date(m.expected_delivery).getTime() - today.getTime()) / 86400000);
          return `• ${jobMap[m.job_id] || "unknown"}: "${m.name}" (${m.phase || "no phase"}) — ${m.status}, ${diff < 0 ? `${Math.abs(diff)} days OVERDUE` : `delivery in ${diff} days`}`;
        }).join("\n")
      : "No urgent material deadlines.";

    const notifsStr = (recentNotifs || []).map((n: any) => `• ${n.title}: ${n.body}`).join("\n") || "No unread alerts.";

    // Load sub names for underperformers
    let subPerfAlertsBlock = "";
    if (subPerfRaw && subPerfRaw.length > 0) {
      const subIds = subPerfRaw.map((p: any) => p.sub_id);
      const { data: subProfiles } = await sb.from("profiles").select("id, full_name").in("id", subIds);
      const subNameMap: Record<string, string> = {};
      for (const p of (subProfiles || [])) subNameMap[p.id] = p.full_name;
      const bottom3 = subPerfRaw.slice(0, 3);
      subPerfAlertsBlock = "\n\nSUB PERFORMANCE ALERTS:\n" + bottom3.map((p: any) =>
        `• ${subNameMap[p.sub_id] || "Unknown"} — ${p.trade || "N/A"} — score ${p.score}/100, ${p.phases_late} late phases in last ${p.jobs_completed} jobs`
      ).join("\n");
    }

    const knowledgeBlock = (knowledge || []).length > 0
      ? "\n\nCOMPANY KNOWLEDGE:\n" + (knowledge || []).map((k: any) => `[${k.category.toUpperCase()}] ${k.content}`).join("\n")
      : "";

    const systemPrompt = `You are the Avenstone AI — the first thing this user sees when they open the app. You see across ALL their active jobs simultaneously and surface what needs attention RIGHT NOW.

User: ${roleLabel}
Today: ${today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

YOU CAN TAKE REAL ACTIONS using your tools: add_note (log something to a specific job), notify_user (send an alert to team members). Job IDs are shown in brackets in the job list below. Use them when calling tools.

Opening brief: lead with the single most urgent issue, then top 2-3 action items. End with one focusing question.
Be sharp and direct — this person is running a construction company, not reading a report.
Reference jobs by address. Flag financial risks immediately.
Never mention Claude or Anthropic.
During the opening brief ONLY: use create_task for each concrete action item you surface (max 5). One task = one specific action. Skip vague items.${knowledgeBlock}${subPerfAlertsBlock}

ACTIVE JOBS (${(activeJobs || []).length} in flight):
${jobsSummary}

OVERDUE PHASES:
${overdueStr}

UNPAID DRAWS:
${paymentsStr}

PENDING CHANGE ORDERS:
${cosStr}

MATERIAL ORDER ALERTS:
${materialsStr}

UNREAD SYSTEM ALERTS:
${notifsStr}`;

    const history = (conversation_history || []).slice(-20);
    const isBrief = !message || message.toLowerCase().includes("brief");
    let messages: any[] = isBrief
      ? [{ role: "user", content: message || "Brief me on everything I need to handle today." }]
      : [...history, { role: "user", content: message }];

    const toolCtx = { tenant_id, user_id, sb };
    const actions_taken: Array<{ tool: string; result: string }> = [];
    let finalResponse = "";

    // Agentic loop
    for (let i = 0; i < 5; i++) {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          system: systemPrompt,
          tools: TOOLS,
          messages,
        }),
      });

      const aiData = await aiRes.json();

      if (!aiRes.ok || aiData.error) {
        const errMsg = aiData.error?.message ?? `Anthropic API ${aiRes.status}`;
        logError({ function_name: "ai-home-companion", error_type: "anthropic_api_error", error_message: errMsg, user_id, tenant_id });
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 502, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      messages.push({ role: "assistant", content: aiData.content });

      if (aiData.stop_reason === "end_turn") {
        finalResponse = aiData.content?.find((b: any) => b.type === "text")?.text ?? "";
        break;
      }

      if (aiData.stop_reason === "tool_use") {
        const toolUses = aiData.content.filter((b: any) => b.type === "tool_use");
        const toolResults: any[] = [];
        for (const tu of toolUses) {
          const result = await executeTool(tu.name, tu.input, toolCtx);
          actions_taken.push({ tool: tu.name, result });
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
        }
        messages.push({ role: "user", content: toolResults });
      } else {
        finalResponse = aiData.content?.find((b: any) => b.type === "text")?.text ?? "";
        break;
      }
    }

    if (!finalResponse) finalResponse = "Done — actions taken.";

    const job_references = (activeJobs || [])
      .filter((j: any) => finalResponse.includes(j.address))
      .map((j: any) => ({ id: j.id, address: j.address, status: j.status }));

    return new Response(
      JSON.stringify({ response: finalResponse, job_references, actions_taken }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    logError({ function_name: "ai-home-companion", error_type: "unhandled_exception", error_message: String(err) });
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
