-- ai_knowledge.created_by — DB drift fix
--
-- Code (ai-master-agent, ai-companion, AiSetupWizard, AiKnowledgeScr),
-- the seed script (scripts/seed-avenstone-knowledge.sql), and CLAUDE.md
-- all reference `created_by` on ai_knowledge. Live schema was missing it
-- (table was created out-of-band; no prior migration in the repo
-- creates or alters ai_knowledge). Master agent's add_knowledge errored
-- "Could not find the 'created_by' column of 'ai_knowledge' in the
-- schema cache." Same pattern as change_orders.submitted_by_id (fixed
-- 2026-05-08) and jobs.start_date (fixed 2026-05-09).

ALTER TABLE ai_knowledge
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
