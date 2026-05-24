import { createClient } from "npm:@supabase/supabase-js@2";

// FIELD_OPUS_ARC Phase 2: read-only source-file proxy.
// Hard-gated to Kalin's auth ID. Returns raw file content from the repo.

const KALIN_USER_ID = '8171742a-b586-4f13-be61-744e191a1896';
const REPO_RAW_BASE = 'https://raw.githubusercontent.com/avenstonekc/avenstone-app/refs/heads/main/';

const ALLOWED_PATH_PREFIXES = [
  'avenstone-vite/src/',
  'avenstone-vite/ios/',
  'avenstone-vite/public/',
  'supabase/functions/',
  'supabase/migrations/',
  'tools/',
];

const ALLOWED_ROOT_FILES = new Set([
  'CLAUDE.md',
  'CLAUDE_MEMORY.md',
  'CLAUDE_ARCHIVE.md',
  'CLAUDE_INDEX.md',
  'OPUS_RULES.md',
  'AVENSTONE_VISION.md',
  'FIELD_OPUS_ARC.md',
  'AGENT_CARDS_ARC.md',
  'AGENT_OPS_ARC.md',
  'DAILY_LOG_ARC.md',
  'EXECUTION_ARC.md',
  'INVOICING_ARC.md',
  'PUSH_NOTIFICATIONS_ARC.md',
  'VOICE_AGENT.md',
  'PUSH_NOTIFICATIONS_ARC_APNS_CERT_SETUP.md',
  'codemagic.yaml',
  'package.json',
  '.gitignore',
  'README.md',
]);

function isAllowedPath(path: string): boolean {
  if (path.includes('..')) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('\0')) return false;

  if (ALLOWED_ROOT_FILES.has(path)) return true;
  return ALLOWED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

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
  if (error || !user) {
    return { ok: false, error: 'invalid token' };
  }
  if (user.id !== KALIN_USER_ID) {
    return { ok: false, error: 'forbidden' };
  }
  return { ok: true };
}

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

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid json body' }), { status: 400 });
  }

  const path = body.path?.trim();
  if (!path) {
    return new Response(JSON.stringify({ ok: false, error: 'path required' }), { status: 400 });
  }

  if (!isAllowedPath(path)) {
    return new Response(
      JSON.stringify({ ok: false, error: `path not in allowed prefixes or root files: ${path}` }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  const url = REPO_RAW_BASE + path;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `github raw ${res.status}: ${res.statusText}`, url }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    const content = await res.text();

    // Truncate guard — 250KB max. Anything bigger is almost certainly the wrong file
    // for an audit. Field-Opus brain handles truncation in its prompt logic.
    const maxBytes = 250_000;
    const truncated = content.length > maxBytes;
    const final = truncated ? content.slice(0, maxBytes) : content;

    return new Response(
      JSON.stringify({
        ok: true,
        path,
        content: final,
        truncated,
        original_length: content.length,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
});
