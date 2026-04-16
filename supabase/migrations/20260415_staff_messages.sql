-- Staff messages: direct PM ↔ Sub chat per job (not visible to clients)
CREATE TABLE IF NOT EXISTS staff_messages (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  text        NOT NULL,
  job_id     text        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sender_id  uuid        NOT NULL REFERENCES profiles(id),
  content    text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_messages_job_idx ON staff_messages(job_id);
CREATE INDEX IF NOT EXISTS staff_messages_created_idx ON staff_messages(created_at);

ALTER TABLE staff_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_messages_select ON staff_messages
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE tenant_id = staff_messages.tenant_id)
  );

CREATE POLICY staff_messages_insert ON staff_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    auth.uid() IN (SELECT id FROM profiles WHERE tenant_id = staff_messages.tenant_id)
  );
