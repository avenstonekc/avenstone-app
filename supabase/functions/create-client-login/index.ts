
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Paginate auth.users to find the real auth user ID for an email.
// listUsers() only returns 50 by default — must paginate to avoid missing users.
async function findAuthUserId(sb: any, email: string): Promise<string | null> {
  let page = 1;
  while (true) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 100 });
    if (!data?.users?.length) return null;
    const match = data.users.find((u: any) => u.email === email);
    if (match) return match.id;
    if (!data.nextPage) return null;
    page++;
  }
}

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

    // Check profiles table first to catch staff-role guard (guards only, not for ID resolution)
    const { data: profileRows } = await sb.from("profiles").select("id, role").eq("email", email).limit(1);
    const profileRow = profileRows?.[0] ?? null;

    if (profileRow) {
      const isStaff = profileRow.role && ["owner", "project_manager", "sales_rep"].includes(profileRow.role);
      if (isStaff) {
        return new Response(
          JSON.stringify({ ok: false, error: "Cannot create client login for a staff email — would overwrite their role" }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Auth is the authoritative source for user IDs — paginate to handle >50 users
    let userId: string | null = await findAuthUserId(sb, email);

    if (userId) {
      // Auth user exists — set password + confirm email immediately
      const { error: updateError } = await sb.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updateError) {
        return new Response(
          JSON.stringify({ ok: false, error: updateError.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      // Ensure profile row is correct (creates if missing, updates if stale)
      await sb.from("profiles").upsert(
        { id: userId, tenant_id, full_name: client_name || "", email, role: "client" },
        { onConflict: "id" }
      );
    } else {
      // No auth user found — create with email+password, confirmed immediately
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
