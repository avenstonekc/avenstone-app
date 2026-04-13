import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const TWILIO_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM  = Deno.env.get("TWILIO_FROM")!;
const SB_URL       = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const LABELS: Record<string, string> = {
  note_posted:         "New note",
  phase_complete:      "Phase complete",
  co_submitted:        "Change order submitted",
  co_approved:         "Change order approved",
  co_rejected:         "Change order rejected",
  job_message:         "New message",
  assigned_to_job:     "Assigned to project",
  phase_overdue:       "Phase overdue",
  document_uploaded:   "Document uploaded",
  daily_log_submitted: "Daily log submitted",
  status_changed:      "Project status update",
  contract_signed:     "Contract signed",
  contract_sent:       "Contract sent",
  payment_received:    "Payment received",
  payment_request:     "Payment request sent",
  completion_signed:   "Project completion signed",
};

serve(async (req) => {
  try {
    const payload = await req.json();
    const notif = payload.record;
    if (!notif?.user_id) return new Response("no record", { status: 400 });

    const sb = createClient(SB_URL, SB_SERVICE);
    const { data: profile } = await sb
      .from("profiles")
      .select("phone, notification_sms, full_name")
      .eq("id", notif.user_id)
      .single();

    if (!profile?.phone || profile.notification_sms !== true) {
      return new Response("skipped", { status: 200 });
    }

    // Normalize phone — Twilio needs E.164
    const raw = profile.phone.replace(/\D/g, "");
    const to = raw.startsWith("1") ? `+${raw}` : `+1${raw}`;

    const label = LABELS[notif.type] || "Avenstone notification";
    const body = `${label}: ${notif.title}${notif.body ? " — " + notif.body.slice(0, 80) : ""}\n\navenstone-app.vercel.app`;

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: TWILIO_FROM, To: to, Body: body }),
      }
    );

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-sms error:", err);
    return new Response(String(err), { status: 500 });
  }
});
