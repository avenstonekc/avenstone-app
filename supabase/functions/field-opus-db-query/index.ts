import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// FIELD_OPUS_ARC Phase 2: read-only whitelist DB queries.
// Hard-gated to Kalin's auth ID. Each query_kind is named and pre-defined.
// No raw SQL surface. Brain (Phase 3) calls via tool_use.

const KALIN_USER_ID = '8171742a-b586-4f13-be61-744e191a1896';

async function verifyKalinAuth(req: Request): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, error: 'missing authorization header' };
  }
  const token = authHeader.slice('Bearer '.length);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const sb = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return { ok: false, error: 'invalid token' };
  if (user.id !== KALIN_USER_ID) return { ok: false, error: 'forbidden' };
  return { ok: true };
}

// ============================================================
// Query registry — add new query_kinds here, deploy, done.
// All queries use the SERVICE-ROLE client (already auth-gated above).
// ============================================================

type QueryFn = (sb: SupabaseClient, params: Record<string, unknown>) => Promise<unknown>;

const QUERIES: Record<string, QueryFn> = {
  recent_bug_reports: async (sb) => {
    const { data, error } = await sb
      .from('bug_reports')
      .select('id, title, description, status, classification, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { rows: data || [] };
  },

  recent_auto_fix_attempts: async (sb) => {
    const { data, error } = await sb
      .from('auto_fix_attempts')
      .select('id, bug_report_id, status, commit_hash, attempt_number, started_at, completed_at, result_summary')
      .order('started_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { rows: data || [] };
  },

  ai_error_logs_summary: async (sb) => {
    const { data, error } = await sb
      .from('ai_error_logs')
      .select('id, function_name, error_message, user_id, created_at, metadata')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { rows: data || [] };
  },

  failed_intents_last_24h: async (sb) => {
    const { data, error } = await sb
      .from('failed_intents')
      .select('id, intent_kind, error_message, payload, created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { rows: data || [] };
  },

  schema_for_table: async (sb, params) => {
    const tableName = (params.table_name as string)?.trim();
    if (!tableName) throw new Error('table_name required');
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) throw new Error('invalid table_name format');

    const { data, error } = await sb.rpc('exec_information_schema_columns', {
      p_table_name: tableName,
    });
    if (error) {
      // Fallback: direct query. Service-role can read information_schema.
      const { data: data2, error: err2 } = await (sb as SupabaseClient)
        .from('information_schema.columns' as never)
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_schema', 'public')
        .eq('table_name', tableName)
        .order('ordinal_position');
      if (err2) throw new Error(err2.message);
      return { rows: data2 || [] };
    }
    return { rows: data || [] };
  },

  policies_for_table: async (sb, params) => {
    const tableName = (params.table_name as string)?.trim();
    if (!tableName) throw new Error('table_name required');
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) throw new Error('invalid table_name format');

    const { data, error } = await sb.rpc('exec_pg_policies_for_table', {
      p_table_name: tableName,
    });
    if (error) {
      return { rows: [], note: `rpc unavailable: ${error.message}` };
    }
    return { rows: data || [] };
  },

  recent_notifications: async (sb) => {
    const { data, error } = await sb
      .from('notifications')
      .select('id, user_id, type, title, email_sent, created_at')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { rows: data || [] };
  },

  push_subscriptions_overview: async (sb) => {
    const { data, error } = await sb
      .from('push_subscriptions')
      .select('id, user_id, channel, created_at')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { rows: data || [] };
  },

  jobs_by_status: async (sb) => {
    const { data, error } = await sb
      .from('jobs')
      .select('status')
      .limit(2000);
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const s = (row as { status: string }).status || 'null';
      counts[s] = (counts[s] || 0) + 1;
    }
    return { counts };
  },
};

const ALLOWED_KINDS = new Set(Object.keys(QUERIES));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-allow-methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST required' }), { status: 405 });
  }

  const authCheck = await verifyKalinAuth(req);
  if (!authCheck.ok) {
    return new Response(JSON.stringify({ ok: false, error: authCheck.error }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: { query_kind?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid json body' }), { status: 400 });
  }

  const kind = body.query_kind?.trim();
  if (!kind) {
    return new Response(JSON.stringify({ ok: false, error: 'query_kind required' }), { status: 400 });
  }

  if (!ALLOWED_KINDS.has(kind)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `unknown query_kind: ${kind}`,
        available: Array.from(ALLOWED_KINDS),
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const result = await QUERIES[kind](sb, body.params || {});
    return new Response(
      JSON.stringify({ ok: true, query_kind: kind, data: result }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ ok: false, query_kind: kind, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
});
