// ANTI_SURPRISE_ENGINE_ARC Phase 1 — General dispatcher
// Reads ripe scheduled_actions (fire_at <= now, status='scheduled') for ALL kinds
// and dispatches them. Runs every 15 minutes via pg_cron.
//
// kind='walkthrough_prep':
//   Creates a notification (fans out to push/email via DB triggers) and a todo
//   for the target PM. Marks the scheduled_action as fired.
//
// kind='company_file_expiration':
//   Intentionally skipped — handled separately by company-files-watchdog (GitHub Actions).
//   Left in table with status='scheduled' so watchdog processes it.
//
// Processes at most 50 rows per run to bound blast radius. Retries increment
// retry_count but do not move to a dead-letter state (future phase).
//
// NO model calls.

import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

const BATCH_LIMIT = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const sb = createClient(SB_URL, SB_SERVICE);
    const now = new Date().toISOString();

    const { data: ripe, error: fetchErr } = await sb
      .from("scheduled_actions")
      .select("*")
      .eq("status", "scheduled")
      .lte("fire_at", now)
      .order("fire_at")
      .limit(BATCH_LIMIT);

    if (fetchErr) throw fetchErr;
    if (!ripe?.length) {
      return new Response(JSON.stringify({ ok: true, fired: 0, skipped: 0 }), { headers: CORS });
    }

    let fired = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const action of ripe) {
      try {
        if (action.kind === "company_file_expiration") {
          // Handled by company-files-watchdog — skip without consuming
          skipped++;
          results.push({ id: action.id, kind: action.kind, status: "skipped_watchdog" });
          continue;
        }

        if (action.kind === "walkthrough_prep") {
          await dispatchWalkthroughPrep(sb, action, now);
        } else {
          // Unknown kind — mark fired with a note; future phases will handle new kinds
          console.warn(`[dispatcher] unknown kind: ${action.kind} for action ${action.id}`);
        }

        await sb
          .from("scheduled_actions")
          .update({ status: "fired", fired_at: now, updated_at: now })
          .eq("id", action.id);

        fired++;
        results.push({ id: action.id, kind: action.kind, status: "fired" });
      } catch (err: any) {
        const msg = String(err?.message || err).slice(0, 300);
        console.error(`[dispatcher] failed action ${action.id}:`, msg);
        await sb
          .from("scheduled_actions")
          .update({
            retry_count: (action.retry_count || 0) + 1,
            updated_at:  now,
          })
          .eq("id", action.id);
        results.push({ id: action.id, kind: action.kind, status: "error", error: msg });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, fired, skipped, results }),
      { headers: CORS }
    );
  } catch (err: any) {
    console.error("[anti-surprise-dispatcher]", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500, headers: CORS,
    });
  }
});

async function dispatchWalkthroughPrep(sb: any, action: any, now: string) {
  const payload      = action.payload || {};
  const workType     = payload.work_type    || "walkthrough";
  const jobAddress   = payload.job_address  || "job";
  const itemCount    = payload.item_count   || 0;
  const photoCount   = payload.photo_req    || 0;
  const mustDocCount = payload.must_doc     || 0;

  const title = `${workType} walkthrough — ${itemCount} item${itemCount !== 1 ? "s" : ""} to capture`;
  const bodyParts = [jobAddress];
  if (photoCount > 0)   bodyParts.push(`${photoCount} photo${photoCount !== 1 ? "s" : ""} required`);
  if (mustDocCount > 0) bodyParts.push(`${mustDocCount} must-document item${mustDocCount !== 1 ? "s" : ""}`);
  const body = bodyParts.join(" · ");

  const targetUserId = action.target_user_id;
  if (!targetUserId) {
    console.warn(`[dispatcher] walkthrough_prep ${action.id} has no target_user_id — skipping notifications`);
    return;
  }

  // Notification fans out to push + email via existing DB triggers
  await sb.from("notifications").insert({
    tenant_id: action.tenant_id,
    user_id:   targetUserId,
    job_id:    action.related_job_id,
    type:      "walkthrough_prep",
    title,
    body,
  });

  // Todo for the PM's task list
  await sb.from("todos").insert({
    tenant_id:             action.tenant_id,
    assigned_to_user_id:   targetUserId,
    created_by_id:         targetUserId,
    job_id:                action.related_job_id,
    type:                  "walkthrough_prep",
    title,
    notes:                 body,
    priority:              "medium",
    source:                "engine",
    status:                "open",
    related_entity_type:   "scheduled_actions",
    related_entity_id:     action.id,
    payload: {
      work_type:    workType,
      items:        payload.items || [],
    },
  });
}
