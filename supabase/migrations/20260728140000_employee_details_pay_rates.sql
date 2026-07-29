-- TIME_CLOCK_ARC S2 — employee records + pay rates. Owner+self only (pay data must NOT sit on
-- profiles: the profiles SELECT policy is tenant-wide, so every crew member could read each
-- other's rate). Straight-time only in v1 — no OT. This slice never touches job financials.

-- employee_details — one row per crew member (owner-managed).
CREATE TABLE employee_details (
  user_id        UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL,
  classification TEXT NOT NULL CHECK (classification = ANY (ARRAY['w2'::text, '1099'::text])),
  phone          TEXT,
  address        TEXT,
  start_date     DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- employee_pay_rates — APPEND-ONLY history. A raise inserts a new effective-dated row; rows are
-- never edited (no UPDATE policy). A fat-fingered rate is fixed by a same-day new row or owner DELETE.
CREATE TABLE employee_pay_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  user_id        UUID NOT NULL REFERENCES profiles(id),
  rate           NUMERIC NOT NULL CHECK (rate > 0),
  effective_date DATE NOT NULL,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_date)
);
CREATE INDEX idx_employee_pay_rates_user ON employee_pay_rates (user_id, effective_date DESC);

-- RLS — owner full; each user SELECT their own; NO PM access, NO cross-crew reads.
ALTER TABLE employee_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_pay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY employee_details_select ON employee_details FOR SELECT
  USING (user_id = auth.uid() OR (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner'));
CREATE POLICY employee_details_insert ON employee_details FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
CREATE POLICY employee_details_update ON employee_details FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner')
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
CREATE POLICY employee_details_delete ON employee_details FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

CREATE POLICY employee_pay_rates_select ON employee_pay_rates FOR SELECT
  USING (user_id = auth.uid() OR (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner'));
CREATE POLICY employee_pay_rates_insert ON employee_pay_rates FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
-- NO UPDATE policy — pay-rate history is append-only.
CREATE POLICY employee_pay_rates_delete ON employee_pay_rates FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
