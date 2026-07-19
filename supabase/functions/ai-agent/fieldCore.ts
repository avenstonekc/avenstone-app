// AVEN_MERGE_ARC B6.1 Slice 2 — field handler, copied verbatim from ai-field-agent/index.ts with only the
// Deno.serve wrapper turned into an exported function. The merged ai-agent/index.ts dispatches to
// it by surface. The legacy fn stays independent (its own copy) so the cutover rollback is one line.


import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkAndAutoInvoice } from '../_shared/autoInvoice.ts';
import { captureTradeActualsForJob } from '../_shared/tradeActuals.ts';
// AVEN_MERGE_ARC B6.1 Slice 1 — phase/gate/notify/money are now shared (were duplicated in
// ai-master-agent). notify keeps its local name via the import alias so call sites are untouched.
import { PHASE_LABELS, getNextPhase, runGatesForTransition } from '../_shared/agentPhaseGates.ts';
import { notifyTenantStaff as notify } from '../_shared/agentNotify.ts';
import { fmtMoney, amountToWords } from '../_shared/agentFormat.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// [AVEN_MERGE_ARC Slice 1] moved to _shared — see imports above.

// [AVEN_MERGE_ARC Slice 1] moved to _shared — see imports above.

// ── Tool definitions — v1 verb roster + 2 carryovers ─────────────────────────
const TOOLS = [
  {
    name: 'log_payment',
    description: 'Record an inbound client payment for a job (deposit, draw, final). Confirmation required.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        amount: { type: 'number' },
        payment_method: { type: 'string', description: 'check, ach, card, cash, wire, other' },
        description: { type: 'string', description: 'e.g., "Deposit", "Draw 2", "Final payment"' },
      },
      required: ['job_id', 'amount'],
    },
  },
  {
    name: 'log_receipt',
    description: 'Record an outbound expense on a job. Creates transaction only — photo attachment is added later in Financials tab. Confirmation required.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        amount: { type: 'number' },
        description: { type: 'string', description: 'What was purchased / who was paid' },
        vendor: { type: 'string', description: 'Vendor or payee name' },
        type: {
          type: 'string',
          enum: ['material_purchase', 'fuel', 'permit', 'sub_payout', 'vendor_payment', 'commission', 'other_expense', 'equipment_rental', 'labor'],
          description: 'Expense type. Infer from context: Home Depot/lumber/supplies=material_purchase; gas station=fuel; city/inspection fee=permit; sub contractor=sub_payout.',
        },
      },
      required: ['job_id', 'amount', 'description'],
    },
  },
  {
    name: 'add_note',
    description: 'Add a note to a job. Auto-applies (no confirmation).',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['job_id', 'content'],
    },
  },
  {
    name: 'advance_phase',
    description: 'Advance a job to the next lifecycle phase. Checks gates first; if gates fail, returns gate state and asks the user for an override reason. Auto-applies when gates pass.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        override_reason: { type: 'string', description: 'Required only when gates fail and the user has agreed to override.' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'submit_change_order',
    description: 'Submit a change order for additional work on a job. Confirmation required.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        description: { type: 'string' },
        amount: { type: 'number' },
      },
      required: ['job_id', 'description', 'amount'],
    },
  },
  {
    name: 'create_lead',
    description: 'Create a new lead or contact in the CRM. Auto-applies.',
    input_schema: {
      type: 'object',
      properties: {
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        notes: { type: 'string', description: 'Project interest or notes' },
        source: { type: 'string', description: 'referral, manual, facebook, instagram, google, etc' },
      },
      required: ['first_name'],
    },
  },
  {
    name: 'update_material_status',
    description: 'Update the status of a material item on a job. Auto-applies.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        material_name: { type: 'string', description: 'Partial name of the material to search for' },
        status: { type: 'string', enum: ['needed', 'ordered', 'delivered', 'installed'] },
      },
      required: ['job_id', 'status'],
    },
  },
];

// Confirmation whitelist — money verbs only require explicit user confirmation.
const CONFIRM_TOOLS = new Set(['log_payment', 'log_receipt', 'submit_change_order']);

