// CONSULTATION_MODE Slice 3 — email the scope recap to the client. Mirrors
// send-estimate-email (Resend + PDF attachment); recap wording, scope-only (no dollars).

const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "Avenstone Group <notifications@avenstonekc.com>";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { to, client_name, job_address, html, pdf_base64, variant = "client", trades = "" } = await req.json();
    if (!to || !pdf_base64) return new Response("missing fields", { status: 400 });

    const label = job_address || "Your Project";
    // WALKTHROUGH_TYPES — sub variant is a work-order tone to the sub; client is unchanged.
    const isSub = variant === "sub";
    const subject = isSub
      ? `Walkthrough Scope${trades ? ` — ${trades}` : ""} — ${label}`
      : `Your Consultation Recap — ${label}`;
    const defaultHtml = isSub
      ? `<p>Hi${client_name ? ` ${client_name}` : ""},</p><p>Attached is the scope from our walkthrough${trades ? ` for ${trades}` : ""} at ${label}. It covers the work, site conditions, measurements, and photos so you can put a number on it. No pricing from our side — send us your bid when you're ready, and flag anything unclear.</p><p>— Avenstone Group</p>`
      : `<p>Hi${client_name ? ` ${client_name}` : ""},</p><p>Thanks for walking through the project with us. Attached is a recap of what we discussed — the scope our bid will be based on. Please review it and let us know if we missed anything.</p><p>— Avenstone Group</p>`;
    const filename = isSub
      ? `Sub Walkthrough${trades ? ` — ${trades}` : ""} — ${label}.pdf`
      : `Consultation Recap — ${label}.pdf`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to,
        subject,
        html: html || defaultHtml,
        attachments: [{
          filename,
          content: pdf_base64,
        }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(JSON.stringify({ error: data.message || "Email failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sent: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-recap-email error:", err);
    return new Response(String(err), { status: 500, headers: corsHeaders });
  }
});
