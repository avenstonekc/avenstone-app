import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

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

serve(async (req) => {
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

    // Load cross-job intelligence in parallel
    const [
      { data: overduePhases },
      { data: unpaidPayments },
      { data: pendingCOs },
      { data: recentNotifs },
      { data: materialAlerts },
      { data: knowledge },
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
        .select("job_id, title, amount, status")
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
      `• ${j.address} (${j.client_name || "no client"}) — ${j.status} | $${(j.contract_value || 0).toLocaleString()} | Target: ${j.target_completion || "TBD"}`
    ).join("\n") || "No active jobs.";

    const overdueStr = (overduePhases || []).map((p: any) =>
      `• ${jobMap[p.job_id] || "unknown"}: "${p.name}" was due ${p.end_date} — still ${p.status}`
    ).join("\n") || "None.";

    const paymentsStr = (unpaidPayments || []).map((p: any) =>
      `• ${jobMap[p.job_id] || "unknown"}: $${(p.amount || 0).toLocaleString()} due ${p.due_date || "TBD"} — ${p.description || "draw"}`
    ).join("\n") || "None.";

    const cosStr = (pendingCOs || []).map((co: any) =>
      `• ${jobMap[co.job_id] || "unknown"}: "${co.title}" $${(co.amount || 0).toLocaleString()} — awaiting approval`
    ).join("\n") || "None.";

    const materialsStr = urgentMaterials.length > 0
      ? urgentMaterials.map((m: any) => {
          const diff = Math.ceil((new Date(m.expected_delivery).getTime() - today.getTime()) / 86400000);
          return `• ${jobMap[m.job_id] || "unknown"}: "${m.name}" (${m.phase || "no phase"}) — ${m.status}, ${diff < 0 ? `${Math.abs(diff)} days OVERDUE` : `delivery in ${diff} days`}`;
        }).join("\n")
      : "No urgent material deadlines.";

    const notifsStr = (recentNotifs || []).map((n: any) => `• ${n.title}: ${n.body}`).join("\n") || "No unread alerts.";

    const knowledgeBlock = (knowledge || []).length > 0
      ? "\n\nCOMPANY KNOWLEDGE:\n" + (knowledge || []).map((k: any) => `[${k.category.toUpperCase()}] ${k.content}`).join("\n")
      : "";

    const systemPrompt = `You are the Avenstone AI — the first thing this user sees when they open the app. You see across ALL their active jobs simultaneously and surface what needs attention RIGHT NOW.

User: ${roleLabel}
Today: ${today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

RULES:
- You ADVISE. You do NOT take actions. "You should call..." not "I'll call..."
- Opening brief: lead with the single most urgent issue, then top 2-3 action items. End with one focusing question.
- Be sharp and direct — this person is running a construction company, not reading a report.
- Reference jobs by address. Flag financial risks immediately.
- For PMs: proactively flag material order deadlines, phase dependencies, sub confirmations needed.
- For Sales Reps: flag follow-up timing, proposal status, next steps to close.
- Never mention Claude or Anthropic.${knowledgeBlock}

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
    const msgs = isBrief
      ? [{ role: "user", content: message || "Brief me on everything I need to handle today." }]
      : [...history, { role: "user", content: message }];

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: msgs,
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

    const response = aiData.content?.[0]?.text ?? "I'm having trouble right now. Try again in a moment.";

    const job_references = (activeJobs || [])
      .filter((j: any) => response.includes(j.address))
      .map((j: any) => ({ id: j.id, address: j.address, status: j.status }));

    return new Response(
      JSON.stringify({ response, job_references }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    logError({ function_name: "ai-home-companion", error_type: "unhandled_exception", error_message: String(err) });
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});