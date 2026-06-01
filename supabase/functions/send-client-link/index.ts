
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = "https://avenstone-app.vercel.app";
const FROM = "Avenstone Group <notifications@avenstonekc.com>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, client_name, job_address, job_id, tenant_id, link_only } = await req.json();
    if (!email || !job_id || !tenant_id) {
      return new Response("missing fields", { status: 400, headers: corsHeaders });
    }

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    // Look up existing user via profiles table — avoids listUsers() pagination limit (50-user default)
    const { data: profileRow } = await sb.from("profiles").select("id, role").eq("email", email).maybeSingle();
    let userId: string | null = profileRow?.id || null;

    if (profileRow) {
      const isStaff = profileRow.role && ["owner", "project_manager", "sales_rep"].includes(profileRow.role);
      if (isStaff) {
        return new Response(
          JSON.stringify({ ok: false, error: "Cannot send client link to a staff email — would overwrite their staff role" }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      await sb.from("profiles").update({ tenant_id, full_name: client_name || "", role: "client" }).eq("id", userId);
    } else {
      const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
        data: { full_name: client_name || "", role: "client", tenant_id },
      });
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      userId = data.user.id;
      await sb.from("profiles").upsert({ id: userId, tenant_id, full_name: client_name || "", email, role: "client" }, { onConflict: "id" });
    }

    // Link client to this job
    await sb.from("jobs").update({ client_user_id: userId }).eq("id", job_id);

    // Generate magic link
    const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !linkData?.properties?.action_link) {
      return new Response(
        JSON.stringify({ ok: false, error: linkError?.message || "Failed to generate magic link" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const loginUrl = linkData.properties.action_link;

    // link_only mode: return the URL without emailing
    if (link_only) {
      return new Response(JSON.stringify({ ok: true, url: loginUrl }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

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
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("send-client-link error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
