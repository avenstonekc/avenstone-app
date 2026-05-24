
import { createClient } from "npm:@supabase/supabase-js@2";
// @deno-types="https://esm.sh/v135/web-push@3.6.7/src/index.d.ts"
import webpush from "https://esm.sh/web-push@3.6.7?target=deno";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails("mailto:kalin@avenstonekc.com", VAPID_PUBLIC, VAPID_PRIVATE);

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  deep_link?: string;
  priority?: 'high' | 'medium' | 'low';
}

interface Sub {
  id: string;
  channel: 'web' | 'apns';
  endpoint?: string | null;
  p256dh?: string | null;
  auth?: string | null;
  apns_token?: string | null;
}

interface SubResult {
  subscription_id: string;
  channel: 'web' | 'apns';
  ok: boolean;
  error?: string;
}

let cachedJwt: { token: string; expires: number } | null = null;

async function getApnsJwt(): Promise<string> {
  const keyId  = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const authKey = Deno.env.get("APNS_AUTH_KEY");

  if (!keyId || !teamId || !authKey) throw new Error('APNs secrets not configured');

  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expires > now + 60) return cachedJwt.token;

  const enc = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const header = enc({ alg: 'ES256', kid: keyId });
  const claims = enc({ iss: teamId, iat: now });
  const signingInput = `${header}.${claims}`;

  const pem = authKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const derBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    derBytes.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    new TextEncoder().encode(signingInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const token = `${header}.${claims}.${sig}`;
  cachedJwt = { token, expires: now + 50 * 60 };
  return token;
}

// deno-lint-ignore no-explicit-any
async function sendWebPush(sub: Sub, payload: PushPayload, sb: any): Promise<SubResult> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint!, keys: { p256dh: sub.p256dh!, auth: sub.auth! } },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.deep_link || '/',
        tag: 'avenstone',
      })
    );
    return { subscription_id: sub.id, channel: 'web', ok: true };
  } catch (err: any) {
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      await sb.from('push_subscriptions').delete().eq('id', sub.id);
      return { subscription_id: sub.id, channel: 'web', ok: false, error: `cleaned stale: ${err.statusCode}` };
    }
    return { subscription_id: sub.id, channel: 'web', ok: false, error: err?.message || String(err) };
  }
}

// deno-lint-ignore no-explicit-any
async function sendApns(sub: Sub, payload: PushPayload, sb: any): Promise<SubResult> {
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");
  if (!bundleId) {
    return { subscription_id: sub.id, channel: 'apns', ok: false, error: 'APNS_BUNDLE_ID not configured' };
  }

  let jwt: string;
  try {
    jwt = await getApnsJwt();
  } catch (err: any) {
    return { subscription_id: sub.id, channel: 'apns', ok: false, error: err?.message || 'jwt failure' };
  }

  const apnsPayload = {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
      'mutable-content': 1,
    },
    data: { deep_link: payload.deep_link || '' },
  };

  try {
    const res = await fetch('https://api.push.apple.com/3/device/' + sub.apns_token, {
      method: 'POST',
      headers: {
        authorization: 'bearer ' + jwt,
        'apns-topic': bundleId,
        'apns-priority': payload.priority === 'high' ? '10' : '5',
        'apns-push-type': 'alert',
        'content-type': 'application/json',
      },
      body: JSON.stringify(apnsPayload),
    });

    if (res.status === 200) {
      return { subscription_id: sub.id, channel: 'apns', ok: true };
    }

    let reason = '';
    try {
      const body = await res.json();
      reason = body?.reason || '';
    } catch (_) { /* ignore */ }

    if (res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') {
      await sb.from('push_subscriptions').delete().eq('id', sub.id);
      return {
        subscription_id: sub.id,
        channel: 'apns',
        ok: false,
        error: `cleaned stale token: ${reason || res.status}`,
      };
    }

    return { subscription_id: sub.id, channel: 'apns', ok: false, error: `apns ${res.status}: ${reason}` };
  } catch (err: any) {
    return { subscription_id: sub.id, channel: 'apns', ok: false, error: err?.message || 'apns fetch failed' };
  }
}

Deno.serve(async (req) => {
  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!payload.user_id) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const sb = createClient(SB_URL, SB_SERVICE);

  const { data: subs, error: subsErr } = await sb
    .from('push_subscriptions')
    .select('id, channel, endpoint, p256dh, auth, apns_token')
    .eq('user_id', payload.user_id);

  if (subsErr) {
    return new Response(JSON.stringify({ ok: false, error: subsErr.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, failed: 0, errors: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const results: SubResult[] = await Promise.all(
    (subs as Sub[]).map((sub) =>
      sub.channel === 'apns'
        ? sendApns(sub, payload, sb)
        : sendWebPush(sub, payload, sb)
    )
  );

  const sent   = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const errors = results.filter((r) => !r.ok).map((r) => ({ subscription_id: r.subscription_id, channel: r.channel, error: r.error }));

  if (failed > 0) {
    try {
      await sb.from('ai_error_logs').insert({
        function_name: 'send-push',
        error_message: 'push delivery: sent=' + sent + ' failed=' + failed,
        user_id: payload.user_id,
        metadata: { errors },
      });
    } catch (_) { /* best effort */ }
  }

  return new Response(JSON.stringify({ ok: true, sent, failed, errors }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
