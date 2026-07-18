import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Parse caller identity
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "Unauthenticated" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ ok: false, error: "Unauthenticated" }, 401);
    const callerId = user.id;

    // 2. Validate body
    let body: any;
    try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
    const { engagementId } = body;
    if (!engagementId) return json({ ok: false, error: "engagementId is required" }, 400);

    // 3. SELECT engagement with sub profile + job
    const { data: engagement, error: engErr } = await sb
      .from("job_sub_engagements")
      .select("*, sub:profiles!sub_id(id, full_name, email, phone), job:jobs!job_id(id, address, status)")
      .eq("id", engagementId)
      .single();

    // 4. Validate existence + ownership
    if (engErr || !engagement) return json({ ok: false, error: "Engagement not found" }, 404);
    if (engagement.sub_id !== callerId) return json({ ok: false, error: "Forbidden" }, 403);

    // 5. Stamp first_viewed_at idempotently (non-blocking)
    if (!engagement.first_viewed_at) {
      sb.from("job_sub_engagements")
        .update({ first_viewed_at: new Date().toISOString() })
        .eq("id", engagementId)
        .is("first_viewed_at", null)
        .then(({ error }) => {
          if (error) console.error("[view-engagement] first_viewed_at stamp failed:", error.message);
        });
    }

    // SELECT current bid separately
    const { data: currentBid } = await sb
      .from("engagement_bids")
      .select("*")
      .eq("engagement_id", engagementId)
      .eq("is_current", true)
      .maybeSingle();

    // WALKTHROUGH_TYPES — resolve shared scope docs (e.g. the sub-walk recap) to signed URLs so
    // the sub can open them. Service-role signs, so the sub never needs storage RLS on the bucket.
    let scopeDocuments: Array<{ id: string; name: string; subcategory: string | null; url: string }> = [];
    const docIds: string[] = Array.isArray(engagement.shared_doc_ids) ? engagement.shared_doc_ids : [];
    if (docIds.length) {
      const { data: files } = await sb
        .from("job_files")
        .select("id, name, storage_bucket, storage_path, subcategory")
        .in("id", docIds)
        .eq("lifecycle_status", "active");
      const signed = await Promise.all((files || []).map(async (f: Record<string, any>) => {
        const { data: sig } = await sb.storage.from(f.storage_bucket || "bid-quotes").createSignedUrl(f.storage_path, 3600);
        return sig?.signedUrl ? { id: f.id, name: f.name, subcategory: f.subcategory ?? null, url: sig.signedUrl } : null;
      }));
      scopeDocuments = signed.filter((d): d is { id: string; name: string; subcategory: string | null; url: string } => !!d);
    }

    // 6. Return engagement + current bid + scope documents
    return json({ ok: true, data: { engagement, currentBid: currentBid || null, scopeDocuments } }, 200);

  } catch (err) {
    console.error("[view-engagement] error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
