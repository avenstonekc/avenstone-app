-- SCE Phase 4B — binding table: checklist option → visual card in the
-- scope-option-images bucket. Platform asset, TENANT-LESS.
--
-- project_type NULL = a univ_ shared asset (trim, doors, flooring layouts) that any
-- project type can fall back to when it has no type-specific image for the option.

CREATE TABLE scope_option_images (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_type  TEXT,                              -- NULL = univ_ shared asset
  field_key     TEXT        NOT NULL,
  option_key    TEXT        NOT NULL,
  storage_path  TEXT        NOT NULL,              -- path within the scope-option-images bucket
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (project_type, field_key, option_key)
);

CREATE INDEX idx_scope_option_images_lookup ON scope_option_images (project_type, field_key);

ALTER TABLE scope_option_images ENABLE ROW LEVEL SECURITY;

-- Public read (interview cards; platform library, no tenant data).
CREATE POLICY soi_public_select ON scope_option_images FOR SELECT USING (true);

-- Owner-only write (platform curation). Service-role bypasses RLS for the batch upload.
CREATE POLICY soi_owner_write ON scope_option_images FOR ALL
  USING (get_my_role() = 'owner') WITH CHECK (get_my_role() = 'owner');
