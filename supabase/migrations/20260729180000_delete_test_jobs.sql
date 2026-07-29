-- TEST_JOB_CLEANUP (2026-07-29) — delete 25 test jobs + every referencing row.
--
-- Kalin locked the KEEP list in-session and ruled the ambiguous rows:
--   KEEP (untouched): 8617 Houston, 107 Brentwood, 1206 W Lucy Webb, 12101 Pawnee,
--     999 Cost Plus Sandbox, 456 Test Flow Ave, + spared 810 crane st & 11291 Hemlock.
--   DELETE: 23 test-named 2026-07-17 rows + '999 Test Lane' (7b44611a, $121k, KALIN_QUEUE c)
--     + '5010 e pony creek rd' (5cb49d86, Kalin's house, a test — $542.50 receipt already
--       QB-synced; that QB entry must be voided manually, this delete cannot reach it).
--
-- This schema DOES enforce FK constraints between child tables (discovered via pg_constraint),
-- incl. one cycle oh_shit_moments.converted_to_co_id <-> change_orders.oh_shit_moment_id. The
-- deletes below run child-before-parent in a topological order; the cycle is broken by nulling
-- the optional converted_to_co_id link first. No delete-firing triggers exist on any child
-- table or on `jobs`, so no cascade can reach a kept job. Storage objects for these jobs were
-- removed first by tools/cleanup_test_jobs_storage.cjs (11 objects). Whole thing is one txn.

BEGIN;

CREATE TEMP TABLE _del_jobs(id text) ON COMMIT DROP;
INSERT INTO _del_jobs(id) VALUES
 ('6a6bf561-1199-4659-bd4e-3e21c90fd228'), -- 456 PATH CERTAINTY TEST
 ('8d5f5391-e7cc-454b-a4e8-32674925fd7f'), -- 456 PATH CERTAINTY TEST
 ('93d28a78-eee2-4d65-afdc-0cd2c4ab9b0c'), -- 456 PATH CERTAINTY TEST
 ('25391e4f-f66d-481f-9bc8-c49b2c05c343'), -- 456 PATH CERTAINTY TEST 2
 ('0b10eebe-fef6-44df-b6f5-29628dfb20aa'), -- 789 BADGE TEST JOB
 ('be34ecc8-69c7-4941-8682-51c69e3f6925'), -- 999 ROUTING TEST
 ('8a0a8aa6-dd02-4a70-a831-949348b2ab43'), -- 111 SCENARIO D TEST
 ('0c5ec979-831e-4d6c-9fa0-bb9664bc2c3c'), -- 100 RUN A
 ('eaf3c4fb-8283-4f44-85fb-02a4bfec3526'), -- 100 RUN D
 ('ffdce472-f973-485a-8188-3a7c643f701b'), -- 200 SF TEST
 ('b2899c06-7352-41d2-9ba2-59b1a70ae72d'), -- 300 FINAL TEST
 ('6dea93fc-3068-4d6e-a6ec-bb3346f25a32'), -- 400 VERIFY DEPLOY
 ('e4720494-d3f2-4adc-9391-fed6ddc1b3b7'), -- 500 DEBUG TEST
 ('be5803f9-9886-464f-a87c-0566320e9541'), -- 600 TRACE TEST
 ('3bbc3c63-b7f8-48d5-8734-76e4bd3d2740'), -- 700 FINAL D TEST
 ('7d4b24b3-14cd-4c67-be7d-587d74ea1883'), -- 800 SF UNLOCK TEST
 ('b7757406-2a41-4242-b80c-2b08f87d8685'), -- 900 SF FIX TEST
 ('3d4881de-6e25-4959-b7a7-113a961f473c'), -- 950 FIBER TEST
 ('5aa81533-c723-4705-babc-04eff442c372'), -- 975 API INTERCEPT TEST
 ('e9a46af4-e34c-491f-b3a8-8eaa7380b198'), -- 999 FINAL API TEST
 ('a445463f-98f6-4c6b-a367-b676137dc9c7'), -- 1000 PICKER DIRECT TEST
 ('8d2c76a0-7385-46d6-9036-ba3664d38c17'), -- 1100 DIRECT STATE TEST
 ('c68495d9-f913-40a7-9204-1b6b34aeb9b0'), -- 1200 IDX47 TEST
 ('7b44611a-854d-407e-ac8f-9c4b61b62d6d'), -- 999 Test Lane, Testville KS
 ('5cb49d86-6cb6-4685-8582-c5c8888df970'); -- 5010 e pony creek rd

