// pendingTasks.js — helpers for pending_tasks table
import { sb, AV_TENANT, AV_USER_ID } from './supabase';

const now = () => new Date().toISOString();

export async function sbCreatePendingTask({ verb, quickLabel, context = {} }) {
  const { data, error } = await sb
    .from('pending_tasks')
    .insert({
      tenant_id: AV_TENANT,
      user_id: AV_USER_ID,
      verb,
      status: 'pending',
      quick_label: quickLabel || null,
      context,
      created_at: now(),
      updated_at: now(),
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

export async function sbUpdatePendingTask(id, patch) {
  const { data, error } = await sb
    .from('pending_tasks')
    .update({ ...patch, updated_at: now() })
    .eq('id', id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

export async function sbDiscardPendingTask(id, reason) {
  const { data, error } = await sb
    .from('pending_tasks')
    .update({
      status: 'discarded',
      discard_reason: reason,
      discarded_at: now(),
      updated_at: now(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

export async function sbCompletePendingTask(id, { resultingEntityType, resultingEntityId } = {}) {
  const { data, error } = await sb
    .from('pending_tasks')
    .update({
      status: 'complete',
      completed_at: now(),
      resulting_entity_type: resultingEntityType || null,
      resulting_entity_id: resultingEntityId || null,
      updated_at: now(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

export async function sbLoadMyPendingTasks() {
  const { data, error } = await sb
    .from('pending_tasks')
    .select('*')
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message, data: [] };
  return { ok: true, error: null, data: data || [] };
}

export async function sbIncrementSnooze(id) {
  // Use a read then update since supabase-js v2 doesn't support computed updates client-side
  const { data: row, error: fetchErr } = await sb
    .from('pending_tasks')
    .select('snooze_count')
    .eq('id', id)
    .single();
  if (fetchErr) return { ok: false, error: fetchErr.message, data: null };
  const { data, error } = await sb
    .from('pending_tasks')
    .update({
      snooze_count: (row?.snooze_count || 0) + 1,
      last_opened_at: now(),
      updated_at: now(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}
