
import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const TWILIO_SID    = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN  = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM   = Deno.env.get("TWILIO_FROM")!;
const SB_URL        = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function sendSMS(to: string, body: string) {
  const raw = to.replace(/\D/g, "");
  const toE164 = raw.startsWith("1") ? `+${raw}` : `+1${raw}`;
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: TWILIO_FROM, To: toE164, Body: body }),
    }
  );
}

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
  try {
    const { job_id, request_type = "analyze", send_sms = false } = await req.json();
    if (!job_id) return new Response("missing job_id", { status: 400 });

    const sb = createClient(SB_URL, SB_SERVICE);

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
      sb.from("job_documents").select("id, name, file_type, created_at").eq("job_id", job_id),
      sb.from("schedule_phases").select("*").eq("job_id", job_id).order("order_index"),
      sb.from("daily_logs").select("*").eq("job_id", job_id).order("log_date", { ascending: false }).limit(10),
      sb.from("job_subs").select("*, profiles(full_name, phone, email)").eq("job_id", job_id),
    ]);

    if (!job) return new Response("job not found", { status: 404 });

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
${(phases || []).map(p => `  ${p.name}: ${p.status} | Start: ${p.start_date || "TBD"} | End: ${p.end_date || "TBD"}`).join("\n") || "  No phases set"}

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

    // Send SMS to subs if requested and drafts exist
    const smsSent: string[] = [];
    if (send_sms && analysis.sms_drafts?.length) {
      for (const draft of analysis.sms_drafts) {
        if (draft.to_phone) {
          await sendSMS(draft.to_phone, draft.message);
          smsSent.push(draft.to_name || draft.to_phone);
        }
      }
    }

    // Save analysis as a job note so it shows in the app
    const summaryNote = analysis.summary || "AI analysis complete.";
    const alerts = (analysis.alerts || []).map((a: any) => `[${a.level?.toUpperCase()}] ${a.message}`).join("\n");
    const noteContent = `🤖 AI Project Manager Analysis\n\n${summaryNote}${alerts ? "\n\nALERTS:\n" + alerts : ""}${smsSent.length ? "\n\nSMS sent to: " + smsSent.join(", ") : ""}`;

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

    return new Response(JSON.stringify({ analysis, sms_sent: smsSent, note_saved: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("ai-project-manager error:", err);
    return new Response(String(err), { status: 500 });
  }
});
