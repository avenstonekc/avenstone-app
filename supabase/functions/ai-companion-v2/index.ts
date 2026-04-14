
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { job_id, user_id, role, message, tenant_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Load or create companion record
    let { data: companion } = await supabase
      .from("job_ai_companions")
      .select("*")
      .eq("job_id", job_id)
      .eq("user_id", user_id)
      .eq("role", role)
      .single();

    if (!companion) {
      const { data: newCompanion } = await supabase
        .from("job_ai_companions")
        .insert({ job_id, user_id, role, tenant_id, conversation_history: [], job_snapshot: {} })
        .select()
        .single();
      companion = newCompanion;
    }

    // Load full job context in parallel
    const [
      { data: job },
      { data: notes },
      { data: changeOrders },
      { data: payments },
      { data: phases },
      { data: subs },
    ] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", job_id).single(),
      supabase.from("job_notes").select("*").eq("job_id", job_id).order("created_at", { ascending: false }).limit(10),
      supabase.from("change_orders").select("*").eq("job_id", job_id),
      supabase.from("payments").select("*").eq("job_id", job_id),
      supabase.from("schedule_phases").select("*").eq("job_id", job_id).order("start_date"),
      supabase.from("job_subs").select("*, profiles(full_name, phone)").eq("job_id", job_id),
    ]);

    // Build job context string
    const coTotal = changeOrders?.reduce((s: number, co: any) => s + (co.amount ?? 0), 0) ?? 0;
    const paidTotal = payments?.reduce((s: number, p: any) => s + (p.amount ?? 0), 0) ?? 0;

    const jobContext = `
JOB DETAILS
-----------
Address: ${job?.address ?? "N/A"}
Client: ${job?.client_name ?? "N/A"}
Status: ${job?.status ?? "N/A"}
Contract Value: $${(job?.contract_value ?? 0).toLocaleString()}
Change Orders Total: $${coTotal.toLocaleString()}
Payments Received: $${paidTotal.toLocaleString()}
Balance Remaining: $${((job?.contract_value ?? 0) + coTotal - paidTotal).toLocaleString()}
Start Date: ${job?.start_date ?? "N/A"}
Target Completion: ${job?.target_completion ?? "N/A"}
Description: ${job?.description ?? "N/A"}

SCHEDULE PHASES
---------------
${phases?.map((p: any) => `• ${p.name}: ${p.status} (${p.start_date ?? "?"} → ${p.end_date ?? "?"})`).join("\n") ?? "None"}

ASSIGNED SUBS
-------------
${subs?.map((s: any) => `• ${s.profiles?.full_name ?? "Unknown"} — ${s.trade ?? "N/A"} (${s.profiles?.phone ?? "no phone"})`).join("\n") ?? "None"}

CHANGE ORDERS
-------------
${changeOrders?.map((co: any) => `• ${co.title ?? "N/A"}: $${(co.amount ?? 0).toLocaleString()} — ${co.status ?? "N/A"}`).join("\n") ?? "None"}

RECENT NOTES
------------
${notes?.map((n: any) => `• [${n.created_at?.slice(0, 10)}] ${n.content}`).join("\n") ?? "None"}
`.trim();

    const systemPrompt = `You are the Avenstone AI Companion — an expert construction project assistant built into the Avenstone job management platform. You have deep knowledge of construction workflows, scheduling, subcontractor coordination, change orders, and client communication.

You are speaking with the job's ${role.replace("_", " ")}. Give direct, practical, and confident answers. Be concise unless detail is needed. Never mention Claude or Anthropic — you are the Avenstone AI.

When asked to "brief me on this job", respond with a structured summary covering: current status, financial position, active phases, key risks, and what's next.

CURRENT JOB CONTEXT:
${jobContext}`;

    // Sliding window of last 20 messages
    const history: any[] = companion?.conversation_history ?? [];
    const recentHistory = history.slice(-20);

    // Call Anthropic API
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          ...recentHistory,
          { role: "user", content: message },
        ],
      }),
    });

    const anthropicData = await anthropicRes.json();
    const reply: string = anthropicData.content?.[0]?.text ?? "I'm sorry, I couldn't generate a response.";

    // Detect action keywords in reply
    const actionKeywords: { pattern: RegExp; label: string }[] = [
      { pattern: /added a note/i, label: "Added a note" },
      { pattern: /created (a )?change order/i, label: "Created a change order" },
      { pattern: /updated (the )?schedule/i, label: "Updated the schedule" },
      { pattern: /sent (a )?message/i, label: "Sent a message" },
      { pattern: /recorded (a )?payment/i, label: "Recorded a payment" },
      { pattern: /assigned (a )?(sub|subcontractor)/i, label: "Assigned a subcontractor" },
      { pattern: /marked (as )?complete/i, label: "Marked phase complete" },
    ];
    const actions_taken = actionKeywords
      .filter(({ pattern }) => pattern.test(reply))
      .map(({ label }) => label);

    // Update conversation history and companion record
    const updatedHistory = [
      ...recentHistory,
      { role: "user", content: message },
      { role: "assistant", content: reply },
    ];

    await supabase
      .from("job_ai_companions")
      .update({ conversation_history: updatedHistory, updated_at: new Date().toISOString() })
      .eq("id", companion.id);

    return new Response(
      JSON.stringify({ reply, actions_taken, companion_id: companion.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
