-- PUSH_NOTIFICATIONS_ARC Phase 1: Extend push_subscriptions for dual-channel (web + apns).
-- Adds channel discriminator, apns_token column, partial unique indexes per channel.
-- FK pre-check confirmed zero dependents on this table.
-- Audit (2026-05-23): unique constraint push_subscriptions_user_id_endpoint_key exists and is dropped below.
-- All 7 existing rows have endpoint/p256dh/auth NOT NULL — all are Web Push, backfilled to channel='web'.
-- RLS policies reference user_id only — unaffected by this migration.

BEGIN;

-- Step 1: Add channel column (nullable initially so backfill can land before NOT NULL flip).
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS channel TEXT;

-- Step 2: Backfill existing rows. Per 2026-05-23 audit, all 7 existing rows are Web Push dev subscriptions.
UPDATE public.push_subscriptions
  SET channel = 'web'
  WHERE channel IS NULL;

-- Step 3: Now enforce NOT NULL + CHECK constraint.
ALTER TABLE public.push_subscriptions
  ALTER COLUMN channel SET NOT NULL;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_channel_check;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_channel_check CHECK (channel IN ('web','apns'));

-- Step 4: Add apns_token column (nullable — only populated on apns rows).
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS apns_token TEXT;

-- Step 5: Make web-specific columns nullable so apns rows can omit them.
-- (Existing rows already have values; new apns rows will leave these NULL.)
ALTER TABLE public.push_subscriptions
  ALTER COLUMN endpoint DROP NOT NULL,
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

-- Step 6: Drop the existing unique constraint on (user_id, endpoint).
-- Audit confirmed: push_subscriptions_user_id_endpoint_key is the exact constraint name.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_endpoint_key;
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;
DROP INDEX IF EXISTS public.push_subscriptions_user_id_endpoint_idx;
DROP INDEX IF EXISTS public.push_subscriptions_endpoint_idx;

-- Step 7: Add per-channel partial unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_sub_web_unique
  ON public.push_subscriptions (user_id, endpoint)
  WHERE channel = 'web';

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_sub_apns_unique
  ON public.push_subscriptions (user_id, apns_token)
  WHERE channel = 'apns';

-- Step 8: Payload integrity check — web rows need endpoint+p256dh+auth, apns rows need apns_token.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_channel_payload_check;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_channel_payload_check CHECK (
    (channel = 'web'  AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL AND apns_token IS NULL)
    OR
    (channel = 'apns' AND apns_token IS NOT NULL AND endpoint IS NULL AND p256dh IS NULL AND auth IS NULL)
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
