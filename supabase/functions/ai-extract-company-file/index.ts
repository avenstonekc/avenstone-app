/**
 * ai-extract-company-file — COMPANY_FILES_ARC Phase 4
 *
 * Standalone Haiku vision extraction for company-level compliance documents.
 * Accepts { storagePath, storageBucket } — downloads the file and returns extracted fields.
 *
 * Auth: JWT + owner/PM role required.
 * Model: claude-haiku-4-5-20251001 — one-shot extraction, no loop, low cost.
 * Cost: ~$0.001 per call (image) or ~$0.002 (PDF) — user-triggered admin UI path only.
 *
 * Note: The master agent path (upload_company_file verb) runs Haiku inline in
 * ai-master-agent/index.ts rather than calling this function, to avoid inter-function
 * JWT forwarding complexity. This function is the standalone path used by CompanyFilesScr.jsx.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB guard

const SYSTEM_PROMPT = `You are extracting fields from a contractor compliance document (insurance certificate, license, bond, or tax form). Return ONLY valid JSON, no preamble, no markdown fences, no commentary.

Schema:
{
  "type": "COI" | "General Liability" | "Workers Comp" | "Bond" | "License" | "W-9" | "Other" | null,
  "expiration_date": "YYYY-MM-DD" | null,
  "effective_date": "YYYY-MM-DD" | null,
  "policy_number": string | null,
  "issuer": string | null,
  "coverage_amount": number | null
}

Rules:
- type: classify the document. "COI" = Certificate of Insurance (any kind). "Workers Comp" = workers compensation policy. "Bond" = surety bond. "License" = contractor or trade license. "W-9" = IRS W-9 tax form. "General Liability" = stand-alone GL policy doc. "Other" if unclear.
- expiration_date and effective_date must be ISO 8601 (YYYY-MM-DD); return null if the year cannot be determined.
- policy_number: policy number, license number, or bond number — whatever the primary document ID is.
- issuer: the insurance company, surety, or licensing authority that issued the document (NOT the contractor holding it).
- coverage_amount: the policy limit or bond amount in USD as a number, no $ sign, no commas. null if not present.
- If a field is not present or cannot be determined, return null for that field.`;

/** Convert ArrayBuffer to base64 without external deps. Chunked to avoid call-stack overflow on large files. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
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

    // ── Tenant + role from profile ────────────────────────────────────────────
    const { data: profile } = await sb
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();
    const tenantId = profile?.tenant_id as string | null;
    const role     = profile?.role     as string | null;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "no tenant" }), { status: 400, headers: jsonHeaders });
    }
    if (role !== "owner" && role !== "project_manager") {
      return new Response(JSON.stringify({ error: "owner or PM role required" }), { status: 403, headers: jsonHeaders });
    }

    // ── Input ─────────────────────────────────────────────────────────────────
    const body = await req.json();
    const { storagePath, storageBucket } = body as { storagePath?: string; storageBucket?: string };
    if (!storagePath || !storageBucket) {
      return new Response(
        JSON.stringify({ error: "storagePath and storageBucket required" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // ── Download from storage ─────────────────────────────────────────────────
    const { data: blob, error: dlErr } = await sb.storage
      .from(storageBucket)
      .download(storagePath);
    if (dlErr || !blob) {
      return new Response(
        JSON.stringify({ error: "download_failed", detail: dlErr?.message }),
        { status: 500, headers: jsonHeaders },
      );
    }

    if (blob.size > MAX_BYTES) {
      return new Response(
        JSON.stringify({ error: "file_too_large", detail: "max 10 MB" }),
        { status: 413, headers: jsonHeaders },
      );
    }

    // ── Base64 encode ─────────────────────────────────────────────────────────
    const ab     = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(ab);

    // ── Determine content type ────────────────────────────────────────────────
    const fileName = storagePath.split("/").pop() ?? "";
    const isPdf    = fileName.toLowerCase().endsWith(".pdf") || blob.type === "application/pdf";
    const mimeType = isPdf ? "application/pdf" : (blob.type || "image/jpeg");

    // ── Build content block ───────────────────────────────────────────────────
    // deno-lint-ignore no-explicit-any
    const contentBlock: any = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image",    source: { type: "base64", media_type: mimeType,           data: base64 } };

    // ── Haiku vision / document call ──────────────────────────────────────────
    const aiHeaders: Record<string, string> = {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
    // PDF document blocks require the beta header
    if (isPdf) aiHeaders["anthropic-beta"] = "pdfs-2024-09-25";

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: aiHeaders,
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            { type: "text", text: "Extract the document fields." },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      console.error("[ai-extract-company-file] Anthropic error:", aiRes.status, errText);
      return new Response(
        JSON.stringify({ error: "ai_error", detail: errText }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const aiData  = await aiRes.json();
    const rawText: string = aiData?.content?.[0]?.text ?? "{}";

    // ── Parse result ──────────────────────────────────────────────────────────
    // deno-lint-ignore no-explicit-any
    let extracted: Record<string, any> = {};
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(match?.[0] ?? "{}");
    } catch {
      console.warn("[ai-extract-company-file] JSON parse failed, raw:", rawText);
    }

    return new Response(JSON.stringify({ ok: true, extracted }), { headers: jsonHeaders });

  } catch (err) {
    console.error("[ai-extract-company-file]", err);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: jsonHeaders });
  }
});
