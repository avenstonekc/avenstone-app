-- Phase E: link failed-intent todos to bug_reports for realtime loop closure
ALTER TABLE todos ADD COLUMN IF NOT EXISTS bug_report_id uuid REFERENCES bug_reports(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_todos_bug_report_id ON todos(bug_report_id) WHERE bug_report_id IS NOT NULL;

-- Enable realtime on bug_reports so TodoCard can subscribe to status transitions
ALTER PUBLICATION supabase_realtime ADD TABLE bug_reports;

NOTIFY pgrst, 'reload schema';
