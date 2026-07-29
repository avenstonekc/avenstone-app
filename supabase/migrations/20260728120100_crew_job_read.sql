-- TIME_CLOCK_ARC S1 — crew must read their tenant's jobs to pick one to clock into.
-- Extends can_access_job (the jobs SELECT gate) to treat 'crew' like staff for READ within the
-- tenant. Crew never reaches JobDet/staff surfaces (App.jsx early-returns them to CrewHomeScr);
-- this only feeds the punch job-picker. No write access is granted.
CREATE OR REPLACE FUNCTION public.can_access_job(p_job_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = p_job_id
      AND (
        (
          j.tenant_id = get_my_tenant_id()
          AND get_my_role() IN ('owner', 'sales_rep', 'project_manager', 'crew')
        )
        OR
        (
          j.tenant_id = get_my_tenant_id()
          AND get_my_role() = 'sub'
          AND EXISTS (
            SELECT 1 FROM job_phases ph
            WHERE ph.job_id = j.id AND ph.assigned_sub_id = auth.uid()
          )
        )
        OR
        (
          get_my_role() = 'client'
          AND (
            j.client_user_id = auth.uid()
            OR j.client_email = (SELECT email FROM profiles WHERE id = auth.uid())
          )
        )
      )
  )
$function$;