-- Break the change_orders <-> oh_shit_moments cycle (optional link).
UPDATE oh_shit_moments SET converted_to_co_id = NULL WHERE job_id::text IN (SELECT id FROM _del_jobs);

-- ── Group 1: leaf grandchildren (no job_id) — via their parent ──
DELETE FROM draw_line_items
  WHERE draw_id        IN (SELECT id FROM draw_schedules   WHERE job_id::text IN (SELECT id FROM _del_jobs))
     OR transaction_id IN (SELECT id FROM job_transactions WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM sub_invoice_payments
  WHERE sub_invoice_id IN (SELECT id FROM sub_invoices     WHERE job_id::text IN (SELECT id FROM _del_jobs))
     OR transaction_id IN (SELECT id FROM job_transactions WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM invoice_line_items
  WHERE invoice_id     IN (SELECT id FROM invoices         WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM floor_plan_versions
  WHERE floor_plan_id  IN (SELECT id FROM floor_plans      WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM schedule_item_invitees
  WHERE schedule_item_id IN (SELECT id FROM schedule_items WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM site_visit_checklist_items
  WHERE schedule_item_id IN (SELECT id FROM schedule_items WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM engagement_bids
  WHERE engagement_id  IN (SELECT id FROM job_sub_engagements WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM sales_turns
  WHERE session_id     IN (SELECT id FROM sales_sessions   WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM contact_messages
  WHERE contact_id     IN (SELECT id FROM contacts         WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM contact_lidar_scans
  WHERE contact_id     IN (SELECT id FROM contacts         WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM sequence_enrollments
  WHERE contact_id     IN (SELECT id FROM contacts         WHERE job_id::text IN (SELECT id FROM _del_jobs));

-- ── Group 2: job_id children that reference deeper parents ──
DELETE FROM schedule_change_log      WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_materials            WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_scope_answers        WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM payment_milestones       WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM consultation_extractions WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM consultation_measurements WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM consultation_photos      WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM consultation_recaps      WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM punch_items              WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM change_orders            WHERE job_id::text IN (SELECT id FROM _del_jobs); -- before oh_shit_moments & job_transactions
DELETE FROM oh_shit_moments          WHERE job_id::text IN (SELECT id FROM _del_jobs); -- before consultation_sessions

-- ── Group 3: mid-level children ──
DELETE FROM estimate_line_items      WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after job_materials
DELETE FROM sub_invoices             WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after sub_invoice_payments
DELETE FROM job_transactions         WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after change_orders/draw_line_items/sub_*
DELETE FROM invoices                 WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after invoice_line_items/payment_milestones/job_transactions
DELETE FROM draw_packages            WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_estimates            WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after estimate_line_items, before consultation_sessions
DELETE FROM schedule_items           WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after its invitees/log/site_visit/sub_invoices
DELETE FROM floor_plans              WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after floor_plan_versions, before contacts
DELETE FROM job_rooms                WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after estimate_line_items/job_scope_answers

-- ── Group 4: parents ──
DELETE FROM consultation_sessions    WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_sub_engagements      WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_phases               WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM payment_schedules        WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM draw_schedules           WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM sales_sessions           WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM contacts                 WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after floor_plans/sub_invoices/contact_*
DELETE FROM job_files                WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after sub_invoices

-- ── Group 5: independent job_id tables (no intra-set dependents) ──
DELETE FROM scheduled_actions        WHERE related_job_id::text IN (SELECT id FROM _del_jobs)
                                        OR related_todo_id IN (SELECT id FROM todos WHERE job_id::text IN (SELECT id FROM _del_jobs));
DELETE FROM ai_pm_runs               WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM ai_error_logs            WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM bid_analytics            WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM consultation_gap_analyses WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM contract_signatures      WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM daily_logs               WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_ai_companions        WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_cost_invoices        WHERE job_id::text IN (SELECT id FROM _del_jobs); -- before job_cost_items
DELETE FROM job_cost_items           WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_documents            WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_lidar_scans          WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_messages             WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_notes                WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_outcomes             WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_reviews              WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM job_walkthrough_items    WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM material_orders          WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM messages                 WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM notifications            WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM owner_escalations        WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM photos                   WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM proposals                WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM staff_messages           WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM sub_ratings              WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM sub_reviews              WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM takeoff_drafts           WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM time_entries             WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM trade_actuals            WHERE job_id::text IN (SELECT id FROM _del_jobs);
DELETE FROM todos                    WHERE job_id::text IN (SELECT id FROM _del_jobs); -- after scheduled_actions

-- ── Group 6: the jobs themselves ──
DELETE FROM jobs WHERE id::text IN (SELECT id FROM _del_jobs);

COMMIT;
