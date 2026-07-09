import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB guard

const SYSTEM_PROMPT = `You are extracting fields from a subcontractor invoice or a vendor/materials receipt (e.g. a hardware store, lumberyard, or supplier receipt). Return ONLY valid JSON, no preamble, no markdown fences, no commentary.

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
- amount is the invoice or receipt grand total in USD as a number, no $ sign, no commas.
- invoice_date and due_date must be ISO 8601 dates (YYYY-MM-DD); return null if you cannot determine the year.
- line_items: return the array if the invoice has itemized lines; null if lump sum only.
- vendor_name: the vendor, supplier, or sub-contractor name (the issuer of the invoice or receipt, not the general contractor).
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

    // ── Input — two accepted shapes ───────────────────────────────────────────
    //   { jobFileId }     → resolve storage coords from a job_files row (original path)
    //   { bucket, path }  → extract straight from a storage object (receipt-modal path,
    //                       where the file isn't a job_files row yet)
    const body = await req.json();
    const jobFileId = (body as { jobFileId?: string }).jobFileId;
    const directBucket = (body as { bucket?: string }).bucket;
    const directPath = (body as { path?: string }).path;

    // Buckets permitted for the direct { bucket, path } shape. Tenant isolation on
    // this shape is enforced via the job the object belongs to (path = `${jobId}/…`).
    const ALLOWED_DIRECT_BUCKETS = new Set(["job-receipts"]);

    let storageBucket: string;
    let storagePath: string;
    let fileName: string;
    let mimeType: string;

    if (jobFileId) {
      // ── Resolve from a job_files row (unchanged behavior) ────────────────────
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
      storageBucket = fileRow.storage_bucket as string;
      storagePath = fileRow.storage_path as string;
      fileName = (fileRow.name as string | null) ?? "";
      mimeType = (fileRow.mime_type as string | null)
        ?? (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    } else if (directBucket && directPath) {
      // ── Resolve from a direct storage coordinate ─────────────────────────────
      if (!ALLOWED_DIRECT_BUCKETS.has(directBucket)) {
        return new Response(JSON.stringify({ error: "unsupported bucket" }), { status: 400, headers: jsonHeaders });
      }
      // Tenant isolation: the object path is `${jobId}/…`; verify that job is in the
      // caller's tenant so a guessed path can't reach across tenant boundaries.
      const jobId = directPath.split("/")[0];
      if (!jobId) {
        return new Response(JSON.stringify({ error: "invalid path" }), { status: 400, headers: jsonHeaders });
      }
      const { data: jobRow, error: jobErr } = await sb
        .from("jobs")
        .select("id, tenant_id")
        .eq("id", jobId)
        .single();
      if (jobErr || !jobRow) {
        return new Response(JSON.stringify({ error: "job not found" }), { status: 404, headers: jsonHeaders });
      }
      if (jobRow.tenant_id !== tenantId) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 403, headers: jsonHeaders });
      }
      storageBucket = directBucket;
      storagePath = directPath;
      fileName = directPath.split("/").pop() ?? "";
      mimeType = fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg";
    } else {
      return new Response(JSON.stringify({ error: "jobFileId or { bucket, path } required" }), { status: 400, headers: jsonHeaders });
    }

    // ── Download from storage ─────────────────────────────────────────────────
    const { data: blob, error: dlErr } = await sb.storage
      .from(storageBucket)
      .download(storagePath);
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
