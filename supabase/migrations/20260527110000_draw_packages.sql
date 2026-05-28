BEGIN;

CREATE TABLE IF NOT EXISTS draw_packages (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL,
  job_id             TEXT        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  draw_id            UUID        REFERENCES draw_schedules(id) ON DELETE CASCADE,
  status             TEXT        NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft', 'previewed', 'sent', 'voided')),
  included_file_ids  JSONB       NOT NULL DEFAULT '[]',
  generated_pdf_path TEXT,
  recipient_email    TEXT,
  recipient_label    TEXT,
  sent_at            TIMESTAMPTZ,
  photo_grid_density INTEGER     NOT NULL DEFAULT 4,
  cover_notes        TEXT,
  created_by_id      UUID        NOT NULL REFERENCES profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_draw_packages_draw ON draw_packages(draw_id);
CREATE INDEX IF NOT EXISTS idx_draw_packages_job  ON draw_packages(job_id);

ALTER TABLE draw_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY draw_packages_tenant_isolation ON draw_packages
  FOR ALL
  USING  (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

COMMIT;
