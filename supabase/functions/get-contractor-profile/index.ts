
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tenantParam = url.searchParams.get("tenant");
    const slugParam = url.searchParams.get("slug");

    if (!tenantParam && !slugParam) {
      return new Response(
        JSON.stringify({ error: "Missing required query param: tenant or slug" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Resolve tenant_id
    let tenantId: string | null = tenantParam ?? null;

    if (!tenantId && slugParam) {
      const { data: slugRow, error: slugErr } = await supabase
        .from("company_profiles")
        .select("tenant_id")
        .eq("slug", slugParam)
        .single();

      if (slugErr || !slugRow) {
        return new Response(
          JSON.stringify({ error: "No contractor profile found for that slug" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      tenantId = slugRow.tenant_id;
    }

    // Step 2: Load company_profiles row
    const { data: company, error: companyErr } = await supabase
      .from("company_profiles")
      .select(
        "company_name, city, state, phone, website, tagline, year_founded, license_number, insurance_verified, slug, tenant_id"
      )
      .eq("tenant_id", tenantId)
      .single();

    if (companyErr || !company) {
      return new Response(
        JSON.stringify({ error: "No company profile found for that tenant" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Completed jobs count
    const { count: completedJobs } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "complete");

    // Step 4: Load job_reviews (limit 10, newest first)
    const { data: reviews } = await supabase
      .from("job_reviews")
      .select(
        "client_name, rating_quality, rating_communication, rating_timeliness, would_recommend, review_text, created_at"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10);

    const safeReviews = reviews ?? [];

    // Step 5: Calculate avg_rating across ALL reviews for that tenant
    const { data: allReviewRatings } = await supabase
      .from("job_reviews")
      .select("rating_quality, rating_communication, rating_timeliness")
      .eq("tenant_id", tenantId);

    const safeAllRatings = allReviewRatings ?? [];
    const totalReviews = safeAllRatings.length;

    let avgRating: number | null = null;
    if (totalReviews > 0) {
      const sum = safeAllRatings.reduce((acc, r) => {
        const rowAvg = ((r.rating_quality ?? 0) + (r.rating_communication ?? 0) + (r.rating_timeliness ?? 0)) / 3;
        return acc + rowAvg;
      }, 0);
      avgRating = Math.round((sum / totalReviews) * 100) / 100;
    }

    // Step 6: Load ai_knowledge for specialties and trades
    const { data: knowledge } = await supabase
      .from("ai_knowledge")
      .select("category, content")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .in("category", ["general", "trades"]);

    const safeKnowledge = knowledge ?? [];
    const specialties: string[] = safeKnowledge
      .filter((k) => k.category === "general")
      .map((k) => k.content as string);
    const trades: string[] = safeKnowledge
      .filter((k) => k.category === "trades")
      .map((k) => k.content as string);

    // Step 7: member_since — earliest created_at from profiles for this tenant
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    const memberSince = profileRow?.created_at ?? null;

    const payload = {
      company,
      stats: {
        completed_jobs: completedJobs ?? 0,
        avg_rating: avgRating,
        total_reviews: totalReviews,
        member_since: memberSince,
      },
      reviews: safeReviews,
      specialties,
      trades,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get-contractor-profile error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
