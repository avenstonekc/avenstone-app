// ESTIMATOR_KNOWLEDGE_ARC Phase 3b-2
// AI scopes (JSON only, no prices). Code prices via resolveRate + material tiers.
// Hardcoded rate table deleted. Rate Book is the sole pricing source.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type RateBook,
  type LaborRow,
  type MaterialRow,
  resolveRate,
  getTier,
} from "../_shared/rateBook.ts";
import {
  assembleChecklist,
  detectTriggers,
  collectRequiredFields,
  openQuestions,
  makeAnswerRecord,
  type ChecklistRow,
  type ModuleRow,
  type ScopeField,
} from "../_shared/scopeEngine.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type FinishTier = "low" | "mid" | "high";

interface ScopeLine {
  trade: string;
  line_item: string;
  unit: string;
  quantity: number;
  description: string;
  category: "labor" | "materials" | "general";
  regional_rate?: number | null; // AI-supplied fallback for gaps + general lines
}

interface ScopeJSON {
  scope_summary: string[];
  lines: ScopeLine[];
  flags: string[];
}

interface PricedLine extends ScopeLine {
  unit_price: number | null;
  amount: number | null;
  source_label: "labor_rate" | "material_tier" | "regional_avg" | "user_entered";
  source_badge: string;
  vetted: boolean;
  gap_key?: string; // present on regional_avg lines; format: "trade::line_item::unit"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fail(msg: string, status = 500): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fmtMoney(n: number | null): string {
  if (n == null) return "TBD";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ── Rate Book loader ──────────────────────────────────────────────────────────

async function loadRateBook(tenantId: string): Promise<RateBook> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const [laborRes, materialRes] = await Promise.all([
    sb.from("rate_book_labor")
      .select("id, trade, line_item, unit, rate_low, rate_high, rate_data, vetted")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("trade")
      .order("line_item"),
    sb.from("rate_book_material")
      .select("category, description, unit, tier_low_min, tier_low_max, tier_mid_min, tier_mid_max, tier_hi_min, tier_hi_max, tier_low_label, tier_mid_label, tier_hi_label")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("category"),
  ]);
  if (laborRes.error) console.error("ai-estimator rate_book_labor:", laborRes.error.message);
  if (materialRes.error) console.error("ai-estimator rate_book_material:", materialRes.error.message);
  const laborRows = (laborRes.data ?? []) as LaborRow[];
  const materialRows = (materialRes.data ?? []) as MaterialRow[];
  console.log(`ai-estimator [3b-2]: ${laborRows.length} labor, ${materialRows.length} material (tenant: ${tenantId})`);
  return { laborRows, materialRows };
}

// ── Bid model config loader (B1.6) ────────────────────────────────────────────

interface BidModelConfig { markup_pct: number; pm_fee: number; }

async function loadBidModelConfig(tenantId: string): Promise<BidModelConfig | null> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await sb
    .from("bid_model_config")
    .select("markup_pct, pm_fee")
    .eq("tenant_id", tenantId)
    .eq("category", "default")
    .maybeSingle();
  if (error) {
    console.error("ai-estimator bid_model_config:", error.message);
    return null;
  }
  if (!data) return null;
  return { markup_pct: Number(data.markup_pct), pm_fee: Number(data.pm_fee) };
}

// ── Scope-interview engine (SCOPE_CAPTURE_ENGINE P1B) ─────────────────────────

// Load platform-default (tenant_id NULL) + tenant-override checklist & module rows.
// Service role bypasses RLS, so the NULL+tenant scoping is done explicitly here.
async function loadScopeConfig(
  tenantId: string,
  projectType: string,
): Promise<{ checklist: ChecklistRow[]; modules: ModuleRow[] }> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const [clRes, modRes] = await Promise.all([
    sb.from("scope_checklists")
      .select("tenant_id, project_type, field_key, question, field_type, options, money_risk_rank, adds_trades, active")
      .eq("project_type", projectType)
      .eq("active", true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`),
    sb.from("scope_modules")
      .select("tenant_id, module_key, label, trigger_phrases, adds_fields, adds_trades, active")
      .eq("active", true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`),
  ]);
  if (clRes.error) console.error("ai-estimator scope_checklists:", clRes.error.message);
  if (modRes.error) console.error("ai-estimator scope_modules:", modRes.error.message);
  return {
    checklist: (clRes.data ?? []) as ChecklistRow[],
    modules: (modRes.data ?? []) as ModuleRow[],
  };
}

