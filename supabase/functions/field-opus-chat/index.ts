import { createClient } from "npm:@supabase/supabase-js@2";

// ============================================================
// FIELD_OPUS_ARC Phase 3a — chat brain scaffolding.
// Hard-gated to Kalin's auth ID. Calls Anthropic Opus.
// Tools registered but stubbed — Phase 3b implements.
// ============================================================

const KALIN_USER_ID = '8171742a-b586-4f13-be61-744e191a1896';
const KALIN_THREAD_ID = '11111111-1111-1111-1111-111111111111';

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const ANTHROPIC_MODEL = 'claude-opus-4-7';
const ANTHROPIC_VERSION = '2023-06-01';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const REPO_RAW_BASE = 'https://raw.githubusercontent.com/avenstonekc/avenstone-app/refs/heads/main/';

// ============================================================
// CORS
// ============================================================
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

// ============================================================
// Auth: verify caller is Kalin
// ============================================================
async function verifyKalinAuth(req: Request): Promise<{ ok: boolean; error?: string; token?: string }> {
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
  return { ok: true, token };
}

// ============================================================
// Thread history: load from field_opus_messages
// ============================================================
interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'dispatch_result';
  content: string;
  meta: Record<string, unknown>;
  created_at: string;
}

async function loadThreadHistory(sb: ReturnType<typeof createClient>): Promise<ThreadMessage[]> {
  const { data, error } = await sb
    .from('field_opus_messages')
    .select('id, role, content, meta, created_at')
    .eq('thread_id', KALIN_THREAD_ID)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`thread load failed: ${error.message}`);
  return (data || []) as ThreadMessage[];
}

async function appendMessage(
  sb: ReturnType<typeof createClient>,
  role: ThreadMessage['role'],
  content: string,
  meta: Record<string, unknown> = {},
): Promise<ThreadMessage> {
  const { data, error } = await sb
    .from('field_opus_messages')
    .insert({ thread_id: KALIN_THREAD_ID, role, content, meta })
    .select('id, role, content, meta, created_at')
    .single();
  if (error) throw new Error(`append failed: ${error.message}`);
  return data as ThreadMessage;
}

