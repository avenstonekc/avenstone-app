-- AI_PM_FOLDIN Slice 2 — pg_cron entry for vigilance-runner
-- Daily at 11:00 UTC (06:00 Central). Same anon JWT pattern as existing cron jobs.

SELECT cron.schedule(
  'vigilance-runner',
  '0 11 * * *',
  $$SELECT net.http_post(
    url     := 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/vigilance-runner',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ"}'::jsonb,
    body    := '{}'::jsonb
  )::text$$
);
