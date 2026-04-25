
import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { session_id, job_id } = await req.json();
    if (!session_id || !job_id) {
      return new Response(JSON.stringify({ error: "Missing session_id or job_id" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const [sessionRes, measurementsRes, extractionRes, jobRes, knowledgeRes, scanRes] =
      await Promise.all([
        sb.from("consultation_sessions").select("*").eq("id", session_id).single(),
        sb.from("consultation_measurements").select("*").eq("session_id", session_id),
        sb.from("consultation_extractions").select("*").eq("session_id", session_id).maybeSingle(),
        sb.from("jobs").select("address, description, sqft, client_name").eq("id", job_id).single(),
        sb.from("ai_knowledge").select("category, content").eq("active", true),
        sb.from("job_lidar_scans")
          .select("rooms, total_sqft, capture_mode, quality_grade")
          .eq("job_id", job_id)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

    const session = sessionRes.data;
    const measurements = measurementsRes.data || [];
    const extraction = extractionRes.data;
    const job = jobRes.data;
    const knowledge = knowledgeRes.data || [];
    const latestScan = scanRes.data?.[0] || null;

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const measureSummary = measurements.length
      ? measurements
          .map((m: Record<string, unknown>) => {
            const fields = m.fields as Record<string, unknown>;
            const fieldLines = Object.entries(fields)
              .map(([k, v]) => `  ${k}: ${v}`)
              .join("\n");
            return `${m.trade}:\n${fieldLines}`;
          })
          .join("\n\n")
      : "No measurements recorded";

    const ambientContext = extraction
      ? [
          (extraction.client_concerns as string[])?.length
            ? `Client concerns: ${(extraction.client_concerns as string[]).join(", ")}`
            : "",
          extraction.budget_signals ? `Budget signals: ${extraction.budget_signals}` : "",
          (extraction.risk_flags as string[])?.length
            ? `Risk flags: ${(extraction.risk_flags as string[]).join(", ")}`
            : "",
          (extraction.scope_hints as string[])?.length
            ? `Scope hints: ${(extraction.scope_hints as string[]).join(", ")}`
            : "",
          extraction.timeline ? `Timeline: ${extraction.timeline}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "No ambient conversation captured";

    const knowledgeContext = knowledge.length
      ? knowledge
          .map((k: Record<string, unknown>) => `[${k.category}] ${k.content}`)
          .join("\n")
      : "";

    const scanContext = latestScan
      ? `LiDAR scan available: ${latestScan.total_sqft || 0} sqft, ${
          (latestScan.rooms as unknown[])?.length || 0
        } rooms scanned, quality grade: ${latestScan.quality_grade || "unknown"}`
      : "No LiDAR scan available for this job";

    const prompt = `You are an expert construction consultation reviewer. Analyze this consultation data and identify gaps — things the rep needs to clarify or measure before the estimate can be accurate.

Job: ${job?.address || "Unknown"}
Client: ${job?.client_name || "Unknown"}
${job?.sqft ? `Approx sqft: ${job.sqft}` : ""}
${job?.description ? `Description: ${job.description}` : ""}

Scan: ${scanContext}

Ambient notes:
${ambientContext}

Measurements:
${measureSummary}

${knowledgeContext ? `Company knowledge / inspection guidance:\n${knowledgeContext}\n` : ""}

Identify up to 8 gaps. Return a JSON object only:
{
  "gaps": [
    {
      "category": "MISSING_MEASUREMENT | UNCLEAR_SCOPE | MISSING_DECISION | CODE_OR_PERMIT | RISK_NOT_DISCLOSED",
      "severity": "blocker | strong | nice_to_have",
      "title": "short label (5-8 words)",
      "description": "what is missing or unclear (1-2 sentences)",
      "suggested_action": "specific question or measurement the rep should ask or take"
    }
  ]
}

Severity guide:
- blocker: estimate cannot be accurate without this information
- strong: likely causes a change order if not resolved before pricing
- nice_to_have: helpful context but the estimate can proceed

Return only valid JSON. No text before or after the JSON object.`;

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
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const aiJson = await aiRes.json();
    const raw = aiJson.content?.[0]?.text || "{}";

    let parsed: { gaps?: unknown[] };
    try {
      const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      return new Response(
        JSON.stringify({ error: "AI returned invalid JSON", raw }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const gaps = (parsed.gaps || []) as Record<string, unknown>[];

    await sb.from("consultation_gap_analyses").insert({
      session_id,
      job_id,
      tenant_id: session.tenant_id,
      gaps,
    });

    const ran_at = new Date().toISOString();
    return new Response(
      JSON.stringify({ ok: true, gaps, ran_at, session_id }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
