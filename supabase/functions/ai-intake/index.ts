import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const ERROR_LOGGER_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-error-logger`;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function logAIError(payload: unknown) {
  fetch(ERROR_LOGGER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

async function callAnthropic(params: {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.max_tokens,
      system: params.system,
      messages: params.messages,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errorBody}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  return text;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: {
    conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
    message: string;
    tenant_id: string;
    mode: "chat" | "extract";
    user_id?: string;
  };

  try {
    body = await req.json();
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { conversation_history, message, tenant_id, mode, user_id } = body;

  // ── CHAT MODE ────────────────────────────────────────────────────────────────
  if (mode === "chat") {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      const { data: knowledge } = await supabase
        .from("ai_knowledge")
        .select("category, content")
        .eq("tenant_id", tenant_id)
        .eq("active", true);

      const knowledgeBlock =
        knowledge?.map((k: { category: string; content: string }) => `[${k.category}] ${k.content}`).join("\n") ?? "";

      const systemPrompt = `You are the Avenstone intake assistant — a friendly, professional AI that helps homeowners and property owners describe their construction project so our team can put together an accurate estimate.

Your job is to gather everything our estimators need through natural conversation. Don't use a rigid form — ask questions conversationally, build on what the client tells you.

COMPANY CONTEXT:
${knowledgeBlock}

WHAT YOU NEED TO COLLECT (in order of priority):
1. What kind of project (kitchen remodel, bathroom, addition, roofing, full renovation, etc.)
2. The property address (or city/area if they're not comfortable yet)
3. Rough scope — what they want done, what condition things are in
4. Square footage or room sizes (tell them we'll do a precise measure next, but rough helps)
5. Timeline — when they want to start / any deadlines
6. Budget range — ask diplomatically: "Do you have a ballpark budget in mind? Even a rough range helps us prioritize."
7. Contact info — name, email, phone
8. Any special concerns or constraints (staying in the home during work, HOA, etc.)

RULES:
- Be warm and conversational, not clinical
- Don't ask all questions at once — 1-2 per message max
- If they give you multiple pieces of info at once, acknowledge them all before moving on
- When you have items 1-5 and at least a name and email, you can wrap up the conversation
- When ready to wrap up, say something like: "I think I have enough to get started — let's move on to taking some measurements so our estimators can give you an accurate number."
- Never mention Claude or Anthropic — you are the Avenstone intake assistant
- Keep messages short (2-4 sentences usually)

SET ready_for_measurements TO TRUE when: you have project type, address or area, basic scope, and contact name + email.`;

      const messages = [
        ...conversation_history,
        { role: "user", content: message },
      ];

      const reply = await callAnthropic({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      });

      const readinessKeywords = [
        "move on to",
        "measurements",
        "get started",
        "accurate number",
        "accurate estimate",
        "next step",
        "schedule a measurement",
      ];
      const replyLower = reply.toLowerCase();
      const keywordMatch = readinessKeywords.some((kw) => replyLower.includes(kw));
      const historyLengthThreshold = conversation_history.length >= 10;
      const ready_for_measurements = keywordMatch || historyLengthThreshold;

      return new Response(
        JSON.stringify({ reply, ready_for_measurements }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err) {
      logAIError({
        function: "ai-intake",
        mode: "chat",
        tenant_id,
        user_id,
        error: String(err),
      });
      return new Response(
        JSON.stringify({ error: "Failed to get AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // ── EXTRACT MODE ─────────────────────────────────────────────────────────────
  if (mode === "extract") {
    const systemPrompt = `Extract structured project information from this intake conversation. Return ONLY valid JSON, no markdown, no explanation.

JSON shape:
{
  "project_type": string,
  "address": string,
  "client_name": string,
  "client_email": string,
  "client_phone": string,
  "scope_summary": string (2-3 sentences),
  "scope_items": string[],
  "budget_range": string,
  "timeline": string,
  "special_concerns": string[],
  "sqft_estimate": string
}

Use empty string "" for missing fields. scope_items should be an array of short action items like ["Replace cabinets", "New countertops", "Tile flooring"].`;

    try {
      const rawText = await callAnthropic({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: conversation_history,
      });

      let extracted: unknown;
      try {
        // Strip markdown code fences if the model included them despite instructions
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        extracted = JSON.parse(cleaned);
      } catch (_parseErr) {
        logAIError({
          function: "ai-intake",
          mode: "extract",
          tenant_id,
          user_id,
          error: "JSON parse failed",
          raw: rawText,
        });
        return new Response(
          JSON.stringify({ extracted: null, error: "parse_failed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ extracted }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err) {
      logAIError({
        function: "ai-intake",
        mode: "extract",
        tenant_id,
        user_id,
        error: String(err),
      });
      return new Response(
        JSON.stringify({ error: "Failed to extract project data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // ── UNKNOWN MODE ─────────────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({ error: `Unknown mode: ${mode}` }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
