// AGENT_DOCS Slice 4 — the send_document verb. Emails a job document (or the estimate) to a given
// address via Resend, as a secure 7-day signed link (not a bulky attachment). Runs with the agent's
// service-role client, so no user JWT is needed (unlike the JWT-gated send-files-bundle fn), and the
// subject/label reflect the actual document (send-estimate-email hardcodes an "Estimate" subject).
// The recipient address is passed through verbatim and shown on the confirm card before send.

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "Avenstone Group <notifications@avenstonekc.com>";

export interface SendDocResult { ok: boolean; error?: string; summary?: string; to?: string; docName?: string; }

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// Resolve which job_file to send: an explicit id wins; otherwise the most recent active file whose
// category/name matches the requested kind.
const KIND_MATCH: Record<string, { category?: string[]; nameLike?: string }> = {
  invoice:             { category: ["Invoices"], nameLike: "Invoice" },
  estimate:            { category: ["Proposals", "Estimates"], nameLike: "Estimate" },
  lien_waiver:         { nameLike: "Lien Waiver" },
  letter:              { nameLike: "Letter" },
  delivery_acceptance: { nameLike: "Delivery Acceptance" },
  damage_waiver:       { nameLike: "Damage Waiver" },
  material_receipt:    { nameLike: "Material Receipt" },
};

// deno-lint-ignore no-explicit-any
export async function sendDocument(sb: any, params: {
  tenantId: string; jobId?: string; documentId?: string; documentKind?: string;
  toEmail: string; toName?: string; message?: string;
}): Promise<SendDocResult> {
  if (!RESEND_KEY) return { ok: false, error: "Email isn't configured (no Resend key)." };
  const to = String(params.toEmail || "").trim();
  if (!looksLikeEmail(to)) return { ok: false, error: `"${to}" doesn't look like a valid email address.` };

  // ── Locate the document ──────────────────────────────────────────────────
  let file: any = null;
  if (params.documentId) {
    const { data } = await sb.from("job_files")
      .select("id, name, storage_path, storage_bucket, category")
      .eq("id", params.documentId).eq("tenant_id", params.tenantId).eq("lifecycle_status", "active").maybeSingle();
    file = data;
  } else {
    if (!params.jobId) return { ok: false, error: "Tell me which job's document to send." };
    let q = sb.from("job_files")
      .select("id, name, storage_path, storage_bucket, category, created_at")
      .eq("tenant_id", params.tenantId).eq("job_id", params.jobId).eq("lifecycle_status", "active")
      .order("created_at", { ascending: false });
    const match = params.documentKind ? KIND_MATCH[params.documentKind] : null;
    if (match?.category) q = q.in("category", match.category);
    const { data: rows } = await q;
    let candidates = rows || [];
    if (match?.nameLike) {
      const kw = match.nameLike.toLowerCase();
      const narrowed = candidates.filter((r: any) => String(r.name || "").toLowerCase().includes(kw));
      if (narrowed.length) candidates = narrowed;
    }
    file = candidates[0] || null;
  }
  if (!file) return { ok: false, error: "I couldn't find that document on the job." };

  // ── Sign a 7-day link ────────────────────────────────────────────────────
  const { data: signed } = await sb.storage.from(file.storage_bucket || "job-documents")
    .createSignedUrl(file.storage_path, 60 * 60 * 24 * 7);
  if (!signed?.signedUrl) return { ok: false, error: "Couldn't generate a secure link for the document." };

  const docName = file.name || file.storage_path.split("/").pop() || "Document";
  const greeting = params.toName ? `Hi ${esc(String(params.toName))},` : "Hi,";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;"><tr><td align="center">
    <table width="100%" style="max-width:560px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">Avenstone Group</div>
        <div style="width:32px;height:2px;background:#C9A84C;margin:0 auto;"></div>
      </td></tr>
      <tr><td style="background:#fff;border-radius:8px;padding:32px;border:1px solid #E8E4DC;">
        <p style="margin:0 0 12px;font-size:14px;color:#374151;">${greeting}</p>
        ${params.message ? `<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.65;">${esc(String(params.message))}</p>` : ""}
        <p style="margin:0 0 16px;font-size:14px;color:#6B7280;">Your document is ready:</p>
        <p style="margin:0 0 24px;"><a href="${signed.signedUrl}" style="color:#0A1F44;font-size:14px;font-weight:600;text-decoration:none;">${esc(docName)}</a></p>
        <p style="margin:0;font-size:11px;color:#9CA3AF;">This link expires in 7 days. Reply if you need it re-shared.</p>
      </td></tr>
      <tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;line-height:1.8;">Avenstone Group &middot; Kansas City, MO</td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: `${docName} — Avenstone Group`, html }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: `Email failed: ${data?.message || res.status}` };
  }
  return { ok: true, to, docName, summary: `${docName} sent to ${to}.` };
}
