import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return new Response("missing token", { status: 400, headers: corsHeaders });

    const sb = createClient(SB_URL, SB_SERVICE);

    // Fetch job by status_token
    const { data: job, error } = await sb
      .from("jobs")
      .select("id, address, status, client_name, target_completion, referring_realtor_name")
      .eq("status_token", token)
      .single();

    if (error || !job) return new Response("not found", { status: 404, headers: corsHeaders });

    // Fetch phases
    const { data: phases } = await sb
      .from("job_phases")
      .select("phase_name, phase_order, status, start_date, end_date")
      .eq("job_id", job.id)
      .order("phase_order", { ascending: true });

    // Fetch last 3 photos
    const { data: photos } = await sb
      .from("photos")
      .select("url, type, created_at")
      .eq("job_id", job.id)
      .eq("type", "photo")
      .order("created_at", { ascending: false })
      .limit(4);

    // Only expose first name for privacy
    const clientFirstName = job.client_name
      ? job.client_name.trim().split(" ")[0]
      : null;

    return new Response(
      JSON.stringify({
        address: job.address,
        status: job.status,
        client_first_name: clientFirstName,
        target_completion: job.target_completion || null,
        phases: (phases || []).map(p => ({
          name: p.phase_name,
          order: p.phase_order,
          status: p.status,
          start_date: p.start_date,
          end_date: p.end_date,
        })),
        photos: (photos || []).map(p => ({ url: p.url, created_at: p.created_at })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-job-status error:", err);
    return new Response(String(err), { status: 500, headers: corsHeaders });
  }
});
