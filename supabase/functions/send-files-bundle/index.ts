import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = "Avenstone Group <notifications@avenstonekc.com>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const jsonHeaders = { ...CORS, "Content-Type": "application/json" };

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
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

    // ── Parse body ────────────────────────────────────────────────────────────
    const { fileIds, recipientEmail, recipientName, message, folderLabel } = await req.json();

    if (!fileIds?.length || !recipientEmail || !folderLabel) {
      return new Response(
        JSON.stringify({ error: "fileIds, recipientEmail, folderLabel required" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // ── Load + verify files belong to this tenant ─────────────────────────────
    const { data: files, error: filesErr } = await sb
      .from("job_files")
      .select("id, name, storage_path, storage_bucket, mime_type")
      .in("id", fileIds)
      .eq("tenant_id", tenantId)
      .eq("lifecycle_status", "active");

    if (filesErr) {
      return new Response(JSON.stringify({ error: filesErr.message }), { status: 500, headers: jsonHeaders });
    }
    if (!files?.length) {
      return new Response(
        JSON.stringify({ error: "no files found for this tenant" }),
        { status: 404, headers: jsonHeaders },
      );
    }

    // ── Sign URLs (7-day expiry) ───────────────────────────────────────────────
    const signedLinks = await Promise.all(files.map(async (f) => {
      const { data } = await sb.storage
        .from(f.storage_bucket)
        .createSignedUrl(f.storage_path, 60 * 60 * 24 * 7);
      const name = f.name || f.storage_path.split("/").pop() || "file";
      return { name, url: data?.signedUrl || "" };
    }));

    const validLinks = signedLinks.filter((l) => l.url);
    if (!validLinks.length) {
      return new Response(
        JSON.stringify({ error: "could not generate signed URLs" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    // ── Build email HTML ───────────────────────────────────────────────────────
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const greeting = recipientName ? `Hi ${esc(String(recipientName))},` : "Hi,";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;">
        <tr><td style="padding-bottom:20px;text-align:center;">
          <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">Avenstone Group</div>
          <div style="width:32px;height:2px;background:#C9A84C;margin:0 auto;"></div>
        </td></tr>
        <tr><td style="background:#fff;border-radius:8px;padding:32px;border:1px solid #E8E4DC;">
          <p style="margin:0 0 12px;font-size:14px;color:#374151;">${greeting}</p>
          ${message ? `<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.65;">${esc(String(message))}</p>` : ""}
          <p style="margin:0 0 16px;font-size:14px;color:#6B7280;">
            Here are the files from <strong style="color:#0A1F44;">${esc(folderLabel)}</strong>:
          </p>
          <ul style="margin:0 0 24px;padding-left:20px;">
            ${validLinks.map((l) => `<li style="margin-bottom:8px;"><a href="${l.url}" style="color:#0A1F44;font-size:13px;font-weight:500;text-decoration:none;">${esc(l.name)}</a></li>`).join("")}
          </ul>
          <p style="margin:0;font-size:11px;color:#9CA3AF;">Links expire in 7 days. Contact us if you need files re-shared.</p>
        </td></tr>
        <tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;line-height:1.8;">
          Avenstone Group &middot; Kansas City, MO
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const subject = `Files from Avenstone: ${folderLabel}`;

    // ── Send via Resend ────────────────────────────────────────────────────────
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [recipientEmail], subject, html }),
    });

    const resData = await res.json();
    if (!res.ok) {
      console.error("Resend error:", resData);
      return new Response(
        JSON.stringify({ error: resData.message || "Email send failed" }),
        { status: 502, headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, sent: validLinks.length }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    console.error("send-files-bundle error:", err);
    return new Response(String(err), { status: 500, headers: CORS });
  }
});
