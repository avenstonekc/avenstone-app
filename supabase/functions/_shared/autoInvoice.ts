// INTENTIONAL DUPLICATE — edge/src circular-import boundary.
// Source of truth: avenstone-vite/src/lib/autoInvoice.js
// This file MUST be kept in lockstep with that file. Any logic change there
// must be applied here, and vice versa. Do not merge — the circular-import
// constraint (edge fns cannot import src/lib; src/lib cannot import supabase.js)
// makes a shared npm/Deno module infeasible. The divergence guard is the only
// safeguard against silent drift.
//
// EXECUTION_ARC Phase 10 — auto-invoice draft on milestone trigger.
// Called on relevant state changes. Idempotent via auto_invoiced_at stamp on draw.
// Does NOT import from supabase.js (would be circular) — uses raw sb client directly.

export async function checkAndAutoInvoice(
  sb: any,
  AV_TENANT: string,
  AV_USER_ID: string,
  eventType: string,
  event: { jobId?: string; newPhase?: string; trade?: string; newStatus?: string },
): Promise<Array<{ drawId: string; invoiceId: string; triggerLabel: string }>> {
  if (!event?.jobId) return [];

  const { data: candidateDraws, error: loadErr } = await sb
    .from('draw_schedules')
    .select('id, job_id, target_amount, title, draw_number, auto_invoice_trigger')
    .eq('job_id', event.jobId)
    .is('auto_invoiced_at', null)
    .not('auto_invoice_trigger', 'is', null);

  if (loadErr) {
    console.warn('[autoInvoice] candidate load failed:', loadErr.message);
    return [];
  }
  if (!candidateDraws?.length) return [];

  const fired: Array<{ drawId: string; invoiceId: string; triggerLabel: string }> = [];
  for (const draw of candidateDraws) {
    if (!triggerMatchesEvent(draw.auto_invoice_trigger, eventType, event)) continue;
    const result = await fireAutoInvoiceFor(sb, AV_TENANT, AV_USER_ID, draw, event);
    if (result) fired.push(result);
  }
  return fired;
}

function triggerMatchesEvent(trigger: any, eventType: string, event: any): boolean {
  if (!trigger?.type) return false;
  switch (trigger.type) {
    case 'sub_start_in_progress':
      return eventType === 'sub_start.status_changed'
        && event.newStatus === 'in_progress'
        && !!trigger.trade
        && trigger.trade.toLowerCase() === (event.trade || '').toLowerCase();
    case 'sub_start_complete':
      return eventType === 'sub_start.status_changed'
        && event.newStatus === 'complete'
        && !!trigger.trade
        && trigger.trade.toLowerCase() === (event.trade || '').toLowerCase();
    case 'delivery_complete':
      return eventType === 'material_order.delivered'
        && !!trigger.trade
        && trigger.trade.toLowerCase() === (event.trade || '').toLowerCase();
    case 'phase_advanced':
      return eventType === 'phase.advanced'
        && !!trigger.phase
        && trigger.phase === event.newPhase;
    default:
      return false;
  }
}

async function fireAutoInvoiceFor(
  sb: any,
  AV_TENANT: string,
  AV_USER_ID: string,
  draw: any,
  event: any,
): Promise<{ drawId: string; invoiceId: string; triggerLabel: string } | null> {
  const triggerLabel = describeTrigger(draw.auto_invoice_trigger, event);
  const today = new Date().toISOString().slice(0, 10);
  const amount = Number(draw.target_amount) || 0;

  let invoiceNumber: string;
  try {
    const { data: invNum, error: rpcErr } = await sb.rpc('next_invoice_number', { p_tenant_id: AV_TENANT });
    if (rpcErr) throw rpcErr;
    invoiceNumber = invNum;
  } catch (err: any) {
    console.warn('[autoInvoice] invoice number generation failed:', err.message);
    return null;
  }

  const { data: invoice, error: invErr } = await sb
    .from('invoices')
    .insert({
      tenant_id:      AV_TENANT,
      job_id:         draw.job_id,
      draw_id:        draw.id,
      invoice_number: invoiceNumber,
      invoice_date:   today,
      subtotal:       amount,
      total_amount:   amount,
      notes:          `Auto-drafted from milestone trigger: ${triggerLabel}. Review actual progress and adjust before sending.`,
      created_by_id:  AV_USER_ID,
    })
    .select('id')
    .single();

  if (invErr) {
    console.warn('[autoInvoice] invoice insert failed:', invErr.message);
    return null;
  }

  await sb.from('invoice_line_items').insert({
    tenant_id:     AV_TENANT,
    invoice_id:    invoice.id,
    description:   `Progress payment — ${draw.title || `Draw ${draw.draw_number}`}`,
    quantity:      1,
    unit_price:    amount,
    line_total:    amount,
    source_type:   'manual',
    display_order: 0,
  }).catch((err: any) => console.warn('[autoInvoice] line item insert failed:', err.message));

  await sb
    .from('draw_schedules')
    .update({ auto_invoiced_at: new Date().toISOString() })
    .eq('id', draw.id)
    .is('auto_invoiced_at', null)
    .catch((err: any) => console.warn('[autoInvoice] idempotency stamp failed for draw', draw.id, ':', err.message));

  return { drawId: draw.id, invoiceId: invoice.id, triggerLabel };
}

function describeTrigger(trigger: any, event: any): string {
  switch (trigger.type) {
    case 'sub_start_in_progress': return `${trigger.trade} sub started`;
    case 'sub_start_complete':    return `${trigger.trade} sub completed`;
    case 'delivery_complete':     return `${trigger.trade} materials delivered`;
    case 'phase_advanced':        return `Job advanced to ${event.newPhase}`;
    default:                      return trigger.type;
  }
}
