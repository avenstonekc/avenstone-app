import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
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

    return new Response(JSON.stringify({ user_id: data.user.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-invite error:", err);
    return new Response(String(err), { status: 500, headers: corsHeaders });
  }
});
