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
  type AnswerRecord,
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
  anchor_source?: string | null; // S5A: ai_knowledge category the regional_rate was cited from (null = uncited/blank ask)
}

interface ScopeJSON {
  scope_summary: string[];
  lines: ScopeLine[];
  flags: string[];
}

interface PricedLine extends ScopeLine {
  unit_price: number | null;
  amount: number | null;
  source_label: "labor_rate" | "material_tier" | "regional_avg" | "user_entered" | "client_supplied";
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

interface BidModelConfig { markup_pct: number; pm_fee: number; supply_model: string; allowance: boolean; }

async function loadBidModelConfig(tenantId: string): Promise<BidModelConfig | null> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await sb
    .from("bid_model_config")
    .select("markup_pct, pm_fee, supply_model, allowance")
    .eq("tenant_id", tenantId)
    .eq("category", "default")
    .maybeSingle();
  if (error) {
    console.error("ai-estimator bid_model_config:", error.message);
    return null;
  }
  if (!data) return null;
  // supply_model: 'contractor' (we supply) vs client/owner-supplied. allowance: bill
  // materials as client allowances. Both default safe if a column is somehow absent.
  return {
    markup_pct: Number(data.markup_pct),
    pm_fee: Number(data.pm_fee),
    supply_model: typeof data.supply_model === "string" ? data.supply_model : "contractor",
    allowance: data.allowance === true,
  };
}

// ── KC regional pricing reference loader (S5A — Path A anchor grounding) ───────
// Grounds the model's regional_rate for gap lines in the tenant's ai_knowledge KC
// pricing prose (labor_rates + pricing_* categories).
//
// DELIBERATELY reads these rows regardless of the `active` flag (decision 2026-07-10).
// `active` is the owner's CLIENT-FACING toggle — it governs whether other AI surfaces
// (ai-companion, ai-master-agent, etc.) inject a knowledge row. The estimator's pricing
// grounding is internal math, not client-facing knowledge injection, so it uses the
// pricing prose even when toggled off elsewhere. Blast radius: estimator only; other
// consumers still filter `.eq('active', true)` and are unaffected.
//
// Token sanity: the full set is ~12KB (~3.1k tokens) across ~15 categories — small
// enough to inject wholesale; no per-trade filtering needed at this size.
async function loadPricingReference(tenantId: string): Promise<string> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await sb
    .from("ai_knowledge")
    .select("category, content")
    .eq("tenant_id", tenantId)
    .or("category.eq.labor_rates,category.like.pricing_%")
    .order("category");
  if (error) {
    console.error("ai-estimator ai_knowledge pricing ref:", error.message);
    return "";
  }
  const rows = (data ?? []) as { category: string; content: string }[];
  if (!rows.length) return "";
  const blocks = rows.map((r) => `### ${r.category}\n${(r.content || "").trim()}`).join("\n\n");
  console.log(`ai-estimator [S5A]: injected ${rows.length} pricing-reference categories (tenant: ${tenantId})`);
  return blocks;
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
function buildInterviewSystemPrompt(fields: ScopeField[], projectType: string, preAnswered: AnswerRecord[], clientPrefs: Array<{ field_key: string; value: unknown }> = []): string {
  const fieldLines = fields.map((f) => {
    const opts = Array.isArray(f.options) ? ` options:[${(f.options as string[]).join(", ")}]` : "";
    const tag = f.origin === "base" ? "" : ` (${f.origin})`;
    return `- ${f.field_key} [${f.field_type}${opts}]${tag} — ${f.question}`;
  }).join("\n");

  // Fields already answered — from the on-site consultation (SCE P2) OR read back from the
  // persisted store on interview resume (SCE Phase B). The deterministic gate already treats
  // these as answered; telling the model keeps it from re-asking them (it may confirm or
  // reference them instead).
  const preLines = preAnswered.length
    ? preAnswered.map((a) => `- ${a.field_key} = ${String(a.value)}`).join("\n")
    : "(none)";

  // SCE Phase C2: the homeowner's portal soft-picks. CONTEXT ONLY — these are NOT in the
  // answered set (the deterministic gate still lists them as open), so the rep drives; the AI
  // may reference them to confirm but must still ask.
  const prefLines = clientPrefs.length
    ? clientPrefs.map((p) => `- ${p.field_key} = ${String(p.value)}`).join("\n")
    : "(none)";

  return `You are Aven — Avenstone's AI scope interviewer (KC, MO residential + light commercial). Never mention Claude or Anthropic.
You are GATHERING SCOPE for a ${projectType} remodel BEFORE any pricing. Do NOT discuss prices, rates, or totals.

You are given the REQUIRED SCOPE FIELDS (priority order, most important first), any fields ALREADY CAPTURED on-site, and the conversation so far. Each turn:
1. Read the whole conversation. Decide which REQUIRED SCOPE FIELDS are already answered by what the rep/homeowner said. Map free text onto a field's options when it is a choice. Only mark a field answered when the conversation actually gives that answer — never guess.
2. Treat every field under ALREADY ANSWERED as known — do NOT ask about it again. You may acknowledge or reference it briefly (e.g. "you picked curbless earlier"), but never re-interrogate it.
3. Write ONE short, friendly, conversational message asking ONLY the fields still unanswered, most important first. Group related questions naturally; do not interrogate one-by-one or restate answered fields. If nothing remains, give a one-line confirmation.

Output ONLY valid JSON — no prose, no markdown fences. Start with { and end with }:
{
  "answered": [{ "field_key": "<key>", "value": "<answer or chosen option>", "confidence": 0.0-1.0 }],
  "questions_message": "<conversational batched ask of the still-open fields, or a brief confirmation if none>",
  "all_answered": true | false
}

ALREADY ANSWERED (do NOT ask again — you may reference these):
${preLines}

CLIENT PREFERENCES (the homeowner soft-picked these in their portal — NOT locked answers; you MAY
reference them to confirm, e.g. "the homeowner leaned toward frameless glass — keep that?", but
STILL ask these as open scope questions and do NOT treat them as answered — the rep decides):
${prefLines}

REQUIRED SCOPE FIELDS (priority order):
${fieldLines}`;
}

