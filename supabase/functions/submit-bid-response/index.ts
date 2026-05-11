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
    // 1. Parse caller identity from JWT
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "Unauthenticated" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ ok: false, error: "Unauthenticated" }, 401);
    const callerId = user.id;

    // 2. Validate body
    let body: any;
    try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
    const { engagementId, totalAmount, terms, startDate, endDate, lineItems: rawLineItems, attachedDocIds, earliestStartDate, availabilityNotes } = body;
    if (!engagementId) return json({ ok: false, error: "engagementId is required" }, 400);
    if (!earliestStartDate) return json({ ok: false, error: "earliestStartDate is required" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(earliestStartDate)) return json({ ok: false, error: "earliestStartDate must be YYYY-MM-DD" }, 400);

    // Validate + normalize line items
    const lineItems: Record<string, unknown>[] = Array.isArray(rawLineItems) ? rawLineItems : [];
    for (const li of lineItems) {
      if (!li.description || typeof li.description !== "string" || !(li.description as string).trim()) {
        return json({ ok: false, error: "Each line item requires a description" }, 400);
      }
      if (typeof li.quantity !== "number" || (li.quantity as number) <= 0) {
        return json({ ok: false, error: "Each line item requires a quantity greater than zero" }, 400);
      }
      if (typeof li.unit_price !== "number" || (li.unit_price as number) < 0) {
        return json({ ok: false, error: "Each line item requires a non-negative unit_price" }, 400);
      }
      // Ensure line_total is set (honor explicit value, fall back to computed)
      const computed = (li.quantity as number) * (li.unit_price as number);
      li.line_total = typeof li.line_total === "number" ? li.line_total : computed;
    }

    // Compute total: sum of line_totals when lines present, else use lump-sum input
    let finalTotal: number;
    if (lineItems.length > 0) {
      finalTotal = lineItems.reduce((sum, li) => sum + Number(li.line_total), 0);
      if (finalTotal <= 0) return json({ ok: false, error: "Line items must sum to a positive total" }, 400);
    } else {
      if (totalAmount == null) return json({ ok: false, error: "totalAmount is required when no line items provided" }, 400);
      finalTotal = Number(totalAmount);
      if (!finalTotal || finalTotal <= 0) return json({ ok: false, error: "totalAmount must be greater than zero" }, 400);
    }

    // 3. SELECT engagement — load-bearing security + status check
    const { data: engagement, error: engErr } = await sb
      .from("job_sub_engagements")
      .select("id, sub_id, tenant_id, status, trade, job_id")
      .eq("id", engagementId)
      .single();

    if (engErr || !engagement) return json({ ok: false, error: "Engagement not found" }, 404);
    if (engagement.sub_id !== callerId) return json({ ok: false, error: "Forbidden" }, 403);
    if (engagement.status !== "invited")
      return json({ ok: false, error: `Cannot submit bid — engagement status is '${engagement.status}'` }, 409);

    // 5. Determine revision number
    const { data: maxRow } = await sb
      .from("engagement_bids")
      .select("revision_number")
      .eq("engagement_id", engagementId)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const revisionNumber = maxRow ? maxRow.revision_number + 1 : 1;

    // 6. Mark prior bid current=false
    await sb
      .from("engagement_bids")
      .update({ is_current: false })
      .eq("engagement_id", engagementId)
      .eq("is_current", true);

    // 7. Insert new bid row
    const now = new Date().toISOString();
    const { data: newBid, error: insertErr } = await sb
      .from("engagement_bids")
      .insert({
        engagement_id: engagementId,
        tenant_id: engagement.tenant_id,
        total_amount: finalTotal,
        terms: terms || null,
        start_date: startDate || null,
        end_date: endDate || null,
        line_items: lineItems,
        earliest_start_date: earliestStartDate,
        availability_notes: availabilityNotes ?? null,
        attached_doc_ids: attachedDocIds || [],
        revision_number: revisionNumber,
        is_current: true,
        drafted_by: "sub",
        drafted_by_id: callerId,
        submitted_at: now,
        created_at: now,
      })
      .select("id")
      .single();

    if (insertErr || !newBid) {
      // Restore prior bid current=true if insert failed
      await sb.from("engagement_bids")
        .update({ is_current: true })
        .eq("engagement_id", engagementId)
        .eq("revision_number", revisionNumber - 1);
      // Postgres unique_violation on idx_engbid_one_current (or revision_number)
      // = concurrent double-submit. The other request won the race; the partial
      // unique index correctly prevented a second is_current=true bid from
      // landing. Surface as 409, not 500 — behavior is right, only the
      // response shape was wrong.
      if ((insertErr as any)?.code === '23505') {
        return json({ ok: false, error: 'Engagement state changed concurrently' }, 409);
      }
      return json({ ok: false, error: insertErr?.message || "Failed to insert bid" }, 500);
    }

    // 8. Transition engagement with optimistic concurrency
    const { data: updatedEng, error: transErr } = await sb
      .from("job_sub_engagements")
      .update({ status: "bid_submitted", bid_submitted_at: now, updated_at: now })
      .eq("id", engagementId)
      .eq("status", "invited")
      .select("id");

    // 9. Concurrent-modification rollback
    if (transErr || !updatedEng || updatedEng.length === 0) {
      // Rollback: delete new bid, restore prior is_current
      await sb.from("engagement_bids").delete().eq("id", newBid.id);
      await sb.from("engagement_bids")
        .update({ is_current: true })
        .eq("engagement_id", engagementId)
        .eq("revision_number", revisionNumber - 1);
      return json({ ok: false, error: "Engagement state changed concurrently — refresh and retry" }, 409);
    }

    // 10. Success
    return json({ ok: true, data: { bidId: newBid.id, revisionNumber, engagementStatus: "bid_submitted" } }, 200);

  } catch (err) {
    console.error("[submit-bid-response] error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
