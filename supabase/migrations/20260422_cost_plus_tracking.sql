-- Cost-plus job tracking

CREATE TABLE IF NOT EXISTS job_cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  trade text NOT NULL DEFAULT '',
  vendor text NOT NULL DEFAULT '',
  estimate numeric NOT NULL DEFAULT 0,
  markup_pct numeric NOT NULL DEFAULT 0,
  client_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_cost_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  cost_item_id uuid NOT NULL REFERENCES job_cost_items(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  date date,
  amount numeric NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT false,
  invoice_file_url text,
  invoice_file_name text,
  lien_waiver_file_url text,
  lien_waiver_file_name text,
  lien_waiver_signed_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cost_plus boolean NOT NULL DEFAULT false;

ALTER TABLE job_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cost_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access" ON job_cost_items USING (tenant_id = get_my_tenant_id());
CREATE POLICY "tenant_access" ON job_cost_invoices USING (tenant_id = get_my_tenant_id());
