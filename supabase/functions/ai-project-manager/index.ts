
import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SB_URL        = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON       = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are the Avenstone AI Project Manager — an intelligent construction project oversight agent for Avenstone Group LLC, Kansas City, MO.

You have full context on a construction job and your job is to:
1. Analyze the job for risks, delays, cost overruns, and sub performance issues
2. Flag problems before they escalate
3. Draft SMS messages to subs to check status or confirm schedules
4. Remind about material orders based on the current phase
5. Grade completed jobs on profitability, efficiency, and client satisfaction
6. Learn patterns across jobs — flag when a sub consistently causes problems

You communicate in a direct, professional tone. You do not mention Claude or Anthropic.
You are the Avenstone AI Project Manager.

When analyzing a job, structure your response as JSON:
{
  "alerts": [{ "level": "high|medium|low", "message": "...", "action": "..." }],
  "sms_drafts": [{ "to_name": "...", "to_phone": "...", "message": "..." }],
  "material_reminders": ["..."],
  "job_grade": { "profitability": 1-10, "efficiency": 1-10, "client_satisfaction": 1-10, "notes": "..." },
  "patterns": ["..."],
  "summary": "One paragraph overall assessment"
}

Only include fields relevant to the current request type.`;

async function askClaude(messages: object[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { job_id, request_type = "analyze" } = await req.json();
    if (!job_id) return new Response("missing job_id", { status: 400 });

    const sb = createClient(SB_URL, SB_SERVICE);

    // Extract calling user from JWT
    const authHeader = req.headers.get("authorization") || "";
    const userSb = createClient(SB_URL, SB_ANON, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: { user } } = await userSb.auth.getUser();
    const user_id = user?.id || null;

    // Load full job context
    const [
      { data: job },
      { data: notes },
      { data: cos },
      { data: payments },
      { data: docs },
      { data: phases },
      { data: logs },
      { data: subs },
    ] = await Promise.all([
      sb.from("jobs").select("*").eq("id", job_id).single(),
      sb.from("job_notes").select("*").eq("job_id", job_id).order("created_at", { ascending: false }).limit(20),
      sb.from("change_orders").select("*").eq("job_id", job_id),
      sb.from("payments").select("*").eq("job_id", job_id),
      // slice 8/12: read from job_files instead of job_documents
      sb.from("job_files").select("id, name, subcategory, created_at").eq("job_id", job_id).eq("storage_bucket", "job-documents").eq("lifecycle_status", "active"),
      sb.from("job_phases").select("*").eq("job_id", job_id).order("phase_order"),
      sb.from("daily_logs").select("*").eq("job_id", job_id).order("log_date", { ascending: false }).limit(10),
      sb.from("job_sub_engagements").select("*, profiles!sub_id(full_name, phone, email)").eq("job_id", job_id),
    ]);

    if (!job) return new Response("job not found", { status: 404 });

    // Rate-limit: 1 invocation per job per 24h
    const { data: recentRun } = await sb
      .from("ai_pm_runs")
      .select("output_summary, invoked_at")
      .eq("job_id", job_id)
      .gte("invoked_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("invoked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentRun) {
      return new Response(JSON.stringify({
        rate_limited: true,
        cached_output: recentRun.output_summary,
        invoked_at: recentRun.invoked_at,
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Build context for AI
    const coTotal = (cos || []).filter(c => c.status === "approved").reduce((a, c) => a + Number(c.amount || 0), 0);
    const collected = (payments || []).filter(p => p.status === "paid").reduce((a, p) => a + Number(p.amount || 0), 0);
    const contractValue = Number(job.contract_value || 0);
    const totalValue = contractValue + coTotal;
    const balance = totalValue - collected;

    const context = `
JOB: ${job.address}
CLIENT: ${job.client_name || "Unknown"} | ${job.client_phone || ""} | ${job.client_email || ""}
STATUS: ${job.status}
CONTRACT VALUE: $${contractValue.toLocaleString()}
CO TOTAL (approved): $${coTotal.toLocaleString()}
TOTAL CONTRACTED: $${totalValue.toLocaleString()}
COLLECTED: $${collected.toLocaleString()}
BALANCE DUE: $${balance.toLocaleString()}
CONTRACT SIGNED: ${job.contract_signed ? "Yes" : "No"}
TARGET COMPLETION: ${job.target_completion || "Not set"}

PHASES:
${(phases || []).map(p => `  ${p.phase_name}: ${p.status} | Start: ${p.start_date || "TBD"} | End: ${p.end_date || "TBD"}`).join("\n") || "  No phases set"}

CHANGE ORDERS (${(cos || []).length} total):
${(cos || []).map(c => `  ${c.co_number || "CO"}: ${c.description} | $${Number(c.amount).toLocaleString()} | ${c.status}`).join("\n") || "  None"}

ASSIGNED SUBS:
${(subs || []).map(s => `  ${s.profiles?.full_name || "Unknown"} | ${s.trade || ""} | ${s.profiles?.phone || "no phone"}`).join("\n") || "  None assigned"}

RECENT NOTES (last 5):
${(notes || []).slice(0, 5).map(n => `  [${n.created_at?.slice(0, 10)}] ${n.author}: ${n.content}`).join("\n") || "  None"}

RECENT DAILY LOGS:
${(logs || []).map(l => `  [${l.log_date}] Crew: ${l.crew_count || 0} | ${l.work_completed || ""}`).join("\n") || "  None"}

DOCUMENTS: ${(docs || []).map(d => d.name).join(", ") || "None"}
`;

    const userMessage = request_type === "grade"
      ? `Grade this completed job and identify patterns for future reference.\n\n${context}`
      : request_type === "sms"
      ? `Draft SMS messages to all assigned subs to check on status and confirm their schedule for the current phase (${job.status}).\n\n${context}`
      : `Analyze this job for risks, delays, cost overruns, and anything that needs immediate attention. Also flag any material orders we should be making based on the current phase.\n\n${context}`;

    const raw = await askClaude([{ role: "user", content: userMessage }]);

    // Parse JSON from AI response
    let analysis: any = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) analysis = JSON.parse(match[0]);
    } catch {
      analysis = { summary: raw };
    }

    // Record this run for rate limiting
    await sb.from("ai_pm_runs").insert({
      tenant_id: job.tenant_id,
      job_id,
      invoked_by: user_id,
      output_summary: JSON.stringify(analysis).slice(0, 4000),
    });

    // Save analysis as a job note so it shows in the app
    const summaryNote = analysis.summary || "AI analysis complete.";
    const alerts = (analysis.alerts || []).map((a: any) => `[${a.level?.toUpperCase()}] ${a.message}`).join("\n");
    const noteContent = `🤖 AI Project Manager Analysis\n\n${summaryNote}${alerts ? "\n\nALERTS:\n" + alerts : ""}`;

    await sb.from("job_notes").insert({
      job_id,
      tenant_id: job.tenant_id,
      content: noteContent,
      author: "AI Project Manager",
      created_at: new Date().toISOString(),
    });

    // Fire notification to PM/owner
    await sb.from("notifications").insert({
      tenant_id: job.tenant_id,
      job_id,
      type: "note_posted",
      title: `AI PM: ${(analysis.alerts?.[0]?.level === "high" ? "🚨 " : "")}${job.address}`,
      body: summaryNote.slice(0, 120),
      user_id: job.assigned_rep || null,
    });

    return new Response(JSON.stringify({ analysis, note_saved: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("ai-project-manager error:", err);
    return new Response(String(err), { status: 500 });
  }
});
