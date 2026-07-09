
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = "https://avenstone-app.vercel.app";
const FROM = "Avenstone Contracting <notifications@avenstonekc.com>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Server-side random password for first-time client provisioning. Never returned,
// logged, or emailed — the client sets their own password via the recovery link.
function randomPassword(length = 24): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { email, client_name, job_address, job_id, tenant_id, contract_type, pdf_base64 } = await req.json();
    if (!email || !job_id || !tenant_id) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    const typeLabel = contract_type === "change_order" ? "Change Order" :
                      contract_type === "completion" ? "Completion Sign-off" :
                      contract_type === "subcontractor_agreement" ? "Subcontractor Agreement" :
                      "Contract";

    // Subcontractor agreements are NOT client portal docs. Subs authenticate through their
    // own onboarding — never provision them, never write a client profile (this path used
    // to mis-provision subs as clients). The email carries the PDF + a plain login link.
    const isSubAgreement = contract_type === "subcontractor_agreement";

    let userId: string | null = null;
    let buttonUrl = APP_URL; // sub path: plain, token-less login link

    if (!isSubAgreement) {
      // ── Client-facing (contract / change_order / completion) ──────────────────
      // Staff-role guard: never turn a staff member into a client.
      const { data: profileRows } = await sb.from("profiles").select("id, role").eq("email", email).limit(1);
      const staffRole = profileRows?.[0]?.role;
      if (staffRole && ["owner", "project_manager", "sales_rep"].includes(staffRole)) {
        return new Response(
          JSON.stringify({ error: "Cannot send a client contract to a staff email — would overwrite their role" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Auth is authoritative — resolve via RPC (listUsers paginates poorly).
      const { data: authId } = await sb.rpc("get_auth_user_id_by_email", { p_email: email });
      userId = (authId as string | null) ?? null;

      if (!userId) {
        // First-time client: create with a server-side random password (never surfaced).
        // The recovery link below is how they actually get in and set their own password.
        const { data, error } = await sb.auth.admin.createUser({
          email,
          password: randomPassword(),
          email_confirm: true,
          user_metadata: { full_name: client_name || "", role: "client", tenant_id },
        });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        userId = data.user.id;
      }
      // NOTE: for an EXISTING auth user we deliberately do NOT reset the password —
      // re-sending a contract must never invalidate a login the client already has.

      // Ensure a correct client profile (creates if missing, fixes stale role). tenant_id explicit.
      await sb.from("profiles").upsert(
        { id: userId, tenant_id, full_name: client_name || "", email, role: "client" },
        { onConflict: "id" }
      );

      // Link client to this job so RLS (can_access_job) lets them see + sign it.
      const { error: jobLinkError } = await sb.from("jobs")
        .update({ client_user_id: userId, client_email: email, client_name: client_name || undefined })
        .eq("id", job_id);
      if (jobLinkError) console.error("job link error:", jobLinkError.message);

      // Recovery link — canonical client-access mechanism (App.jsx routes #type=recovery →
      // SetPasswordScr → portal, which auto-shows the Sign Now banner). Generating a recovery
      // link does not reset an existing password; it only lets the client set one if they choose.
      const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: APP_URL },
      });
      if (linkError || !linkData?.properties?.action_link) {
        return new Response(
          JSON.stringify({ error: `Failed to generate recovery link: ${linkError?.message || "unknown"}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      buttonUrl = linkData.properties.action_link;
    }

    const greeting = client_name ? `Hi ${client_name.split(" ")[0]},` : "Hi,";
    const linkNote = isSubAgreement
      ? "Sign in to your Avenstone portal to review and sign."
      : "This secure link expires in 24 hours. Contact us if you have questions.";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;">
<tr><td style="background:#0A1F44;padding:24px 32px;border-radius:8px 8px 0 0;">
  <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;font-weight:700;">Avenstone Group</div>
  <div style="font-size:22px;font-weight:700;color:#fff;margin-top:6px;">Please Sign Your ${typeLabel}</div>
</td></tr>
<tr><td style="background:#fff;padding:32px;border:1px solid #E8E4DC;border-top:none;border-radius:0 0 8px 8px;">
  <p style="margin:0 0 16px;font-size:14px;color:#374151;">${greeting}</p>
  <p style="margin:0 0 16px;font-size:14px;color:#6B7280;line-height:1.7;">
    Avenstone Group has sent you a <strong style="color:#0A1F44;">${typeLabel}</strong> for your project at
    <strong style="color:#0A1F44;">${job_address}</strong>.
  </p>
  <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.7;">
    Please review the document and sign electronically using the button below.
  </p>
  <a href="${buttonUrl}" style="display:inline-block;background:#0A1F44;color:#C9A84C;padding:14px 36px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.5px;">Review &amp; Sign →</a>
  <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">${linkNote}</p>
</td></tr>
<tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;line-height:1.8;">
  Avenstone Group · avenstonekc.com · Kansas City, MO
</td></tr>
</table></td></tr></table>
</body></html>`;

    const attachments = pdf_base64 ? [{
      filename: `${typeLabel} — ${job_address}.pdf`,
      content: pdf_base64,
    }] : [];

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: email,
        subject: `Action Required: Sign your ${typeLabel} — ${job_address}`,
        html,
        ...(attachments.length ? { attachments } : {}),
      }),
    });

    const resData = await res.json();
    // Minimal shape — never return the recovery link or any credential.
    return new Response(JSON.stringify({ ...resData, user_id: userId }), {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-contract-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
