// Phase-driven todo engine. Idempotent. Operates only on source='engine' todos.
// Manual user-created todos (source='manual') are never touched by the engine.

const RULES = [
  // ---- Rule 1: material order in 'planned' state needs a quote ----
  {
    name: 'material_planned_get_quote',
    create_on: 'material_order.created',
    create_condition: (event) => event.status === 'planned',
    create_payload: (event) => ({
      title: `Get quote for ${event.trade} materials`,
      type: 'material_quote_needed',
      job_id: event.jobId,
      related_entity_type: 'material_order',
      related_entity_id: event.orderId,
    }),
    resolve_on: ['material_order.status_changed', 'material_order.deleted'],
    resolve_condition: (event, todo) => {
      if (todo.related_entity_id !== event.orderId) return false;
      return event.newStatus !== 'planned';
    },
    resolve_match: (todo) =>
      todo.type === 'material_quote_needed' &&
      todo.related_entity_type === 'material_order' &&
      todo.source === 'engine',
  },
  // ---- Rule 2: auto-created sub_start needs PM review ----
  {
    name: 'auto_sub_start_review',
    create_on: 'schedule_item.auto_created',
    create_payload: (event) => ({
      title: `Review auto-created ${event.trade} start: ${event.startDate}`,
      notes: 'System scheduled this from an accepted bid + quoted delivery date. Adjust the start date or buffer if needed, or resolve to confirm.',
      type: 'auto_sub_start_review',
      job_id: event.jobId,
      related_entity_type: 'schedule_item',
      related_entity_id: event.scheduleItemId,
    }),
    resolve_on: ['schedule_item.modified', 'schedule_item.cancelled', 'schedule_item.completed'],
    resolve_condition: (event, todo) => todo.related_entity_id === event.scheduleItemId,
    resolve_match: (todo) =>
      todo.type === 'auto_sub_start_review' &&
      todo.related_entity_type === 'schedule_item' &&
      todo.source === 'engine',
  },
];

function findCreateRules(eventType) {
  return RULES.filter(r => r.create_on === eventType);
}
function findResolveRules(eventType) {
  return RULES.filter(r => Array.isArray(r.resolve_on) && r.resolve_on.includes(eventType));
}

export async function runTodoEngine(sb, AV_TENANT, AV_USER_ID, eventType, event) {
  const results = { created: [], resolved: [] };

  // --- CREATE phase ---
  for (const rule of findCreateRules(eventType)) {
    if (rule.create_condition && !rule.create_condition(event)) continue;

    const payloadPreview = rule.create_payload(event);

    // Idempotency: refuse duplicate open todo for same engine rule + entity
    const { data: existing } = await sb
      .from('todos')
      .select('id')
      .eq('type', payloadPreview.type)
      .eq('related_entity_id', payloadPreview.related_entity_id)
      .eq('source', 'engine')
      .eq('status', 'open')
      .limit(1);

    if (existing?.length) continue;

    const insertRow = {
      tenant_id: AV_TENANT,
      ...payloadPreview,
      source: 'engine',
      status: 'open',
      created_by_id: AV_USER_ID,
    };

    const { data, error } = await sb.from('todos').insert(insertRow).select().single();
    if (error) {
      console.warn(`[todoEngine] create failed for rule ${rule.name}:`, error.message);
      continue;
    }
    results.created.push({ rule: rule.name, todoId: data.id });
  }

  // --- RESOLVE phase ---
  for (const rule of findResolveRules(eventType)) {
    const samplePayload = rule.create_payload(event);
    const { data: candidates, error: loadErr } = await sb
      .from('todos')
      .select('*')
      .eq('status', 'open')
      .eq('source', 'engine')
      .eq('type', samplePayload.type ?? null);

    if (loadErr) {
      console.warn(`[todoEngine] resolve load failed for rule ${rule.name}:`, loadErr.message);
      continue;
    }
    if (!candidates?.length) continue;

    const matching = candidates.filter(t => rule.resolve_match(t));
    for (const todo of matching) {
      if (rule.resolve_condition && !rule.resolve_condition(event, todo)) continue;

      const { error: updErr } = await sb
        .from('todos')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_reason: 'auto_resolved_by_engine',
          updated_at: new Date().toISOString(),
        })
        .eq('id', todo.id)
        .eq('status', 'open');

      if (updErr) {
        console.warn(`[todoEngine] resolve failed for todo ${todo.id}:`, updErr.message);
        continue;
      }
      results.resolved.push({ rule: rule.name, todoId: todo.id });
    }
  }

  return results;
}
