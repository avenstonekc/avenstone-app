import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'create_lead',
    description: 'Create a new lead or contact in the CRM',
    input_schema: {
      type: 'object',
      properties: {
        first_name: { type: 'string' },
        last_name:  { type: 'string' },
        phone:      { type: 'string' },
        email:      { type: 'string' },
        notes:      { type: 'string', description: 'Project interest or notes' },
        source:     { type: 'string', description: 'referral, manual, facebook, instagram, google, etc' },
      },
      required: ['first_name'],
    },
  },
  {
    name: 'create_job_note',
    description: 'Add a note to a job',
    input_schema: {
      type: 'object',
      properties: {
        job_id:  { type: 'string' },
        content: { type: 'string' },
      },
      required: ['job_id', 'content'],
    },
  },
  {
    name: 'update_job_status',
    description: 'Change the status/phase of a job',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        status: {
          type: 'string',
          enum: ['lead','bid_sent','signed','demo','framing','rough_mep','drywall','finish','punch','complete','on_hold'],
        },
      },
      required: ['job_id', 'status'],
    },
  },
  {
    name: 'create_change_order',
    description: 'Create a change order for additional work on a job',
    input_schema: {
      type: 'object',
      properties: {
        job_id:      { type: 'string' },
        description: { type: 'string' },
        amount:      { type: 'number' },
        reason:      { type: 'string' },
      },
      required: ['job_id', 'description', 'amount'],
    },
  },
  {
    name: 'update_material_status',
    description: 'Update the status of a material item on a job',
    input_schema: {
      type: 'object',
      properties: {
        job_id:        { type: 'string' },
        material_name: { type: 'string', description: 'Partial name of the material to search for' },
        status:        { type: 'string', enum: ['needed','ordered','delivered','installed'] },
      },
      required: ['job_id', 'status'],
    },
  },
];

// ── System prompt — role aware ────────────────────────────────────────────────
function systemPrompt(role: string, ctx: any): string {
  const focus = {
    sales_rep: 'You help sales reps capture leads, update pipeline, and track assigned jobs.',
    project_manager: 'You help PMs log job activity, manage materials, and document issues.',
    owner: 'You help the owner manage leads, jobs, materials, and change orders across the whole company.',
  }[role] || 'You help the team manage jobs and leads.';

  let ctxStr = '';
  if (ctx.job) ctxStr += `\nActive job: "${ctx.job.address}" — ${ctx.job.client_name || 'no client'}, status: ${ctx.job.status}, ID: ${ctx.job.id}.`;
  if (ctx.jobs?.length) ctxStr += `\nOther active jobs: ${ctx.jobs.map((j: any) => `${j.address} (${j.status})`).join(', ')}.`;

  return `You are the Field Agent AI for Avenstone, a residential construction company.
${focus}
${ctxStr}

RULES — follow exactly:
1. Voice interface only. Max 25 words per response. No lists, no markdown.
2. When asked to DO something — use the matching tool. Do not describe what you would do.
3. If a required detail is missing (name, amount, job) — ask for only that one thing.
4. Never invent or assume data you weren't given.
5. After selecting a tool, your text response should confirm what you're about to do in one plain sentence ending with "Say yes to confirm."`;
}

// ── Human-readable action descriptions ───────────────────────────────────────
function describeAction(tool: string, input: any): string {
  const STATUS_LABELS: Record<string, string> = {
    lead:'Lead', bid_sent:'Bid Sent', signed:'Signed', demo:'Demo',
    framing:'Framing', rough_mep:'Rough MEP', drywall:'Drywall',
    finish:'Finish', punch:'Punch List', complete:'Complete', on_hold:'On Hold',
  };
  switch (tool) {
    case 'create_lead':
      return `Add ${input.first_name}${input.last_name ? ' ' + input.last_name : ''} as a new lead${input.notes ? ` — ${input.notes.slice(0,50)}` : ''}.`;
    case 'create_job_note':
      return `Add note: "${input.content.slice(0, 60)}${input.content.length > 60 ? '…' : ''}"`;
    case 'update_job_status':
      return `Move job to ${STATUS_LABELS[input.status] || input.status}.`;
    case 'create_change_order':
      return `Create $${Number(input.amount).toLocaleString()} change order — ${input.description}.`;
    case 'update_material_status':
      return `Mark ${input.material_name || 'material'} as ${input.status}.`;
    default:
      return 'Perform this action.';
  }
}

