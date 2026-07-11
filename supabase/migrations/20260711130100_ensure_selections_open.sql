-- SCOPE_TO_ESTIMATE Phase C1 — lazy idempotent SELECTIONS open.
-- The client role has NO jobs UPDATE (record-signature-evidence owns the signed-state write
-- server-side). This SECURITY DEFINER fn lets the client portal stamp selections_opened_at on
-- load for jobs that reached in_progress via the status-picker/agent (no signature hook fired),
-- WITHOUT granting the client any jobs UPDATE. Guards: can_access_job (caller linkage), tenant
-- match, eligibility (in_progress+ OR Contract phase complete), null-only (idempotent). It only
-- ever sets selections_opened_at. Mirrors the get_auth_user_id_by_email definer pattern.

CREATE OR REPLACE FUNCTION ensure_selections_open(p_job_id TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stamp  TIMESTAMPTZ;
  v_status TEXT;
BEGIN
  -- Caller must be linked to the job (client linkage or staff), same tenant.
  IF NOT can_access_job(p_job_id) THEN
    RETURN NULL;
  END IF;

  SELECT selections_opened_at, status INTO v_stamp, v_status
    FROM jobs WHERE id = p_job_id AND tenant_id = get_my_tenant_id();
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_stamp IS NOT NULL THEN RETURN v_stamp; END IF;

  -- Eligible: job at in_progress+ OR its Contract phase is complete. Never key on
  -- status='contract' — signing goes straight to in_progress.
  IF v_status IN ('in_progress','final_touches','complete')
     OR EXISTS (SELECT 1 FROM job_phases jp
                WHERE jp.job_id = p_job_id AND jp.phase_name = 'Contract' AND jp.status = 'complete')
  THEN
    UPDATE jobs SET selections_opened_at = now()
      WHERE id = p_job_id AND tenant_id = get_my_tenant_id() AND selections_opened_at IS NULL
      RETURNING selections_opened_at INTO v_stamp;
    RETURN v_stamp;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION ensure_selections_open(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_selections_open(TEXT) TO authenticated;
