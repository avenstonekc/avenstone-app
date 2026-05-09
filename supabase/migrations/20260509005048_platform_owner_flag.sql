ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_owner BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE profiles SET is_platform_owner = TRUE WHERE email = 'kalin@avenstonekc.com';
COMMENT ON COLUMN profiles.is_platform_owner IS 'TRUE = can read bug_reports cross-tenant. Set manually for Kalin and Blake.';
NOTIFY pgrst, 'reload schema';
