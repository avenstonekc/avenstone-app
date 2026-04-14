-- Owner Intelligence Tables
-- Run manually via Supabase SQL editor or Management API

-- ─── sub_performance ─────────────────────────────────────────────────────────
-- Rolling performance scores per subcontractor per trade

CREATE TABLE IF NOT EXISTS sub_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  trade text,
  jobs_assigned int DEFAULT 0,
  jobs_completed int DEFAULT 0,
  phases_on_time int DEFAULT 0,
  phases_late int DEFAULT 0,
  cos_caused int DEFAULT 0,
  avg_response_hours numeric,
  last_job_date date,
  score numeric GENERATED ALWAYS AS (
    CASE WHEN (phases_on_time + phases_late) = 0 THEN 50
    ELSE ROUND((phases_on_time::numeric / (phases_on_time + phases_late)) * 100, 1)
    END
  ) STORED,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(sub_id, trade)
);

ALTER TABLE sub_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_access" ON sub_performance FOR ALL USING (tenant_id = get_my_tenant_id());

-- ─── job_outcomes ─────────────────────────────────────────────────────────────
-- Written on job completion — tracks estimate accuracy, schedule accuracy, profit

CREATE TABLE IF NOT EXISTS job_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  address text,
  job_type text,
  contract_value numeric,
  final_value numeric,
  estimate_accuracy_pct numeric,
  scheduled_days int,
  actual_days int,
  schedule_accuracy_pct numeric,
  co_count int DEFAULT 0,
  co_total numeric DEFAULT 0,
  client_rating int,
  profit_margin_pct numeric,
  notes text,
  completed_at timestamptz DEFAULT now()
);

ALTER TABLE job_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_access" ON job_outcomes FOR ALL USING (tenant_id = get_my_tenant_id());

-- ─── bid_analytics ───────────────────────────────────────────────────────────
-- Bid win/loss tracking for estimating improvement

CREATE TABLE IF NOT EXISTS bid_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  address text,
  job_type text,
  bid_amount numeric,
  outcome text CHECK (outcome IN ('pending', 'won', 'lost')),
  lost_reason text,
  bid_sent_at timestamptz,
  decided_at timestamptz
);

ALTER TABLE bid_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_access" ON bid_analytics FOR ALL USING (tenant_id = get_my_tenant_id());

-- ─── owner_escalations ───────────────────────────────────────────────────────
-- AI questions routed to owner when human judgment is required

CREATE TABLE IF NOT EXISTS owner_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  job_id text REFERENCES jobs(id) ON DELETE SET NULL,
  source_agent text NOT NULL,
  question text NOT NULL,
  context text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'dismissed')),
  owner_response text,
  created_at timestamptz DEFAULT now(),
  answered_at timestamptz
);

ALTER TABLE owner_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_access" ON owner_escalations FOR ALL USING (tenant_id = get_my_tenant_id());
