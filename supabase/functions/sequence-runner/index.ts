
import { createClient } from "npm:@supabase/supabase-js@2";

const TWILIO_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM  = Deno.env.get("TWILIO_FROM")!;
const SB_URL       = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const sb = createClient(SB_URL, SB_SERVICE);
    const now = new Date().toISOString();

    // Find all active enrollments due to send.
    // contact join is for contact-path enrollments; sub_id on the row itself
    // identifies sub-path enrollments (fetched separately in the loop).
    const { data: due, error } = await sb
      .from("sequence_enrollments")
      .select("*, sequence:sequences(*), contact:contacts(*)")
      .eq("status", "active")
      .lte("next_send_at", now);

    if (error) throw error;
    if (!due?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    const results = [];

    for (const enrollment of due) {
      const sequence = enrollment.sequence;
      const steps: Array<{ day: number; label: string; message: string }> = sequence?.steps || [];
      const stepIndex = enrollment.current_step;

      if (stepIndex >= steps.length) {
        // All steps done — mark complete
        await sb.from("sequence_enrollments")
          .update({ status: "complete", completed_at: now })
          .eq("id", enrollment.id);
        results.push({ id: enrollment.id, action: "completed" });
        continue;
      }

      const step = steps[stepIndex] as any;
      const isSubEnrollment = !!enrollment.sub_id;
      const actionType: string = step.action_type ?? "sms";

      // ── Email delivery branch ──────────────────────────────────────────────
      if (actionType === "email") {
        if (isSubEnrollment) {
          // Sub is a profile — invoke notify-email (handles opt-out check)
          const { data: subProfile } = await sb
            .from("profiles")
            .select("id, email")
            .eq("id", enrollment.sub_id)
            .single();
          if (!subProfile?.email) {
            console.log(`[sequence-runner] sub ${enrollment.sub_id} has no email — skipping step`);
            results.push({ id: enrollment.id, action: "skipped", reason: "sub has no email" });
            continue;
          }
          const notifyRes = await fetch(`${SB_URL}/functions/v1/notify-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SB_SERVICE}` },
            body: JSON.stringify({ record: {
              user_id: subProfile.id,
              title: step.subject ?? step.label,
              body: step.body ?? step.message,
              job_id: null,
              type: "sequence_email",
            }}),
          });
          if (!notifyRes.ok) {
            const errText = await notifyRes.text();
            console.error(`notify-email error for enrollment ${enrollment.id}:`, errText);
            results.push({ id: enrollment.id, action: "error", reason: errText });
            continue;
          }
        } else {
          // Contact — email is in the join result; call Resend directly
          const contact = enrollment.contact;
          if (!contact?.email) {
            results.push({ id: enrollment.id, action: "skipped", reason: "contact has no email" });
            continue;
          }
          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Avenstone Group <notifications@avenstonekc.com>",
              to: contact.email,
              subject: step.subject ?? "Avenstone message",
              html: `<p style="font-family:sans-serif;font-size:14px;line-height:1.65;color:#6B7280;">${step.body ?? step.message}</p>`,
            }),
          });
          if (!resendRes.ok) {
            const errText = await resendRes.text();
            console.error(`Resend error for enrollment ${enrollment.id}:`, errText);
            results.push({ id: enrollment.id, action: "error", reason: errText });
            continue;
          }
        }

        // Advance enrollment — same logic as SMS path
        const nextIdxEmail = stepIndex + 1;
        if (nextIdxEmail >= steps.length) {
          await sb.from("sequence_enrollments")
            .update({ current_step: nextIdxEmail, status: "complete", completed_at: now, next_send_at: null })
            .eq("id", enrollment.id);
          results.push({ id: enrollment.id, action: "completed_last_step" });
        } else {
          const nextStepEmail = steps[nextIdxEmail] as any;
          const daysUntilNextEmail = nextStepEmail.day - step.day;
          const nextSendAtEmail = new Date(Date.now() + daysUntilNextEmail * 24 * 60 * 60 * 1000).toISOString();
          await sb.from("sequence_enrollments")
            .update({ current_step: nextIdxEmail, next_send_at: nextSendAtEmail })
            .eq("id", enrollment.id);
          results.push({ id: enrollment.id, action: "advanced", next_step: nextIdxEmail, next_send_at: nextSendAtEmail });
        }
        sent++;
        continue;
      }
      // ── End email branch ───────────────────────────────────────────────────

      // Resolve phone and contact/sub id for this enrollment
      let phone: string | null = null;
      let contactId: string | null = null;

      if (isSubEnrollment) {
        const { data: subProfile } = await sb
          .from("profiles")
          .select("id, phone")
          .eq("id", enrollment.sub_id)
          .single();
        if (!subProfile?.phone) {
          console.log(`[sequence-runner] sub ${enrollment.sub_id} has no phone — skipping step`);
          results.push({ id: enrollment.id, action: "skipped", reason: "sub has no phone" });
          continue;
        }
        phone = subProfile.phone;
      } else {
        const contact = enrollment.contact;
        if (!contact?.phone) {
          results.push({ id: enrollment.id, action: "skipped", reason: "no phone" });
          continue;
        }
        phone = contact.phone;
        contactId = contact.id;
      }

      // Normalize to E.164
      const raw = phone.replace(/\D/g, "");
      const toE164 = raw.startsWith("1") ? `+${raw}` : `+1${raw}`;

      // Send SMS via Twilio
      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ From: TWILIO_FROM, To: toE164, Body: step.message }),
        }
      );

      const twilioData = await twilioRes.json();

      if (!twilioRes.ok) {
        console.error(`Twilio error for enrollment ${enrollment.id}:`, twilioData.message);
        results.push({ id: enrollment.id, action: "error", reason: twilioData.message });
        continue;
      }

      // Save outbound message log (contact path only — sub_messages table not yet created)
      if (!isSubEnrollment && contactId) {
        await sb.from("contact_messages").insert({
          tenant_id: enrollment.tenant_id,
          contact_id: contactId,
          direction: "outbound",
          body: step.message,
          from_number: TWILIO_FROM,
          to_number: toE164,
          twilio_sid: twilioData.sid,
          status: "sent",
          created_at: now,
        });
      }

      // Advance enrollment to next step
      const nextIndex = stepIndex + 1;
      if (nextIndex >= steps.length) {
        await sb.from("sequence_enrollments")
          .update({ current_step: nextIndex, status: "complete", completed_at: now, next_send_at: null })
          .eq("id", enrollment.id);
        results.push({ id: enrollment.id, action: "completed_last_step" });
      } else {
        const nextStep = steps[nextIndex];
        const daysUntilNext = nextStep.day - step.day;
        const nextSendAt = new Date(Date.now() + daysUntilNext * 24 * 60 * 60 * 1000).toISOString();
        await sb.from("sequence_enrollments")
          .update({ current_step: nextIndex, next_send_at: nextSendAt })
          .eq("id", enrollment.id);
        results.push({ id: enrollment.id, action: "advanced", next_step: nextIndex, next_send_at: nextSendAt });
      }

      // Update last_contacted_at (contact path only)
      if (!isSubEnrollment && contactId) {
        await sb.from("contacts").update({ last_contacted_at: now }).eq("id", contactId);
      }

      sent++;
    }

    return new Response(JSON.stringify({ ok: true, sent, results }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sequence-runner error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