// SCOPE_TO_ESTIMATE Phase A — map the internal AnswerRecord[] to the persisted
// job_scope_answers shape the frontend upserts. Pure; no persistence here.
// - option_key: for a choice field, the option matching the value (space/underscore-
//   insensitive); null for free-text/number fields.
// - source: AnswerRecord.source → job_scope_answers.source vocab. 'typed' → 'rep_typed'
//   (rep conversation; ScopeOptionCards picks arrive as chat text and are indistinguishable
//   from typed here, so they fold into rep_typed — see Phase A report). 'measured' stays.
//   photo/plan/assumed → 'extracted'.
// - trade: null in Phase A. ScopeField carries no adds_trades, so per-answer trade
//   derivation is Phase D's job. room_id is stamped frontend-side (Phase A default room).
interface ScopeAnswerOut {
  field_key: string;
  option_key: string | null;
  value: string;
  trade: string | null;
  source: "rep_typed" | "rep_card" | "measured" | "extracted" | "client_selected";
}

function mapAnswerSource(s: AnswerRecord["source"]): ScopeAnswerOut["source"] {
  if (s === "measured") return "measured";
  if (s === "client") return "client_selected";  // C2 carrier
  if (s === "card") return "rep_card";            // C2 carrier
  if (s === "photo" || s === "plan" || s === "assumed") return "extracted";
  return "rep_typed";
}

// SCOPE_TO_ESTIMATE Phase B — inverse of mapAnswerSource, for stored answers fed back into the
// interview via prefilled_answers. Maps the job_scope_answers db source vocab → AnswerRecord
// source so a stored answer round-trips to the SAME db source through toScopeAnswerPayload
// (measured→measured, rep_typed→typed→rep_typed, extracted→assumed→extracted) instead of being
// blanket-relabeled 'measured'. NOTE: rep_card/client_selected have no distinct AnswerRecord
// carrier (→ typed / measured); neither exists in the store during Phase A/B (card picks persist
// as rep_typed; client_selected is Phase C) — revisit here if Phase C introduces them.
function dbSourceToRecord(s: unknown): AnswerRecord["source"] {
  switch (s) {
    case "rep_typed":       return "typed";
    case "rep_card":        return "card";    // C2 carrier (was 'typed' — now bijective)
    case "client_selected": return "client";  // C2 carrier — client picks survive round-trip
    case "extracted":       return "assumed";
    case "measured":        return "measured";
    default:                return "measured";
  }
}

