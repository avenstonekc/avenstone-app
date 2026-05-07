// EXECUTION_ARC Phase 6 — dual-trigger schedule_item auto-creation.
// When both:
//   1. An accepted engagement (status='active') for trade X on job J
//   2. A quoted material_order with quoted_delivery_date for trade X on job J
// exist, auto-creates a sub_start schedule_item with scheduled_date = delivery + buffer.
//
// Idempotent: only skips if a Phase-6-auto-created (auto_created=true) sub_start
// already exists for this trade on this job. sbAcceptBid-drafted items (auto_created=false)
// are intentionally left alone — both signals coexist for PM review.
//
// Schema notes (from audit):
//   - Column is 'scheduled_date' (DATE), not 'start_date'
//   - Status default is 'scheduled', not 'planned'
//   - 'title' is NOT NULL — required field
//   - engagement table is 'job_sub_engagements', accepted status is 'active'

const DEFAULT_BUFFER_DAYS = 1;

export async function checkAndCreateSubStart(sb, AV_TENANT, AV_USER_ID, jobId, trade) {
  if (!jobId || !trade) return null;

  const tradeNormalized = trade.trim();
  if (!tradeNormalized) return null;

  // 1. Check for accepted engagement for this trade on this job (status='active' post-accept)
  const { data: acceptedEngagements, error: engErr } = await sb
    .from('job_sub_engagements')
    .select('id, trade, status, sub_id')
    .eq('job_id', jobId)
    .ilike('trade', tradeNormalized)
    .eq('status', 'active')
    .limit(1);

  if (engErr) {
    console.warn('[scheduleAutoCreate] engagement check failed:', engErr.message);
    return null;
  }
  if (!acceptedEngagements?.length) return null;

  // 2. Check for quoted+ material_order with delivery date for this trade
  const { data: quotedOrders, error: orderErr } = await sb
    .from('material_orders')
    .select('id, trade, status, quoted_delivery_date')
    .eq('job_id', jobId)
    .ilike('trade', tradeNormalized)
    .in('status', ['quoted', 'ordered', 'delivered'])
    .not('quoted_delivery_date', 'is', null)
    .order('quoted_delivery_date', { ascending: true })
    .limit(1);

  if (orderErr) {
    console.warn('[scheduleAutoCreate] order check failed:', orderErr.message);
    return null;
  }
  if (!quotedOrders?.length) return null;

  // 3. Idempotency: only skip if a Phase-6-created sub_start already exists.
  // sbAcceptBid's draft items (auto_created=false) are left untouched.
  const { data: existing, error: existingErr } = await sb
    .from('schedule_items')
    .select('id')
    .eq('job_id', jobId)
    .eq('type', 'sub_start')
    .ilike('trade', tradeNormalized)
    .eq('auto_created', true)
    .neq('status', 'cancelled')
    .limit(1);

  if (existingErr) {
    console.warn('[scheduleAutoCreate] existing check failed:', existingErr.message);
    return null;
  }
  if (existing?.length) return null;

  // 4. Compute scheduled_date = delivery_date + buffer
  const delivery = new Date(quotedOrders[0].quoted_delivery_date + 'T00:00:00Z');
  delivery.setUTCDate(delivery.getUTCDate() + DEFAULT_BUFFER_DAYS);
  const scheduledDate = delivery.toISOString().slice(0, 10);

  const eng = acceptedEngagements[0];
  const order = quotedOrders[0];

  // 5. Create the schedule_item
  const insertRow = {
    tenant_id: AV_TENANT,
    job_id: jobId,
    type: 'sub_start',
    title: `${eng.trade} start — delivery + ${DEFAULT_BUFFER_DAYS}d buffer`,
    trade: eng.trade,
    assigned_sub_id: eng.sub_id,
    engagement_id: eng.id,
    scheduled_date: scheduledDate,
    status: 'scheduled',
    notify_client: true,
    notify_sub: true,
    notes: `Auto-created from accepted bid + quoted delivery (${order.quoted_delivery_date}). Review the start date and buffer — adjust if needed, then resolve the todo to confirm.`,
    auto_created: true,
    auto_created_from_engagement_id: eng.id,
    auto_created_from_material_order_id: order.id,
    created_by_id: AV_USER_ID,
  };

  const { data: newItem, error: insertErr } = await sb
    .from('schedule_items')
    .insert(insertRow)
    .select()
    .single();

  if (insertErr) {
    console.warn('[scheduleAutoCreate] insert failed:', insertErr.message);
    return null;
  }

  return newItem;
}
