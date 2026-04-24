-- QuickBooks category mapping + sync tracking
-- qb_category_map: tenant-level mapping of transaction_type → QB account / class
-- qb_synced_at on job_transactions: timestamps when a row was included in a QB export

CREATE TABLE IF NOT EXISTS qb_category_map (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  tx_type     TEXT NOT NULL,
  qb_account  TEXT NOT NULL DEFAULT '',
  qb_class    TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, tx_type)
);

CREATE INDEX IF NOT EXISTS idx_qb_category_map_tenant ON qb_category_map(tenant_id);

ALTER TABLE job_transactions
  ADD COLUMN IF NOT EXISTS qb_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_job_transactions_qb_synced
  ON job_transactions(qb_synced_at)
  WHERE qb_synced_at IS NOT NULL;

ALTER TABLE qb_category_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_qb_map" ON qb_category_map
  FOR ALL
  USING  (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner')
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

-- Staff can read the map (needed when they run an export)
CREATE POLICY "staff_read_qb_map" ON qb_category_map
  FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));

-- Seed default QB account / class mappings for Avenstone tenant
INSERT INTO qb_category_map (tenant_id, tx_type, qb_account, qb_class) VALUES
  ('00000000-0000-0000-0000-000000000001', 'client_payment',    'Accounts Receivable',  'Job Revenue'),
  ('00000000-0000-0000-0000-000000000001', 'client_deposit',    'Customer Deposits',    'Job Revenue'),
  ('00000000-0000-0000-0000-000000000001', 'client_refund',     'Accounts Receivable',  'Job Revenue'),
  ('00000000-0000-0000-0000-000000000001', 'sub_payout',        'Subcontractors',       'Cost of Goods Sold'),
  ('00000000-0000-0000-0000-000000000001', 'vendor_payment',    'Materials & Supplies', 'Cost of Goods Sold'),
  ('00000000-0000-0000-0000-000000000001', 'material_purchase', 'Materials & Supplies', 'Cost of Goods Sold'),
  ('00000000-0000-0000-0000-000000000001', 'equipment_rental',  'Equipment Rental',     'Cost of Goods Sold'),
  ('00000000-0000-0000-0000-000000000001', 'permit',            'Permits & Fees',       'Job Costs'),
  ('00000000-0000-0000-0000-000000000001', 'fuel',              'Fuel & Mileage',       'Operating Expenses'),
  ('00000000-0000-0000-0000-000000000001', 'commission',        'Commissions Paid',     'Operating Expenses'),
  ('00000000-0000-0000-0000-000000000001', 'other_expense',     'General Expenses',     'Operating Expenses'),
  ('00000000-0000-0000-0000-000000000001', 'other_income',      'Other Income',         'Other Income')
ON CONFLICT (tenant_id, tx_type) DO NOTHING;