// The AI's bounded job: extract which required fields the conversation already answered,
// and phrase the still-open ones conversationally. It does NOT decide completion (the
// edge fn recomputes openQuestions deterministically from the AI's answered set).
function buildInterviewSystemPrompt(fields: ScopeField[], projectType: string): string {
  const fieldLines = fields.map((f) => {
    const opts = Array.isArray(f.options) ? ` options:[${(f.options as string[]).join(", ")}]` : "";
    const tag = f.origin === "base" ? "" : ` (${f.origin})`;
    return `- ${f.field_key} [${f.field_type}${opts}]${tag} — ${f.question}`;
  }).join("\n");

  return `You are Aven — Avenstone's AI scope interviewer (KC, MO residential + light commercial). Never mention Claude or Anthropic.
You are GATHERING SCOPE for a ${projectType} remodel BEFORE any pricing. Do NOT discuss prices, rates, or totals.

You are given the REQUIRED SCOPE FIELDS (priority order, most important first) and the conversation so far. Each turn:
1. Read the whole conversation. Decide which REQUIRED SCOPE FIELDS are already answered by what the rep/homeowner said. Map free text onto a field's options when it is a choice. Only mark a field answered when the conversation actually gives that answer — never guess.
2. Write ONE short, friendly, conversational message asking ONLY the fields still unanswered, most important first. Group related questions naturally; do not interrogate one-by-one or restate answered fields. If nothing remains, give a one-line confirmation.

Output ONLY valid JSON — no prose, no markdown fences. Start with { and end with }:
{
  "answered": [{ "field_key": "<key>", "value": "<answer or chosen option>", "confidence": 0.0-1.0 }],
  "questions_message": "<conversational batched ask of the still-open fields, or a brief confirmation if none>",
  "all_answered": true | false
}

REQUIRED SCOPE FIELDS (priority order):
${fieldLines}`;
}

// One interview turn. Deterministic gate; AI does NL extraction + phrasing only.
async function handleScopeInterview(
  messages: Array<{ role: string; content: unknown }>,
  tenantId: string,
  rawProjectType: string | undefined,
): Promise<Response> {
  // The body project_type is the authoritative source. The frontend resolves it
  // (typed Rooms field → job_room_scopes → none) before sending; here we just
  // normalize (trim + lowercase) so a typed "Bathroom"/"BATHROOM " still matches the
  // lowercase seed — loadScopeConfig's .eq("project_type", ...) is case-sensitive.
  const projectType = typeof rawProjectType === "string" ? rawProjectType.trim().toLowerCase() : undefined;
  // No project type → nothing to ask → complete, so the frontend falls straight to pricing.
  if (!projectType) {
    return ok({ scope_complete: true, content: "", answers: [] });
  }

  const { checklist, modules } = await loadScopeConfig(tenantId, projectType);
  const baseFields = assembleChecklist(projectType, checklist);
  if (baseFields.length === 0) {
    // No seeded checklist for this project type — nothing to ask; price as today.
    console.log(`ai-estimator scope-interview: no checklist for '${projectType}' (tenant ${tenantId}) — completing.`);
    return ok({ scope_complete: true, content: "", answers: [] });
  }

  // Deterministic: fire modules from ALL rep text so far, build the full required set.
  const repText = messages
    .filter((m) => m.role === "user")
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? (m.content as Array<{ type?: string; text?: string }>)
              .filter((p) => p?.type === "text").map((p) => p.text ?? "").join(" ")
          : ""
    )
    .join("\n");
  const fired = detectTriggers(repText, modules);
  const requiredFields = collectRequiredFields(baseFields, fired);

  // AI: extract answered + phrase open (phrasing only — the completion gate is deterministic).
  const system = buildInterviewSystemPrompt(requiredFields, projectType);
  const aiRes = await callAnthropic(system, messages, 1500);
  if (aiRes.error) return fail(aiRes.error);

  let parsed: {
    answered?: Array<{ field_key: string; value: unknown; confidence?: number }>;
    questions_message?: string;
    all_answered?: boolean;
  };
  try {
    const raw = aiRes.text.trim();
    const jsonStr = raw.startsWith("{")
      ? raw
      : (raw.match(/```(?:json)?\s*([\s\S]+?)```/)?.[1]?.trim() ?? raw);
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error("ai-estimator scope-interview parse failed —", String(e), "| raw:", aiRes.text.slice(0, 300));
    // Don't hard-block the rep — let them proceed to pricing if the interview misfires.
    return ok({ scope_complete: true, content: "", answers: [], parse_error: true });
  }

  const answers = (parsed.answered ?? [])
    .filter((a) => a && typeof a.field_key === "string")
    .map((a) => makeAnswerRecord(a.field_key, a.value, typeof a.confidence === "number" ? a.confidence : 1));
  const answeredKeys = new Set(answers.map((a) => a.field_key));

  // Deterministic completion gate — NOT the AI's claim.
  const stillOpen = openQuestions(requiredFields, answeredKeys);
  const complete = stillOpen.length === 0;

  const content = complete
    ? "Got everything I need on scope — putting your estimate together now."
    : (parsed.questions_message?.trim() || "A few more scope details before I price this:");

  console.log(`ai-estimator scope-interview [${projectType}]: ${answers.length} answered, ${stillOpen.length} open, fired=[${fired.map((m) => m.module_key).join(",")}]`);

  return ok({
    scope_complete: complete,
    content,
    answers,
    open_field_keys: stillOpen.map((f) => f.field_key),
    fired_modules: fired.map((m) => m.module_key),
  });
}
// ── Vocabulary builder (injected per-request) ─────────────────────────────────

