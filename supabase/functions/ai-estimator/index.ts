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
  source_label: "labor_rate" | "material_tier" | "regional_avg";
  source_badge: string;
  vetted: boolean;
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

function buildScopeSystemPrompt(vocabSection: string): string {
  return `You are Aven — Avenstone's AI estimator (KC, MO residential + light commercial). Never mention Claude or Anthropic.

YOUR ONLY JOB IS SCOPE. DO NOT INVENT OR OUTPUT PRICES. Pricing is applied by code after you respond.
Output ONLY valid JSON — no prose, no markdown fences, no text before or after. Start your response with { and end with }.

COMPANY: Cost-plus model. Markup (30%) and PM fee ($1,200) are added by code — do not include.
TRANSPARENCY: Separate labor and material lines. Client-allowance items include "Allowance" in description.

TRADE ORDER (include only relevant trades):
DEMO/TEAROUT · FRAMING · INSULATION · DRYWALL · TILE & WATERPROOFING · FLOORING
PLUMBING · VANITY & FIXTURES · ELECTRICAL · HVAC · CABINETS & COUNTERTOPS
PAINT · ROOFING · SIDING/EXTERIOR · WINDOWS/DOORS · CONCRETE · GENERAL

WASTE — apply to quantities, show math in description:
Tile (floor or wall/shower): +15% | Drywall: +10% | LVP/hardwood: +12%
Trim/baseboard: +10% | Insulation batt: +8% | Framing lumber: +10%

BATHROOM RULES: use moisture_resistant (not hang/combined) for any wet-area drywall.
If shower has tiled floor: include schluter_membrane (SF) + shower_pan_mudbed (LS).

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
      // Gap: use AI-supplied regional_rate
      const rgRate = typeof line.regional_rate === "number" ? line.regional_rate : null;
      return {
        ...line,
        unit_price: rgRate,
        amount: rgRate != null ? Math.round(rgRate * line.quantity * 100) / 100 : null,
        source_label: "regional_avg",
        source_badge: "⚡ Regional Avg",
        vetted: false,
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
      // Material category not in Rate Book — use AI regional_rate
      const rgRate = typeof line.regional_rate === "number" ? line.regional_rate : null;
      return {
        ...line,
        unit_price: rgRate,
        amount: rgRate != null ? Math.round(rgRate * line.quantity * 100) / 100 : null,
        source_label: "regional_avg",
        source_badge: "⚡ Regional Avg",
        vetted: false,
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
    };
  });
}

// ── Estimate formatter ────────────────────────────────────────────────────────

function formatEstimate(
  scope: ScopeJSON,
  pricedLines: PricedLine[],
  projectSf: number,
  finishTier: FinishTier,
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
  const markup = Math.round(subtotal * 0.30);
  const pmFee = 1200;
  const total = subtotal + markup + pmFee;

  let out = `**Pricing Tier: ${tierLabel}** · Finish: **${finishLabel}**\n${body}
---
Labor: ${fmtMoney(laborTotal)} · Materials: ${fmtMoney(matTotal)} · General: ${fmtMoney(generalTotal)}
**Subtotal: ${fmtMoney(subtotal)}**
Markup (30%): ${fmtMoney(markup)}
Project Management: ${fmtMoney(pmFee)}
**TOTAL: ${fmtMoney(total)}**`;

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
    const { messages, tenant_id, project_sf, finish_tier } = await req.json();
    if (!messages?.length) return fail("no messages", 400);
    if (!tenant_id) return fail("tenant_id required", 400);

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

    const finishTier: FinishTier = ["low", "mid", "high"].includes(finish_tier)
      ? (finish_tier as FinishTier)
      : "mid";
    const projectSf = typeof project_sf === "number" && project_sf > 0 ? project_sf : 0;

    // ── Scope call ─────────────────────────────────────────────────────────────
    const vocabSection = buildVocabSection(rateBook);
    const scopeSystem = buildScopeSystemPrompt(vocabSection);

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
    const content = formatEstimate(scope, pricedLines, projectSf, finishTier);

    // 3c: include priced_scope so EstimateTab can commit with exact source_labels
    // without a second AI EXTRACT_JSON_FOR_PROPOSAL round-trip.
    return ok({ content, priced_scope: pricedLines, ...(scopeResult.truncated ? { truncated: true } : {}) });
  } catch (e) {
    console.error("ai-estimator error:", e);
    return fail(String(e));
  }
});
