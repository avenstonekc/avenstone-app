const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "Avenstone Group <notifications@avenstonekc.com>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { to, plan_name, version_number, pdf_url, custom_message } = await req.json();

    if (!to || !plan_name || !pdf_url) {
      return new Response("missing: to, plan_name, pdf_url required", { status: 400, headers: CORS });
    }

    const recipients: string[] = Array.isArray(to) ? to : [to];
    if (recipients.length === 0) {
      return new Response("no recipients", { status: 400, headers: CORS });
    }

    const esc = (s: string) => String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
          <h2 style="margin:0 0 8px;font-size:18px;color:#0A1F44;font-weight:600;">Floor Plan: ${esc(plan_name)}</h2>
          ${version_number != null ? `<p style="margin:0 0 16px;font-size:12px;color:#9CA3AF;">Version ${version_number}</p>` : ""}
          ${custom_message ? `<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.65;">${esc(String(custom_message))}</p>` : ""}
          <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.65;">Your floor plan is ready. Click below to open the PDF.</p>
          <a href="${pdf_url}" style="display:inline-block;background:#0A1F44;color:#C9A84C;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.3px;">
            View Floor Plan &rarr;
          </a>
          <p style="margin:24px 0 0;font-size:11px;color:#9CA3AF;">Link expires in 7 days.</p>
        </td></tr>
        <tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;line-height:1.8;">
          Avenstone Group &middot; Kansas City, MO
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const subject = `Floor Plan: ${plan_name}${version_number != null ? ` (v${version_number})` : ""}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: recipients, subject, html }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(JSON.stringify({ error: data.message || "Email failed" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sent: true }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-floor-plan-email error:", err);
    return new Response(String(err), { status: 500, headers: CORS });
  }
});
