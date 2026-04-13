import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = "https://avenstone-app.vercel.app";
const FROM = "Avenstone Group <notifications@avenstonekc.com>";

const SUBJECTS: Record<string, string> = {
  note_posted:          "New note on your project",
  phase_complete:       "Phase complete",
  co_submitted:         "Change order submitted for review",
  co_approved:          "Change order approved",
  co_rejected:          "Change order rejected",
  document_uploaded:    "New document uploaded",
  daily_log_submitted:  "Daily log submitted",
  assigned_to_job:      "You've been assigned to a project",
  phase_overdue:        "Phase overdue",
};

serve(async (req) => {
  try {
    const payload = await req.json();
    // Supabase database webhook sends { type, table, schema, record, old_record }
    const notif = payload.record;
    if (!notif?.user_id) return new Response("no record", { status: 400 });

    // Look up recipient — skip if they've opted out
    const sb = createClient(SB_URL, SB_SERVICE);
    const { data: profile } = await sb
      .from("profiles")
      .select("email, full_name, notification_email")
      .eq("id", notif.user_id)
      .single();

    if (!profile?.email || profile.notification_email === false) {
      return new Response("skipped", { status: 200 });
    }

    const subject = SUBJECTS[notif.type] ?? "Avenstone notification";
    const greeting = profile.full_name ? `Hi ${profile.full_name.split(" ")[0]},` : "Hi,";

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="padding-bottom:20px;text-align:center;">
          <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">Avenstone Group</div>
          <div style="width:32px;height:2px;background:#C9A84C;margin:0 auto;"></div>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#fff;border-radius:8px;padding:32px;border:1px solid #E8E4DC;">
          <p style="margin:0 0 6px;font-size:13px;color:#9CA3AF;">${greeting}</p>
          <h2 style="margin:0 0 12px;font-size:18px;color:#0A1F44;font-weight:600;">${notif.title}</h2>
          ${notif.body ? `<p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.65;">${notif.body}</p>` : ""}
          ${notif.job_id ? `
          <a href="${APP_URL}" style="display:inline-block;background:#0A1F44;color:#C9A84C;padding:11px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.3px;">
            View Project →
          </a>` : ""}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;line-height:1.8;">
          Avenstone Group · Kansas City, MO<br>
          <a href="${APP_URL}" style="color:#9CA3AF;">Manage notification preferences</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: profile.email, subject, html }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-email error:", err);
    return new Response(String(err), { status: 500 });
  }
});
