import { createClient } from "npm:@supabase/supabase-js@2";

// FIELD_OPUS_ARC Phase 4: webhook for VM → Supabase result posting.
// Gated by VM_WEBHOOK_SECRET (x-webhook-secret header — same pattern as ai-auto-fix-dispatcher).
// Updates dispatch queue row + appends dispatch_result message to thread.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VM_SECRET = Deno.env.get('VM_WEBHOOK_SECRET');

const KALIN_THREAD_ID = '11111111-1111-1111-1111-111111111111';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST required' }), { status: 405 });
  }

  if (!VM_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'VM_WEBHOOK_SECRET not configured' }), { status: 500 });
  }

  const providedSecret = req.headers.get('x-webhook-secret');
  if (providedSecret !== VM_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid secret' }), { status: 403 });
  }

  let body: {
    queue_id?: string;
    status?: 'completed' | 'failed';
    commit_hash?: string;
    result_text?: string;
    error_text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid json body' }), { status: 400 });
  }

  const queueId = body.queue_id?.trim();
  if (!queueId) {
    return new Response(JSON.stringify({ ok: false, error: 'queue_id required' }), { status: 400 });
  }
  if (!['completed', 'failed'].includes(body.status || '')) {
    return new Response(JSON.stringify({ ok: false, error: 'status must be completed or failed' }), { status: 400 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Update queue row
  const updatePayload: Record<string, unknown> = {
    status: body.status,
    completed_at: new Date().toISOString(),
  };
  if (body.commit_hash) updatePayload.commit_hash = body.commit_hash;
  if (body.result_text) updatePayload.result_text = body.result_text;
  if (body.error_text) updatePayload.error_text = body.error_text;

  const { error: updateErr } = await sb
    .from('field_opus_dispatch_queue')
    .update(updatePayload)
    .eq('id', queueId);

  if (updateErr) {
    return new Response(
      JSON.stringify({ ok: false, error: `queue update failed: ${updateErr.message}` }),
      { status: 500 },
    );
  }

  // Compose result message
  const isSuccess = body.status === 'completed';
  const resultSummary = isSuccess
    ? `✓ Dispatch completed${body.commit_hash ? ` — commit ${body.commit_hash}` : ''}\n\n${body.result_text || '(no result text)'}`
    : `✗ Dispatch failed\n\n${body.error_text || '(no error text)'}`;

  const { error: msgErr } = await sb
    .from('field_opus_messages')
    .insert({
      thread_id: KALIN_THREAD_ID,
      role: 'dispatch_result',
      content: resultSummary,
      meta: {
        queue_id: queueId,
        status: body.status,
        commit_hash: body.commit_hash || null,
      },
    });

  if (msgErr) {
    return new Response(
      JSON.stringify({ ok: false, error: `message insert failed: ${msgErr.message}` }),
      { status: 500 },
    );
  }

  // Best-effort push notification — never fail the webhook if this errors.
  try {
    const KALIN_USER_ID = '8171742a-b586-4f13-be61-744e191a1896';
    const title = isSuccess
      ? `Dispatch complete${body.commit_hash ? ` · ${body.commit_hash.slice(0, 7)}` : ''}`
      : 'Dispatch failed';
    const notifBody = isSuccess
      ? (body.result_text?.slice(0, 140) || 'Field-Opus dispatch finished. Open to review.')
      : (body.error_text?.slice(0, 140) || 'Field-Opus dispatch failed. Open to review.');
    const { error: notifErr } = await sb.from('notifications').insert({
      user_id: KALIN_USER_ID,
      type: 'todo_delegated',
      title,
      body: notifBody,
    });
    if (notifErr) {
      console.error('field-opus-result-webhook notification insert failed:', notifErr.message);
    }
  } catch (pushErr) {
    console.error('field-opus-result-webhook push fanout failed:', pushErr);
  }

  // Auto-fire an Opus reflection turn so the thread has a response ready when Kalin opens the app.
  try {
    const reflectionMessage = isSuccess
      ? `[System] VM dispatch ${queueId} completed${body.commit_hash ? ` at commit ${body.commit_hash.slice(0, 7)}` : ''}. Summarize what shipped in 1-3 sentences. If anything in the result looks like it needs follow-up work, flag it but do NOT auto-draft a prompt — wait for Kalin's go-ahead.`
      : `[System] VM dispatch ${queueId} FAILED. Diagnose the failure from the result text: identify the root cause and propose a concrete next slice. Be specific about file/line/symptom.`;

    await sb.from('field_opus_messages').insert({
      thread_id: KALIN_THREAD_ID,
      role: 'user',
      content: reflectionMessage,
      meta: { kind: 'auto_reflection_trigger', queue_id: queueId },
    });

    const chatRes = await fetch(`${SUPABASE_URL}/functions/v1/field-opus-chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-field-opus-webhook-secret': VM_SECRET!,
      },
      body: JSON.stringify({ message: reflectionMessage, system_invocation: true }),
    });

    if (!chatRes.ok) {
      const errBody = await chatRes.text();
      console.error(`field-opus-chat system call failed (${chatRes.status}): ${errBody.slice(0, 300)}`);
    } else {
      console.log(`field-opus-chat system call succeeded for queue_id=${queueId}`);
    }
  } catch (autoErr) {
    console.error('auto-reflection chat invocation exception:', autoErr);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
