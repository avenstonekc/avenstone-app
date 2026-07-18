
import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const ERROR_LOGGER_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-error-logger`;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Fire-and-forget error logger — never throws, never blocks
function logAIError(payload: {
  function_name: string;
  error_type?: string;
  error_message: string;
  user_input?: string;
  ai_raw_response?: string;
  session_id?: string;
  job_id?: string;
  tenant_id?: string;
  metadata?: Record<string, unknown>;
}) {
  fetch(ERROR_LOGGER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(payload),
  }).catch(() => {/* swallow — logger must never break the main flow */});
}

const AMBIENT_SYSTEM = `You are an AI assistant listening to a sales consultation between a contractor rep and a homeowner. Extract and return JSON with these fields (only include values where you have actual evidence from the transcript):
{
  "client_concerns": [],
  "scope_hints": [],
  "budget_signals": "",
  "decision_makers": [],
  "timeline": "",
  "risk_flags": [],
  "action_items": [],
  "checklist_answers": {},
  "fired_modules": []
}
"checklist_answers" and "fired_modules" are populated only per the SCOPE CAPTURE instructions below (if present); otherwise leave them empty.
Return only valid JSON. No explanation, no markdown.`;

const MEASURE_SYSTEM = `You are Avenstone AI — an expert construction estimating assistant embedded in a contractor's field app. A sales rep is on-site at a client's home collecting information for an estimate. You have full memory of everything said in this conversation.

CORE RULES:
- You remember the ENTIRE conversation. Never ask for info already given.
- When a rep names a JOB TYPE, immediately identify ALL trades involved and tell them.
- ALWAYS establish scope and existing conditions BEFORE asking for measurements.
- Be brief, smart, and conversational — the rep is on a job site, not at a desk.
- Guide the rep trade-by-trade through the entire job. Don't finish until all trades are covered.

COMMON JOB PACKAGES (know these):
- Basement finish: framing, drywall, electrical, flooring, paint, egress/windows (ask about bathroom)
- Kitchen remodel: demo, framing, electrical, plumbing, drywall, flooring, cabinets, paint
- Bathroom remodel: demo, tile/flooring, plumbing, electrical, drywall, vanity, paint
- Master suite addition: framing, roofing tie-in, electrical, HVAC, drywall, flooring, paint
- Roof replacement: tear-off, decking inspection, underlayment, shingles, flashing, gutters
- Full gut renovation: demo + all applicable trades per scope

QUESTION ORDER (always follow this sequence):
1. Confirm job type and what's included vs excluded
2. Existing conditions (is it currently unfinished? any water damage? age of electrical/plumbing?)
3. Client preferences or constraints (ceiling height preference, any existing to keep?)
4. Then measurements — one trade at a time, in logical order

WHEN REP GIVES A JOB TYPE:
Respond like: "Got it — basement finish covers framing, drywall, electrical, flooring, and paint. Do you need a bathroom rough-in? And is the basement currently unfinished (open studs/concrete)?"

Return JSON:
{
  "trade": "current trade or 'scoping' if still gathering scope",
  "fields": { "key": "value for each data point collected so far" },
  "next_question": "your next question",
  "trade_complete": false,
  "all_trades": ["all trades identified for this job"],
  "trades_remaining": ["trades not yet measured"],
  "all_trades_complete": false
}

