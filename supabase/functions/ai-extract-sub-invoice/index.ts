import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB guard

const SYSTEM_PROMPT = `You are extracting fields from a sub-contractor invoice. Return ONLY valid JSON, no preamble, no markdown fences, no commentary.

Schema:
{
  "invoice_number": string | null,
  "invoice_date": "YYYY-MM-DD" | null,
  "due_date": "YYYY-MM-DD" | null,
  "amount": number | null,
  "description": string | null,
  "line_items": [{ "description": string, "qty": number | null, "unit_price": number | null, "total": number }] | null,
  "vendor_name": string | null
}

Rules:
- amount is the invoice grand total in USD as a number, no $ sign, no commas.
- invoice_date and due_date must be ISO 8601 dates (YYYY-MM-DD); return null if you cannot determine the year.
- line_items: return the array if the invoice has itemized lines; null if lump sum only.
- vendor_name: the sub-contractor or vendor name (the issuer of the invoice, not the general contractor).
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
    const { jobFileId } = body as { jobFileId?: string };
    if (!jobFileId) {
      return new Response(JSON.stringify({ error: "jobFileId required" }), { status: 400, headers: jsonHeaders });
    }

    // ── Fetch job_files row ───────────────────────────────────────────────────
    const { data: fileRow, error: fileErr } = await sb
      .from("job_files")
      .select("id, storage_path, storage_bucket, mime_type, name, tenant_id")
      .eq("id", jobFileId)
      .single();
    if (fileErr || !fileRow) {
      return new Response(JSON.stringify({ error: "file not found" }), { status: 404, headers: jsonHeaders });
    }

    // Tenant isolation check
    if (fileRow.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 403, headers: jsonHeaders });
    }

    // ── Download from storage ─────────────────────────────────────────────────
    const { data: blob, error: dlErr } = await sb.storage
      .from(fileRow.storage_bucket as string)
      .download(fileRow.storage_path as string);
    if (dlErr || !blob) {
      return new Response(JSON.stringify({ error: "download_failed", detail: dlErr?.message }), { status: 500, headers: jsonHeaders });
    }

    if (blob.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "file_too_large", detail: "max 10 MB" }), { status: 413, headers: jsonHeaders });
    }

    // ── Base64 encode ─────────────────────────────────────────────────────────
    const ab = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(ab);

    // ── Determine content type ────────────────────────────────────────────────
    const fileName = (fileRow.name as string | null) ?? "";
    const mimeType: string = (fileRow.mime_type as string | null)
      ?? (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

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
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            { type: "text", text: "Extract the invoice fields from this document." },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      console.error("[ai-extract-sub-invoice] Anthropic error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "ai_error", detail: errText }), { status: 502, headers: jsonHeaders });
    }

    const aiData = await aiRes.json();
    const rawText: string = aiData?.content?.[0]?.text ?? "{}";

    // ── Parse result ──────────────────────────────────────────────────────────
    // deno-lint-ignore no-explicit-any
    let extracted: Record<string, any> = {};
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(match?.[0] ?? "{}");
    } catch {
      console.warn("[ai-extract-sub-invoice] JSON parse failed, raw:", rawText);
    }

    return new Response(JSON.stringify({ ok: true, extracted }), { headers: jsonHeaders });

  } catch (err) {
    console.error("[ai-extract-sub-invoice]", err);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: jsonHeaders });
  }
});