function buildVocabSection(rateBook: RateBook): string {
  const tradeMap = new Map<string, string[]>();
  for (const row of rateBook.laborRows) {
    if (!tradeMap.has(row.trade)) tradeMap.set(row.trade, []);
    tradeMap.get(row.trade)!.push(`${row.line_item}·${row.unit}`);
  }
  const laborVocab = [...tradeMap.entries()]
    .map(([trade, items]) => `${trade}: ${items.join(", ")}`)
    .join("\n");

  const matVocab = rateBook.materialRows.map((r) => `${r.category}·${r.unit}`).join(", ");

  return `LABOR VOCABULARY — category="labor" lines: use EXACT trade / line_item / unit:
${laborVocab}

MATERIAL VOCABULARY — category="materials" lines: set line_item = exact category name:
${matVocab}

GENERAL LINES — category="general": line_item ∈ { permit | floor_protection | cleanup | contingency_ls }
Always set regional_rate for general lines (your KC market estimate for that cost).`;
}

// ── Scope system prompt ───────────────────────────────────────────────────────

function buildScopeSystemPrompt(vocabSection: string, markupPct: number, pmFee: number, financialModel = "fixed_bid"): string {
  const pmFmtd = pmFee > 0
    ? `$${pmFee.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "$0";

  const companyLine =
    financialModel === "flip"
      ? "BILLING MODEL: Flip renovation. This job is reimbursed against receipts via draws by a lender or investor — profit is the ARV−cost-basis spread. There is NO markup and NO PM fee on a flip estimate. Your job is to capture the complete cost basis for the renovation. Do NOT mention markup, client pricing, or PM fees anywhere in your output."
      : financialModel === "cost_plus"
        ? `BILLING MODEL: Cost-plus. The owner has configured ${markupPct}% markup and ${pmFmtd} PM fee — these are applied by code and do NOT appear in your scope output. The rep sees these rates pre-filled and edits them only when this job differs. Do not ask about them.`
        : `BILLING MODEL: Fixed-bid. Markup (${markupPct}%) and PM fee (${pmFmtd}) are applied by code to produce the client price — do NOT include them in your scope output. The rep sees these rates pre-filled and edits them only when this job differs. Do not ask about them.`;

  return `You are Aven — Avenstone's AI estimator (KC, MO residential + light commercial). Never mention Claude or Anthropic.

YOUR ONLY JOB IS SCOPE. DO NOT INVENT OR OUTPUT PRICES. Pricing is applied by code after you respond.
Output ONLY valid JSON — no prose, no markdown fences, no text before or after. Start your response with { and end with }.

${companyLine}
TRANSPARENCY: Separate labor and material lines. Client-allowance items include "Allowance" in description.

TRADE ORDER (include only relevant trades):
DEMO/TEAROUT · FRAMING · INSULATION · DRYWALL · TILE & WATERPROOFING · FLOORING
PLUMBING · VANITY & FIXTURES · ELECTRICAL · HVAC · CABINETS & COUNTERTOPS
PAINT · ROOFING · SIDING/EXTERIOR · WINDOWS/DOORS · CONCRETE · GENERAL

WASTE — apply to quantities, show math in description:
Tile (floor or wall/shower): +15% | Drywall: +10% | LVP/hardwood: +12%
Trim/baseboard: +10% | Insulation batt: +8% | Framing lumber: +10%

BATHROOM RULES: use moisture_resistant (not hang/combined) for any wet-area drywall.

${vocabSection}

SCOPE JSON SCHEMA:
{
  "scope_summary": ["<client-facing bullet>", ...],  // up to 12 bullets, no prices
  "lines": [
    {
      "trade": "<exact trade string from LABOR VOCABULARY>",
      "line_item": "<exact line_item or material category>",
      "unit": "<SF|LF|EA|LS|sq|room|load>",
      "quantity": <number, waste-adjusted>,
      "description": "<specific, show waste math>",
      "category": "labor" | "materials" | "general",
      "regional_rate": <number|null>  // null for matched labor vocab; required for general + unmatched items
    }
  ],
  "flags": ["<missing info, assumptions, unknowns>"]
}

RULES:
- Labor vocab match → set regional_rate: null. EXACT trade/line_item/unit from vocabulary.
- Labor with no vocab match → closest match, set regional_rate to your KC estimate, add a flag.
- Materials → line_item = EXACT category from MATERIAL VOCABULARY.
- General → always set regional_rate to your KC market estimate.`;
}

// ── Extraction prompt (EXTRACT_JSON_FOR_PROPOSAL pass-through) ────────────────

const EXTRACT_SYSTEM_PROMPT = `You are Aven — Avenstone's AI. Read the estimate in the conversation and output ONLY valid JSON — no prose, no markdown.

Output exactly:
{
  "scope_summary": ["<client bullet>", ...],
  "line_items": [
    {
      "trade": "<trade section>",
      "description": "<item description>",
      "qty_label": "<quantity + unit>",
      "amount": <dollar number, no $ or commas>,
      "category": "labor" | "materials"
    }
  ],
  "flags": ["..."],
  "subtotal": <sum of all amounts, no markup>
}
Include ALL priced lines. amounts are plain numbers. subtotal = sum of line amounts only (not markup or PM fee).`;

// ── Material pricing ──────────────────────────────────────────────────────────

function priceMaterialLine(
  category: string,
  quantity: number,
  rateBook: RateBook,
  finishTier: FinishTier,
): { price: number | null; amount: number | null; tierLabel: string } {
  const row = rateBook.materialRows.find((r) => r.category === category);
  if (!row) return { price: null, amount: null, tierLabel: "?" };
  let minV: number | null, maxV: number | null, label: string;
  if (finishTier === "low") {
    minV = row.tier_low_min; maxV = row.tier_low_max; label = row.tier_low_label;
  } else if (finishTier === "high") {
    minV = row.tier_hi_min; maxV = row.tier_hi_max; label = row.tier_hi_label;
  } else {
    minV = row.tier_mid_min; maxV = row.tier_mid_max; label = row.tier_mid_label;
  }
  if (minV == null && maxV == null) return { price: null, amount: null, tierLabel: label };
  const price = (Number(minV ?? maxV) + Number(maxV ?? minV)) / 2;
  return { price, amount: Math.round(price * quantity * 100) / 100, tierLabel: label };
}

// ── Pricing orchestrator ──────────────────────────────────────────────────────

function priceScopeLines(
  lines: ScopeLine[],
  rateBook: RateBook,
  projectSf: number,
  finishTier: FinishTier,
): PricedLine[] {
  return lines.map((line): PricedLine => {
    // ── Labor ─────────────────────────────────────────────────────────────────
    if (line.category === "labor") {
      const result = resolveRate(
        { trade: line.trade, line_item: line.line_item, unit: line.unit, quantity: line.quantity, project_sf: projectSf },
        rateBook,
      );
      if (result.matched) {
        const vRow = rateBook.laborRows.find((r) => r.id === result.labor_row_id);
        return {
          ...line,
          unit_price: result.rate_point,
          amount: result.amount,
          source_label: "labor_rate",
          source_badge: vRow?.vetted ? "✓ Rate Book" : "○ Rate Book*",
          vetted: vRow?.vetted ?? false,
        };
      }
      // Gap: use AI-supplied regional_rate; carry gap_key for client batch-ask
      const rgRate = typeof line.regional_rate === "number" ? line.regional_rate : null;
      return {
        ...line,
        unit_price: rgRate,
        amount: rgRate != null ? Math.round(rgRate * line.quantity * 100) / 100 : null,
        source_label: "regional_avg",
        source_badge: "⚡ Regional Avg",
        vetted: false,
        gap_key: `${line.trade}::${line.line_item}::${line.unit}`,
      };
    }

    // ── Materials ──────────────────────────────────────────────────────────────
    if (line.category === "materials") {
      const { price, amount, tierLabel } = priceMaterialLine(line.line_item, line.quantity, rateBook, finishTier);
      if (price != null) {
        return {
          ...line,
          unit_price: price,
          amount,
          source_label: "material_tier",
          source_badge: `◈ Material (${tierLabel})`,
          vetted: false,
        };
      }
      // Material category not in Rate Book — use AI regional_rate; carry gap_key
      const rgRate = typeof line.regional_rate === "number" ? line.regional_rate : null;
      return {
        ...line,
        unit_price: rgRate,
        amount: rgRate != null ? Math.round(rgRate * line.quantity * 100) / 100 : null,
        source_label: "regional_avg",
        source_badge: "⚡ Regional Avg",
        vetted: false,
        gap_key: `${line.trade}::${line.line_item}::${line.unit}`,
      };
    }

    // ── General (permit, cleanup, floor_protection, contingency_ls) ────────────
    const rgRate = typeof line.regional_rate === "number" ? line.regional_rate : null;
    return {
      ...line,
      unit_price: rgRate,
      amount: rgRate != null ? Math.round(rgRate * line.quantity * 100) / 100 : null,
      source_label: "regional_avg",
      source_badge: "⚡ Regional Avg",
      vetted: false,
      gap_key: `${line.trade}::${line.line_item}::${line.unit}`,
    };
  });
}

// ── Estimate formatter ────────────────────────────────────────────────────────

function formatEstimate(
  scope: ScopeJSON,
  pricedLines: PricedLine[],
  projectSf: number,
  finishTier: FinishTier,
  markupPct: number,
  pmFeeVal: number,
  financialModel = "fixed_bid",
): string {
  const tier = getTier(projectSf);
  const tierLabel = {
    high: `HIGH (${projectSf} SF — ≤750 SF premium per-unit)`,
    mid: `MID (${projectSf} SF — 751–1,999 SF)`,
    low: `LOW (${projectSf} SF — 2,000+ SF volume)`,
  }[tier];
  const finishLabel = { low: "Budget", mid: "Mid-grade", high: "Premium" }[finishTier];

  // Group by trade, preserving line order
  const tradeOrder: string[] = [];
  const byTrade = new Map<string, PricedLine[]>();
  for (const line of pricedLines) {
    const key = line.trade || "General";
    if (!byTrade.has(key)) { byTrade.set(key, []); tradeOrder.push(key); }
    byTrade.get(key)!.push(line);
  }

  let laborTotal = 0, matTotal = 0, generalTotal = 0;
  const gapItems: string[] = [];
  let body = "";

  for (const trade of tradeOrder) {
    const lines = byTrade.get(trade)!;
    body += `\n**${trade.toUpperCase()}**\n`;
    for (const line of lines) {
      const amt = line.amount ?? 0;
      if (line.category === "labor") laborTotal += amt;
      else if (line.category === "materials") matTotal += amt;
      else generalTotal += amt;
      if (line.source_label === "regional_avg") gapItems.push(line.line_item);

      const fixedUnit = ["EA", "LS", "room", "load", "sq"].includes(line.unit);
      const rateStr = line.unit_price != null
        ? (fixedUnit ? fmtMoney(line.unit_price) : `${fmtMoney(line.unit_price)}/${line.unit}`)
        : "TBD";

      body += `- ${line.description} | ${line.quantity} ${line.unit} | ${rateStr} | **${fmtMoney(line.amount)}** | ${line.source_badge}\n`;
    }
  }

  const subtotal = laborTotal + matTotal + generalTotal;
  const markup = Math.round(subtotal * (markupPct / 100));
  const pmFee = Math.round(pmFeeVal);
  const total = subtotal + markup + pmFee;

  // State-and-proceed preamble: model-aware — flip suppresses markup/PM-fee framing.
  const preamble = financialModel === "flip"
    ? `_Flip renovation — estimating cost basis only. No markup or PM fee applied._\n\n`
    : `_Running at **${markupPct}%** markup · **${fmtMoney(pmFeeVal)}** PM fee — edit the fields above if this job's different._\n\n`;

  // Summary footer: flip shows cost basis only; cost_plus/fixed_bid show markup breakdown.
  const summaryFooter = financialModel === "flip"
    ? `Labor: ${fmtMoney(laborTotal)} · Materials: ${fmtMoney(matTotal)} · General: ${fmtMoney(generalTotal)}\n**TOTAL COST BASIS: ${fmtMoney(subtotal)}**`
    : `Labor: ${fmtMoney(laborTotal)} · Materials: ${fmtMoney(matTotal)} · General: ${fmtMoney(generalTotal)}\n**Subtotal: ${fmtMoney(subtotal)}**\nMarkup (${markupPct}%): ${fmtMoney(markup)}\nProject Management: ${fmtMoney(pmFee)}\n**TOTAL: ${fmtMoney(total)}**`;

  let out = preamble + `**Pricing Tier: ${tierLabel}** · Finish: **${finishLabel}**\n${body}
---
${summaryFooter}`;

  if (gapItems.length > 0) {
    out += `\n\n> ⚡ **Regional Avg** lines (not from Rate Book): ${[...new Set(gapItems)].join(", ")}. Add to Rate Book to vet.`;
  }
  if (pricedLines.some((l) => l.source_label === "labor_rate" && !l.vetted)) {
    out += "\n> ○ **Rate Book*** = seeded rate, not yet vetted by Kalin. Review in Rate Book → Labor Rates.";
  }
  if (scope.flags.length > 0) {
    out += `\n\n**Flags:** ${scope.flags.join(" · ")}`;
  }
  return out;
}

