import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM  = Deno.env.get("TWILIO_FROM")!;
const SB_URL       = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { contact_id, body, tenant_id, sent_by } = await req.json();
    if (!contact_id || !body) {
      return new Response(JSON.stringify({ error: "Missing contact_id or body" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const sb = createClient(SB_URL, SB_SERVICE);

    // Load contact phone
    const { data: contact, error: ce } = await sb.from("contacts").select("phone, first_name, last_name").eq("id", contact_id).single();
    if (ce || !contact?.phone) {
      return new Response(JSON.stringify({ error: "Contact not found or no phone number" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Normalize to E.164
    const raw = contact.phone.replace(/\D/g, "");
    const to = raw.startsWith("1") ? `+${raw}` : `+1${raw}`;

    // Send via Twilio
    const twilioRes = await fetch(
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

    const twilioData = await twilioRes.json();
    if (!twilioRes.ok) {
      console.error("Twilio error:", twilioData);
      return new Response(JSON.stringify({ error: twilioData.message || "Twilio error" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Save to contact_messages
    const { data: msg, error: me } = await sb.from("contact_messages").insert({
      tenant_id: tenant_id || "00000000-0000-0000-0000-000000000001",
      contact_id,
      direction: "outbound",
      body,
      from_number: TWILIO_FROM,
      to_number: to,
      twilio_sid: twilioData.sid,
      status: "sent",
      sent_by: sent_by || null,
      created_at: new Date().toISOString(),
    }).select().single();

    // Update last_contacted_at
    await sb.from("contacts").update({ last_contacted_at: new Date().toISOString() }).eq("id", contact_id);

    return new Response(JSON.stringify({ ok: true, message: msg, twilio_sid: twilioData.sid }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-contact-sms error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
