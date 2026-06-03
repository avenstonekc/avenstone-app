-- ANTI_SURPRISE_ENGINE_ARC Phase 1 — pg_cron entries
-- anti-surprise-generator: daily at 03:00 UTC — sweeps newly-sold jobs
-- anti-surprise-dispatcher: every 15 minutes — fires ripe scheduled_actions
-- Uses same anon JWT pattern as existing sequence-runner cron job.

SELECT cron.schedule(
  'anti-surprise-generator',
  '0 3 * * *',
  $$SELECT net.http_post(
    url     := 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/anti-surprise-generator',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ"}'::jsonb,
    body    := '{}'::jsonb
  )::text$$
);

SELECT cron.schedule(
  'anti-surprise-dispatcher',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url     := 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/anti-surprise-dispatcher',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ"}'::jsonb,
    body    := '{}'::jsonb
  )::text$$
);