// Match key ignoring case and space/underscore differences ("Curbless Shower" ≡ "curbless_shower").
function normOptKey(s: unknown): string {
  return (s ?? "").toString().toLowerCase().replace(/[\s_]+/g, "").trim();
}

function toScopeAnswerPayload(answers: AnswerRecord[], fields: ScopeField[]): ScopeAnswerOut[] {
  const byKey = new Map<string, ScopeField>();
  for (const f of fields) byKey.set(f.field_key.toLowerCase(), f);
  return answers.map((a) => {
    const field = byKey.get(a.field_key.toLowerCase());
    const valStr = a.value == null ? "" : String(a.value);
    let optionKey: string | null = null;
    if (field && field.field_type === "choice" && Array.isArray(field.options)) {
      const match = (field.options as unknown[]).find((o) => normOptKey(o) === normOptKey(valStr));
      optionKey = match != null ? String(match) : null;
    }
    return { field_key: a.field_key, option_key: optionKey, value: valStr, trade: null, source: mapAnswerSource(a.source) };
  });
}

// One interview turn. Deterministic gate; AI does NL extraction + phrasing only.
async function handleScopeInterview(
  messages: Array<{ role: string; content: unknown }>,
  tenantId: string,
  rawProjectType: string | undefined,
  prefilledAnswers?: Record<string, unknown>,
  clientPrefs?: Array<{ field_key: string; value: unknown }>,
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
  // SCOPE_TO_ESTIMATE Phase A — re-trigger pass. detectTriggers historically saw only rep
  // chat text, so on-site/measured answers (prefilled_answers, never typed into chat) could
  // not fire trigger modules — the audit's Q3 gap. Widen the trigger input to the UNION of
  // rep text + prefilled answer values + their humanized labels. Card picks and AI-extracted
  // answers already reach detectTriggers via rep chat text; this adds the session-captured
  // ones. detectTriggers stays pure — same function, wider input.
  const prefillTriggerText = prefilledAnswers && typeof prefilledAnswers === "object"
    ? Object.entries(prefilledAnswers)
        .flatMap(([k, raw]) => { const v = raw != null && typeof raw === "object" ? (raw as { value?: unknown }).value : raw; const s = String(v ?? ""); return [k, s, s.replace(/_/g, " ")]; })
        .join("\n")
    : "";
  const triggerText = [repText, prefillTriggerText].filter(Boolean).join("\n");
  const fired = detectTriggers(triggerText, modules);
  const requiredFields = collectRequiredFields(baseFields, fired);

  // SCOPE_CAPTURE_ENGINE P2: fold session pre-answers (from the on-site consultation)
  // into the answered set BEFORE the AI turn. Only keys matching a real required field
  // count — free-form measurement keys are ignored. These are 'measured'-sourced and
  // let the interview skip whatever the site visit already captured.
  const requiredKeys = new Set(requiredFields.map((f) => f.field_key.toLowerCase()));
  // Phase B: prefilled_answers entries may be a scalar (legacy session field → 'measured') or
  // { value, source } where source is the job_scope_answers db vocab. Preserve the source by
  // mapping db source → AnswerRecord source (dbSourceToRecord) so it round-trips unchanged
  // rather than being blanket-relabeled 'measured'.
  const sessionAnswers: AnswerRecord[] =
    prefilledAnswers && typeof prefilledAnswers === "object"
      ? Object.entries(prefilledAnswers)
          .map(([k, raw]) => {
            const isObj = raw != null && typeof raw === "object";
            const value = isObj ? (raw as { value?: unknown }).value : raw;
            const dbSrc = isObj ? (raw as { source?: unknown }).source : "measured";
            return { k, value, src: dbSourceToRecord(dbSrc) };
          })
          .filter((e) => requiredKeys.has(String(e.k).toLowerCase()) && e.value != null && String(e.value).trim() !== "")
          .map((e) => makeAnswerRecord(e.k, e.value, 0.9, e.src))
      : [];
  const sessionKeys = new Set(sessionAnswers.map((a) => a.field_key));

  // If the session already answered every required field, complete without an AI call
  // (saves a Sonnet turn) — the rep drafted from a fully-captured site visit.
  if (sessionKeys.size > 0 && openQuestions(requiredFields, sessionKeys).length === 0) {
    console.log(`ai-estimator scope-interview [${projectType}]: complete from ${sessionAnswers.length} session pre-answers — no AI call`);
    return ok({
      scope_complete: true,
      content: "Got your scope from the on-site session — putting your estimate together now.",
      answers: toScopeAnswerPayload(sessionAnswers, requiredFields),
      open_field_keys: [],
      fired_modules: fired.map((m) => m.module_key),
    });
  }

  // AI: extract answered + phrase open (phrasing only — the completion gate is deterministic).
  const system = buildInterviewSystemPrompt(requiredFields, projectType, sessionAnswers, clientPrefs || []);
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

  const aiAnswers = (parsed.answered ?? [])
    .filter((a) => a && typeof a.field_key === "string")
    .map((a) => makeAnswerRecord(a.field_key, a.value, typeof a.confidence === "number" ? a.confidence : 1));
  // Merge session pre-answers with the AI's conversation extraction; the live
  // conversation wins on a shared key (the rep may have changed it on the phone).
  const mergedByKey = new Map<string, AnswerRecord>();
  for (const a of sessionAnswers) mergedByKey.set(a.field_key.toLowerCase(), a);
  for (const a of aiAnswers) mergedByKey.set(a.field_key.toLowerCase(), a);
  const answers = [...mergedByKey.values()];
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
    answers: toScopeAnswerPayload(answers, requiredFields),
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

function buildScopeSystemPrompt(vocabSection: string, markupPct: number, pmFee: number, financialModel = "fixed_bid", supplyModel = "contractor", allowance = false, pricingReference = ""): string {
  const pmFmtd = pmFee > 0
    ? `$${pmFee.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "$0";

  // S5A anchor grounding: a fenced KC pricing reference block + directives. When present,
  // any regional_rate the model sets MUST come from this reference and cite its category
  // in anchor_source; uncovered lines get regional_rate:null + anchor_source:null (blank ask).
  const referenceBlock = pricingReference
    ? `\n=== KC REGIONAL PRICING REFERENCE (Avenstone, Kansas City) ===
This is Avenstone's own KC market pricing. Use it as the ONLY source for regional_rate on any
line NOT matched to the Rate Book vocabulary. Each block is headed by its category name.
${pricingReference}
=== END KC REGIONAL PRICING REFERENCE ===\n`
    : "";

  const anchorRules = pricingReference
    ? `
ANCHOR GROUNDING (regional_rate provenance — strict):
- When you set regional_rate on a gap or general line, that number MUST fall within a range in
  the KC REGIONAL PRICING REFERENCE above, and you MUST set "anchor_source" to the exact category
  header you drew it from (e.g. "pricing_tile", "labor_rates").
- If the reference does NOT cover a line's trade/work, set regional_rate: null AND anchor_source: null
  — a blank ask the rep will fill. NEVER invent a rate that isn't in the reference. NEVER cite a
  category that does not contain the number you used.
- Matched Rate Book labor vocab lines: regional_rate: null, anchor_source: null (code prices them).`
    : "";

  // S6: reserve the word "Allowance" — the frontend routes lines to the Allowances section on
  // that word, so the model must not spoof it outside the config-driven allowance mode.
  const reserveAllowance = allowance
    ? ""
    : `\nRESERVED WORD: Do NOT use the word "Allowance" anywhere in a line description — it is reserved for a billing mode not active on this job.`;

  // Material supply directive. Precedence: client/owner-supplied WINS over allowance —
  // if the client buys the materials there is no allowance to bill. Prompt is the hint;
  // priceScopeLines is the guard (it zeroes client-supplied lines regardless of the model).
  const materialSupplyLine =
    supplyModel !== "contractor"
      ? `MATERIAL SUPPLY: The CLIENT/OWNER supplies ALL materials on this job. STILL LIST every material line (scope completeness — the client must see what they're buying), but do NOT price them: add "(client-supplied)" to each material line description. Code sets them to $0 and excludes them from totals. Labor lines are unaffected. (This overrides any allowance behavior.)`
      : allowance
        ? `MATERIAL SUPPLY: Materials are billed as CLIENT ALLOWANCES. Include the word "Allowance" in every material line description — the allowance amount is the normal material price. Labor lines are unaffected.`
        : `MATERIAL SUPPLY: Contractor supplies materials (standard). Price material lines normally.`;

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
${materialSupplyLine}${reserveAllowance}
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
${referenceBlock}
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
      "regional_rate": <number|null>,  // null for matched labor vocab AND for uncited gaps; a cited KC-reference number otherwise
      "anchor_source": <string|null>   // the KC REGIONAL PRICING REFERENCE category cited (e.g. "pricing_tile"); null when uncited/matched
    }
  ],
  "flags": ["<missing info, assumptions, unknowns>"]
}

