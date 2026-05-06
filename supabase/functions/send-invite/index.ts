
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email, full_name, role, trade, phone, tenant_id } = await req.json();
    if (!email || !tenant_id) return new Response("missing email or tenant_id", { status: 400 });

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    // Invite creates the auth user and fires the handle_new_user trigger
    const { data, error } = await sb.auth.admin.inviteUserByEmail(email, {
      data: { full_name: full_name || "", role: role || "sub", tenant_id, trade: trade || "", phone: phone || "" },
    });

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    await sb.from("profiles").upsert({
      id: data.user.id,
      tenant_id,
      full_name: full_name || "",
      email,
      role: role || "sub",
      trade: trade || null,
      phone: phone || null,
    }, { onConflict: "id" });

    try {
      const { data: invSeqs } = await sb.from("sequences").select("id, steps").eq("tenant_id", tenant_id).eq("trigger", "sub_invited").eq("status", "active");
      for (const seq of (invSeqs || [])) {
        const { data: ex } = await sb.from("sequence_enrollments").select("id").eq("sequence_id", seq.id).eq("sub_id", data.user.id).in("status", ["active", "complete"]).maybeSingle();
        if (ex) continue;
        const steps: any[] = seq.steps || [];
        const nextSendAt = new Date(Date.now() + (steps[0]?.day ?? 0) * 86400000).toISOString();
        await sb.from("sequence_enrollments").insert({ tenant_id, sequence_id: seq.id, sub_id: data.user.id, status: "active", current_step: 0, next_send_at: nextSendAt, enrolled_at: new Date().toISOString() });
      }
    } catch (enrollErr) {
      console.error("[send-invite] auto-enroll error:", enrollErr);
    }

    return new Response(JSON.stringify({ user_id: data.user.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-invite error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
