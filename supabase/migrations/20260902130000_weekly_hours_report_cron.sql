-- Friday projected-hours email to the owner.
-- Fires the weekly-hours-report edge function every Friday at 20:00 UTC
-- (= 3:00 PM CDT / 2:00 PM CST) so the report reaches the owner before the
-- crew's 5:00 PM Chicago quit time, which the function projects open punches to.
-- Zero AI: the edge function is pure SQL + Resend. ~1 email/week.

select cron.schedule(
  'weekly-hours-report',
  '0 20 * * 5',
  $$
  select net.http_post(
    url     := 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/weekly-hours-report',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
