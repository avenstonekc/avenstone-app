// EXECUTION_ARC Phase 9a — actuals capture layer.
// Auto-fires when a job's status flips to 'complete'. Snapshots trade-level
// cost data using best-available proxies. Idempotent via UNIQUE (tenant, job, trade).

export async function captureTradeActualsForJob(sb, AV_TENANT, jobId) {
  if (!jobId) return { captured: 0, error: 'jobId required' };

  const { data: job, error: jobErr } = await sb
    .from('jobs')
    .select('id, status, tenant_id')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    console.warn('[tradeActuals] job load failed:', jobErr?.message);
    return { captured: 0, error: 'job_load_failed' };
  }

  if (job.status !== 'complete') {
    console.warn(`[tradeActuals] skip — job ${jobId} status is ${job.status}, not complete`);
    return { captured: 0, error: 'job_not_complete' };
  }

  const trades = await discoverTradesForJob(sb, jobId);
  if (trades.length === 0) {
    return { captured: 0, error: 'no_trades' };
  }

  const completionDate = new Date().toISOString().slice(0, 10);
  let captured = 0;
  for (const trade of trades) {
    const result = await captureSingleTrade(sb, AV_TENANT, jobId, trade, completionDate);
    if (result) captured++;
  }
  return { captured, total: trades.length };
}

async function discoverTradesForJob(sb, jobId) {
  const tradeSet = new Set();

  const { data: eng } = await sb.from('job_sub_engagements').select('trade').eq('job_id', jobId);
  eng?.forEach(e => e.trade && tradeSet.add(e.trade.trim()));

  const { data: mat } = await sb.from('material_orders').select('trade').eq('job_id', jobId);
  mat?.forEach(m => m.trade && tradeSet.add(m.trade.trim()));

  const { data: sch } = await sb.from('schedule_items').select('trade').eq('job_id', jobId).eq('type', 'sub_start');
  sch?.forEach(s => s.trade && tradeSet.add(s.trade.trim()));

  return Array.from(tradeSet);
}

async function captureSingleTrade(sb, AV_TENANT, jobId, trade, completionDate) {
  // Labor: sum of accepted current bids on engagements for this job + trade.
  // Schema reality: engagement_bids.engagement_id -> job_sub_engagements.id;
  // "accepted" = accepted_at IS NOT NULL AND is_current=true.
  const { data: engagements } = await sb
    .from('job_sub_engagements')
    .select('id')
    .eq('job_id', jobId)
    .ilike('trade', trade);

  const engagementIds = (engagements ?? []).map(e => e.id);
  let laborCost = 0;
  let bidCount = 0;
  if (engagementIds.length > 0) {
    const { data: acceptedBids } = await sb
      .from('engagement_bids')
      .select('id, total_amount')
      .in('engagement_id', engagementIds)
      .eq('is_current', true)
      .not('accepted_at', 'is', null);

    laborCost = acceptedBids?.reduce((sum, b) => sum + Number(b.total_amount ?? 0), 0) ?? 0;
    bidCount = acceptedBids?.length ?? 0;
  }

  // Material: sum of non-cancelled material_orders quote_totals for this job + trade.
  const { data: materialOrders } = await sb
    .from('material_orders')
    .select('id, quote_total')
    .eq('job_id', jobId)
    .ilike('trade', trade)
    .not('status', 'eq', 'cancelled');

  const materialCost = materialOrders?.reduce((sum, m) => sum + Number(m.quote_total ?? 0), 0) ?? 0;
  const materialOrderCount = materialOrders?.length ?? 0;

  if (laborCost === 0 && materialCost === 0) {
    return null;
  }

  const insertRow = {
    tenant_id: AV_TENANT,
    job_id: jobId,
    trade,
    labor_cost: laborCost > 0 ? laborCost : null,
    material_cost: materialCost > 0 ? materialCost : null,
    labor_source: laborCost > 0 ? 'accepted_bids' : null,
    material_source: materialCost > 0 ? 'material_order_quotes' : null,
    bid_count: bidCount,
    material_order_count: materialOrderCount,
    job_completion_date: completionDate,
    captured_method: 'auto_on_complete',
  };

  const { data, error } = await sb
    .from('trade_actuals')
    .upsert(insertRow, { onConflict: 'tenant_id,job_id,trade' })
    .select()
    .single();

  if (error) {
    console.warn(`[tradeActuals] insert failed for trade ${trade}:`, error.message);
    return null;
  }
  return data;
}

export async function captureTradeActualsManually(sb, AV_TENANT, jobId, options = {}) {
  return captureTradeActualsForJob(sb, AV_TENANT, jobId);
}

export async function sbBackfillTradeActuals(sb, AV_TENANT) {
  const { data: completeJobs } = await sb
    .from('jobs')
    .select('id')
    .eq('status', 'complete');

  let totalCaptured = 0;
  for (const job of completeJobs ?? []) {
    const result = await captureTradeActualsForJob(sb, AV_TENANT, job.id);
    totalCaptured += result.captured;
  }
  return { jobs: completeJobs?.length ?? 0, totalCaptured };
}
