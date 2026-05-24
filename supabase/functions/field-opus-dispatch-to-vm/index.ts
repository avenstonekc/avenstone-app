import { createClient } from "npm:@supabase/supabase-js@2";

// FIELD_OPUS_ARC Phase 4: client-tap-Send → enqueue + POST to VM /dispatch-interactive.
// Hard-gated to Kalin. Enforces queue depth 5.
// Reuses VM_WEBHOOK_SECRET (same secret used by auto-fix dispatcher to the same VM).

const KALIN_USER_ID = '8171742a-b586-4f13-be61-744e191a1896';
const KALIN_THREAD_ID = '11111111-1111-1111-1111-111111111111';
const MAX_IN_FLIGHT = 5;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// VM_WEBHOOK_SECRET is already set for the auto-fix path — reuse for Field-Opus.
const VM_SECRET = Deno.env.get('VM_WEBHOOK_SECRET');
const VM_DISPATCH_URL = Deno.env.get('FIELD_OPUS_VM_URL') ||
  'https://autofix.avenstonekc.com/dispatch-interactive';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

async function verifyKalinAuth(req: Request): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, error: 'missing authorization header' };
  }
  const token = authHeader.slice('Bearer '.length);

  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return { ok: false, error: 'invalid token' };
  if (user.id !== KALIN_USER_ID) return { ok: false, error: 'forbidden' };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  if (!VM_SECRET) {
    return jsonResponse({ ok: false, error: 'VM_WEBHOOK_SECRET not configured' }, 500);
  }

  const authCheck = await verifyKalinAuth(req);
  if (!authCheck.ok) return jsonResponse({ ok: false, error: authCheck.error }, 403);

  let body: { prompt?: string; message_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid json body' }, 400);
  }

  const prompt = body.prompt?.trim();
  const messageId = body.message_id?.trim();
  if (!prompt) return jsonResponse({ ok: false, error: 'prompt required' }, 400);
  if (!messageId) return jsonResponse({ ok: false, error: 'message_id required' }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Check queue depth — reject if at cap
  const { data: inFlight, error: inFlightErr } = await sb
    .from('field_opus_dispatch_queue')
    .select('id')
    .in('status', ['queued', 'dispatched']);

  if (inFlightErr) {
    return jsonResponse({ ok: false, error: `queue check failed: ${inFlightErr.message}` }, 500);
  }
  const inFlightCount = inFlight?.length ?? 0;
  if (inFlightCount >= MAX_IN_FLIGHT) {
    return jsonResponse(
      { ok: false, error: `VM busy — ${inFlightCount} dispatches in flight (cap ${MAX_IN_FLIGHT}). Wait for current to complete.` },
      200,
    );
  }

  // Enqueue
  const { data: queueRow, error: enqErr } = await sb
    .from('field_opus_dispatch_queue')
    .insert({ thread_id: KALIN_THREAD_ID, message_id: messageId, prompt, status: 'queued' })
    .select('id, created_at')
    .single();
  if (enqErr) {
    return jsonResponse({ ok: false, error: `enqueue failed: ${enqErr.message}` }, 500);
  }

  // POST to VM /dispatch-interactive
  try {
    const vmRes = await fetch(VM_DISPATCH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': VM_SECRET,
      },
      body: JSON.stringify({
        queue_id: queueRow.id,
        prompt,
        webhook_url: `${SUPABASE_URL}/functions/v1/field-opus-result-webhook`,
      }),
    });

    if (!vmRes.ok) {
      const errBody = await vmRes.text();
      await sb
        .from('field_opus_dispatch_queue')
        .update({ status: 'failed', error_text: `VM rejected (${vmRes.status}): ${errBody.slice(0, 500)}` })
        .eq('id', queueRow.id);
      return jsonResponse({ ok: false, queue_id: queueRow.id, error: `VM rejected: ${vmRes.status}` }, 200);
    }

    await sb
      .from('field_opus_dispatch_queue')
      .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
      .eq('id', queueRow.id);

    return jsonResponse({
      ok: true,
      queue_id: queueRow.id,
      status: 'dispatched',
      message: 'VM accepted. Result will stream back as a dispatch_result message.',
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await sb
      .from('field_opus_dispatch_queue')
      .update({ status: 'failed', error_text: `dispatch network error: ${errMsg}` })
      .eq('id', queueRow.id);
    return jsonResponse({ ok: false, queue_id: queueRow.id, error: errMsg }, 200);
  }
});
