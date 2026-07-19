-- AGENT_DOCS Slice 2 — lien waiver templates as DATA (editable without code).
-- Legal text reviewed and signed off by attorney on 2026-07-18 (MO + KS, no redlines).
-- Keyed by (tenant, state, conditional, final). Unconditional variants set requires_payment_gate
-- so the agent hard-gates them behind an explicit "payment received" confirmation + amount read-back.
-- Placeholders filled at render time: {{state}} {{claimant}} {{customer}} {{owner}} {{job_address}}
--   {{amount}} {{through_date}} {{exceptions}} {{date}}.

CREATE TABLE IF NOT EXISTS waiver_templates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL,
  state                  TEXT NOT NULL CHECK (state IN ('MO', 'KS')),
  conditional            BOOLEAN NOT NULL,
  final                  BOOLEAN NOT NULL,
  title                  TEXT NOT NULL,
  notice                 TEXT,                              -- bold NOTICE recital (unconditional only; NULL otherwise)
  body_template          TEXT NOT NULL,
  requires_payment_gate  BOOLEAN NOT NULL DEFAULT false,    -- true for unconditional — agent must confirm payment received
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, state, conditional, final)
);

CREATE INDEX IF NOT EXISTS idx_waiver_templates_lookup
  ON waiver_templates (tenant_id, state, conditional, final);

ALTER TABLE waiver_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wt_tenant_select ON waiver_templates;
CREATE POLICY wt_tenant_select ON waiver_templates
  FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS wt_modify ON waiver_templates;
CREATE POLICY wt_modify ON waiver_templates
  FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('owner')))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('owner')));

-- ── Seed: Avenstone tenant, MO + KS × 4 variants (attorney-approved 2026-07-18) ──
DO $$
DECLARE
  t_id UUID := '00000000-0000-0000-0000-000000000001';
  st   TEXT;
  states TEXT[] := ARRAY['MO', 'KS'];
BEGIN
  FOREACH st IN ARRAY states LOOP
    -- 1. CONDITIONAL PROGRESS
    INSERT INTO waiver_templates (tenant_id, state, conditional, final, title, notice, body_template, requires_payment_gate)
    VALUES (t_id, st, true, false,
      'CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT',
      NULL,
      'State: {{state}}' || E'\n\n' ||
      'This document waives and releases lien, stop-payment-notice, and payment-bond rights the claimant has for labor and materials furnished to the property described below, but only on condition that the claimant actually receives payment of {{amount}}, and only to the extent of that payment. This waiver does not become effective until the payment has been received and the funds have cleared.' || E'\n\n' ||
      'Claimant: {{claimant}}' || E'\n' ||
      'Customer / Contractor: {{customer}}' || E'\n' ||
      'Owner: {{owner}}' || E'\n' ||
      'Property: {{job_address}}' || E'\n' ||
      'Through date (payment covers labor/materials through): {{through_date}}' || E'\n' ||
      'This waiver excludes retainage, unbilled/disputed items, and: {{exceptions}}',
      false)
    ON CONFLICT (tenant_id, state, conditional, final) DO NOTHING;

    -- 2. UNCONDITIONAL PROGRESS
    INSERT INTO waiver_templates (tenant_id, state, conditional, final, title, notice, body_template, requires_payment_gate)
    VALUES (t_id, st, false, false,
      'UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT',
      'NOTICE: This document waives and releases lien, stop-payment-notice, and payment-bond rights the claimant has, unconditionally, for the amount below — even if the claimant has not been paid. If the claimant has not been paid, use a conditional waiver form instead.',
      'State: {{state}}' || E'\n\n' ||
      'The claimant has been paid {{amount}} and waives and releases any lien, stop-payment-notice, and payment-bond claim for labor and materials furnished through {{through_date}}, excluding retainage and: {{exceptions}}.' || E'\n\n' ||
      'Claimant: {{claimant}}' || E'\n' ||
      'Owner: {{owner}}' || E'\n' ||
      'Property: {{job_address}}',
      true)
    ON CONFLICT (tenant_id, state, conditional, final) DO NOTHING;

    -- 3. CONDITIONAL FINAL
    INSERT INTO waiver_templates (tenant_id, state, conditional, final, title, notice, body_template, requires_payment_gate)
    VALUES (t_id, st, true, true,
      'CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT',
      NULL,
      'State: {{state}}' || E'\n\n' ||
      'This document waives and releases all lien, stop-payment-notice, and payment-bond rights the claimant has on the property, on condition that the claimant receives final payment of {{amount}} and the funds clear. This release is effective only upon receipt of that payment.' || E'\n\n' ||
      'Claimant: {{claimant}}' || E'\n' ||
      'Customer / Contractor: {{customer}}' || E'\n' ||
      'Owner: {{owner}}' || E'\n' ||
      'Property: {{job_address}}' || E'\n' ||
      'Excludes disputed claims (if any): {{exceptions}}',
      false)
    ON CONFLICT (tenant_id, state, conditional, final) DO NOTHING;

    -- 4. UNCONDITIONAL FINAL
    INSERT INTO waiver_templates (tenant_id, state, conditional, final, title, notice, body_template, requires_payment_gate)
    VALUES (t_id, st, false, true,
      'UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT',
      'NOTICE: This document waives and releases ALL lien, stop-payment-notice, and payment-bond rights the claimant has, unconditionally. This is a final release. If the claimant has not been paid in full, do not sign.',
      'State: {{state}}' || E'\n\n' ||
      'The claimant has been paid in full ({{amount}}) for all labor and materials furnished to the property described below and unconditionally waives and releases all lien, stop-payment-notice, and payment-bond claims, excluding: {{exceptions}}.' || E'\n\n' ||
      'Claimant: {{claimant}}' || E'\n' ||
      'Owner: {{owner}}' || E'\n' ||
      'Property: {{job_address}}',
      true)
    ON CONFLICT (tenant_id, state, conditional, final) DO NOTHING;
  END LOOP;
END $$;
