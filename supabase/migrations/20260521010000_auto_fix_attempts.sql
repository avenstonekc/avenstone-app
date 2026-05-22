-- Audit log for every AUTO_FIX_ARC dispatch attempt.
-- One row per classifier invocation. backend_safe bugs get vm_dispatch_status='dispatched';
-- all others get vm_dispatch_status='not_dispatched'. One-try-per-bug enforced in the edge fn
-- by checking COUNT(*) on this table before dispatching.

CREATE TABLE auto_fix_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_id UUID NOT NULL REFERENCES bug_reports(id),
  classification TEXT NOT NULL,
  reasoning TEXT,
  fix_prompt TEXT,
  vm_dispatch_status TEXT,
  vm_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auto_fix_attempts_bug_id ON auto_fix_attempts(bug_id);
CREATE INDEX idx_auto_fix_attempts_created_at ON auto_fix_attempts(created_at DESC);

ALTER TABLE auto_fix_attempts ENABLE ROW LEVEL SECURITY;

-- Platform owners can read all attempts for debugging and weekly review.
CREATE POLICY auto_fix_attempts_platform_owner_read ON auto_fix_attempts
  FOR SELECT USING (
    (SELECT is_platform_owner FROM profiles WHERE id = auth.uid()) = TRUE
  );

NOTIFY pgrst, 'reload schema';
