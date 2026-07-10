
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

    // signed_copy = post-signature delivery of the fully-executed PDF. The client already
    // signed — this is a confirmation, not a request. NO provisioning, NO recovery link,
    // no "Action Required". typeLabel stays "Contract" (the doc that was signed).
    const isSignedCopy = contract_type === "signed_copy";

    let userId: string | null = null;
    let buttonUrl = APP_URL; // sub path: plain, token-less login link

    if (!isSubAgreement && !isSignedCopy) {
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
    // Only client-facing types carry a real job address; subs pass none. Guard against a
    // blank or label-only address so copy never reads "for your project at ." or doubles
    // the type label (the SubComplianceModal-passes-the-label bug).
    const hasAddress = !!(job_address && job_address.trim() && job_address.trim() !== typeLabel);
    const addrPhrase = hasAddress ? ` for your project at <strong style="color:#0A1F44;">${job_address}</strong>` : "";

    // Copy diverges by audience:
    //  • signed_copy   = post-signature confirmation, executed PDF attached, no action, no recovery link.
    //  • subcontractor = plain token-less login link, agreement attached to review.
    //  • client sign   = real recovery link → "Review & Sign".
    let heading: string, bodyLine: string, actionLine: string, buttonLabel: string, linkNote: string, subject: string;

    if (isSignedCopy) {
      heading     = `Your Signed ${typeLabel}`;
      bodyLine    = `Thank you. Your signed <strong style="color:#0A1F44;">${typeLabel}</strong>${addrPhrase} is complete — a copy is <strong style="color:#0A1F44;">attached to this email for your records</strong>.`;
      actionLine  = `No action is needed. You can view your project anytime in the Avenstone portal.`;
      buttonLabel = "View Your Project →";
      linkNote    = "Questions? Reply to this email or contact the office.";
      subject     = hasAddress ? `Signed: ${typeLabel} — ${job_address}` : `Signed: Your ${typeLabel}`;
    } else if (isSubAgreement) {
      heading     = `Your ${typeLabel} Is Ready to Review`;
      bodyLine    = `Avenstone Group has sent you a <strong style="color:#0A1F44;">${typeLabel}</strong>${addrPhrase}. The agreement is <strong style="color:#0A1F44;">attached to this email</strong> for your review.`;
      actionLine  = `Review the attached agreement, then open Avenstone using the button below.`;
      buttonLabel = "Open Avenstone →";
      linkNote    = "If you have portal access, sign in to review and sign. Otherwise, contact the office and we'll get you set up.";
      subject     = hasAddress ? `Action Required: Sign your ${typeLabel} — ${job_address}` : `Action Required: Your ${typeLabel}`;
    } else {
      heading     = `Please Sign Your ${typeLabel}`;
      bodyLine    = `Avenstone Group has sent you a <strong style="color:#0A1F44;">${typeLabel}</strong>${addrPhrase}.`;
      actionLine  = `Please review the document and sign electronically using the button below.`;
      buttonLabel = "Review &amp; Sign →";
      linkNote    = "This secure link expires in 24 hours. Contact us if you have questions.";
      subject     = hasAddress ? `Action Required: Sign your ${typeLabel} — ${job_address}` : `Action Required: Your ${typeLabel}`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;">
<tr><td style="background:#0A1F44;padding:24px 32px;border-radius:8px 8px 0 0;">
  <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;font-weight:700;">Avenstone Group</div>
  <div style="font-size:22px;font-weight:700;color:#fff;margin-top:6px;">${heading}</div>
</td></tr>
<tr><td style="background:#fff;padding:32px;border:1px solid #E8E4DC;border-top:none;border-radius:0 0 8px 8px;">
  <p style="margin:0 0 16px;font-size:14px;color:#374151;">${greeting}</p>
  <p style="margin:0 0 16px;font-size:14px;color:#6B7280;line-height:1.7;">
    ${bodyLine}
  </p>
  <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.7;">
    ${actionLine}
  </p>
  <a href="${buttonUrl}" style="display:inline-block;background:#0A1F44;color:#C9A84C;padding:14px 36px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.5px;">${buttonLabel}</a>
  <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">${linkNote}</p>
</td></tr>
<tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;line-height:1.8;">
  Avenstone Group · avenstonekc.com · Kansas City, MO
</td></tr>
</table></td></tr></table>
</body></html>`;

    const attachments = pdf_base64 ? [{
      filename: isSignedCopy
        ? (hasAddress ? `Signed ${typeLabel} — ${job_address}.pdf` : `Signed ${typeLabel}.pdf`)
        : (hasAddress ? `${typeLabel} — ${job_address}.pdf` : `${typeLabel}.pdf`),
      content: pdf_base64,
    }] : [];

    // signed_copy only: CC the tenant's business email so the office holds the same
    // executed artifact the client received. Canonical source = tenants.business_email.
    let ccList: string[] = [];
    if (isSignedCopy) {
      const { data: tRow } = await sb.from("tenants").select("business_email").eq("id", tenant_id).single();
      const biz = ((tRow?.business_email as string | null) || "").trim();
      if (biz && biz.toLowerCase() !== String(email).toLowerCase()) ccList = [biz];
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: email,
        ...(ccList.length ? { cc: ccList } : {}),
        subject,
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
