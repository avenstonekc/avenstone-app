-- CONTRACT_SIGNING · client-RLS hardening — close the client UPDATE hole on jobs.
--
-- The "jobs: client sign" UPDATE policy checked linkage + role only, with NO column scope:
--   qual/with_check = get_my_role()='client' AND (client_user_id=auth.uid() OR client_email=...)
-- so any linked client session (clients now get real authenticated sessions via the contract
-- flow) could UPDATE ANY jobs column — budget, address, status, client_user_id, etc. RLS cannot
-- column-scope and column GRANTs cannot distinguish app roles, so clients lose UPDATE on jobs
-- entirely. The sign flow's ONLY legitimate client write (contract_signed + status) now happens
-- server-side in the record-signature-evidence edge fn (service role).
--
-- Client SELECT on jobs is unaffected. The staff UPDATE policy ("jobs: owner/rep/pm update") is
-- untouched.
DROP POLICY IF EXISTS "jobs: client sign" ON jobs;

NOTIFY pgrst, 'reload schema';
