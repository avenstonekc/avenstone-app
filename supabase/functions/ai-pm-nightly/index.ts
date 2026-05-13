
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL      = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY") || "";
const AI_PM_URL   = `${SB_URL}/functions/v1/ai-project-manager`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const ACTIVE_STATUSES = ["in_progress", "final_touches"];

const daysSince = (dateStr: string) =>
  Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const sb = createClient(SB_URL, SB_SERVICE);

    const { data: jobs, error: jobsErr } = await sb
      .from("jobs")
      .select("id, address, status, tenant_id, client_user_id, contract_signed, contract_value, created_at, updated_at")
      .in("status", ACTIVE_STATUSES);

    if (jobsErr) throw jobsErr;

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0, total_alerts: 0, results: [] }), {
        status: 200,
        headers: CORS,
      });
    }

    const results: {
      job_id: string;
      address: string;
      alerts_fired: number;
      alert_types: string[];
      error?: string;
    }[] = [];

    const today = new Date().toISOString().slice(0, 10);
    const isWeekday = new Date().getDay() !== 0 && new Date().getDay() !== 6;

    // Process jobs sequentially to avoid rate limits
    for (const job of jobs) {
      try {
        const [
          { data: phases },
          { data: payments },
          { data: cos },
          { data: logs },
          { data: recentNotifs },
          { data: lineItems },
          { data: quoteRequests },
          { data: contractDocs },
          { data: pmUsers },
          { data: consultSessions },
          { data: jobEstimates },
          { data: proposalDocs },
        ] = await Promise.all([
          sb.from("schedule_phases").select("*").eq("job_id", job.id).order("order_index"),
          sb.from("job_transactions").select("*").eq("job_id", job.id),
          sb.from("change_orders").select("*").eq("job_id", job.id),
          sb.from("daily_logs").select("*").eq("job_id", job.id).order("log_date", { ascending: false }).limit(5),
          sb.from("notifications").select("type").eq("job_id", job.id).gte("created_at", new Date(Date.now() - 86400000).toISOString()),
          sb.from("estimate_line_items").select("phase,client_price,total_cost").eq("job_id", job.id),
          sb.from("quote_requests").select("*,responses:bid_responses(*)").eq("job_id", job.id),
          sb.from("job_documents").select("id,file_type").eq("job_id", job.id).eq("file_type", "contract"),
          sb.from("profiles").select("id").eq("tenant_id", job.tenant_id).in("role", ["project_manager", "owner"]).limit(1),
          sb.from("consultation_sessions").select("id,created_at").eq("job_id", job.id).order("created_at", { ascending: false }).limit(1),
          sb.from("job_estimates").select("id,created_at").eq("job_id", job.id).order("created_at", { ascending: false }).limit(1),
          sb.from("job_documents").select("id,created_at").eq("job_id", job.id).eq("file_type", "proposal").order("created_at", { ascending: false }).limit(1),
        ]);

        const pmUserId = pmUsers?.[0]?.id || null;

        const recentTypes = new Set((recentNotifs || []).map((n: { type: string }) => n.type));

        // Split transactions by direction for targeted rules
        const allTxs = payments || [];
        const clientPayments = allTxs.filter((t: { direction: string }) => t.direction === 'in');

        const alerts: {
          type: string;
          title: string;
          body: string;
          user_id: string | null;
          level: "high" | "medium" | "low";
          source_table?: string;
          source_id?: string;
        }[] = [];

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
        const overdue = clientPayments.filter(
          (p: { status: string; due_date: string | null }) =>
            p.status === "overdue" ||
            (p.status === "pending" && p.due_date && p.due_date < today)
        );
        if (overdue.length > 0) {
          const p = overdue[0];
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
        const upcoming = (phases || []).filter((p: { status: string; start_date: string | null }) => {
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

        // Rule 4: no_daily_log
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

        // Rule 5: co_pending_approval — targets PM/owner (not client)
        const pendingCOs = (cos || []).filter(
          (c: { status: string; created_at: string }) =>
            c.status === "pending" && daysSince(c.created_at) >= 3
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
        const lienMissing = allTxs.filter((t: { direction: string; type: string; lien_waiver_required: boolean; lien_waiver_url: string | null }) =>
          t.direction === 'out' &&
          ['sub_payout', 'vendor_payment'].includes(t.type) &&
          t.lien_waiver_required === true &&
          !t.lien_waiver_url
        );
        if (lienMissing.length > 0) {
          alerts.push({
            type: "lien_waiver_missing",
            title: `${lienMissing.length} lien waiver${lienMissing.length > 1 ? 's' : ''} missing`,
            body: `${job.address} — ${lienMissing.length} sub/vendor payment${lienMissing.length > 1 ? 's' : ''} need lien waivers`,
            user_id: pmUserId,
            level: "medium",
            source_table: "job_transactions",
            source_id: lienMissing[0].id,
          });
        }

        // Rule 8: budget_overrun (fires when any phase actual > 110% of budget)
        if (lineItems && lineItems.length) {
          const paidOut = allTxs.filter((t: { direction: string; status: string }) => t.direction === 'out' && t.status === 'paid');
          const phaseBudget: Record<string, number> = {};
          for (const li of lineItems as { phase: string | null; client_price: number | null; total_cost: number | null }[]) {
            if (!li.phase) continue;
            const key = li.phase.trim().toLowerCase();
            phaseBudget[key] = (phaseBudget[key] || 0) + Number(li.client_price ?? li.total_cost ?? 0);
          }
          const phaseActual: Record<string, number> = {};
          for (const t of paidOut as { phase?: string | null; amount: number }[]) {
            if (!t.phase) continue;
            const key = t.phase.trim().toLowerCase();
            phaseActual[key] = (phaseActual[key] || 0) + Number(t.amount || 0);
          }
          const overBudgetPhases = Object.entries(phaseBudget).filter(([phase, budget]) => {
            const actual = phaseActual[phase] || 0;
            return budget > 0 && actual > budget * 1.10;
          });
          if (overBudgetPhases.length) {
            const phaseList = overBudgetPhases.map(([p]) => p).join(', ');
            alerts.push({
              type: "budget_overrun",
              title: `Budget overrun — ${overBudgetPhases.length} phase${overBudgetPhases.length > 1 ? 's' : ''}`,
              body: `${job.address} — over budget: ${phaseList}`,
              user_id: pmUserId,
              level: "high",
              source_table: "jobs",
              source_id: job.id,
            });
          }
        }

        // Rule 9: bid_award_no_contract — awarded QR but no contract doc
        const hasAwardedQR = (quoteRequests || []).some(
          (qr: { responses?: { status: string }[] }) =>
            (qr.responses || []).some((r) => r.status === "awarded")
        );
        if (hasAwardedQR && !(contractDocs && contractDocs.length)) {
          alerts.push({
            type: "bid_award_no_contract",
            title: "Bid awarded — sub contract needed",
            body: `${job.address} — a bid has been awarded but no sub contract is on file`,
            user_id: pmUserId,
            level: "medium",
            source_table: "jobs",
            source_id: job.id,
          });
        }

        // Rule 10: itb_no_responses_due_soon — sent QR, due within 3 days, 0 responses
        const qrDueSoon = (quoteRequests || []).find(
          (qr: { status: string; due_date: string | null; responses?: unknown[] }) => {
            if (qr.status !== "sent" || !qr.due_date) return false;
            const daysUntil = Math.floor((new Date(qr.due_date).getTime() - Date.now()) / 86400000);
            return daysUntil >= 0 && daysUntil <= 3 && !(qr.responses || []).length;
          }
        );
        if (qrDueSoon) {
          alerts.push({
            type: "itb_no_responses_due_soon",
            title: "Quote request due soon — no bids yet",
            body: `${job.address} — ${(qrDueSoon as { trade?: string }).trade || "quote request"} due ${(qrDueSoon as { due_date: string }).due_date} with no responses`,
            user_id: pmUserId,
            level: "medium",
            source_table: "quote_requests",
            source_id: (qrDueSoon as { id: string }).id,
          });
        }

        // Rule 11: itb_award_pending — submitted bids waiting 5+ days for decision
        const qrAwardPending = (quoteRequests || []).find(
          (qr: { status: string; responses?: { status: string; submitted_at?: string | null }[] }) => {
            if (!["sent", "draft"].includes(qr.status)) return false;
            const submitted = (qr.responses || []).filter((r) => r.status === "submitted");
            if (!submitted.length) return false;
            const oldest = submitted.reduce((a: { submitted_at?: string | null }, b: { submitted_at?: string | null }) =>
              (a.submitted_at || "") < (b.submitted_at || "") ? a : b
            );
            return oldest.submitted_at && daysSince(oldest.submitted_at) >= 5;
          }
        );
        if (qrAwardPending) {
          alerts.push({
            type: "itb_award_pending",
            title: "Bid awaiting award decision",
            body: `${job.address} — ${(qrAwardPending as { trade?: string }).trade || "quote request"} has bids submitted for 5+ days`,
            user_id: pmUserId,
            level: "medium",
            source_table: "quote_requests",
            source_id: (qrAwardPending as { id: string }).id,
          });
        }

        // Rule 12: consultation_stale — no consultation session after 14+ days on active job
        const lastSession = (consultSessions || [])[0];
        const daysSinceSession = lastSession ? daysSince(lastSession.created_at) : daysSince(job.created_at);
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
        } else if (lastSession && daysSinceSession >= 30) {
          alerts.push({
            type: "consultation_stale",
            title: "Consultation data is 30+ days old",
            body: `${job.address} — last consultation was ${daysSinceSession} days ago. Consider a re-measure before the estimate.`,
            user_id: pmUserId,
            level: "low",
            source_table: "consultation_sessions",
            source_id: lastSession.id,
          });
        }

        // Rule 13: estimate_no_proposal_24h — has estimate but no proposal doc after 24h
        const latestEstimate = (jobEstimates || [])[0];
        const hasProposalDoc = proposalDocs && proposalDocs.length > 0;
        if (latestEstimate && !hasProposalDoc && daysSince(latestEstimate.created_at) >= 1) {
          alerts.push({
            type: "estimate_no_proposal_24h",
            title: "Estimate ready — proposal not generated",
            body: `${job.address} — estimate is ${daysSince(latestEstimate.created_at)} day${daysSince(latestEstimate.created_at) !== 1 ? 's' : ''} old with no proposal on file`,
            user_id: pmUserId,
            level: "medium",
            source_table: "job_estimates",
            source_id: latestEstimate.id,
          });
        }

        // Rule 14: proposal_not_sent_48h — proposal doc exists but hasn't been sent (still active job after 48h)
        const latestProposal = (proposalDocs || [])[0];
        if (latestProposal && daysSince(latestProposal.created_at) >= 2) {
          alerts.push({
            type: "proposal_not_sent_48h",
            title: "Proposal not sent to client",
            body: `${job.address} — proposal has been ready for ${daysSince(latestProposal.created_at)} days. Send it to the client.`,
            user_id: pmUserId,
            level: "medium",
            source_table: "job_documents",
            source_id: latestProposal.id,
          });
        }

        // Dedup: skip already-sent types and alerts with no target user
        const newAlerts = alerts.filter((a) => !recentTypes.has(a.type) && a.user_id);

        if (newAlerts.length > 0) {
          await sb.from("notifications").insert(
            newAlerts.map((a) => ({
              tenant_id: job.tenant_id,
              job_id: job.id,
              type: a.type,
              title: a.title,
              body: a.body,
              user_id: a.user_id,
              created_at: new Date().toISOString(),
            }))
          );

          // Also write todos (additive alongside notifications for v1)
          await sb.from("todos").insert(
            newAlerts.map((a) => ({
              tenant_id: job.tenant_id,
              assigned_to_user_id: a.user_id,
              created_by_id: a.user_id,
              job_id: job.id,
              type: a.type,
              title: a.title,
              notes: a.body,
              priority: a.level,
              source: "ai_pm_nightly",
              status: "open",
              related_entity_type: a.source_table || null,
              related_entity_id: a.source_id || null,
            }))
          );
        }

        // AI narrative disabled — too expensive for automatic firing

        results.push({
          job_id: job.id,
          address: job.address,
          alerts_fired: newAlerts.length,
          alert_types: newAlerts.map((a) => a.type),
        });
      } catch (jobErr) {
        results.push({
          job_id: job.id,
          address: job.address,
          alerts_fired: 0,
          alert_types: [],
          error: String(jobErr).slice(0, 200),
        });
      }
    }

    return new Response(
      JSON.stringify({
        processed: jobs.length,
        total_alerts: results.reduce((s, r) => s + r.alerts_fired, 0),
        results,
      }),
      { status: 200, headers: CORS }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: CORS,
    });
  }
});
