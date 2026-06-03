// ANTI_SURPRISE_ENGINE_ARC Phase 1 — Generation event
// Nightly sweep: finds jobs that recently entered 'contract' status,
// resolves their trades from estimate_line_items, matches against
// tenant_playbook_items, and writes scheduled_actions rows of
// kind='walkthrough_prep' — one per matching trade per job.
//
// NO model calls. Pure SQL/JS generation from structured playbook.
// Idempotent: dedup index (rule_key, related_job_id) prevents double-generation.

import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

// Word-prefix fuzzy match: "FRAMING & CARPENTRY" matches "Framing",
// "VANITY & FIXTURES" matches "Cabinets / vanities - Install", etc.
// Uses 5-char prefix overlap so minor plurals/suffixes still match.
function tradeMatchesWorkType(estimateTrade: string, workType: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[&\/\-,+]/g, " ").split(/\s+/).filter(w => w.length >= 4);

  const etWords = normalize(estimateTrade);
  const wtWords = normalize(workType);

  for (const ew of etWords) {
    for (const ww of wtWords) {
      const prefixLen = Math.min(ew.length, ww.length, 5);
      if (prefixLen >= 4 && ew.substring(0, prefixLen) === ww.substring(0, prefixLen)) {
        return true;
      }
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const sb = createClient(SB_URL, SB_SERVICE);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // force_job_ids: optional array of job IDs to generate for regardless of status/lookback.
    // Used for testing and manual re-generation. Nightly cron does not pass this.
    const forceJobIds: string[] | undefined = body.force_job_ids;

    const now = new Date().toISOString();

    let jobs: any[];

    if (forceJobIds?.length) {
      const { data, error } = await sb
        .from("jobs")
        .select("id, address, tenant_id, status")
        .in("id", forceJobIds);
      if (error) throw error;
      jobs = data || [];
    } else {
      // Nightly run: jobs that entered 'contract' within the last 25 hours
      const lookback = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const { data, error } = await sb
        .from("jobs")
        .select("id, address, tenant_id, status")
        .eq("status", "contract")
        .gte("updated_at", lookback);
      if (error) throw error;
      jobs = data || [];
    }

    if (!jobs.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0, generated: 0 }), {
        headers: CORS,
      });
    }

    let totalGenerated = 0;
    const results: any[] = [];

    for (const job of jobs) {
      try {
        // ── Resolve trades ──────────────────────────────────────────────────
        const { data: estimateRows } = await sb
          .from("estimate_line_items")
          .select("trade")
          .eq("job_id", job.id)
          .not("trade", "is", null);

        let estimateTrades: string[] = [
          ...new Set((estimateRows || []).map((r: any) => r.trade as string).filter(Boolean)),
        ];

        // Fallback: job_sub_engagements if estimate has no trades
        if (!estimateTrades.length) {
          const { data: engRows } = await sb
            .from("job_sub_engagements")
            .select("trade")
            .eq("job_id", job.id)
            .not("status", "in", '("declined","withdrawn","removed")');
          estimateTrades = [
            ...new Set((engRows || []).map((r: any) => r.trade as string).filter(Boolean)),
          ];
        }

        if (!estimateTrades.length) {
          results.push({ job_id: job.id, skipped: true, reason: "no_trades" });
          continue;
        }

        // ── Load tenant playbook ───────────────────────────────────────────
        const { data: playbook } = await sb
          .from("tenant_playbook_items")
          .select("work_type, label, photo_required, must_document, sort_order")
          .eq("tenant_id", job.tenant_id)
          .order("work_type")
          .order("sort_order");

        if (!playbook?.length) {
          results.push({ job_id: job.id, skipped: true, reason: "no_playbook" });
          continue;
        }

        // ── Resolve target PM ──────────────────────────────────────────────
        const { data: pmUser } = await sb
          .from("profiles")
          .select("id")
          .eq("tenant_id", job.tenant_id)
          .in("role", ["owner", "project_manager"])
          .limit(1)
          .maybeSingle();

        if (!pmUser) {
          results.push({ job_id: job.id, skipped: true, reason: "no_pm_user" });
          continue;
        }

        // ── Group playbook by work_type and match to estimate trades ───────
        const playbookByWorkType = new Map<string, any[]>();
        for (const item of playbook) {
          if (!playbookByWorkType.has(item.work_type)) playbookByWorkType.set(item.work_type, []);
          playbookByWorkType.get(item.work_type)!.push(item);
        }

        let jobGenerated = 0;
        const jobTrades: string[] = [];

        for (const [workType, items] of playbookByWorkType) {
          // Check if any estimate trade matches this workType
          const matched = estimateTrades.some(et => tradeMatchesWorkType(et, workType));
          if (!matched) continue;

          const ruleKey = `walkthrough_prep::${workType}`;

          // Dedup check — don't generate if row already exists for this job+rule_key
          const { data: existing } = await sb
            .from("scheduled_actions")
            .select("id")
            .eq("related_job_id", job.id)
            .eq("rule_key", ruleKey)
            .eq("status", "scheduled")
            .maybeSingle();

          if (existing) continue;

          // ── Determine fire_at ──────────────────────────────────────────
          // Look for a sub_start or site_visit schedule item for this trade.
          // If found: fire 1 day before. If not: fire in 1 day (near-term surfacing).
          const { data: schedItem } = await sb
            .from("schedule_items")
            .select("scheduled_date")
            .eq("job_id", job.id)
            .ilike("trade", `%${workType.split(/[\s\/\-]/)[0]}%`)
            .in("type", ["sub_start", "site_visit"])
            .neq("status", "cancelled")
            .order("scheduled_date")
            .limit(1)
            .maybeSingle();

          let fireAt: string;
          if (schedItem?.scheduled_date) {
            const d = new Date(schedItem.scheduled_date);
            d.setDate(d.getDate() - 1);
            fireAt = d.toISOString();
          } else {
            // No schedule item — fire near-term so it surfaces for the PM
            const d = new Date();
            d.setDate(d.getDate() + 1);
            fireAt = d.toISOString();
          }

          await sb.from("scheduled_actions").insert({
            tenant_id:           job.tenant_id,
            kind:                "walkthrough_prep",
            status:              "scheduled",
            priority:            "medium",
            fire_at:             fireAt,
            related_job_id:      job.id,
            target_user_id:      pmUser.id,
            created_by_id:       pmUser.id,
            rule_key:            ruleKey,
            source:              "anti_surprise_engine",
            payload: {
              work_type:    workType,
              job_address:  job.address,
              item_count:   items.length,
              photo_req:    items.filter((i: any) => i.photo_required).length,
              must_doc:     items.filter((i: any) => i.must_document).length,
              items:        items.map((i: any) => ({
                label:          i.label,
                photo_required: i.photo_required,
                must_document:  i.must_document,
                sort_order:     i.sort_order,
              })),
            },
          });

          jobGenerated++;
          jobTrades.push(workType);
        }

        totalGenerated += jobGenerated;
        results.push({
          job_id:     job.id,
          address:    job.address,
          generated:  jobGenerated,
          work_types: jobTrades,
        });
      } catch (jobErr: any) {
        results.push({
          job_id:  job.id,
          error:   String(jobErr?.message || jobErr).slice(0, 200),
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: jobs.length, generated: totalGenerated, results }),
      { headers: CORS }
    );
  } catch (err: any) {
    console.error("[anti-surprise-generator]", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500, headers: CORS,
    });
  }
});
