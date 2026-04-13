import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = "https://avenstone-app.vercel.app";
const FROM = "Avenstone Group <notifications@avenstonekc.com>";

serve(async (req) => {
  try {
    const { email, client_name, job_address, job_id, tenant_id } = await req.json();
    if (!email || !job_id || !tenant_id) return new Response("missing fields", { status: 400 });

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    // Ensure client has an auth account
    const { data: existingUsers } = await sb.auth.admin.listUsers();
    let userId: string | null = null;
    const existing = existingUsers?.users?.find((u: any) => u.email === email);

    if (existing) {
      userId = existing.id;
    } else {
      const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
        data: { full_name: client_name || "", role: "client", tenant_id },
      });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
      userId = data.user.id;
      await sb.from("profiles").upsert({ id: userId, tenant_id, full_name: client_name || "", email, role: "client" }, { onConflict: "id" });
    }

    // Link client to this job
    await sb.from("jobs").update({ client_user_id: userId }).eq("id", job_id);

    // Generate magic link
    const { data: linkData } = await sb.auth.admin.generateLink({ type: "magiclink", email });
    const loginUrl = linkData?.properties?.action_link || APP_URL;
    const greeting = client_name ? `Hi ${client_name.split(" ")[0]},` : "Hi,";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;">
<tr><td style="padding-bottom:20px;text-align:center;">
  <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">Avenstone Group</div>
  <div style="width:32px;height:2px;background:#C9A84C;margin:0 auto;"></div>
</td></tr>
<tr><td style="background:#fff;border-radius:8px;padding:32px;border:1px solid #E8E4DC;">
  <p style="margin:0 0 16px;font-size:13px;color:#9CA3AF;">${greeting}</p>
  <h2 style="margin:0 0 8px;font-size:20px;color:#0A1F44;font-weight:600;">Your Project Update</h2>
  <p style="margin:0 0 20px;font-size:14px;color:#6B7280;line-height:1.65;">You can now view the latest progress on your project at <strong>${job_address}</strong> — including the schedule, photos, and any change orders.</p>
  <p style="margin:0 0 20px;font-size:14px;color:#6B7280;line-height:1.65;">Have a question or concern? You can message us directly from your project view.</p>
  <a href="${loginUrl}" style="display:inline-block;background:#0A1F44;color:#C9A84C;padding:13px 32px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;">View My Project →</a>
  <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">This link expires in 24 hours. You can request a new one from your contractor.</p>
</td></tr>
<tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;line-height:1.8;">
  Avenstone Group · Kansas City, MO
</td></tr>
</table></td></tr></table>
</body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: email, subject: `Your project update — ${job_address}`, html }),
    });

    const data = await res.json();
    return new Response(JSON.stringify({ ...data, user_id: userId }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-client-link error:", err);
    return new Response(String(err), { status: 500 });
  }
});