// ── Execute confirmed action ──────────────────────────────────────────────────
async function executeAction(sb: any, action: any, tenant_id: string, user_id: string) {
  const { tool, input } = action;
  const STATUS_LABELS: Record<string, string> = {
    lead:'Lead', bid_sent:'Bid Sent', signed:'Signed', demo:'Demo',
    framing:'Framing', rough_mep:'Rough MEP', drywall:'Drywall',
    finish:'Finish', punch:'Punch List', complete:'Complete', on_hold:'On Hold',
  };

  try {
    switch (tool) {
      case 'create_lead': {
        const { error } = await sb.from('contacts').insert({
          tenant_id,
          first_name:  input.first_name,
          last_name:   input.last_name  || null,
          phone:       input.phone      || null,
          email:       input.email      || null,
          notes:       input.notes      || null,
          source:      input.source     || 'manual',
          status:      'new',
          created_at:  new Date().toISOString(),
        });
        if (error) throw error;
        const name = `${input.first_name}${input.last_name ? ' ' + input.last_name : ''}`;
        return { reply: `Done. ${name} added as a new lead.`, executed: true, action_label: `Created lead: ${name}` };
      }

      case 'create_job_note': {
        const { data: prof } = await sb.from('profiles').select('full_name').eq('id', user_id).single();
        const { error } = await sb.from('job_notes').insert({
          job_id:     input.job_id,
          tenant_id,
          content:    input.content,
          author:     prof?.full_name || 'Field Agent',
          created_at: new Date().toISOString(),
        });
        if (error) throw error;
        return { reply: 'Note added.', executed: true, action_label: 'Note added to job' };
      }

      case 'update_job_status': {
        const { error } = await sb.from('jobs').update({ status: input.status }).eq('id', input.job_id);
        if (error) throw error;
        return {
          reply: `Done. Job moved to ${STATUS_LABELS[input.status] || input.status}.`,
          executed: true,
          action_label: `Status → ${STATUS_LABELS[input.status] || input.status}`,
        };
      }

      case 'create_change_order': {
        const { error } = await sb.from('change_orders').insert({
          job_id:      input.job_id,
          tenant_id,
          description: input.description,
          amount:      Number(input.amount),
          reason:      input.reason || null,
          status:      'pending',
          created_at:  new Date().toISOString(),
        });
        if (error) throw error;
        return {
          reply: `Change order for $${Number(input.amount).toLocaleString()} created. Pending client approval.`,
          executed: true,
          action_label: `CO: $${Number(input.amount).toLocaleString()} — ${input.description}`,
        };
      }

      case 'update_material_status': {
        let q = sb.from('job_materials').select('id,name').eq('job_id', input.job_id);
        if (input.material_name) q = q.ilike('name', `%${input.material_name}%`);
        const { data: mats } = await q.limit(1);
        if (!mats?.length) return { reply: `Couldn't find that material. What's the exact name?`, executed: false };
        const { error } = await sb.from('job_materials').update({ status: input.status }).eq('id', mats[0].id);
        if (error) throw error;
        return {
          reply: `${mats[0].name} marked as ${input.status}.`,
          executed: true,
          action_label: `${mats[0].name} → ${input.status}`,
        };
      }

      default:
        return { reply: 'Unknown action.', executed: false };
    }
  } catch (e) {
    return { reply: `Something went wrong: ${String(e).slice(0, 80)}`, executed: false };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const {
      user_id, role, tenant_id, message,
      job_id,
      conversation_history = [],
      pending_action, confirmed,
    } = await req.json();

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Execute confirmed action (skip Claude) ────────────────────────────────
    if (confirmed && pending_action) {
      const result = await executeAction(sb, pending_action, tenant_id, user_id);
      return new Response(JSON.stringify(result), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Load context ──────────────────────────────────────────────────────────
    const ctx: any = {};

    if (job_id) {
      const { data } = await sb.from('jobs')
        .select('id,address,client_name,status,contract_value,co_total')
        .eq('id', job_id).single();
      if (data) ctx.job = data;
    }

    // Active jobs for context (role-filtered)
    let jq = sb.from('jobs').select('id,address,status,client_name')
      .neq('status', 'complete').neq('status', 'on_hold')
      .eq('tenant_id', tenant_id).order('created_at', { ascending: false }).limit(8);
    if (role === 'sales_rep') {
      const { data: prof } = await sb.from('profiles').select('full_name').eq('id', user_id).single();
      if (prof?.full_name) jq = jq.eq('assigned_rep', prof.full_name);
    }
    const { data: jobs } = await jq;
    ctx.jobs = (jobs || []).filter((j: any) => j.id !== job_id);

    // ── Call Claude with tools ────────────────────────────────────────────────
    const messages = [
      ...conversation_history.slice(-8).map((m: any) => ({
        role: m.role, content: m.content,
      })),
      { role: 'user', content: message },
    ];

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':          Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version':  '2023-06-01',
        'content-type':       'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system:     systemPrompt(role, ctx),
        tools:      TOOLS,
        messages,
      }),
    });

    const claude = await claudeRes.json();
    if (!claudeRes.ok) throw new Error(claude.error?.message || `Claude error ${claudeRes.status}`);

    const textBlock = claude.content?.find((b: any) => b.type === 'text');
    const toolBlock = claude.content?.find((b: any) => b.type === 'tool_use');

    // Claude wants to take an action — return for confirmation, don't execute yet
    if (toolBlock) {
      const description = describeAction(toolBlock.name, toolBlock.input);
      return new Response(JSON.stringify({
        reply: textBlock?.text || `${description} Say yes to confirm.`,
        pending_action: { tool: toolBlock.name, input: toolBlock.input, description },
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Pure conversational reply
    return new Response(JSON.stringify({
      reply: textBlock?.text || "What do you need?",
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('ai-field-agent error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
