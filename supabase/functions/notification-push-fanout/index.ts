import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push`;

const PUSH_TYPES = new Set([
  'todo_delegated',
  'assigned_to_job',
  'schedule_item_created',
  'schedule_item_changed',
  'co_submitted',
  'co_approved',
  'co_rejected',
  // Anti-surprise engine types
  'walkthrough_prep',
  'phase_advanced',
]);

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title?: string | null;
  body?: string | null;
  job_id?: string | null;
  tenant_id?: string | null;
  priority?: string | null;
}

function buildTitle(n: NotificationRow): string {
  if (n.title) return n.title;
  switch (n.type) {
    case 'todo_delegated':        return 'New to-do assigned';
    case 'assigned_to_job':       return 'You were added to a job';
    case 'schedule_item_created': return 'New schedule item';
    // schedule_item_changed: cascade notifications carry enriched body written at INSERT time
    // (e.g. "Drywall moved from Jun 8 to Jun 12 (cascade from upstream task).")
    // Title fallback used only for non-cascade changes.
    case 'schedule_item_changed': return 'Schedule item updated';
    case 'co_submitted':          return 'Change order submitted';
    case 'co_approved':           return 'Change order approved';
    case 'co_rejected':           return 'Change order rejected';
    case 'walkthrough_prep':      return n.title || 'Walkthrough checklist ready';
    case 'phase_advanced':        return n.title || 'Job phase advanced';
    default:                      return 'Avenstone notification';
  }
}

function buildDeepLink(n: NotificationRow): string {
  switch (n.type) {
    case 'todo_delegated':
      return n.job_id ? `/job/${n.job_id}/todos` : '/today';
    case 'assigned_to_job':
      return n.job_id ? `/job/${n.job_id}` : '/jobs';
    case 'schedule_item_created':
    case 'schedule_item_changed':
      return n.job_id ? `/job/${n.job_id}/schedule` : '/today';
    case 'co_submitted':
    case 'co_approved':
    case 'co_rejected':
      return n.job_id ? `/job/${n.job_id}/financials` : '/jobs';
    case 'walkthrough_prep':
    case 'phase_advanced':
      return n.job_id ? `/job/${n.job_id}` : '/today';
    default:
      return '/today';
  }
}

Deno.serve(async (req: Request) => {
  try {
    const { record: notification } = await req.json() as { record: NotificationRow };

    if (!notification?.user_id || !notification?.type) {
      return new Response(
        JSON.stringify({ ok: false, error: 'missing user_id or type' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }

    if (!PUSH_TYPES.has(notification.type)) {
      return new Response(
        JSON.stringify({ ok: true, fanned_out: false, reason: 'type not in push list' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    const pushPayload = {
      user_id:   notification.user_id,
      title:     buildTitle(notification),
      body:      notification.body || '',
      deep_link: buildDeepLink(notification),
      priority:  notification.priority === 'high' ? 'high' : 'medium',
    };

    const res = await fetch(SEND_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify(pushPayload),
    });
    const result = await res.json().catch(() => ({}));

    if (result.failed > 0 || !res.ok) {
      try {
        const sb = createClient(SUPABASE_URL, SERVICE_KEY);
        await sb.from('ai_error_logs').insert({
          function_name: 'notification-push-fanout',
          error_message: `push fanout for ${notification.type}: sent=${result.sent ?? 0} failed=${result.failed ?? 0}`,
          user_id:       notification.user_id,
          metadata:      { notification_id: notification.id, errors: result.errors ?? [] },
        });
      } catch (_logErr) {
        // best effort — do not propagate
      }
    }

    return new Response(
      JSON.stringify({ ok: true, fanned_out: true, sent: result.sent, failed: result.failed }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
});
