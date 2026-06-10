-- Delete test job 'test-flow-001' (123 Test Flow Dr, Kansas City MO) and all referencing rows.
-- Audit counts before deletion (all verified non-zero tables):
--   change_orders: 4, consultation_sessions: 16, consultation_extractions: 1,
--   consultation_measurements: 2, consultation_gap_analyses: 2, daily_logs: 5,
--   draw_schedules: 2, estimate_line_items: 5, floor_plans: 2, invoice_line_items: 2,
--   invoices: 2, job_ai_companions: 2, job_files: 59, job_lidar_scans: 42,
--   job_phases: 10, job_sub_engagements: 1, job_transactions: 33, notifications: 109,
--   oh_shit_moments: 10, photos: 14, schedule_change_log: 1, schedule_items: 3,
--   sub_invoice_payments: 1, sub_invoices: 1, todos: 6

BEGIN;

-- ── Level 3: grandchildren ────────────────────────────────────────────────────
DELETE FROM consultation_extractions
  WHERE session_id IN (SELECT id FROM consultation_sessions WHERE job_id::text = 'test-flow-001');

DELETE FROM consultation_measurements
  WHERE session_id IN (SELECT id FROM consultation_sessions WHERE job_id::text = 'test-flow-001');

DELETE FROM consultation_gap_analyses
  WHERE session_id IN (SELECT id FROM consultation_sessions WHERE job_id::text = 'test-flow-001');

DELETE FROM sub_invoice_payments
  WHERE sub_invoice_id IN (SELECT id FROM sub_invoices WHERE job_id::text = 'test-flow-001');

DELETE FROM invoice_line_items
  WHERE invoice_id IN (SELECT id FROM invoices WHERE job_id::text = 'test-flow-001');

-- ── Level 2: direct job children ──────────────────────────────────────────────
DELETE FROM change_orders          WHERE job_id::text = 'test-flow-001';
DELETE FROM consultation_sessions  WHERE job_id::text = 'test-flow-001';
DELETE FROM daily_logs             WHERE job_id::text = 'test-flow-001';
DELETE FROM draw_schedules         WHERE job_id::text = 'test-flow-001';
DELETE FROM estimate_line_items    WHERE job_id::text = 'test-flow-001';
DELETE FROM floor_plans            WHERE job_id::text = 'test-flow-001';
DELETE FROM invoices               WHERE job_id::text = 'test-flow-001';
DELETE FROM job_ai_companions      WHERE job_id::text = 'test-flow-001';
DELETE FROM job_files              WHERE job_id::text = 'test-flow-001';
DELETE FROM job_lidar_scans        WHERE job_id::text = 'test-flow-001';
DELETE FROM job_phases             WHERE job_id::text = 'test-flow-001';
DELETE FROM job_sub_engagements    WHERE job_id::text = 'test-flow-001';
DELETE FROM job_transactions       WHERE job_id::text = 'test-flow-001';
DELETE FROM notifications          WHERE job_id::text = 'test-flow-001';
DELETE FROM oh_shit_moments        WHERE job_id::text = 'test-flow-001';
DELETE FROM photos                 WHERE job_id::text = 'test-flow-001';
DELETE FROM schedule_change_log    WHERE job_id::text = 'test-flow-001';
DELETE FROM schedule_items         WHERE job_id::text = 'test-flow-001';
DELETE FROM sub_invoices           WHERE job_id::text = 'test-flow-001';
DELETE FROM todos                  WHERE job_id::text = 'test-flow-001';

-- ── Level 1: jobs row ─────────────────────────────────────────────────────────
DELETE FROM jobs WHERE id::text = 'test-flow-001';

COMMIT;
