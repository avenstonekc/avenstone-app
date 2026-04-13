import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL       = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM  = Deno.env.get("TWILIO_FROM")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;
const FROM         = "Avenstone Contracting <notifications@avenstonekc.com>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SMS_MESSAGES: Record<string, (address: string, eta: string, name: string, link: string) => string> = {
  kickoff:    (a, eta, n, l) => `Hey${n?" "+n:""} — Kalin at Avenstone. Your client's project at ${a} is officially kicked off. We're on it${eta?`. Est. completion: ${eta}`:""}. Track it here: ${l}`,
  rough_in:   (a, _e, n, l) => `Avenstone update${n?" for "+n:""} — ${a}: rough-in is done (framing, plumbing, electrical behind walls). On track. Status: ${l}`,
  finishes:   (a, eta, n, l) => `Avenstone update${n?" for "+n:""} — ${a}: finish work underway (paint, flooring, trim, fixtures)${eta?`. Est. completion: ${eta}`:""}. Status: ${l}`,
  punch_list: (a, _e, n, l) => `Avenstone update${n?" for "+n:""} — ${a}: punch list started. Final touch-ups. Almost done. Status: ${l}`,
  complete:   (a, _e, n, l) => `Avenstone update${n?" for "+n:""} — ${a}: project complete. Your client has been notified. Final status: ${l} — Thanks for the referral.`,
};

const MILESTONE_LABELS: Record<string, string> = {
  kickoff:    "Project Kicked Off",
  rough_in:   "Rough-In Complete",
  finishes:   "Finish Work Underway",
  punch_list: "Punch List Started",
  complete:   "Project Complete",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { job_id, milestone } = await req.json();
    if (!job_id || !milestone) {
      return new Response("missing job_id or milestone", { status: 400, headers: corsHeaders });
    }
    if (!SMS_MESSAGES[milestone]) {
      return new Response("unknown milestone", { status: 400, headers: corsHeaders });
    }

    const sb = createClient(SB_URL, SB_SERVICE);
    const { data: job, error } = await sb.from("jobs").select("*").eq("id", job_id).single();
    if (error || !job) {
      return new Response("job not found", { status: 404, headers: corsHeaders });
    }

    const {
      referring_realtor_name: realtorName = "",
      referring_realtor_phone: realtorPhone = "",
      referring_realtor_email: realtorEmail = "",
      address = "",
      target_completion: eta = "",
      status_token: statusToken = "",
    } = job;

    if (!realtorPhone && !realtorEmail) {
      return new Response(JSON.stringify({ skipped: "no realtor contact info" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const magicLink = statusToken
      ? `https://avenstone-app.vercel.app/?st=${statusToken}`
      : "https://avenstone-app.vercel.app";

    const smsBody = SMS_MESSAGES[milestone](address, eta, realtorName.split(" ")[0] || "", magicLink);
    const milestoneLabel = MILESTONE_LABELS[milestone];
    const results: Record<string, string> = {};

    // ── SMS via Twilio ──────────────────────────────────────────────────────
    if (realtorPhone && TWILIO_SID) {
      const raw = realtorPhone.replace(/\D/g, "");
      const to = raw.startsWith("1") ? `+${raw}` : `+1${raw}`;
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ From: TWILIO_FROM, To: to, Body: smsBody }),
        }
      );
      results.sms = res.ok ? "sent" : "failed";
    }

    // ── Email via Resend ────────────────────────────────────────────────────
    if (realtorEmail && RESEND_KEY) {
      const greeting = realtorName ? `Hi ${realtorName.split(" ")[0]},` : "Hi,";
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;">
<tr><td align="center"><table width="100%" style="max-width:520px;">
<tr><td style="padding-bottom:20px;text-align:center;">
  <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">Avenstone Contracting</div>
  <div style="width:32px;height:2px;background:#C9A84C;margin:0 auto;"></div>
</td></tr>
<tr><td style="background:#fff;border-radius:8px;padding:32px;border:1px solid #E8E4DC;">
  <p style="margin:0 0 16px;font-size:13px;color:#9CA3AF;">${greeting}</p>
  <h2 style="margin:0 0 4px;font-size:18px;color:#0A1F44;font-weight:600;">Project Update</h2>
  <div style="font-size:12px;color:#C9A84C;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">${milestoneLabel}</div>
  <p style="margin:0 0 20px;font-size:14px;color:#6B7280;"><strong style="color:#0A1F44;">${address}</strong></p>
  <div style="background:#F7F5F0;border:1px solid #E8E4DC;border-left:3px solid #C9A84C;padding:16px;border-radius:4px;margin-bottom:20px;">
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${smsBody}</p>
  </div>
  ${eta ? `<p style="margin:0 0 16px;font-size:12px;color:#9CA3AF;">Estimated completion: <strong style="color:#0A1F44;">${eta}</strong></p>` : ""}
  <a href="${magicLink}" style="display:block;background:#0A1F44;color:#C9A84C;padding:12px 24px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.3px;text-align:center;margin-bottom:12px;">View Project Status →</a>
  <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;">No login required. Works on any device.</p>
</td></tr>
<tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;">Avenstone Contracting · Kansas City, MO</td></tr>
</table></td></tr></table>
</body></html>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: realtorEmail,
          subject: `Project update — ${address} — ${milestoneLabel}`,
          html,
        }),
      });
      results.email = res.ok ? "sent" : "failed";
    }

    return new Response(JSON.stringify(results), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-realtor error:", err);
    return new Response(String(err), { status: 500, headers: corsHeaders });
  }
});