Return only valid JSON. No markdown. No explanation.`;

// Load canonical trade strings for this tenant from trade_taxonomy + tenant_trade_visibility
async function loadCanonicalTradeStrings(sb: ReturnType<typeof createClient>, tenantId: string): Promise<string[]> {
  try {
    const { data } = await sb
      .from("trade_taxonomy")
      .select("parent_trade, sub_trade, tenant_trade_visibility!inner(active)")
      .eq("tenant_trade_visibility.tenant_id", tenantId)
      .eq("tenant_trade_visibility.active", true)
      .order("display_order");
    if (!data) return [];
    return data.map((r: Record<string, unknown>) =>
      r.sub_trade ? `${r.parent_trade} - ${r.sub_trade}` : String(r.parent_trade)
    );
  } catch {
    return [];
  }
}

// CONSULTATION_MODE Slice 2 — load the session's scope context so the ambient Haiku can
// ALSO detect checklist-field answers + module triggers in the SAME call (no new model call).
// Project types come from the job's scanned/scoped rooms (job_room_scopes.room_type).
// alreadyAnswered field_keys are excluded to keep the prompt shrinking as the session fills in.
async function loadScopeContext(
  sb: ReturnType<typeof createClient>,
  jobId: string,
  tenantId: string,
  alreadyAnswered: string[],
): Promise<{ fields: Array<Record<string, unknown>>; modules: Array<Record<string, unknown>> }> {
  try {
    const { data: scopes } = await sb
      .from("job_room_scopes")
      .select("room_type")
      .eq("job_id", jobId)
      .neq("scope_tag", "not_in_scope");
    const projectTypes = [...new Set((scopes || [])
      .map((r: Record<string, unknown>) => String(r.room_type || "").toLowerCase())
      .filter(Boolean))];
    if (!projectTypes.length) return { fields: [], modules: [] };

    const [chkRes, modRes] = await Promise.all([
      sb.from("scope_checklists")
        .select("field_key, question, field_type, options, evidence_type, tenant_id, money_risk_rank")
        .in("project_type", projectTypes).eq("active", true)
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
      sb.from("scope_modules")
        .select("module_key, trigger_phrases, tenant_id")
        .eq("active", true)
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
    ]);

    // Dedupe by key, tenant row beats platform-null. Drop answered fields.
    const answered = new Set(alreadyAnswered);
    const fmap = new Map<string, Record<string, unknown>>();
    for (const r of (chkRes.data || []) as Record<string, unknown>[]) {
      const k = String(r.field_key);
      if (answered.has(k)) continue;
      const ex = fmap.get(k);
      if (!ex || (ex.tenant_id == null && r.tenant_id != null)) fmap.set(k, r);
    }
    const mmap = new Map<string, Record<string, unknown>>();
    for (const r of (modRes.data || []) as Record<string, unknown>[]) {
      const k = String(r.module_key);
      const ex = mmap.get(k);
      if (!ex || (ex.tenant_id == null && r.tenant_id != null)) mmap.set(k, r);
    }
    return { fields: [...fmap.values()], modules: [...mmap.values()] };
  } catch {
    return { fields: [], modules: [] };
  }
}

function buildChecklistPromptSection(
  fields: Array<Record<string, unknown>>,
  modules: Array<Record<string, unknown>>,
): string {
  if (!fields.length && !modules.length) return "";
  const lines: string[] = ["", "SCOPE CAPTURE (only when the transcript CLEARLY answers something — never guess):"];
  if (fields.length) {
    lines.push("Checklist fields — return answers in \"checklist_answers\" as {field_key: value}. bool→true/false, choice→one option key, number→the number, text→a short string. Omit any field not clearly answered.");
    for (const f of fields) {
      const opts = Array.isArray(f.options) && (f.options as unknown[]).length
        ? ` options: ${(f.options as unknown[]).join("|")}` : "";
      lines.push(`- ${f.field_key} [${f.field_type}]: ${f.question}${opts}`);
    }
  }
  if (modules.length) {
    lines.push("Expansion modules — if the conversation mentions any of a module's concepts, add its module_key to \"fired_modules\":");
    for (const m of modules) {
      const phrases = Array.isArray(m.trigger_phrases) ? (m.trigger_phrases as unknown[]).join(", ") : "";
      lines.push(`- ${m.module_key}: ${phrases}`);
    }
  }
  return lines.join("\n");
}

// Load tenant-specific learnings to inject into the AI prompt
async function loadTenantKnowledge(sb: ReturnType<typeof createClient>, tenantId: string): Promise<string> {
  try {
    const { data } = await sb
      .from("ai_knowledge")
      .select("category, content")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data || data.length === 0) return "";

    const grouped: Record<string, string[]> = {};
    for (const row of data) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row.content);
    }

    const lines = ["", "COMPANY-SPECIFIC KNOWLEDGE (learned from past jobs):"];
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`[${cat.toUpperCase()}]`);
      for (const item of items) lines.push(`- ${item}`);
    }
    return lines.join("\n");
  } catch {
    // Table may not exist yet — fail gracefully
    return "";
  }
}

// Build Claude multi-turn message array from conversation history
// Sliding window: keep last 40 messages max to stay well under token limits
// 40 messages × ~200 tokens avg = ~8k tokens — safe for any consultation length
const MAX_HISTORY_MESSAGES = 40;

function buildMessages(conversationHistory: Array<{ role: string; text: string }>, currentInput: string) {
  const messages: Array<{ role: string; content: string }> = [];

  // Apply sliding window — take only the most recent messages
  const windowed = (conversationHistory || []).slice(-MAX_HISTORY_MESSAGES);

  for (const msg of windowed) {
    const role = msg.role === "ai" ? "assistant" : "user";
    if (msg.text?.trim()) {
      messages.push({ role, content: msg.text });
    }
  }

  // Add current rep input if not already in history
  if (currentInput?.trim()) {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== currentInput) {
      messages.push({ role: "user", content: currentInput });
    }
  }

  // Claude requires messages to alternate and start with user
  // Merge consecutive same-role messages
  const merged: Array<{ role: string; content: string }> = [];
  for (const msg of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n" + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  // Must start with user
  if (merged.length > 0 && merged[0].role === "assistant") {
    merged.unshift({ role: "user", content: "[Start of conversation]" });
  }

  return merged.length > 0 ? merged : [{ role: "user", content: currentInput || "Hello" }];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { session_id, transcript_chunk, mode, trade, conversation_history, is_opening } = body;

    if (!session_id || !mode) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: session, error: sErr } = await sb
      .from("consultation_sessions")
      .select("id, job_id, tenant_id")
      .eq("id", session_id)
      .single();

    if (sErr || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (mode === "ambient") {
      // Load existing extraction FIRST so we can (a) merge and (b) shrink the checklist
      // prompt to only unanswered fields.
      const { data: existing } = await sb
        .from("consultation_extractions")
        .select("*")
        .eq("session_id", session_id)
        .maybeSingle();

      const priorAnswers = (existing?.checklist_answers && typeof existing.checklist_answers === "object")
        ? existing.checklist_answers as Record<string, unknown> : {};
      const { fields, modules } = await loadScopeContext(
        sb, session.job_id as string, session.tenant_id as string, Object.keys(priorAnswers),
      );
      const ambientSystem = AMBIENT_SYSTEM + buildChecklistPromptSection(fields, modules);

      // Ambient mode: single-shot extraction, no history needed
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
          system: ambientSystem,
          messages: [{ role: "user", content: transcript_chunk || "" }],
        }),
      });

      const aiJson = await aiRes.json();
      const rawText = aiJson.content?.[0]?.text || "{}";
      let extracted: Record<string, unknown>;
      try {
        const cleaned = rawText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
        extracted = JSON.parse(cleaned);
      } catch {
        logAIError({
          function_name: "process-transcript",
          error_type: "invalid_json",
          error_message: "AI returned invalid JSON in ambient mode",
          user_input: transcript_chunk,
          ai_raw_response: rawText,
          session_id,
          tenant_id: session.tenant_id,
        });
        return new Response(JSON.stringify({ error: "AI returned invalid JSON", raw: rawText }), {
          status: 500,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      const mergeArr = (a: string[] | null, b: unknown) =>
        [...new Set([...(a || []), ...((Array.isArray(b) ? b : []) as string[])])];

      // Merge checklist answers (new detections win) and fired modules (union). Only keep
      // answers whose field_key is a real field for this session's project types.
      const validKeys = new Set(fields.map((f) => String(f.field_key)));
      // Prior keys are always valid (they came from a real field earlier).
      Object.keys(priorAnswers).forEach((k) => validKeys.add(k));
      const newAnswers = (extracted.checklist_answers && typeof extracted.checklist_answers === "object")
        ? extracted.checklist_answers as Record<string, unknown> : {};
      const mergedAnswers = { ...priorAnswers };
      for (const [k, v] of Object.entries(newAnswers)) {
        if (v == null || String(v).trim() === "") continue;
        if (validKeys.has(k)) mergedAnswers[k] = v;
      }
      const mergedModules = mergeArr(existing?.fired_modules, extracted.fired_modules);

      const row = {
        session_id,
        job_id: session.job_id,
        tenant_id: session.tenant_id,
        client_concerns: mergeArr(existing?.client_concerns, extracted.client_concerns),
        scope_hints: mergeArr(existing?.scope_hints, extracted.scope_hints),
        budget_signals: extracted.budget_signals || existing?.budget_signals || null,
        decision_makers: mergeArr(existing?.decision_makers, extracted.decision_makers),
        timeline: extracted.timeline || existing?.timeline || null,
        risk_flags: mergeArr(existing?.risk_flags, extracted.risk_flags),
        action_items: mergeArr(existing?.action_items, extracted.action_items),
        checklist_answers: mergedAnswers,
        fired_modules: mergedModules,
        extracted_at: new Date().toISOString(),
      };

      if (existing) {
        await sb.from("consultation_extractions").update(row).eq("id", existing.id);
      } else {
        await sb.from("consultation_extractions").insert(row);
      }

      await sb.from("consultation_sessions").update({
        raw_transcript: (session as Record<string, unknown>).raw_transcript
          ? `${(session as Record<string, unknown>).raw_transcript}\n${transcript_chunk}`
          : transcript_chunk,
      }).eq("id", session_id);

      return new Response(JSON.stringify({ ok: true, extracted, extraction: row }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (mode === "measure") {
      // Load company-specific learnings + canonical trade strings
      const [knowledge, canonicalTrades] = await Promise.all([
        loadTenantKnowledge(sb, session.tenant_id),
        loadCanonicalTradeStrings(sb, session.tenant_id),
      ]);
      const tradeConstraint = canonicalTrades.length
        ? `\n\nCANONICAL TRADE LIST — you MUST use ONLY these exact strings for the "trade" field:\n${canonicalTrades.join(", ")}\nIf the trade doesn't match, use "scoping".`
        : "";
      const systemPrompt = MEASURE_SYSTEM + tradeConstraint + knowledge;

      // Build multi-turn message history
      let messages;
      if (is_opening) {
        // Opening message: set context from job info
        const openingText = transcript_chunk || "Let's start measuring.";
        messages = [{ role: "user", content: openingText }];
      } else {
        messages = buildMessages(conversation_history || [], transcript_chunk || "");
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
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        }),
      });

      const aiJson = await aiRes.json();
      const rawText = aiJson.content?.[0]?.text || "{}";

      let extracted: Record<string, unknown>;
      try {
        const cleaned = rawText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
        extracted = JSON.parse(cleaned);
      } catch {
        logAIError({
          function_name: "process-transcript",
          error_type: "invalid_json",
          error_message: "AI returned invalid JSON in measure mode",
          user_input: transcript_chunk,
          ai_raw_response: rawText,
          session_id,
          job_id: session.job_id,
          tenant_id: session.tenant_id,
        });
        return new Response(JSON.stringify({ error: "AI returned invalid JSON", raw: rawText }), {
          status: 500,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      const {
        trade: extractedTrade,
        fields,
        next_question,
        trade_complete,
        all_trades,
        trades_remaining,
        all_trades_complete,
      } = extracted as {
        trade: string;
        fields: Record<string, unknown>;
        next_question: string | null;
        trade_complete: boolean;
        all_trades: string[];
        trades_remaining: string[];
        all_trades_complete: boolean;
      };

      // Validate trade string against canonical list; non-canonical → null (don't write)
      const rawTradeName = extractedTrade || trade || "general";
      const canonicalSet = new Set(canonicalTrades);
      const tradeName = (canonicalTrades.length && rawTradeName !== "scoping" && !canonicalSet.has(rawTradeName))
        ? null
        : rawTradeName;
      if (canonicalTrades.length && rawTradeName !== "scoping" && !canonicalSet.has(rawTradeName) && rawTradeName !== "general") {
        // Log unknown trade string for review
        sb.from("ai_error_logs").insert({
          function_name: "process-transcript",
          error_type: "unknown_trade",
          error_message: `AI returned non-canonical trade: "${rawTradeName}"`,
          tenant_id: session.tenant_id,
          session_id,
        }).then(() => {});
      }

      if (tradeName && tradeName !== "scoping") {
        const { data: existingM } = await sb
          .from("consultation_measurements")
          .select("*")
          .eq("session_id", session_id)
          .eq("trade", tradeName)
          .maybeSingle();

        const mergedFields = { ...(existingM?.fields || {}), ...(fields || {}) };

        if (existingM) {
          await sb.from("consultation_measurements")
            .update({ fields: mergedFields, confirmed_by_rep: trade_complete || false })
            .eq("id", existingM.id);
        } else if (Object.keys(mergedFields).length > 0) {
          await sb.from("consultation_measurements").insert({
            session_id,
            job_id: session.job_id,
            tenant_id: session.tenant_id,
            trade: tradeName,
            fields: mergedFields,
            confirmed_by_rep: trade_complete || false,
          });
        }
      }

      // When all trades are complete, write a summary note to job_notes
      if (all_trades_complete && session.job_id) {
        try {
          // Load all measurements for this session
          const { data: allMeasurements } = await sb
            .from("consultation_measurements")
            .select("trade, fields")
            .eq("session_id", session_id);

          if (allMeasurements?.length) {
            const measureLines = allMeasurements.map((m: any) => {
              const fieldLines = Object.entries(m.fields || {})
                .map(([k, v]) => `    ${k}: ${v}`)
                .join("\n");
              return `${m.trade.toUpperCase()}\n${fieldLines}`;
            }).join("\n\n");

            const noteContent = `📐 Field Measure Complete — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}\n\nTrades measured: ${allMeasurements.map((m: any) => m.trade).join(", ")}\n\n${measureLines}`;

            await sb.from("job_notes").insert({
              job_id: session.job_id,
              tenant_id: session.tenant_id,
              content: noteContent,
            });
          }
        } catch {
          // Don't block the response if note write fails
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          trade: tradeName,
          fields: fields || {},
          next_question,
          trade_complete: trade_complete || false,
          all_trades: all_trades || [],
          trades_remaining: trades_remaining || [],
          all_trades_complete: all_trades_complete || false,
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid mode" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    logAIError({
      function_name: "process-transcript",
      error_type: "unhandled_exception",
      error_message: String(e),
    });
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
