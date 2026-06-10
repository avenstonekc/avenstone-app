// vigilance-runner — daily active-job health sweep
// Pure SQL/JS. ZERO model calls. No Anthropic imports.
// Called by pg_cron daily at 11:00 UTC (06:00 Central).
// Accepts force_job_ids array in POST body for manual/smoke-test runs.
//
// Dedup: checks for an existing OPEN todo with the same type+related_entity_id
// before writing. A persisting condition keeps its one open todo; no daily spam.

import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Match ai-pm-nightly scope exactly
const ACTIVE_STATUSES = ["in_progress", "final_touches"];

const daysSince = (dateStr: string) =>
  Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const sb = createClient(SB_URL, SB_SERVICE);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const forceJobIds: string[] | undefined = body.force_job_ids;

    const jobSelect = "id, address, status, tenant_id, client_user_id, contract_signed, created_at, updated_at";

    let jobs: any[];
    if (forceJobIds?.length) {
      const { data, error } = await sb.from("jobs").select(jobSelect).in("id", forceJobIds);
      if (error) throw error;
      jobs = data || [];
    } else {
      const { data, error } = await sb.from("jobs").select(jobSelect).in("status", ACTIVE_STATUSES);
      if (error) throw error;
      jobs = data || [];
    }

    if (!jobs.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0, total_fired: 0, results: [] }), {
        status: 200, headers: CORS,
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const isWeekday = new Date().getDay() !== 0 && new Date().getDay() !== 6;

    const results: any[] = [];

    for (const job of jobs) {
      try {
        const [
          { data: phases },
          { data: allTxs },
          { data: cos },
          { data: logs },
          { data: lineItems },
          { data: pmUsers },
          { data: consultSessions },
          { data: jobEstimates },
          { data: proposalDocs },
          { data: openTodos },
        ] = await Promise.all([
          sb.from("job_phases").select("phase_name, status, start_date").eq("job_id", job.id),
          sb.from("job_transactions").select("id, direction, type, status, due_date, amount, phase, lien_waiver_required, lien_waiver_url").eq("job_id", job.id),
          sb.from("change_orders").select("id, status, created_at, amount, description").eq("job_id", job.id),
          sb.from("daily_logs").select("log_date").eq("job_id", job.id).order("log_date", { ascending: false }).limit(5),
          sb.from("estimate_line_items").select("phase, client_price, total_cost").eq("job_id", job.id),
          sb.from("profiles").select("id").eq("tenant_id", job.tenant_id).in("role", ["project_manager", "owner"]).limit(1),
          sb.from("consultation_sessions").select("id, created_at").eq("job_id", job.id).order("created_at", { ascending: false }).limit(1),
          sb.from("job_estimates").select("id, created_at").eq("job_id", job.id).order("created_at", { ascending: false }).limit(1),
          sb.from("job_files").select("id, created_at").eq("job_id", job.id).eq("storage_bucket", "job-documents").eq("subcategory", "Proposals").eq("lifecycle_status", "active").order("created_at", { ascending: false }).limit(1),
          // Dedup: all open vigilance todos for this job
          sb.from("todos").select("type, related_entity_id").eq("job_id", job.id).eq("status", "open").eq("source", "vigilance"),
        ]);

        const pmUserId = pmUsers?.[0]?.id || null;

        // "type::related_entity_id" keys already open — skip if present
        const openKeys = new Set<string>(
          (openTodos || []).map((t: any) => `${t.type}::${t.related_entity_id}`)
        );

        const clientPayments = (allTxs || []).filter((t: any) => t.direction === "in");

        type Alert = {
          type: string;
          title: string;
          body: string;
          user_id: string | null;
          level: "high" | "medium" | "low";
          source_table: string;
          source_id: string;
        };
        const alerts: Alert[] = [];

        // Rule 1: contract_unsigned
        if (!job.contract_signed && daysSince(job.created_at) >= 2) {
          alerts.push({
            type: "contract_unsigned",
            title: "Contract needs your signature",
            body: `${job.address} — tap to review and sign your contract`,
            user_id: job.client_user_id,
            level: "high",
            source_table: "jobs",
            source_id: job.id,
          });
        }

        // Rule 2: payment_overdue
        const overduePayments = clientPayments.filter((p: any) =>
          p.status === "overdue" ||
          (p.status === "pending" && p.due_date && p.due_date < today)
        );
        if (overduePayments.length > 0) {
          const p = overduePayments[0];
          alerts.push({
            type: "payment_overdue",
            title: `Payment overdue — $${Number(p.amount).toLocaleString()}`,
            body: `${job.address} — payment was due ${p.due_date}. Tap to pay now.`,
            user_id: job.client_user_id,
            level: "high",
            source_table: "job_transactions",
            source_id: p.id,
          });
        }

        // Rule 3: phase_starting_soon
        const upcoming = (phases || []).filter((p: any) => {
          if (p.status !== "pending" || !p.start_date) return false;
          const daysUntil = Math.floor((new Date(p.start_date).getTime() - Date.now()) / 86400000);
          return daysUntil >= 0 && daysUntil <= 2;
        });
        if (upcoming.length > 0) {
          const ph = upcoming[0];
          alerts.push({
            type: "phase_starting_soon",
            title: `${ph.phase_name} starts ${ph.start_date === today ? "today" : "soon"}`,
            body: `${job.address} — confirm crew and materials are ready`,
            user_id: pmUserId,
            level: "medium",
            source_table: "jobs",
            source_id: job.id,
          });
        }

        // Rule 4: no_daily_log (weekdays only)
        if (isWeekday) {
          const lastLog = logs?.[0];
          const daysSinceLog = lastLog ? daysSince(lastLog.log_date) : 999;
          if (daysSinceLog >= 2) {
            alerts.push({
              type: "no_daily_log",
              title: "No daily log in 2 days",
              body: `${job.address} — is the crew on site? Log today's progress`,
              user_id: pmUserId,
              level: "medium",
              source_table: "jobs",
              source_id: job.id,
            });
          }
        }

        // Rule 5: co_pending_approval
        const pendingCOs = (cos || []).filter(
          (c: any) => c.status === "pending" && daysSince(c.created_at) >= 3
        );
        if (pendingCOs.length > 0) {
          const co = pendingCOs[0];
          alerts.push({
            type: "co_pending_approval",
            title: `Change order needs approval — $${Number(co.amount || 0).toLocaleString()}`,
            body: `${job.address} — ${co.description?.slice(0, 80) || "change order"} has been waiting ${daysSince(co.created_at)} days`,
            user_id: pmUserId,
            level: "medium",
            source_table: "change_orders",
            source_id: co.id,
          });
        }

        // Rule 6: job_stale
        if (daysSince(job.updated_at || job.created_at) >= 14) {
          alerts.push({
            type: "job_stale",
            title: `Job stuck in ${job.status} for 14+ days`,
            body: `${job.address} — no updates in over 2 weeks. Needs attention.`,
            user_id: pmUserId,
            level: "low",
            source_table: "jobs",
            source_id: job.id,
          });
        }

        // Rule 7: lien_waiver_missing
        const lienMissing = (allTxs || []).filter((t: any) =>
          t.direction === "out" &&
          ["sub_payout", "vendor_payment"].includes(t.type) &&
          t.lien_waiver_required === true &&
          !t.lien_waiver_url
        );
        if (lienMissing.length > 0) {
          alerts.push({
            type: "lien_waiver_missing",
            title: `${lienMissing.length} lien waiver${lienMissing.length > 1 ? "s" : ""} missing`,
            body: `${job.address} — ${lienMissing.length} sub/vendor payment${lienMissing.length > 1 ? "s" : ""} need lien waivers`,
            user_id: pmUserId,
            level: "medium",
            source_table: "job_transactions",
            source_id: lienMissing[0].id,
          });
        }

        // Rule 8: budget_overrun (any phase actual > 110% of budget)
        if (lineItems && lineItems.length) {
          const paidOut = (allTxs || []).filter((t: any) => t.direction === "out" && t.status === "paid");
          const phaseBudget: Record<string, number> = {};
          for (const li of lineItems as any[]) {
            if (!li.phase) continue;
            const key = li.phase.trim().toLowerCase();
            phaseBudget[key] = (phaseBudget[key] || 0) + Number(li.client_price ?? li.total_cost ?? 0);
          }
          const phaseActual: Record<string, number> = {};
          for (const t of paidOut as any[]) {
            if (!t.phase) continue;
            const key = t.phase.trim().toLowerCase();
            phaseActual[key] = (phaseActual[key] || 0) + Number(t.amount || 0);
          }
          const overBudgetPhases = Object.entries(phaseBudget).filter(([phase, budget]) => {
            const actual = phaseActual[phase] || 0;
            return budget > 0 && actual > budget * 1.10;
          });
          if (overBudgetPhases.length) {
            alerts.push({
              type: "budget_overrun",
              title: `Budget overrun — ${overBudgetPhases.length} phase${overBudgetPhases.length > 1 ? "s" : ""}`,
              body: `${job.address} — over budget: ${overBudgetPhases.map(([p]) => p).join(", ")}`,
              user_id: pmUserId,
              level: "high",
              source_table: "jobs",
              source_id: job.id,
            });
          }
        }

        // Rule 9: consultation_stale
        const lastSession = (consultSessions || [])[0];
        if (!lastSession && daysSince(job.created_at) >= 14) {
          alerts.push({
            type: "consultation_stale",
            title: "No consultation session on record",
            body: `${job.address} — job is ${daysSince(job.created_at)} days old with no AI consultation session`,
            user_id: pmUserId,
            level: "low",
            source_table: "jobs",
            source_id: job.id,
          });
        } else if (lastSession && daysSince(lastSession.created_at) >= 30) {
          alerts.push({
            type: "consultation_stale",
            title: "Consultation data is 30+ days old",
            body: `${job.address} — last consultation was ${daysSince(lastSession.created_at)} days ago. Consider a re-measure before the estimate.`,
            user_id: pmUserId,
            level: "low",
            source_table: "consultation_sessions",
            source_id: lastSession.id,
          });
        }

        // Rule 10: estimate_no_proposal_24h
        const latestEstimate = (jobEstimates || [])[0];
        const hasProposalDoc = proposalDocs && proposalDocs.length > 0;
        if (latestEstimate && !hasProposalDoc && daysSince(latestEstimate.created_at) >= 1) {
          alerts.push({
            type: "estimate_no_proposal_24h",
            title: "Estimate ready — proposal not generated",
            body: `${job.address} — estimate is ${daysSince(latestEstimate.created_at)} day${daysSince(latestEstimate.created_at) !== 1 ? "s" : ""} old with no proposal on file`,
            user_id: pmUserId,
            level: "medium",
            source_table: "job_estimates",
            source_id: latestEstimate.id,
          });
        }

        // Rule 11: proposal_not_sent_48h (source_table is job_files — not the legacy job_documents)
        const latestProposal = (proposalDocs || [])[0];
        if (latestProposal && daysSince(latestProposal.created_at) >= 2) {
          alerts.push({
            type: "proposal_not_sent_48h",
            title: "Proposal not sent to client",
            body: `${job.address} — proposal has been ready for ${daysSince(latestProposal.created_at)} days. Send it to the client.`,
            user_id: pmUserId,
            level: "medium",
            source_table: "job_files",
            source_id: latestProposal.id,
          });
        }

        // Dedup + filter
        const noUserAlerts = alerts.filter((a) => !a.user_id);
        const dedupSkipped = alerts.filter((a) => a.user_id && openKeys.has(`${a.type}::${a.source_id}`));
        const newAlerts = alerts.filter(
          (a) => a.user_id && !openKeys.has(`${a.type}::${a.source_id}`)
        );

        if (newAlerts.length > 0) {
          const now = new Date().toISOString();

          // Insert notifications — high-priority gets email_sent=false (trigger fires), others blocked
          const { error: notifErr } = await sb.from("notifications").insert(
            newAlerts.map((a) => ({
              tenant_id: job.tenant_id,
              job_id: job.id,
              type: a.type,
              title: a.title,
              body: a.body,
              user_id: a.user_id,
              created_at: now,
              email_sent: a.level !== "high",
            }))
          );
          if (notifErr) throw notifErr;

          // Insert todos with source='vigilance'
          const { error: todoErr } = await sb.from("todos").insert(
            newAlerts.map((a) => ({
              tenant_id: job.tenant_id,
              assigned_to_user_id: a.user_id,
              created_by_id: a.user_id,
              job_id: job.id,
              type: a.type,
              title: a.title,
              notes: a.body,
              priority: a.level,
              source: "vigilance",
              status: "open",
              related_entity_type: a.source_table,
              related_entity_id: a.source_id,
            }))
          );
          if (todoErr) throw todoErr;
        }

        results.push({
          job_id: job.id,
          address: job.address,
          rules_evaluated: 11,
          fired: newAlerts.length,
          alert_types: newAlerts.map((a) => a.type),
          dedup_skipped: dedupSkipped.length,
          no_user_skipped: noUserAlerts.length,
        });
      } catch (jobErr: any) {
        results.push({
          job_id: job.id,
          address: job.address ?? "?",
          error: String(jobErr?.message || jobErr).slice(0, 200),
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: jobs.length,
        total_fired: results.reduce((s: number, r: any) => s + (r.fired || 0), 0),
        results,
      }),
      { status: 200, headers: CORS }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500, headers: CORS,
    });
  }
});
