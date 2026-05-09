-- Master Agent v2 simplification — queue retired in favor of persistent chat.
-- 8 rows existed at drop time (6 complete, 2 discarded — all smoke-test artifacts).
-- Resulting entities (job_transactions, change_orders, jobs, todos) live in their
-- own tables and are unaffected; only audit metadata is intentionally lost.
DROP TABLE IF EXISTS pending_tasks CASCADE;
NOTIFY pgrst, 'reload schema';
