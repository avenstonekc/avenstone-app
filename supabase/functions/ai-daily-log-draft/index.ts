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

const SYSTEM_PROMPT = `You are a construction field documentation assistant. Turn a brief raw field note into a clean daily log entry.

Return strict JSON with exactly these three fields:
{
  "work_completed": "client-readable prose describing the work completed today, written in past tense",
  "materials_used": "concise description of materials installed or consumed, or empty string if none mentioned",
  "issues": "any problems, delays, or blockers encountered, or empty string if none mentioned"
}

Rules:
- work_completed is client-facing: professional, clear, past tense. Focus on what was accomplished.
- Do NOT invent or guess weather, crew count, or hours worked — the PM fills those in manually.
- Do NOT add information not present in the raw note.
- Keep all fields concise: 1-3 sentences maximum.
- Return only valid JSON. No markdown fences, no explanation.`;

async function loadJobContext(
  sb: ReturnType<typeof createClient>,
  jobId: string
): Promise<{ tenantId: string | null; phase: string | null }> {
  const { data: job } = await sb
    .from("jobs")
    .select("tenant_id")
    .eq("id", jobId)
    .single();

  if (!job) return { tenantId: null, phase: null };

  const { data: phases } = await sb
    .from("job_phases")
    .select("phase_name, status")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  let phase: string | null = null;
  if (phases?.length) {
    const inProgress = phases.find((p: { phase_name: string; status: string }) => p.status === "in_progress");
    phase = inProgress?.phase_name ?? phases[0].phase_name;
  }

  return { tenantId: job.tenant_id, phase };
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
    const { tenantId, phase } = await loadJobContext(sb, job_id);

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const userMessage = [
      phase ? `Current job phase: ${phase}` : null,
      `Raw field note: ${raw_note.trim()}`,
    ].filter(Boolean).join("\n");

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
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const aiJson = await aiRes.json();
    const rawText = aiJson.content?.[0]?.text ?? "{}";

    let draft: { work_completed: string; materials_used: string; issues: string };
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();
      draft = JSON.parse(cleaned);
    } catch {
      logAIError({
        function_name: "ai-daily-log-draft",
        error_type: "invalid_json",
        error_message: "AI returned invalid JSON",
        user_input: raw_note,
        ai_raw_response: rawText,
        job_id,
        tenant_id: tenantId,
      });
      return new Response(JSON.stringify({ error: "AI returned invalid JSON", raw: rawText }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        work_completed: draft.work_completed ?? "",
        materials_used: draft.materials_used ?? "",
        issues: draft.issues ?? "",
      }),
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
