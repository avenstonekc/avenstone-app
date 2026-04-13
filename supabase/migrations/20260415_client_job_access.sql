-- Allow clients to see their job by client_user_id OR client_email.
-- This covers the case where client_user_id hasn't been set yet,
-- and also handles clients whose tenant_id might not be set.

-- Update can_access_job to include email fallback for clients
CREATE OR REPLACE FUNCTION can_access_job(p_job_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = p_job_id
      AND (
        -- Staff: must be same tenant
        (
          j.tenant_id = get_my_tenant_id()
          AND get_my_role() IN ('owner', 'sales_rep', 'project_manager')
        )
        OR
        -- Sub: same tenant + assigned to a phase
        (
          j.tenant_id = get_my_tenant_id()
          AND get_my_role() = 'sub'
          AND EXISTS (
            SELECT 1 FROM job_phases ph
            WHERE ph.job_id = j.id AND ph.assigned_sub_id = auth.uid()
          )
        )
        OR
        -- Client: match by user_id OR by email (email is always set by staff)
        (
          get_my_role() = 'client'
          AND (
            j.client_user_id = auth.uid()
            OR j.client_email = (SELECT email FROM profiles WHERE id = auth.uid())
          )
        )
      )
  )
$$;
