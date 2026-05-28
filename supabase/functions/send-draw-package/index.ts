import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const BUCKET     = "draw-packages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fmtCurrency = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "Unauthenticated" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ ok: false, error: "Unauthenticated" }, 401);

    // Parse body
    const { draw_package_id, recipient_email, recipient_label, message = null } = await req.json() as {
      draw_package_id: string;
      recipient_email: string;
      recipient_label?: string;
      message?: string | null;
    };
    if (!draw_package_id) return json({ ok: false, error: "draw_package_id required" }, 400);
    if (!recipient_email) return json({ ok: false, error: "recipient_email required" }, 400);

    // Load draw_packages row
    const { data: pkg, error: pkgErr } = await sb
      .from("draw_packages")
      .select("id, job_id, draw_id, generated_pdf_path, status, tenant_id")
      .eq("id", draw_package_id)
      .single();
    if (pkgErr || !pkg) return json({ ok: false, error: "Draw package not found" }, 404);
    if (!pkg.generated_pdf_path) return json({ ok: false, error: "Package has no PDF — build the package first" }, 400);

    // Load draw schedule
    const { data: draw } = await sb
      .from("draw_schedules")
      .select("draw_number, title, target_amount, retainage_held, created_at")
      .eq("id", pkg.draw_id as string)
      .single();

    // Load job
    const { data: job } = await sb
      .from("jobs")
      .select("address, client_name, tenant_id")
      .eq("id", pkg.job_id as string)
      .single();

    // Load tenant
    const { data: tenant } = await sb
      .from("tenants")
      .select("name, business_email, business_phone, business_address")
      .eq("id", (pkg.tenant_id || job?.tenant_id) as string)
      .single();

    const businessName    = (tenant?.name             as string) || "Avenstone Group";
    const businessEmail   = (tenant?.business_email   as string) || "notifications@avenstonekc.com";
    const businessAddress = (tenant?.business_address as string) || "Kansas City, MO";
    const FROM = `${businessName} <notifications@avenstonekc.com>`;

    // Generate 30-day signed URL
    const { data: signedData, error: signedErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(pkg.generated_pdf_path as string, 60 * 60 * 24 * 30);
    if (signedErr || !signedData?.signedUrl) throw new Error(`Signed URL failed: ${signedErr?.message ?? "no URL"}`);
    const pdfUrl = signedData.signedUrl;

    // Amounts
    const workBilled = Number(draw?.target_amount ?? 0);
    const retainage  = Number(draw?.retainage_held ?? 0);
    const netDraw    = workBilled - retainage;
    const drawLabel  = draw?.title ? `Draw #${draw.draw_number} — ${draw.title}` : `Draw #${draw?.draw_number ?? ""}`;
    const dateLabel  = fmtDate(draw?.created_at as string);
    const label      = recipient_label || recipient_email;

    // Email HTML — mirrors send-invoice structure
    const subject = `Draw Package: ${drawLabel} from ${businessName}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;">
<tr><td style="padding-bottom:20px;text-align:center;">
  <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">${businessName}</div>
  <div style="width:32px;height:2px;background:#C9A84C;margin:0 auto;"></div>
</td></tr>
<tr><td style="background:#fff;border-radius:8px;padding:32px;border:1px solid #E8E4DC;">
  <h2 style="margin:0 0 8px;font-size:20px;color:#1A2540;font-weight:700;">${drawLabel}</h2>
  <p style="margin:0 0 4px;font-size:14px;color:#6B7280;">Date: <strong style="color:#0A1F44;">${dateLabel}</strong></p>
  <p style="margin:0 0 4px;font-size:14px;color:#6B7280;">Project: <strong style="color:#0A1F44;">${(job?.address as string) ?? ""}</strong></p>
  ${message ? `<p style="margin:12px 0;font-size:14px;color:#374151;background:#F7F5F0;padding:12px;border-radius:4px;border-left:3px solid #C9A84C;">${message}</p>` : ""}
  <div style="background:#F7F5F0;border:1px solid #E8E4DC;padding:16px;border-radius:4px;margin:20px 0;">
    <table width="100%" cellpadding="4" cellspacing="0" style="font-size:13px;">
      <tr><td style="color:#6B7280;">Work Billed:</td><td align="right" style="color:#0A1F44;font-weight:600;">${fmtCurrency(workBilled)}</td></tr>
      ${retainage > 0 ? `<tr><td style="color:#6B7280;">Less Retainage:</td><td align="right" style="color:#6B7280;">(${fmtCurrency(retainage)})</td></tr>` : ""}
      <tr style="border-top:1px solid #E8E4DC;"><td style="padding-top:8px;color:#0A1F44;font-weight:700;font-size:15px;">Net Draw Request:</td><td align="right" style="padding-top:8px;font-size:18px;font-weight:700;color:#1A2540;">${fmtCurrency(netDraw)}</td></tr>
    </table>
  </div>
  <a href="${pdfUrl}" style="display:block;background:#1A2540;color:#C9A84C;padding:14px 32px;border-radius:4px;text-decoration:none;font-size:15px;font-weight:700;text-align:center;">View Draw Package →</a>
  <p style="margin:16px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">This link expires in 30 days. Questions? Reply to this email.</p>
</td></tr>
<tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;">${businessName} · ${businessAddress}</td></tr>
</table></td></tr></table>
</body></html>`;

    // Send email
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, reply_to: businessEmail, to: recipient_email, subject, html }),
    });

    let emailWarning: string | undefined;
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      emailWarning = `Email delivery failed (${emailRes.status}): ${errText}`;
    }

    // Update draw_packages
    const now = new Date().toISOString();
    await sb.from("draw_packages").update({
      status:           "sent",
      recipient_email:  recipient_email,
      recipient_label:  recipient_label || null,
      sent_at:          now,
      updated_at:       now,
    }).eq("id", draw_package_id);

    return json({
      ok: true,
      sent_to: recipient_email,
      label,
      pdf_url: pdfUrl,
      ...(emailWarning ? { email_warning: emailWarning } : {}),
    });

  } catch (err: unknown) {
    console.error("send-draw-package error:", err);
    return json({ ok: false, error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