// ── System prompt — role aware ────────────────────────────────────────────────
function systemPrompt(role: string, ctx: any): string {
  const focus = ({
    sales_rep: 'You help sales reps capture leads, update pipeline, and track assigned jobs.',
    project_manager: 'You help PMs log job activity, manage materials, and document issues.',
    owner: 'You help the owner manage leads, jobs, materials, and change orders across the whole company.',
  } as Record<string, string>)[role] || 'You help the team manage jobs and leads.';

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
5. For money tools (log_payment, log_receipt, submit_change_order): your text response should confirm what you're about to do in one plain sentence ending with "Say yes to confirm."
6. For other tools (add_note, advance_phase, create_lead, update_material_status): the action runs immediately — your text should be a short confirmation in past tense.
7. For advance_phase: if the user did not provide an override reason and gates may be failing, do NOT pass override_reason. The system will return failing gates; you then ask the user for a reason.
8. Currency formatting: ALWAYS write dollar amounts with two decimal places. "$542.50" not "$542.5". "$1,000.00" not "$1000". Applies to all text responses and any reference to a monetary value.`;
}

// [AVEN_MERGE_ARC Slice 1] moved to _shared — see imports above.

// ── Human-readable confirmation descriptions (money verbs only) ──────────────
function describeAction(tool: string, input: any): string {
  switch (tool) {
    // AVEN_MERGE_ARC B6.1 Slice 4 — money read-back restored on the field surface (the locked
    // VOICE_AGENT money-safety rule): the confirm card shows the digit form AND the spelled-out form
    // (shared amountToWords) so a misheard/fat-fingered amount surfaces before the row writes.
    case 'log_payment':
      return `Log ${fmtMoney(input.amount)} (${amountToWords(input.amount)}) client payment${input.description ? ` — ${input.description}` : ''}.`;
    case 'log_receipt':
      return `Log ${fmtMoney(input.amount)} (${amountToWords(input.amount)}) expense — ${input.description}${input.vendor ? ` (${input.vendor})` : ''}.`;
    case 'submit_change_order':
      return `Submit ${fmtMoney(input.amount)} (${amountToWords(input.amount)}) change order — ${input.description}.`;
    default:
      return 'Perform this action.';
  }
}

// ── Execute action — single source of truth for both auto and confirmed paths
async function executeAction(sb: any, action: any, tenant_id: string, user_id: string) {
  const { tool, input } = action;
  try {
    switch (tool) {
      case 'log_payment': {
        // Mirrors sbCreateTransaction contract.
        const { data, error } = await sb.from('job_transactions').insert({
          job_id: input.job_id,
          tenant_id,
          direction: 'in',
          type: 'client_payment',
          amount: Number(input.amount),
          description: input.description || null,
          payment_method: input.payment_method || null,
          status: 'paid',
          date_paid: new Date().toISOString().slice(0, 10),
          created_by: user_id,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) throw error;
        return {
          reply: `Logged. ${fmtMoney(input.amount)} payment recorded.`,
          executed: true,
          action_label: `Payment: ${fmtMoney(input.amount)}`,
          data,
        };
      }

      case 'log_receipt': {
        const ALLOWED_OUT = new Set([
          'material_purchase', 'fuel', 'permit', 'sub_payout',
          'vendor_payment', 'commission', 'other_expense', 'equipment_rental', 'labor',
        ]);
        const rawType = input.type as string | undefined;
        const txType = rawType && ALLOWED_OUT.has(rawType) ? rawType : 'material_purchase';
        const { data, error } = await sb.from('job_transactions').insert({
          job_id: input.job_id,
          tenant_id,
          direction: 'out',
          type: txType,
          amount: Number(input.amount),
          description: input.description,
          payer_or_payee_name: input.vendor || null,
          status: 'paid',
          date_paid: new Date().toISOString().slice(0, 10),
          created_by: user_id,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) throw error;
        return {
          reply: `Logged. Open Financials, tap the transaction, and upload the receipt photo when you're at a screen.`,
          executed: true,
          action_label: `Expense: ${fmtMoney(input.amount)}`,
          data,
        };
      }

      case 'add_note': {
        // Mirrors sbCreateNote contract: insert + sbNotify('note_posted').
        const { data: prof } = await sb.from('profiles').select('full_name').eq('id', user_id).single();
        const author = prof?.full_name || 'Field Agent';
        const { data, error } = await sb.from('job_notes').insert({
          job_id: input.job_id, tenant_id, content: input.content, author,
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) throw error;
        const { data: jrow } = await sb.from('jobs').select('address').eq('id', input.job_id).single();
        const title = jrow?.address ? `Note on ${jrow.address}` : 'New job note';
        notify(sb, tenant_id, user_id, {
          type: 'note_posted', title, body: String(input.content).slice(0, 120), jobId: input.job_id,
        }).catch(() => {});
        return { reply: 'Note added.', executed: true, action_label: 'Note added to job', data };
      }

      case 'advance_phase': {
        // Mirrors sbAdvancePhase contract: gate-fail without reason returns requiresOverride payload.
        const { data: job } = await sb.from('jobs').select('id, status').eq('id', input.job_id).single();
        if (!job) return { reply: 'Job not found.', executed: false };
        const currentPhase = job.status;
        const nextPhase = getNextPhase(currentPhase);
        if (!nextPhase) {
          return { reply: `${PHASE_LABELS[currentPhase] || currentPhase} is the final phase. Nothing further to advance.`, executed: false };
        }
        const { gates, allPassed, requiresOverride } = await runGatesForTransition(input.job_id, currentPhase, nextPhase, sb);
        const useOverride = !allPassed;
        if (useOverride && !input.override_reason?.trim()) {
          const failing = gates.filter(g => !g.passed).map(g => g.label);
          const reasonStr = failing.length ? failing.join(', ') : 'manual override required';
          return {
            reply: `Can't advance — ${reasonStr}. Want to override? Tell me why and I'll move it forward.`,
            executed: false,
            requires_override: true,
            failing_gates: failing,
            current_phase: PHASE_LABELS[currentPhase] || currentPhase,
            next_phase: PHASE_LABELS[nextPhase] || nextPhase,
          };
        }
        const nowIso = new Date().toISOString();
        const { error } = await sb.from('jobs').update({
          status: nextPhase,
          phase_override_used: useOverride,
          phase_override_reason: useOverride ? input.override_reason.trim() : null,
          phase_override_at: useOverride ? nowIso : null,
          phase_override_by_id: useOverride ? user_id : null,
        }).eq('id', input.job_id);
        if (error) throw error;
        // Side effects — mirrors sbAdvancePhase: notification, auto-invoice, trade actuals.
        let jobAddress = '';
        try { const { data: jAddr } = await sb.from('jobs').select('address').eq('id', input.job_id).single(); jobAddress = jAddr?.address || ''; } catch (_) {}
        notify(sb, tenant_id, user_id, {
          type: 'phase_advanced',
          title: `Phase advanced — ${jobAddress || 'job'}`,
          body: `Moved to ${PHASE_LABELS[nextPhase] || nextPhase}${useOverride ? ' (override)' : ''}`,
          jobId: input.job_id,
        }).catch(() => {});
        checkAndAutoInvoice(sb, tenant_id, user_id, 'phase.advanced', {
          jobId: input.job_id, newPhase: nextPhase,
        }).catch((err: any) => console.warn('[autoInvoice] ai-field-agent advance_phase hook failed:', err?.message));
        if (nextPhase === 'complete') {
          captureTradeActualsForJob(sb, tenant_id, input.job_id)
            .catch((err: any) => console.warn('[tradeActuals] ai-field-agent capture failed:', err?.message));
        }
        return {
          reply: `Moved to ${PHASE_LABELS[nextPhase] || nextPhase}${useOverride ? ' (override)' : ''}.`,
          executed: true,
          action_label: `Phase → ${PHASE_LABELS[nextPhase] || nextPhase}`,
        };
      }

      case 'submit_change_order': {
        // Mirrors sbCreateChangeOrder contract: auto co_number + sbNotify('co_submitted').
        const { count } = await sb.from('change_orders').select('id', { count: 'exact', head: true }).eq('job_id', input.job_id);
        const coNumber = `CO-${String((count || 0) + 1).padStart(3, '0')}`;
        const { data, error } = await sb.from('change_orders').insert({
          job_id: input.job_id,
          tenant_id,
          co_number: coNumber,
          description: input.description,
          amount: Number(input.amount),
          status: 'pending',
          created_at: new Date().toISOString(),
        }).select().single();
        if (error) throw error;
        const { data: jrow } = await sb.from('jobs').select('address').eq('id', input.job_id).single();
        const title = jrow?.address ? `New CO on ${jrow.address}` : `New change order ${coNumber}`;
        const body = `${coNumber}: ${input.description} — ${fmtMoney(input.amount)}`;
        notify(sb, tenant_id, user_id, { type: 'co_submitted', title, body, jobId: input.job_id }).catch(() => {});
        return {
          reply: `${coNumber} for ${fmtMoney(input.amount)} submitted. Pending client approval.`,
          executed: true,
          action_label: `CO: ${fmtMoney(input.amount)} — ${input.description}`,
          data,
        };
      }

      case 'create_lead': {
        const { error } = await sb.from('contacts').insert({
          tenant_id,
          first_name: input.first_name,
          last_name: input.last_name || null,
          phone: input.phone || null,
          email: input.email || null,
          notes: input.notes || null,
          source: input.source || 'manual',
          status: 'new',
          created_at: new Date().toISOString(),
        });
        if (error) throw error;
        const name = `${input.first_name}${input.last_name ? ' ' + input.last_name : ''}`;
        return { reply: `Done. ${name} added as a new lead.`, executed: true, action_label: `Created lead: ${name}` };
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
export async function handleFieldAgent(req: Request): Promise<Response> {
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
      ...conversation_history.slice(-20).map((m: any) => ({
        role: m.role, content: m.content,
      })),
      { role: 'user', content: message },
    ];

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt(role, ctx),
        tools: TOOLS,
        messages,
      }),
    });

    const claude = await claudeRes.json();
    if (!claudeRes.ok) throw new Error(claude.error?.message || `Claude error ${claudeRes.status}`);

    const textBlock = claude.content?.find((b: any) => b.type === 'text');
    const toolBlock = claude.content?.find((b: any) => b.type === 'tool_use');

    if (toolBlock) {
      // Money verbs require explicit user confirmation; everything else auto-executes.
      if (CONFIRM_TOOLS.has(toolBlock.name)) {
        const description = describeAction(toolBlock.name, toolBlock.input);
        return new Response(JSON.stringify({
          reply: textBlock?.text || `${description} Say yes to confirm.`,
          pending_action: { tool: toolBlock.name, input: toolBlock.input, description },
        }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const result = await executeAction(sb, { tool: toolBlock.name, input: toolBlock.input }, tenant_id, user_id);
      // Prefer Claude's natural-language confirmation if present; else fall back to executor's reply.
      return new Response(JSON.stringify({
        ...result,
        reply: textBlock?.text || result.reply,
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
}
