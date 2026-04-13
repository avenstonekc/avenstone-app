import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TWILIO_FROM  = Deno.env.get("TWILIO_FROM")!;
const SB_URL       = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AVENSTONE_TENANT = "00000000-0000-0000-0000-000000000001";

// TwiML response helper
const twiml = (msg?: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ""}</Response>`;

const twimlHeaders = { "Content-Type": "text/xml" };

serve(async (req) => {
  // Twilio sends form-encoded POST
  if (req.method !== "POST") return new Response(twiml(), { headers: twimlHeaders });

  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const from = params.get("From") || "";
    const msgBody = params.get("Body") || "";
    const sid = params.get("MessageSid") || "";
    const to = params.get("To") || TWILIO_FROM;

    if (!from || !msgBody) return new Response(twiml(), { headers: twimlHeaders });

    const sb = createClient(SB_URL, SB_SERVICE);

    // Normalize from number — strip non-digits, try to match stored phone
    const fromDigits = from.replace(/\D/g, "");

    // Find existing contact by phone
    const { data: contacts } = await sb
      .from("contacts")
      .select("id, phone, tenant_id")
      .eq("tenant_id", AVENSTONE_TENANT);

    let contactId: string | null = null;
    if (contacts) {
      for (const c of contacts) {
        if (c.phone && c.phone.replace(/\D/g, "").endsWith(fromDigits.slice(-10))) {
          contactId = c.id;
          break;
        }
      }
    }

    // If no match, create a new contact
    if (!contactId) {
      const { data: newContact } = await sb
        .from("contacts")
        .insert({
          tenant_id: AVENSTONE_TENANT,
          first_name: "Unknown",
          last_name: from,
          phone: from,
          source: "inbound_sms",
          status: "new",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      contactId = newContact?.id || null;
      console.log("Created new contact from inbound SMS:", from, newContact?.id);
    }

    if (!contactId) {
      console.error("Failed to find or create contact for", from);
      return new Response(twiml(), { headers: twimlHeaders });
    }

    // Save inbound message
    await sb.from("contact_messages").insert({
      tenant_id: AVENSTONE_TENANT,
      contact_id: contactId,
      direction: "inbound",
      body: msgBody,
      from_number: from,
      to_number: to,
      twilio_sid: sid,
      status: "received",
      created_at: new Date().toISOString(),
    });

    // Update last_contacted_at
    await sb.from("contacts").update({ last_contacted_at: new Date().toISOString() }).eq("id", contactId);

    // No auto-reply — just acknowledge
    return new Response(twiml(), { headers: twimlHeaders });
  } catch (e) {
    console.error("twilio-inbound error:", e);
    return new Response(twiml(), { headers: twimlHeaders });
  }
});
