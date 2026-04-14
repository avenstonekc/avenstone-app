
import { createClient } from "npm:@supabase/supabase-js@2";

const TWILIO_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM  = Deno.env.get("TWILIO_FROM")!;
const SB_URL       = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AVENSTONE_TENANT = "00000000-0000-0000-0000-000000000001";

const MISSED_CALL_MSG =
  "Hey! This is Avenstone Group — sorry we missed your call! We'll get back to you shortly. Feel free to reply here and we'll take care of you. 🏠";

// TwiML that plays nothing and hangs up (or could play a voicemail greeting)
const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thanks for calling Avenstone Group. We're unavailable right now, but we just sent you a text message. We'll be in touch shortly!</Say>
  <Hangup/>
</Response>`;

Deno.serve(async (req) => {
  // Twilio sends form-encoded POST for voice webhooks
  if (req.method !== "POST") {
    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  }

  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    const from = params.get("From") || "";         // caller's number
    const callStatus = params.get("CallStatus") || "";
    const direction = params.get("Direction") || "";

    console.log(`Call from ${from}, status: ${callStatus}, direction: ${direction}`);

    // Only text back on inbound calls (not our own outbound dials)
    if (direction === "outbound-dial") {
      return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
    }

    if (!from || from === "anonymous") {
      return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
    }

    const sb = createClient(SB_URL, SB_SERVICE);

    // Normalize caller number
    const fromDigits = from.replace(/\D/g, "");
    const toE164 = fromDigits.startsWith("1") ? `+${fromDigits}` : `+1${fromDigits}`;

    // Find or create contact
    const { data: contacts } = await sb
      .from("contacts")
      .select("id, phone, first_name, last_name")
      .eq("tenant_id", AVENSTONE_TENANT);

    let contact = null;
    if (contacts) {
      contact = contacts.find(c =>
        c.phone && c.phone.replace(/\D/g, "").endsWith(fromDigits.slice(-10))
      ) || null;
    }

    if (!contact) {
      const { data: newC } = await sb
        .from("contacts")
        .insert({
          tenant_id: AVENSTONE_TENANT,
          first_name: "Missed Call",
          last_name: from,
          phone: from,
          source: "missed_call",
          status: "new",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      contact = newC;
      console.log("Created contact from missed call:", from);
    }

    // Send the text-back
    const smsRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: TWILIO_FROM, To: toE164, Body: MISSED_CALL_MSG }),
      }
    );

    const smsData = await smsRes.json();
    console.log("Text-back sent:", smsData.sid || smsData.message);

    // Save outbound message to contact_messages
    if (contact?.id) {
      await sb.from("contact_messages").insert({
        tenant_id: AVENSTONE_TENANT,
        contact_id: contact.id,
        direction: "outbound",
        body: MISSED_CALL_MSG,
        from_number: TWILIO_FROM,
        to_number: toE164,
        twilio_sid: smsData.sid || null,
        status: "sent",
        created_at: new Date().toISOString(),
      });

      await sb.from("contacts").update({ last_contacted_at: new Date().toISOString() }).eq("id", contact.id);
    }

    // Notify all staff of missed call
    const { data: staff } = await sb
      .from("profiles")
      .select("id")
      .eq("tenant_id", AVENSTONE_TENANT)
      .in("role", ["owner", "sales_rep", "project_manager"]);

    if (staff?.length && contact?.id) {
      const callerName = contact.first_name === "Missed Call"
        ? `Unknown (${from})`
        : `${contact.first_name} ${contact.last_name}`.trim();
      await sb.from("notifications").insert(
        staff.map((p: { id: string }) => ({
          tenant_id: AVENSTONE_TENANT,
          user_id: p.id,
          type: "missed_call",
          title: `Missed call — ${callerName}`,
          body: "Auto text-back sent. Reply in Contacts.",
          read: false,
          email_sent: false,
          sms_sent: false,
          created_at: new Date().toISOString(),
        }))
      );
    }

    // Return TwiML — play a short message then hang up
    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  } catch (e) {
    console.error("missed-call-textback error:", e);
    // Still return valid TwiML so Twilio doesn't error
    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  }
});
