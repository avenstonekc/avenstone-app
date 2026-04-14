CREATE TABLE IF NOT EXISTS daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  job_id text REFERENCES jobs(id) ON DELETE SET NULL,
  title text NOT NULL,
  source text DEFAULT 'ai',
  completed boolean DEFAULT false,
  completed_at timestamptz,
  task_date date DEFAULT CURRENT_DATE,
  carried_over boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_access" ON daily_tasks FOR ALL USING (user_id = auth.uid());