// ── Anthropic call helper ─────────────────────────────────────────────────────

async function callAnthropic(
  system: string,
  messages: Array<{ role: string; content: unknown }>,
  maxTokens: number,
): Promise<{ text: string; truncated: boolean; error?: string }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages }),
  });
  const data = await res.json();
  if (!res.ok) return { text: "", truncated: false, error: data.error?.message ?? "AI error" };
  if (data.stop_reason === "max_tokens") {
    console.error("ai-estimator truncated:", data.usage);
  }
  return { text: data.content?.[0]?.text ?? "", truncated: data.stop_reason === "max_tokens" };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { messages, tenant_id, project_sf, finish_tier, markup_pct, pm_fee, financial_model, mode, project_type } = await req.json();
    if (!messages?.length) return fail("no messages", 400);
    if (!tenant_id) return fail("tenant_id required", 400);

    // ── Scope-interview mode (SCOPE_CAPTURE_ENGINE P1B) — strictly UPSTREAM of pricing.
    // Asks the checklist questions until scope is complete; never prices here. The pricing
    // path below is untouched: when complete, the frontend re-POSTs without mode and the
    // existing scope->price->priced_scope contract runs over the confirmed conversation.
    if (mode === "scope_interview") {
      return await handleScopeInterview(messages, tenant_id, project_type);
    }

    const rateBook = await loadRateBook(tenant_id);

    // ── EXTRACT_JSON_FOR_PROPOSAL: pass through to AI to extract from formatted markdown ──
    const lastMsg = messages[messages.length - 1];
    const isExtract =
      typeof lastMsg?.content === "string" &&
      lastMsg.content.trim() === "EXTRACT_JSON_FOR_PROPOSAL";

    if (isExtract) {
      const result = await callAnthropic(EXTRACT_SYSTEM_PROMPT, messages, 6000);
      if (result.error) return fail(result.error);
      return ok({ content: result.text, ...(result.truncated ? { truncated: true } : {}) });
    }

    // ── Fail-loud: Rate Book must be populated for scope calls ─────────────────
    if (!rateBook.laborRows.length) {
      console.error("ai-estimator: Rate Book empty for tenant", tenant_id);
      return fail(
        "Rate Book not available for this tenant — cannot generate a priced estimate. Verify rate_book_labor rows exist and are active.",
        503,
      );
    }

    // ── Fail-loud: bid_model_config 'default' row required (B1.6) ─────────────
    // Silent fallback to 30/1200 is explicitly rejected — if the row is missing
    // the owner must configure it before the estimator can run.
    const bidConfig = await loadBidModelConfig(tenant_id);
    if (!bidConfig) {
      console.error("ai-estimator: bid_model_config 'default' row missing for tenant", tenant_id);
      return fail(
        "Markup configuration not available for this tenant — add a 'default' row to bid_model_config before generating estimates.",
        503,
      );
    }

    const finishTier: FinishTier = ["low", "mid", "high"].includes(finish_tier)
      ? (finish_tier as FinishTier)
      : "mid";

    // Fail-loud: SF required — the engine cannot price SF/LF lines without it.
    if (typeof project_sf !== "number" || project_sf <= 0) {
      return fail("project_sf required (> 0) to price SF/LF lines — enter the project square footage", 400);
    }
    const projectSf = project_sf;

    // Resolve financial model — default to 'fixed_bid' (column default) if absent.
    const financialModel: string =
      financial_model === "flip" || financial_model === "cost_plus" || financial_model === "fixed_bid"
        ? financial_model
        : "fixed_bid";

    // B1.6: markup_pct and pm_fee from body params if provided (rep override),
    // else use bid_model_config tenant default. No silent fallback to hardcoded values.
    let markupPct = typeof markup_pct === "number" && markup_pct >= 0 ? markup_pct : bidConfig.markup_pct;
    let pmFeeVal  = typeof pm_fee    === "number" && pm_fee    >= 0 ? pm_fee    : bidConfig.pm_fee;

    // Flip renovation: profit is ARV−cost_basis spread — no markup or PM fee.
    // Force both to 0 regardless of what the frontend sends (bid_model_config
    // holds the cost-plus default; a flip job must never apply it).
    if (financialModel === "flip") { markupPct = 0; pmFeeVal = 0; }

    // ── Scope call ─────────────────────────────────────────────────────────────
    const vocabSection = buildVocabSection(rateBook);
    const scopeSystem = buildScopeSystemPrompt(vocabSection, markupPct, pmFeeVal, financialModel);

    const scopeResult = await callAnthropic(scopeSystem, messages, 4000);
    if (scopeResult.error) return fail(scopeResult.error);

    // Parse scope JSON — strip markdown fences if AI added them despite instructions
    let scope: ScopeJSON;
    try {
      const raw = scopeResult.text.trim();
      const jsonStr = raw.startsWith("{")
        ? raw
        : (raw.match(/```(?:json)?\s*([\s\S]+?)```/)?.[1]?.trim() ?? raw);
      scope = JSON.parse(jsonStr);
      if (!Array.isArray(scope.lines)) throw new Error("missing lines array");
    } catch (e) {
      console.error("ai-estimator: scope JSON parse failed —", String(e), "| raw:", scopeResult.text.slice(0, 400));
      // Graceful fallback: return raw text rather than a blank error
      return ok({ content: scopeResult.text, parse_error: true });
    }

    // Price and format
    const pricedLines = priceScopeLines(scope.lines, rateBook, projectSf, finishTier);
    const content = formatEstimate(scope, pricedLines, projectSf, finishTier, markupPct, pmFeeVal, financialModel);

    // 3c: include priced_scope so EstimateTab can commit with exact source_labels
    // without a second AI EXTRACT_JSON_FOR_PROPOSAL round-trip.
    return ok({ content, priced_scope: pricedLines, ...(scopeResult.truncated ? { truncated: true } : {}) });
  } catch (e) {
    console.error("ai-estimator error:", e);
    return fail(String(e));
  }
});



