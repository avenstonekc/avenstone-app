import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const VM_WEBHOOK_URL    = Deno.env.get("VM_WEBHOOK_URL") || "https://autofix.avenstonekc.com/fix";
const VM_WEBHOOK_SECRET = Deno.env.get("VM_WEBHOOK_SECRET")!;
const DISPATCHER_SECRET = Deno.env.get("DISPATCHER_SECRET");
const AUTO_FIX_ENABLED  = Deno.env.get("AUTO_FIX_ENABLED") !== "false";

const GITHUB_RAW       = "https://raw.githubusercontent.com/avenstonekc/avenstone-app/refs/heads/main";
const MAX_DAILY        = 20;
const MODEL            = "claude-sonnet-4-6";
const TRIGGER_STATUS   = "open"; // submit-bug-report inserts 'open'; dispatcher picks it up here

// Patterns that make a fix_prompt unsafe regardless of classification
const DENYLIST: RegExp[] = [
  /\.github\/workflows\//,
  /pricing|stripe|payment|payout/i,
  /\/auth\//,
  /\btools\//,
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Supabase DB Webhooks forward the raw signing key as a static header value (not per-request HMAC).
function verifySecret(secret: string, sigHeader: string | null): boolean {
  return !!sigHeader && sigHeader === secret;
}

function fmtBreadcrumbs(bc: unknown[]): string {
  if (!Array.isArray(bc) || !bc.length) return "None";
  return bc.slice(-20).map((b: any, i: number) =>
    `${i + 1}. [${b.ts?.slice(11, 19) || ""}] ${b.type} — ${b.label || b.route || ""}`
  ).join("\n");
}

function fmtErrors(errs: unknown[]): string {
  if (!Array.isArray(errs) || !errs.length) return "None";
  return errs.map((e: any) => `• [${e.ts?.slice(11, 19) || ""}] ${e.message || ""}`).join("\n");
}

function hasDenylistHit(text: string): boolean {
  return DENYLIST.some(p => p.test(text));
}

const CLASSIFIER_SYSTEM = `You are the AUTO_FIX_ARC dispatcher for Avenstone — a multi-tenant construction field ops platform built on Vite + React 18 + Supabase edge functions.

ROLE: Read the project context (CLAUDE_MEMORY.md + CLAUDE.md + OPUS_RULES.md) and the bug context. Classify the bug. If eligible, write a precise fix prompt for the VM-hosted Claude Code executor.

CLASSIFIER RULES:
"backend_safe" requires ALL of the following:
  - Error originates in supabase/functions/* OR avenstone-vite/src/lib/supabase.js
  - No auth, RLS, payments, or Stripe file paths would be touched
  - Error message is specific enough to point at a single failure point
  - Fix is mechanical: typo, missing field, wrong return shape, missing await, wrong column name
"frontend" — error in avenstone-vite/src/components/* requiring browser/device testing to verify
"ios" — involves Capacitor plugins, RoomPlan, LiDAR, STT, TTS, or native iOS Swift
"unsafe_path" — fix would touch: .github/workflows/, auth code, payments/stripe/payout logic, tools/ scripts
"ambiguous" — cannot be confident; bias toward this over a false-positive auto-fix

PROMPT STRUCTURE when backend_safe (follow OPUS_RULES.md structure exactly):
SCOPE LINE: one sentence naming the file, function, and broken behavior.
AUDIT STEP: read the failing code at the specific file path. Cite lines. Do not guess.
IMPLEMENT STEP: apply the mechanical fix. No refactor. No opportunistic cleanup. Stay in scope.
VERIFY STEP: check edge fn logs / PostgREST schema / Supabase response shape as appropriate.
CLOSING: one commit per logical change, push, append [LOG] to CLAUDE_MEMORY.md, update bug_reports.status='auto_fixed' for bug ID given in the bug_context.

SAFETY CONSTRAINTS baked into every prompt you write:
  - Do NOT touch: .github/workflows/, supabase/migrations/, auth/, stripe/payment/pricing/payout patterns, tools/
  - One commit per logical change. Push per commit.
  - If the fix requires a schema migration, stop and output needs_human instead.

OUTPUT FORMAT — respond with ONLY valid JSON, no text outside the JSON object:
{
  "classification": "backend_safe" | "frontend" | "ios" | "unsafe_path" | "ambiguous",
  "reasoning": "one sentence",
  "fix_prompt": "full Claude Code prompt following the structure above (only when backend_safe, else null)"
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const rawBody = await req.text();

  if (DISPATCHER_SECRET) {
    const sig = req.headers.get("x-supabase-webhook-signature");
    if (!verifySecret(DISPATCHER_SECRET, sig)) return json({ ok: false, error: "Invalid signature" }, 401);
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const record = payload?.record;
  if (!record?.id) return json({ ok: false, error: "No record in payload" }, 400);

  // Only process new bug submissions (submit-bug-report inserts status='open')
  if (record.status !== TRIGGER_STATUS) return json({ ok: true, skipped: true });

  const admin = createClient(SB_URL, SB_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Kill switch
  if (!AUTO_FIX_ENABLED) {
    await admin.from("bug_reports")
      .update({ status: "needs_human", updated_at: new Date().toISOString() })
      .eq("id", record.id);
    return json({ ok: true, result: "disabled" });
  }

  // One-try rule: if any attempt exists for this bug_id, no-op regardless of current status
  const { count: priorAttempts } = await admin
    .from("auto_fix_attempts")
    .select("id", { count: "exact", head: true })
    .eq("bug_id", record.id);

  if ((priorAttempts ?? 0) > 0) {
    return json({ ok: true, skipped: true, reason: "already_attempted" });
  }

  // Global 24h rate limit
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const { count: dailyCount } = await admin
    .from("auto_fix_attempts")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since24h);

  if ((dailyCount ?? 0) >= MAX_DAILY) {
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("bug_reports").update({ status: "needs_human", updated_at: now }).eq("id", record.id),
      admin.from("auto_fix_attempts").insert({
        bug_id: record.id,
        classification: "needs_human",
        reasoning: "Global 24h rate limit reached (20 dispatches/day)",
        fix_prompt: null,
        vm_dispatch_status: "rate_limited",
        vm_response: null,
      }),
    ]);
    return json({ ok: true, result: "rate_limited" });
  }

  // Fetch project context from GitHub in parallel (cold-invocation cache only)
  const [memRes, claudeRes, rulesRes] = await Promise.all([
    fetch(`${GITHUB_RAW}/CLAUDE_MEMORY.md`),
    fetch(`${GITHUB_RAW}/CLAUDE.md`),
    fetch(`${GITHUB_RAW}/OPUS_RULES.md`),
  ]);
  const [memMd, claudeMd, rulesMd] = await Promise.all([
    memRes.ok   ? memRes.text()   : Promise.resolve(""),
    claudeRes.ok ? claudeRes.text() : Promise.resolve(""),
    rulesRes.ok  ? rulesRes.text()  : Promise.resolve(""),
  ]);

  const bugContext = `BUG ID: ${record.id}
ROUTE: ${record.route || "unknown"}
APP VERSION: ${record.app_version || "unknown"}
DEVICE: ${record.device_info || "unknown"}
SUBMITTED: ${record.created_at}

USER DESCRIPTION:
${record.description || "(none)"}

LAST 20 BREADCRUMBS:
${fmtBreadcrumbs(record.breadcrumbs || [])}

CONSOLE ERRORS (last 10):
${fmtErrors(record.console_errors || [])}

NETWORK ERRORS (last 10):
${fmtErrors(record.network_errors || [])}`;

  const userMessage = `<project_context>
<CLAUDE_MEMORY>
${memMd.slice(0, 8000)}
</CLAUDE_MEMORY>
<CLAUDE_MD>
${claudeMd.slice(0, 8000)}
</CLAUDE_MD>
<OPUS_RULES>
${rulesMd.slice(0, 4000)}
</OPUS_RULES>
</project_context>

<bug_context>
${bugContext}
</bug_context>

Classify this bug and output the JSON response.`;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!anthropicRes.ok) {
    console.error("Anthropic error:", anthropicRes.status, await anthropicRes.text());
    await admin.from("bug_reports")
      .update({ status: "needs_human", updated_at: new Date().toISOString() })
      .eq("id", record.id);
    return json({ ok: false, error: `Anthropic ${anthropicRes.status}` }, 500);
  }

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text ?? "";

  let cls: string, reasoning: string, fix_prompt: string | null;
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? rawText);
    cls = parsed.classification;
    reasoning = parsed.reasoning ?? "";
    fix_prompt = parsed.fix_prompt ?? null;
  } catch {
    console.error("Classifier parse failed:", rawText);
    await admin.from("bug_reports")
      .update({ status: "needs_human", updated_at: new Date().toISOString() })
      .eq("id", record.id);
    return json({ ok: false, error: "Classifier parse failed" }, 500);
  }

  // Dispatcher self-check: scan its own fix_prompt for denylist patterns
  if (cls === "backend_safe" && fix_prompt && hasDenylistHit(fix_prompt)) {
    cls = "unsafe_path";
    reasoning = `Dispatcher denylist hit in fix_prompt. Original reasoning: ${reasoning}`;
    fix_prompt = null;
  }

  const now = new Date().toISOString();

  if (cls === "backend_safe" && fix_prompt) {
    let vmStatus = "pending";
    let vmResponse: unknown = null;

    try {
      const vmRes = await fetch(VM_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "x-webhook-secret": VM_WEBHOOK_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bug_id: record.id, prompt: fix_prompt }),
      });
      vmResponse = await vmRes.json().catch(() => ({ http_status: vmRes.status }));
      vmStatus = vmRes.ok ? "dispatched" : "vm_error";
    } catch (err) {
      console.error("VM dispatch error:", err);
      vmStatus = "vm_error";
      vmResponse = { error: (err as Error).message };
    }

    await Promise.all([
      admin.from("bug_reports").update({ status: "attempting", updated_at: now }).eq("id", record.id),
      admin.from("auto_fix_attempts").insert({
        bug_id: record.id, classification: cls, reasoning, fix_prompt,
        vm_dispatch_status: vmStatus, vm_response: vmResponse,
      }),
    ]);

    return json({ ok: true, result: "dispatched", classification: cls, vm_status: vmStatus });
  }

  // Not eligible — escalate to human
  await Promise.all([
    admin.from("bug_reports").update({ status: "needs_human", updated_at: now }).eq("id", record.id),
    admin.from("auto_fix_attempts").insert({
      bug_id: record.id, classification: cls, reasoning, fix_prompt: null,
      vm_dispatch_status: "not_dispatched", vm_response: null,
    }),
  ]);

  return json({ ok: true, result: "needs_human", classification: cls });
});
