import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ERROR_LOGGER_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-error-logger`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function logAIError(payload: {
  function_name: string;
  error_type?: string;
  error_message: string;
  user_input?: string;
  ai_raw_response?: string;
  job_id?: string;
  tenant_id?: string;
  metadata?: Record<string, unknown>;
}) {
  fetch(ERROR_LOGGER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

const SYSTEM_PROMPT = `You are writing a brief project update for a homeowner from their contractor.

Given a field note describing what happened on site today plus any upcoming scheduled work, write a warm, professional client-facing update message. Plain language — no construction jargon. Reassuring and clear.

The message should:
- Open by describing what was accomplished today (1–2 sentences)
- If upcoming schedule info is provided, briefly mention what's coming next (1 sentence)
- Sound like a friendly, professional contractor talking to their client — not a corporate press release
- Be a short paragraph or two at most

Return ONLY the message text. No subject line, no greeting, no signature, no markdown, no JSON. Just the message body.`;

interface ScheduleItem {
  title: string;
  scheduled_date: string;
  trade: string | null;
}

async function loadJobContext(
  sb: ReturnType<typeof createClient>,
  jobId: string
): Promise<{ tenantId: string | null; currentPhase: string | null; upcomingItems: ScheduleItem[] }> {
  const { data: job } = await sb
    .from("jobs")
    .select("tenant_id")
    .eq("id", jobId)
    .single();

  if (!job) return { tenantId: null, currentPhase: null, upcomingItems: [] };

  // Current phase
  const { data: phases } = await sb
    .from("job_phases")
    .select("phase_name, status")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  let currentPhase: string | null = null;
  if (phases?.length) {
    const inProgress = phases.find((p: { phase_name: string; status: string }) => p.status === "in_progress");
    currentPhase = inProgress?.phase_name ?? phases[0].phase_name;
  }

  // Upcoming schedule items (next 30 days)
  const today = new Date().toISOString().slice(0, 10);
  const { data: items } = await sb
    .from("schedule_items")
    .select("title, scheduled_date, trade")
    .eq("job_id", jobId)
    .in("status", ["scheduled", "in_progress"])
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .limit(5);

  return { tenantId: job.tenant_id, currentPhase, upcomingItems: items || [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { job_id, raw_note } = body;

    if (!job_id || !raw_note?.trim()) {
      return new Response(JSON.stringify({ error: "job_id and raw_note are required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { tenantId, currentPhase, upcomingItems } = await loadJobContext(sb, job_id);

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const contextLines: string[] = [];
    if (currentPhase) contextLines.push(`Current phase: ${currentPhase}`);
    contextLines.push(`What happened today (field note): ${raw_note.trim()}`);
    if (upcomingItems.length) {
      const upcoming = upcomingItems
        .map((s: ScheduleItem) => `- ${s.title} (${s.scheduled_date})`)
        .join("\n");
      contextLines.push(`Upcoming scheduled work:\n${upcoming}`);
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: contextLines.join("\n\n") }],
      }),
    });

    const aiJson = await aiRes.json();
    const clientMessage = aiJson.content?.[0]?.text?.trim() ?? "";

    if (!clientMessage) {
      logAIError({
        function_name: "ai-daily-log-draft",
        error_type: "empty_response",
        error_message: "AI returned empty client message",
        user_input: raw_note,
        ai_raw_response: JSON.stringify(aiJson),
        job_id,
        tenant_id: tenantId,
      });
      return new Response(JSON.stringify({ error: "AI returned empty response" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, client_message: clientMessage }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    logAIError({
      function_name: "ai-daily-log-draft",
      error_type: "unhandled_exception",
      error_message: String(e),
    });
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
