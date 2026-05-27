/**
 * company-files-watchdog — COMPANY_FILES_ARC Phase 5
 *
 * Processes ripe scheduled_actions rows for company file expirations.
 * Rule key pattern: cf_exp_30d_<uuid> | cf_exp_14d_<uuid> | cf_exp_0d_<uuid>
 *
 * For each ripe row:
 *   1. Load the company_file from payload.company_file_id
 *   2. If archived → cancel row, skip (file was replaced)
 *   3. Get all owner + project_manager profiles for the tenant
 *   4. For each profile: check open todos with related_entity_id=<cf uuid>
 *      to prevent duplicates across re-runs
 *   5. Create todos for profiles without an open one for this file
 *   6. Mark scheduled_actions.status='fired', fired_at=NOW()
 *
 * Scheduled: daily at 14:00 UTC via GitHub Actions company-files-watchdog.yml
 * Model: no AI — pure DB read/write. Zero API cost.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Map days_out → human-readable urgency message and todo priority
function alertMeta(daysOut: number, cfType: string, expDate: string): { title: string; notes: string; priority: string } {
  const fmtDate = new Date(expDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (daysOut === 0 || daysOut < 0) {
    return {
      title:    `⚠️ ${cfType} has expired — renew immediately`,
      notes:    `Expired ${fmtDate}. Update via Settings → Company Files before sending next CO or proposal.`,
      priority: "high",
    };
  }
  if (daysOut <= 14) {
    return {
      title:    `⚠️ ${cfType} expires in ${daysOut} days — urgent`,
      notes:    `Expires ${fmtDate}. Start renewal now — docs take several days to process. Update via Settings → Company Files.`,
      priority: "high",
    };
  }
  return {
    title:    `${cfType} expires in ${daysOut} days`,
    notes:    `Expires ${fmtDate}. Start renewal soon to avoid lapse. Update via Settings → Company Files.`,
    priority: "medium",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const sb = createClient(SB_URL, SB_SERVICE);
  const now = new Date().toISOString();

  try {
    // 1. Fetch all ripe scheduled_actions for company file expirations
    const { data: ripeRows, error: fetchErr } = await sb
      .from("scheduled_actions")
      .select("*")
      .eq("status", "scheduled")
      .like("rule_key", "cf_exp_%")
      .lte("fire_at", now);

    if (fetchErr) throw fetchErr;
    if (!ripeRows || ripeRows.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, todos_created: 0, skipped: 0, message: "No ripe rows" }),
        { status: 200, headers: CORS },
      );
    }

    let todosCreated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of ripeRows) {
      try {
        const companyFileId: string = row.payload?.company_file_id;
        const daysOut: number = row.payload?.days_out ?? 0;

        if (!companyFileId) {
          // Malformed row — cancel it
          await sb.from("scheduled_actions")
            .update({ status: "cancelled", cancelled_at: now })
            .eq("id", row.id);
          skipped++;
          continue;
        }

        // 2. Load the company_file
        const { data: cf, error: cfErr } = await sb
          .from("company_files")
          .select("id, tenant_id, type, expiration_date, lifecycle_status")
          .eq("id", companyFileId)
          .single();

        if (cfErr || !cf) {
          // File deleted or not found — cancel row
          await sb.from("scheduled_actions")
            .update({ status: "cancelled", cancelled_at: now })
            .eq("id", row.id);
          skipped++;
          continue;
        }

        if (cf.lifecycle_status === "archived") {
          // File was replaced — cancel row, no todo needed
          await sb.from("scheduled_actions")
            .update({ status: "cancelled", cancelled_at: now })
            .eq("id", row.id);
          skipped++;
          continue;
        }

        // 3. Get owner + project_manager profiles for the tenant
        const { data: staffProfiles, error: profErr } = await sb
          .from("profiles")
          .select("id")
          .eq("tenant_id", cf.tenant_id)
          .in("role", ["owner", "project_manager"]);

        if (profErr || !staffProfiles?.length) {
          errors.push(`No owner/PM profiles for tenant ${cf.tenant_id}`);
          await sb.from("scheduled_actions")
            .update({ status: "fired", fired_at: now })
            .eq("id", row.id);
          continue;
        }

        // 4. For each profile, check for existing open todo and create if absent
        const meta = alertMeta(daysOut, cf.type, cf.expiration_date);

        for (const prof of staffProfiles) {
          const { data: existing } = await sb
            .from("todos")
            .select("id")
            .eq("related_entity_type", "company_file")
            .eq("related_entity_id", companyFileId)
            .eq("assigned_to_user_id", prof.id)
            .eq("status", "open")
            .maybeSingle();

          if (existing) continue; // already has an open todo for this file

          // 5. Create todo
          const { error: todoErr } = await sb.from("todos").insert({
            tenant_id:           cf.tenant_id,
            assigned_to_user_id: prof.id,
            created_by_id:       prof.id,
            title:               meta.title,
            notes:               meta.notes,
            type:                "company_file_expiration",
            source:              "engine",
            status:              "open",
            priority:            meta.priority,
            related_entity_type: "company_file",
            related_entity_id:   companyFileId,
            due_date:            cf.expiration_date,
          });

          if (todoErr) {
            errors.push(`Todo insert failed for profile ${prof.id}: ${todoErr.message}`);
          } else {
            todosCreated++;
          }
        }

        // 6. Mark scheduled_actions row as fired
        await sb.from("scheduled_actions")
          .update({ status: "fired", fired_at: now })
          .eq("id", row.id);

      } catch (rowErr: unknown) {
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
        errors.push(`Row ${row.id}: ${msg}`);
      }
    }

    const result = {
      processed:     ripeRows.length,
      todos_created: todosCreated,
      skipped,
      errors:        errors.length > 0 ? errors : undefined,
    };

    return new Response(JSON.stringify(result), { status: 200, headers: CORS });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS });
  }
});
