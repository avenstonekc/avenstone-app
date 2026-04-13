import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GHL_SECRET = Deno.env.get("GHL_WEBHOOK_SECRET"); // optional signature check

const AVENSTONE_TENANT = "00000000-0000-0000-0000-000000000001";

// GHL deal stages that should trigger job creation
const TRIGGER_STAGES = [
  "deposit received",
  "deposit paid",
  "won",
  "signed",
  "contract signed",
  "proposal accepted",
];

serve(async (req) => {
  // Allow GET for GHL webhook verification ping
  if (req.method === "GET") {
    return new Response("GHL webhook active", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Optional: verify GHL webhook secret
    if (GHL_SECRET) {
      const sig = req.headers.get("x-ghl-signature") || req.headers.get("x-webhook-secret");
      if (sig !== GHL_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const payload = await req.json();
    console.log("GHL webhook payload:", JSON.stringify(payload));

    // GHL sends different payload shapes depending on the trigger type
    // Handle both "Contact DND" / pipeline stage webhooks
    const type = payload.type || payload.event || "";
    const pipelineStage = (
      payload.pipeline_stage_name ||
      payload.pipelineStageName ||
      payload.stage?.name ||
      payload.stageId ||
      ""
    ).toLowerCase().trim();

    // Only act on deposit/won stage triggers
    const shouldCreate = TRIGGER_STAGES.some(s => pipelineStage.includes(s));
    if (!shouldCreate && type !== "OpportunityStageUpdate" && type !== "opportunity.statusUpdate") {
      console.log(`Skipping stage: "${pipelineStage}", type: "${type}"`);
      return new Response(JSON.stringify({ ok: true, skipped: true, stage: pipelineStage }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extract contact / deal info from payload
    // GHL payload varies — handle common shapes
    const contact = payload.contact || payload.Contact || {};
    const opportunity = payload.opportunity || payload.Opportunity || payload;

    const clientName = (
      contact.name ||
      contact.full_name ||
      `${contact.firstName || contact.first_name || ""} ${contact.lastName || contact.last_name || ""}`.trim() ||
      opportunity.contact_name ||
      "Unknown Client"
    ).trim();

    const clientEmail = (
      contact.email ||
      opportunity.contact_email ||
      ""
    ).toLowerCase().trim();

    const clientPhone = (
      contact.phone ||
      contact.phone_raw ||
      opportunity.contact_phone ||
      ""
    ).trim();

    const address = (
      contact.address1 ||
      contact.address ||
      opportunity.address ||
      contact.city
        ? [contact.address1, contact.city, contact.state].filter(Boolean).join(", ")
        : ""
    ).trim() || clientName + " — address TBD";

    const dealValue = Number(
      opportunity.monetary_value ||
      opportunity.value ||
      opportunity.deal_value ||
      0
    );

    const assignedUserName = (
      opportunity.assigned_to ||
      opportunity.assignedTo ||
      opportunity.owner_name ||
      payload.assigned_user ||
      ""
    ).trim();

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Find the matching rep by full_name
    let assignedRep = assignedUserName;
    if (assignedUserName) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("full_name")
        .eq("tenant_id", AVENSTONE_TENANT)
        .in("role", ["owner", "sales_rep"])
        .ilike("full_name", `%${assignedUserName.split(" ")[0]}%`);
      if (profiles?.length) assignedRep = profiles[0].full_name;
    }

    // Check for duplicate — same client_email + address already exists
    if (clientEmail) {
      const { data: existing } = await sb
        .from("jobs")
        .select("id")
        .eq("tenant_id", AVENSTONE_TENANT)
        .eq("client_email", clientEmail)
        .neq("status", "complete")
        .limit(1);
      if (existing?.length) {
        console.log(`Duplicate job for ${clientEmail} — skipping`);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "duplicate", job_id: existing[0].id }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Create the job
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { data: job, error: jobErr } = await sb
      .from("jobs")
      .insert({
        id: jobId,
        tenant_id: AVENSTONE_TENANT,
        address,
        client_name: clientName,
        client_email: clientEmail || null,
        client_phone: clientPhone || null,
        contract_value: dealValue || null,
        assigned_rep: assignedRep || null,
        status: "lead",
        lead_source: "GoHighLevel",
        created_at: now,
      })
      .select()
      .single();

    if (jobErr) {
      console.error("Job insert error:", jobErr);
      return new Response(JSON.stringify({ error: jobErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Notify all staff
    const { data: staff } = await sb
      .from("profiles")
      .select("id")
      .eq("tenant_id", AVENSTONE_TENANT)
      .in("role", ["owner", "sales_rep", "project_manager"]);

    if (staff?.length) {
      const repLabel = assignedRep ? ` → ${assignedRep}` : "";
      await sb.from("notifications").insert(
        staff.map((p: { id: string }) => ({
          tenant_id: AVENSTONE_TENANT,
          user_id: p.id,
          job_id: jobId,
          type: "new_lead",
          title: `New lead from GHL${repLabel}`,
          body: `${clientName} — ${address}${dealValue ? ` — $${dealValue.toLocaleString()}` : ""}`,
          read: false,
          email_sent: false,
          sms_sent: false,
        }))
      );
    }

    console.log(`Created job ${jobId} for ${clientName}`);
    return new Response(JSON.stringify({ ok: true, job_id: jobId, client: clientName, address, assigned_rep: assignedRep }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("GHL webhook error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
