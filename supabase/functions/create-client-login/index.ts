
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, client_name, job_id, tenant_id } = await req.json();
    if (!email || !password || !job_id || !tenant_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing fields: email, password, job_id, tenant_id required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ ok: false, error: "Password must be at least 6 characters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    // Find existing user by email via profiles — avoids listUsers() pagination limit
    // Use limit(1) to handle duplicate email rows without throwing
    const { data: profileRows } = await sb.from("profiles").select("id, role").eq("email", email).limit(1);
    const profileRow = profileRows?.[0] ?? null;
    let userId: string | null = profileRow?.id ?? null;

    if (profileRow) {
      const isStaff = profileRow.role && ["owner", "project_manager", "sales_rep"].includes(profileRow.role);
      if (isStaff) {
        return new Response(
          JSON.stringify({ ok: false, error: "Cannot create client login for a staff email — would overwrite their role" }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      // Set password on existing auth user and confirm email immediately
      const { error: updateError } = await sb.auth.admin.updateUserById(userId!, {
        password,
        email_confirm: true,
      });
      if (updateError) {
        return new Response(
          JSON.stringify({ ok: false, error: updateError.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      // Ensure profile is role=client and linked to correct tenant
      await sb.from("profiles").update({ tenant_id, full_name: client_name || "", role: "client", email }).eq("id", userId);
    } else {
      // Create new auth user with email+password, confirmed immediately — no email round-trip
      const { data, error } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: client_name || "", role: "client", tenant_id },
      });
      if (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      userId = data.user.id;
      await sb.from("profiles").upsert(
        { id: userId, tenant_id, full_name: client_name || "", email, role: "client" },
        { onConflict: "id" }
      );
    }

    // Link client to this job
    await sb.from("jobs").update({ client_user_id: userId, client_email: email }).eq("id", job_id);

    return new Response(JSON.stringify({ ok: true, email, user_id: userId }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("create-client-login error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