RULES:
- Labor vocab match → regional_rate: null, anchor_source: null. EXACT trade/line_item/unit from vocabulary.
- Labor with no vocab match → closest match; if the KC reference covers it, cite it (regional_rate from the range + anchor_source); else regional_rate: null + anchor_source: null. Add a flag.
- Materials → line_item = EXACT category from MATERIAL VOCABULARY.
- General → cite the KC reference if it covers the item (regional_rate + anchor_source); else regional_rate: null + anchor_source: null.${anchorRules}`;
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

// S6: build a gap (regional_avg) priced line. CODE IS THE GUARD — the price is applied
// from regional_rate ONLY when the model cited an anchor_source; an uncited gap is forced
// to a blank ask (null price/amount) so the model can never emit a final, vetted-looking
// number without provenance. Badge distinguishes cited (⚡ KC Avg) vs no-anchor (⚠) for the rep.
function buildGapLine(line: ScopeLine): PricedLine {
  const anchorSrc = typeof line.anchor_source === "string" && line.anchor_source.trim()
    ? line.anchor_source.trim()
    : null;
  const rgRate = anchorSrc && typeof line.regional_rate === "number" ? line.regional_rate : null;
  return {
    ...line,
    unit_price: rgRate,
    amount: rgRate != null ? Math.round(rgRate * line.quantity * 100) / 100 : null,
    source_label: "regional_avg",
    source_badge: anchorSrc ? "⚡ KC Avg (cited)" : "⚠ No Anchor — rep must enter",
    vetted: false,
    anchor_source: anchorSrc,
    gap_key: `${line.trade}::${line.line_item}::${line.unit}`,
  };
}

// ── Pricing orchestrator ──────────────────────────────────────────────────────

function priceScopeLines(
  lines: ScopeLine[],
  rateBook: RateBook,
  projectSf: number,
  finishTier: FinishTier,
  supplyModel = "contractor",
  allowance = false,
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
      // Gap: cited KC anchor → priced from regional_rate; uncited → blank ask (buildGapLine).
      return buildGapLine(line);
    }

    // ── Materials ──────────────────────────────────────────────────────────────
    if (line.category === "materials") {
      // Precedence: client/owner-supplied WINS over allowance. When the client buys the
      // materials, list the line for scope completeness but zero it and exclude from totals
      // (amount 0 contributes 0). Code is the guard — enforced regardless of what the AI priced.
      if (supplyModel !== "contractor") {
        const desc = /client-supplied/i.test(line.description)
          ? line.description
          : `${line.description} (client-supplied)`;
        return {
          ...line,
          description: desc,
          unit_price: 0,
          amount: 0,
          source_label: "client_supplied",
          source_badge: "🛒 Client-Supplied",
          vetted: false,
        };
      }

      // Allowance mode: keep normal material pricing but mark the line so it renders in the
      // Allowances section (frontend classifies on the word "Allowance" in the description).
      const withAllowanceTag = (d: string) =>
        allowance && !/allowance/i.test(d) ? `${d} (Allowance)` : d;

      const { price, amount, tierLabel } = priceMaterialLine(line.line_item, line.quantity, rateBook, finishTier);
      if (price != null) {
        return {
          ...line,
          description: withAllowanceTag(line.description),
          unit_price: price,
          amount,
          source_label: "material_tier",
          source_badge: allowance ? `◈ Allowance (${tierLabel})` : `◈ Material (${tierLabel})`,
          vetted: false,
        };
      }
      // Material category not in Rate Book — cited KC anchor priced; uncited → blank ask.
      return buildGapLine({ ...line, description: withAllowanceTag(line.description) });
    }

    // ── General (permit, cleanup, floor_protection, contingency_ls) ────────────
    return buildGapLine(line);
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
  const citedItems: string[] = [];   // gap lines grounded in a KC anchor
  const noAnchorItems: string[] = []; // gap lines with no reference coverage — rep must enter
  let body = "";

  for (const trade of tradeOrder) {
    const lines = byTrade.get(trade)!;
    body += `\n**${trade.toUpperCase()}**\n`;
    for (const line of lines) {
      const amt = line.amount ?? 0;
      if (line.category === "labor") laborTotal += amt;
      else if (line.category === "materials") matTotal += amt;
      else generalTotal += amt;
      if (line.source_label === "regional_avg") {
        (line.anchor_source ? citedItems : noAnchorItems).push(line.line_item);
      }

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

  if (citedItems.length > 0) {
    out += `\n\n> ⚡ **KC Avg (cited)** — grounded in Avenstone's KC pricing reference, not yet in the Rate Book: ${[...new Set(citedItems)].join(", ")}. Confirm or override, then add to the Rate Book to vet.`;
  }
  if (noAnchorItems.length > 0) {
    out += `\n\n> ⚠ **No Anchor — rep must enter**: ${[...new Set(noAnchorItems)].join(", ")}. No KC reference covers these, so no rate was assumed — enter one before committing.`;
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
    const { messages, tenant_id, project_sf, finish_tier, markup_pct, pm_fee, financial_model, mode, project_type, prefilled_answers, client_prefs } = await req.json();
    if (!messages?.length) return fail("no messages", 400);
    if (!tenant_id) return fail("tenant_id required", 400);

    // ── Scope-interview mode (SCOPE_CAPTURE_ENGINE P1B) — strictly UPSTREAM of pricing.
    // Asks the checklist questions until scope is complete; never prices here. The pricing
    // path below is untouched: when complete, the frontend re-POSTs without mode and the
    // existing scope->price->priced_scope contract runs over the confirmed conversation.
    if (mode === "scope_interview") {
      return await handleScopeInterview(messages, tenant_id, project_type, prefilled_answers, client_prefs);
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
    const pricingReference = await loadPricingReference(tenant_id); // S5A anchor grounding
    const scopeSystem = buildScopeSystemPrompt(vocabSection, markupPct, pmFeeVal, financialModel, bidConfig.supply_model, bidConfig.allowance, pricingReference);

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
    const pricedLines = priceScopeLines(scope.lines, rateBook, projectSf, finishTier, bidConfig.supply_model, bidConfig.allowance);
    const content = formatEstimate(scope, pricedLines, projectSf, finishTier, markupPct, pmFeeVal, financialModel);

    // 3c: include priced_scope so EstimateTab can commit with exact source_labels
    // without a second AI EXTRACT_JSON_FOR_PROPOSAL round-trip.
    return ok({ content, priced_scope: pricedLines, ...(scopeResult.truncated ? { truncated: true } : {}) });
  } catch (e) {
    console.error("ai-estimator error:", e);
    return fail(String(e));
  }
});



