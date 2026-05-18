-- Phase 1: daily_logs approval workflow columns
-- Additive only — no existing columns touched.
-- Existing rows default to 'draft' (correct: historical logs were never curated).

ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS status         TEXT        NOT NULL DEFAULT 'draft'
    CONSTRAINT daily_logs_status_check CHECK (status IN ('draft', 'approved')),
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_id UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_daily_logs_status ON daily_logs(status);

-- Verify
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'daily_logs'
    AND column_name  IN ('status', 'approved_at', 'approved_by_id')
  ORDER BY column_name;

NOTIFY pgrst, 'reload schema';
