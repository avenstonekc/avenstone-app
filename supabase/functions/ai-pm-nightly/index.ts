import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY   = Deno.env.get("SUPABASE_ANON_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ";

const AI_PM_URL = "https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/ai-project-manager";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const EXCLUDED_STATUSES = ["lead", "bid_sent", "complete", "on_hold"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const sb = createClient(SB_URL, SB_SERVICE);

    // Query all active-construction jobs
    const { data: jobs, error } = await sb
      .from("jobs")
      .select("id, address, status")
      .not("status", "in", `(${EXCLUDED_STATUSES.map(s => `"${s}"`).join(",")})`);

    if (error) throw error;

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0, results: [] }), {
        status: 200,
        headers: CORS,
      });
    }

    const results: { job_id: string; address: string; alerts_count: number; error?: string }[] = [];

    // Process sequentially to avoid Anthropic rate limits
    for (const job of jobs) {
      try {
        const res = await fetch(AI_PM_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({
            job_id: job.id,
            request_type: "analyze",
            send_sms: false,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          results.push({ job_id: job.id, address: job.address, alerts_count: 0, error: text.slice(0, 200) });
          continue;
        }

        const data = await res.json();
        const alerts_count = (data?.analysis?.alerts || []).length;

        results.push({ job_id: job.id, address: job.address, alerts_count });
      } catch (jobErr) {
        results.push({
          job_id: job.id,
          address: job.address,
          alerts_count: 0,
          error: String(jobErr).slice(0, 200),
        });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { status: 200, headers: CORS }
    );

  } catch (err) {
    console.error("ai-pm-nightly error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS }
    );
  }
});
