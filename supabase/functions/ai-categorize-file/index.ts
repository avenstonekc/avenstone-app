import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const FALLBACK: CategorizeResult = { category: "Photos", subcategory: null, confidence: 0, source: "error" };

interface CategorizeResult {
  category: string;
  subcategory: string | null;
  confidence: number;
  source: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const jsonHeaders = { ...CORS, "Content-Type": "application/json" };

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jsonHeaders });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jsonHeaders });
    }

    // ── Tenant from profile ───────────────────────────────────────────────────
    const { data: profile } = await sb
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    const tenantId = profile?.tenant_id as string | null;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "no tenant" }), { status: 400, headers: jsonHeaders });
    }

    // ── Input ─────────────────────────────────────────────────────────────────
    const body = await req.json();
    const { jobId, imageBase64, imageMimeType = "image/jpeg", fileName = "photo" } = body as {
      jobId?: string;
      imageBase64?: string;
      imageMimeType?: string;
      fileName?: string;
    };
    if (!jobId || !imageBase64) {
      return new Response(JSON.stringify({ error: "jobId and imageBase64 required" }), { status: 400, headers: jsonHeaders });
    }

    // ── Load valid Photos subcategories for tenant ────────────────────────────
    const { data: subcatRows } = await sb
      .from("tenant_file_subcategories")
      .select("subcategory")
      .eq("tenant_id", tenantId)
      .eq("category", "Photos")
      .order("display_order", { ascending: true });

    const validSubcats: string[] = subcatRows && subcatRows.length > 0
      ? subcatRows.map((r: { subcategory: string }) => r.subcategory)
      : ["Before", "During", "After", "Demo", "Framing", "Plumbing", "Electrical", "HVAC",
         "Drywall", "Tile", "Flooring", "Cabinets", "Paint", "Trim/Finish", "Roofing", "Final"];

    // ── Current in-progress job phase (context for Haiku) ────────────────────
    const { data: phaseRow } = await sb
      .from("job_phases")
      .select("phase_name")
      .eq("job_id", jobId)
      .eq("tenant_id", tenantId)
      .eq("status", "in_progress")
      .order("phase_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    const phaseName: string | null = phaseRow?.phase_name ?? null;

    // ── Haiku vision call ─────────────────────────────────────────────────────
    const prompt =
`You are a construction photo categorizer for a contractor app.

Active job phase: ${phaseName ?? "unknown"}
Valid photo subcategories: ${validSubcats.join(", ")}

Look at this job site photo and classify it. Respond with JSON only — no markdown, no explanation:
{"subcategory": "<exact subcategory from the list above, or null if none fit>", "confidence": <0.0-1.0>}

Rules:
- subcategory must match exactly one entry from the list, or null
- confidence >= 0.9: you are certain of the trade shown
- confidence 0.7-0.89: reasonable inference
- confidence < 0.7: uncertain — prefer null when unsure
- If the active job phase clearly matches, lean toward that subcategory`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 128,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: imageMimeType, data: imageBase64 },
            },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      console.error("[ai-categorize-file] Anthropic error:", aiRes.status, await aiRes.text().catch(() => ""));
      return new Response(JSON.stringify(FALLBACK), { headers: jsonHeaders });
    }

    const aiData = await aiRes.json();
    const rawText: string = aiData?.content?.[0]?.text ?? "{}";

    // ── Parse + validate ──────────────────────────────────────────────────────
    let parsed: { subcategory?: string | null; confidence?: number } = {};
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match?.[0] ?? "{}");
    } catch {
      console.warn("[ai-categorize-file] JSON parse failed:", rawText);
    }

    const rawSubcat = typeof parsed.subcategory === "string" ? parsed.subcategory : null;
    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0;

    // Only accept subcategories the tenant actually has configured
    const subcategory = rawSubcat && validSubcats.includes(rawSubcat) ? rawSubcat : null;
    const source = subcategory && confidence >= 0.80 ? "vision" : "vision_lowconf";

    const result: CategorizeResult = { category: "Photos", subcategory: subcategory ?? null, confidence, source };
    return new Response(JSON.stringify(result), { headers: jsonHeaders });

  } catch (err) {
    console.error("[ai-categorize-file]", err);
    return new Response(JSON.stringify(FALLBACK), { status: 500, headers: jsonHeaders });
  }
});
