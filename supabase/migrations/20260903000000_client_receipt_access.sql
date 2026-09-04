-- Let a client view receipt/proof images for their OWN cost-plus job, so the client
-- portal Financials view can show proof-of-cost alongside each expense.
--
-- Receipt object paths are '<job_id>/<file>' (see sbUploadReceipt), so the first path
-- folder segment is the job id. jobs.id is TEXT, matched directly against it.
--
-- Scope is deliberately tight: SELECT only, bucket job-receipts only, the caller must be
-- the client (get_my_role()='client') linked to that job (client_user_id = auth.uid()),
-- and only on cost_plus jobs — mirroring jt_client_select on job_transactions, which
-- already exposes the outbound cost rows for exactly these jobs. No write access.

drop policy if exists jr_client_select on storage.objects;
create policy jr_client_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-receipts'
    and exists (
      select 1 from public.jobs j
      where j.id = (storage.foldername(name))[1]
        and j.tenant_id = get_my_tenant_id()
        and j.cost_plus = true
        and j.client_user_id = auth.uid()
        and get_my_role() = 'client'
    )
  );