// ============================================================
// Repo file fetch — used to load governing docs at session start.
// Direct fetch (no auth needed — public repo).
// ============================================================
async function fetchRepoFile(path: string): Promise<string> {
  try {
    const res = await fetch(REPO_RAW_BASE + path);
    if (!res.ok) return `[ERROR fetching ${path}: ${res.status}]`;
    const content = await res.text();
    const maxBytes = 100_000;
    return content.length > maxBytes
      ? content.slice(0, maxBytes) + `\n\n[TRUNCATED at ${maxBytes} bytes — full file is ${content.length}]`
      : content;
  } catch (err) {
    return `[ERROR fetching ${path}: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

// ============================================================
// System prompt assembly
// ============================================================
async function buildSystemPrompt(): Promise<string> {
  const [claudeMd, claudeMemoryMd, opusRulesMd, fieldOpusArcMd] = await Promise.all([
    fetchRepoFile('CLAUDE.md'),
    fetchRepoFile('CLAUDE_MEMORY.md'),
    fetchRepoFile('OPUS_RULES.md'),
    fetchRepoFile('FIELD_OPUS_ARC.md'),
  ]);

  return `You are Field-Opus — the in-app dev console for Kalin Spratling, owner of Avenstone Contracting and the Avenstone construction-management platform. You speak with him directly via chat in the Avenstone iOS/web app. He's usually in the field (jobsite, truck, between meetings).

You think like the web-version Opus he talks to at home. Same brain. Same rules. Same discipline. The difference: you dispatch Sonnet prompts directly to a VM that runs Claude Code autonomously, then report results back into this chat thread. No copy-paste workflow.

## Your role

1. Listen to what Kalin describes — a bug, a feature, an architecture question, a question about the codebase.
2. Audit before recommending. Use the read_source_file tool to inspect any file you need. Use query_db to check live state. NEVER guess at code that you haven't read.
3. When the task is concrete enough to dispatch, call draft_sonnet_prompt to render a Sonnet-ready prompt as a card. Do NOT execute the slice yourself — that's Kalin's call. He taps "Send to VM" on the card.
4. When Kalin gives you ambiguous direction, make the call rather than asking. OPUS_RULES governs.

## What you NEVER do

- Never claim work is done. You can only claim a prompt is drafted.
- Never pattern-match on file names without reading them.
- Never draft a Sonnet prompt without first reading the files it will touch.
- Never bury contradictions with prior session decisions. Surface them directly.
- Never opportunistically refactor. If Kalin asks for X, prompt for X, not X+Y.

## Tone

Terse. Direct. Kalin is moving fast and usually frustrated by something. Match register. No long preambles. No "great question." No recap of context he already has.

When he curses or rants, don't pearl-clutch. Acknowledge briefly, fix the problem, move on. When he's wrong about a technical claim, say so plainly with evidence.

## Tools available to you

- read_source_file(path): fetch repo source. Use for audits before drafting.
- query_db(query_kind, params): run a whitelisted read-only DB query. Use for live state checks.
- draft_sonnet_prompt(scope_line, prompt_text, model): render a Sonnet prompt as a tappable card in the chat. Kalin reviews + taps Send to VM. THIS DOES NOT DISPATCH — drafting only.
- note_decision(text): append a system note to the thread for future-session continuity.

## Governing documents

The three documents below are loaded fresh from GitHub at every session start. They are the source of truth. If anything below contradicts your training, the documents win.

---

## CLAUDE.md

${claudeMd}

---

## CLAUDE_MEMORY.md

${claudeMemoryMd}

---

## OPUS_RULES.md

${opusRulesMd}

---

## FIELD_OPUS_ARC.md

${fieldOpusArcMd}
`;
}

// ============================================================
// Tools (declared here; implementations stubbed for Phase 3a — Phase 3b fills in)
// ============================================================
const TOOLS = [
  {
    name: 'read_source_file',
    description:
      "Fetch the contents of a file from the avenstonekc/avenstone-app repository. Use this BEFORE drafting any Sonnet prompt that touches a file, to verify current contents and avoid stale-knowledge bugs. Path must be repo-relative (e.g. 'avenstone-vite/src/components/jobs/JobDet.jsx' or 'OPUS_RULES.md'). Returns the file's text content or an error.",
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repo-relative path to the file.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'query_db',
    description:
      "Run a pre-defined read-only query against the live database. Available query_kinds: recent_bug_reports, recent_auto_fix_attempts, ai_error_logs_summary, failed_intents_last_24h, schema_for_table (params: table_name), policies_for_table (params: table_name), recent_notifications, push_subscriptions_overview, jobs_by_status. No raw SQL pass-through. Use this for live-state audits before drafting prompts.",
    input_schema: {
      type: 'object',
      properties: {
        query_kind: {
          type: 'string',
          description: 'One of the allowed query_kinds.',
        },
        params: {
          type: 'object',
          description: 'Optional parameters depending on query_kind. e.g. schema_for_table needs { table_name }.',
        },
      },
      required: ['query_kind'],
    },
  },
  {
    name: 'draft_sonnet_prompt',
    description:
      "Render a Sonnet-ready prompt as a tappable card in Kalin's chat. The card shows the scope line + full prompt + a 'Send to VM' button. This DOES NOT DISPATCH — it only drafts. Kalin reviews and taps Send when ready. Use this when a task is concrete enough to hand off to Sonnet running in the VM. Follow OPUS_RULES structure (scope line, audit-first, one commit per logical change, closing tasks, known limitations, trade-aware check).",
    input_schema: {
      type: 'object',
      properties: {
        scope_line: {
          type: 'string',
          description: "One-line summary of what files the prompt touches and what files it explicitly doesn't.",
        },
        prompt_text: {
          type: 'string',
          description: 'The full Sonnet prompt body, following OPUS_RULES structure. Will be rendered verbatim in the card.',
        },
        model: {
          type: 'string',
          enum: ['sonnet', 'opus'],
          description: "Which model the prompt is for. Default 'sonnet' — opus only for architectural slices.",
        },
      },
      required: ['scope_line', 'prompt_text'],
    },
  },
  {
    name: 'note_decision',
    description:
      "Append a system-tagged note to the thread for future-session continuity. Use sparingly — for locked decisions, architectural choices, or 'we agreed not to do X' moments. Visible in the thread as a small system message.",
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The decision or note to record.',
        },
      },
      required: ['text'],
      // Cache breakpoint: system prompt + tools are the stable prefix. Rolling messages are not cached.
      // deno-lint-ignore no-explicit-any
    } as any,
    cache_control: { type: 'ephemeral' },
  },
];

// Phase 3a stub: tool execution returns "not implemented" — Phase 3b wires the actual calls.
async function executeTool(
  name: string,
  _input: Record<string, unknown>,
  _token: string,
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  return {
    ok: false,
    error: `Tool '${name}' is registered but execution lands in Phase 3b. This is the Phase 3a scaffolding.`,
  };
}

// ============================================================
// Anthropic API call
// ============================================================
interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage?: { input_tokens: number; output_tokens: number };
}

async function callAnthropic(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }>,
): Promise<AnthropicResponse> {
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: TOOLS,
    messages,
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 500)}`);
  }

  return await res.json();
}

