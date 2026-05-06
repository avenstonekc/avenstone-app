ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS business_email   TEXT,
  ADD COLUMN IF NOT EXISTS business_phone   TEXT,
  ADD COLUMN IF NOT EXISTS business_address TEXT;

UPDATE tenants
SET
  business_email   = 'notifications@avenstonekc.com',
  business_address = 'Kansas City, MO'
WHERE id = '00000000-0000-0000-0000-000000000001';

NOTIFY pgrst, 'reload schema';
