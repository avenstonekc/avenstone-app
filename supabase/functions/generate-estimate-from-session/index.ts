import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { session_id, job_id } = await req.json();
    if (!session_id || !job_id) {
      return new Response(JSON.stringify({ error: "Missing session_id or job_id" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Load session + measurements + extraction
    const [sessionRes, measurementsRes, extractionRes, jobRes] = await Promise.all([
      sb.from("consultation_sessions").select("*").eq("id", session_id).single(),
      sb.from("consultation_measurements").select("*").eq("session_id", session_id),
      sb.from("consultation_extractions").select("*").eq("session_id", session_id).maybeSingle(),
      sb.from("jobs").select("address, description, sqft, client_name").eq("id", job_id).single(),
    ]);

    const session = sessionRes.data;
    const measurements = measurementsRes.data || [];
    const extraction = extractionRes.data;
    const job = jobRes.data;

    if (!session || !measurements.length) {
      return new Response(JSON.stringify({ error: "No measurements found for this session" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Build measurement summary
    const measureSummary = measurements.map((m: Record<string, unknown>) => {
      const fields = m.fields as Record<string, unknown>;
      const fieldLines = Object.entries(fields).map(([k, v]) => `  ${k}: ${v}`).join("\n");
      return `${m.trade}:\n${fieldLines}`;
    }).join("\n\n");

    const ambientContext = extraction
      ? [
          extraction.client_concerns?.length ? `Client concerns: ${extraction.client_concerns.join(", ")}` : "",
          extraction.budget_signals ? `Budget signals: ${extraction.budget_signals}` : "",
          extraction.risk_flags?.length ? `Risk flags: ${extraction.risk_flags.join(", ")}` : "",
          extraction.timeline ? `Timeline: ${extraction.timeline}` : "",
        ].filter(Boolean).join("\n")
      : "";

    // Generate estimate
    const estimatePrompt = `Generate a detailed construction estimate for the following job.

Job: ${job?.address || "Unknown address"}
Client: ${job?.client_name || "Unknown"}
${job?.sqft ? `Square footage: ${job.sqft} sqft` : ""}
${job?.description ? `Description: ${job.description}` : ""}

${ambientContext ? `Consultation context:\n${ambientContext}\n` : ""}

Measurements collected on-site:
${measureSummary}

Return a JSON object with:
{
  "trades": [
    {
      "trade": "trade name",
      "line_items": [
        { "description": "item", "qty": 1, "unit": "ea", "unit_cost": 0, "total": 0 }
      ],
      "subtotal": 0
    }
  ],
  "materials_total": 0,
  "labor_total": 0,
  "cost_subtotal": 0,
  "pm_fee": 0,
  "margin_pct": 25,
  "margin_amount": 0,
  "total": 0,
  "confidence_scores": { "trade_name": 95 }
}

Use Avenstone's cost-plus model: show material + labor per trade, then add PM fee ($800-$2000) and 20-35% margin on top. Return only valid JSON.`;

    const estimateRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        messages: [{ role: "user", content: estimatePrompt }],
      }),
    });

    const estimateJson = await estimateRes.json();
    const estimateRaw = estimateJson.content?.[0]?.text || "{}";
    let estimate: Record<string, unknown>;
    try {
      const clean = estimateRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      estimate = JSON.parse(clean);
    } catch {
      return new Response(JSON.stringify({ error: "Estimate AI returned invalid JSON", raw: estimateRaw }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Generate OH SHIT moments
    const ohShitPrompt = `Based on this construction job and measurements, identify the top 3-5 "OH SHIT moments" — unexpected conditions that commonly occur and would result in a change order.

Job: ${job?.address || "Unknown"}
Trades: ${measurements.map((m: Record<string, unknown>) => m.trade).join(", ")}
Measurements: ${measureSummary}
${ambientContext ? `Context: ${ambientContext}` : ""}

Return a JSON array:
[
  {
    "condition": "description of what might be found",
    "likelihood": "low|medium|high",
    "estimated_cost_low": 500,
    "estimated_cost_high": 1500,
    "how_to_present": "one sentence explaining this to the homeowner"
  }
]

Return only valid JSON array. No explanation.`;

    const ohShitRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [{ role: "user", content: ohShitPrompt }],
      }),
    });

    const ohShitJson = await ohShitRes.json();
    const ohShitRaw = ohShitJson.content?.[0]?.text || "[]";
    let ohShitMoments: Record<string, unknown>[];
    try {
      const clean = ohShitRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      ohShitMoments = JSON.parse(clean);
    } catch {
      ohShitMoments = [];
    }

    // Save OH SHIT moments to DB
    if (ohShitMoments.length) {
      await sb.from("oh_shit_moments").insert(
        ohShitMoments.map((m) => ({
          session_id,
          job_id,
          tenant_id: session.tenant_id,
          condition: m.condition,
          likelihood: m.likelihood,
          estimated_cost_low: m.estimated_cost_low,
          estimated_cost_high: m.estimated_cost_high,
          how_to_present: m.how_to_present,
          included_in_proposal: false,
        }))
      );
    }

    // Mark session complete
    await sb.from("consultation_sessions").update({ status: "complete", ended_at: new Date().toISOString() }).eq("id", session_id);

    return new Response(JSON.stringify({ ok: true, estimate, oh_shit_moments: ohShitMoments, measurements }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
