
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

// ── Recovery-link email via Resend ────────────────────────────────────────────
// Plain-text style header, no logo. Mirror of send-estimate-email pattern.
async function sendRecoveryEmail(opts: {
  to: string;
  client_name: string;
  job_address: string;
  recovery_link: string;
}): Promise<{ sent: boolean; id?: string; error?: string }> {
  const { to, client_name, job_address, recovery_link } = opts;
  const greeting = client_name ? `Hi ${client_name},` : "Hello,";
  const html = `
<div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px 0;">${greeting}</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px 0;">
    Your Avenstone client portal is ready${job_address ? ` for <strong>${job_address}</strong>` : ""}.
    Use the button below to set your password and sign in.
  </p>
  <p style="margin:28px 0;">
    <a href="${recovery_link}"
       style="display:inline-block;background:#0A1F44;color:#fff;text-decoration:none;
              padding:13px 28px;border-radius:6px;font-size:15px;font-weight:600;">
      Set Password &amp; Sign In →
    </a>
  </p>
  <p style="font-size:13px;color:#555;line-height:1.6;margin:0 0 8px 0;">
    If the button doesn't work, copy and paste this link into your browser:
  </p>
  <p style="font-size:12px;color:#888;word-break:break-all;margin:0 0 24px 0;">${recovery_link}</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />
  <p style="font-size:12px;color:#999;margin:0;">
    Avenstone Group · Kansas City, MO
  </p>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: `Your Avenstone client portal is ready${job_address ? ` — ${job_address}` : ""}`,
      html,
    }),
  });
  const data = await res.json();
  if (!res.ok) return { sent: false, error: data.message || "Resend failed" };
  return { sent: true, id: data.id };
}

// ── Random password generator (agent path only — never returned to caller) ───
function randomPassword(length = 24): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // send_recovery:true = agent path. Password is generated server-side; never
    // returned to the caller. A recovery link is issued and emailed via Resend.
    // send_recovery absent/false = UI path (ClientLoginButton). Password is PM-set.
    const { email, password: callerPassword, client_name, job_id, tenant_id, send_recovery } = await req.json();
    const agentPath = send_recovery === true;

    if (!email || !job_id || !tenant_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing fields: email, job_id, tenant_id required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // UI path: password required + minimum length check
    const password = agentPath ? randomPassword() : (callerPassword || "");
    if (!agentPath) {
      if (!password) {
        return new Response(
          JSON.stringify({ ok: false, error: "missing fields: email, password, job_id, tenant_id required" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      if (password.length < 6) {
        return new Response(
          JSON.stringify({ ok: false, error: "Password must be at least 6 characters" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    // Check profiles table first to catch staff-role guard (guards only, not for ID resolution)
    const { data: profileRows } = await sb.from("profiles").select("id, role").eq("email", email).limit(1);
    const profileRow = profileRows?.[0] ?? null;

    if (profileRow) {
      const isStaff = profileRow.role && ["owner", "project_manager", "sales_rep"].includes(profileRow.role);
      if (isStaff) {
        return new Response(
          JSON.stringify({ ok: false, error: "Cannot create client login for a staff email — would overwrite their role" }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Auth is the authoritative source — query auth.users directly via RPC
    // (sb.auth.admin.listUsers paginates poorly; GoTrue ?email= filter is unreliable)
    const { data: authId } = await sb.rpc('get_auth_user_id_by_email', { p_email: email });
    let userId: string | null = (authId as string | null) ?? null;

    if (userId) {
      // Auth user exists — set password + confirm email immediately
      const { error: updateError } = await sb.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updateError) {
        return new Response(
          JSON.stringify({ ok: false, error: updateError.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      // Ensure profile row is correct (creates if missing, updates if stale)
      await sb.from("profiles").upsert(
        { id: userId, tenant_id, full_name: client_name || "", email, role: "client" },
        { onConflict: "id" }
      );
    } else {
      // No auth user found — create with email+password, confirmed immediately
      const { data, error } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: client_name || "", role: "client", tenant_id },
      });
      if (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      userId = data.user.id;
      await sb.from("profiles").upsert(
        { id: userId, tenant_id, full_name: client_name || "", email, role: "client" },
        { onConflict: "id" }
      );
    }

    // Link client to this job
    await sb.from("jobs").update({ client_user_id: userId, client_email: email }).eq("id", job_id);

    // ── Agent path: generate recovery link + email it ─────────────────────────
    if (agentPath) {
      // Fetch job address for email
      const { data: jobRow } = await sb.from("jobs").select("address").eq("id", job_id).single();
      const job_address = (jobRow as any)?.address || "";

      // generateLink issues a one-time recovery link the client uses to set their own password.
      // redirect_to must match Supabase project's allowlist (https://avenstone-app.vercel.app is confirmed).
      const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: APP_URL },
      });
      if (linkError || !linkData?.properties?.action_link) {
        return new Response(
          JSON.stringify({ ok: false, error: `Failed to generate recovery link: ${linkError?.message || "unknown"}` }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const recovery_link = linkData.properties.action_link;

      // Send email via Resend — verify send, don't fire and forget
      const emailResult = await sendRecoveryEmail({
        to: email,
        client_name: client_name || "",
        job_address,
        recovery_link,
      });
      if (!emailResult.sent) {
        // Provisioning succeeded but email failed — surface the error explicitly
        return new Response(
          JSON.stringify({ ok: false, error: `Portal provisioned but email failed: ${emailResult.error}` }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Return minimal shape — no password, no recovery link
      return new Response(JSON.stringify({
        ok: true,
        email,
        user_id: userId,
        email_sent: true,
        resend_id: emailResult.id,
      }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // UI path: return provisioned credentials confirmation (no email sent)
    return new Response(JSON.stringify({ ok: true, email, user_id: userId }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("create-client-login error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