// ============================================================
// Thread → API message conversion
// ============================================================
function threadToApiMessages(
  thread: ThreadMessage[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  // Skip the message we just appended (last item) — it's the current user turn, already the last message.
  // dispatch_result + system roles serialized as user messages for API compatibility.
  // Phase 3b/4 polish will handle proper tool_result threading.
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of thread) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      out.push({ role: 'assistant', content: msg.content });
    } else if (msg.role === 'dispatch_result') {
      out.push({ role: 'user', content: `[VM dispatch result]\n${msg.content}` });
    } else if (msg.role === 'system') {
      out.push({ role: 'user', content: `[System note]\n${msg.content}` });
    }
  }
  return out;
}

// ============================================================
// Handler
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'POST required' }, 405);
  }

  const authCheck = await verifyKalinAuth(req);
  if (!authCheck.ok) {
    return jsonResponse({ ok: false, error: authCheck.error }, 403);
  }
  const userToken = authCheck.token!;

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid json body' }, 400);
  }

  const userMessage = body.message?.trim();
  if (!userMessage) {
    return jsonResponse({ ok: false, error: 'message required' }, 400);
  }

  // Service-role DB client for writes to field_opus_messages (RLS bypass — already auth-verified).
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // 1. Persist user message
    await appendMessage(sb, 'user', userMessage);

    // 2. Load full thread (includes the message we just appended)
    const thread = await loadThreadHistory(sb);

    // 3. Build system prompt (loads 4 governing docs fresh from GitHub)
    const systemPrompt = await buildSystemPrompt();

    // 4. Convert thread to API messages
    const apiMessages = threadToApiMessages(thread);

    // 5. Single-turn call to Anthropic.
    //    Tool execution loop is Phase 3b — for now we surface whatever the first response is.
    const apiResp = await callAnthropic(systemPrompt, apiMessages);

    // 6. Extract assistant text + any tool_use blocks
    const textBlocks = apiResp.content.filter((b) => b.type === 'text').map((b) => b.text || '');
    const toolUses = apiResp.content.filter((b) => b.type === 'tool_use');

    const assistantText = textBlocks.join('\n\n').trim() || '[empty response]';

    // draft_sonnet_prompt is a structured-output tool — surface its input directly.
    // No backend execution needed; the card renders from the tool input.
    let draftPromptCard: null | {
      scope_line: string;
      prompt_text: string;
      model: 'sonnet' | 'opus';
    } = null;

    for (const tu of toolUses) {
      if (tu.name === 'draft_sonnet_prompt') {
        const input = tu.input || {};
        draftPromptCard = {
          scope_line: String(input.scope_line || ''),
          prompt_text: String(input.prompt_text || ''),
          model: input.model === 'opus' ? 'opus' : 'sonnet',
        };
      }
    }

    // 7. Persist assistant message
    const assistantMeta: Record<string, unknown> = {
      stop_reason: apiResp.stop_reason,
      usage: apiResp.usage,
    };
    if (toolUses.length > 0) {
      assistantMeta.tool_uses = toolUses.map((t) => ({ name: t.name, input: t.input }));
    }
    if (draftPromptCard) {
      assistantMeta.draft_prompt = draftPromptCard;
    }
    await appendMessage(sb, 'assistant', assistantText, assistantMeta);

    // 8. Return response shape — client (Phase 5) consumes this.
    return jsonResponse({
      ok: true,
      assistant_text: assistantText,
      draft_prompt: draftPromptCard,
      stop_reason: apiResp.stop_reason,
      tool_uses: toolUses.map((t) => ({ name: t.name, input: t.input })),
      note: toolUses.some((t) => t.name !== 'draft_sonnet_prompt')
        ? 'Phase 3a: read_source_file / query_db / note_decision are stubbed. Phase 3b implements.'
        : undefined,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    try {
      await appendMessage(sb, 'system', `[ERROR] ${errMsg}`, { is_error: true });
    } catch { /* ignore */ }
    return jsonResponse({ ok: false, error: errMsg }, 200);
  }
});

// executeTool is declared but only wired in Phase 3b.
void executeTool;
