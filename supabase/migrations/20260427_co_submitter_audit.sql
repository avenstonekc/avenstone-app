ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS submitted_by_id UUID REFERENCES profiles(id);
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS submitted_by_role TEXT;
CREATE INDEX IF NOT EXISTS change_orders_submitted_by_id_idx ON change_orders(submitted_by_id);
-- Apply via Supabase Studio SQL editor or curl Management API; see CLAUDE.md.
