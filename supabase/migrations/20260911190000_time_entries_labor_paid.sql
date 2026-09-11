-- TIME_CLOCK_ARC S5 — labor dollars → job financials.
-- When an owner pays an employee, the hours become a 'labor' job_transaction (paid) on each job
-- they worked, which on cost-plus jobs carries markup to the client. These columns mark which
-- punches have already been paid out so the same hours can never be double-billed.
alter table time_entries
  add column if not exists paid_at            timestamptz,
  add column if not exists pay_transaction_id uuid references job_transactions(id) on delete set null;

-- Fast lookup of a user's unpaid, closed punches (the pay-run query).
create index if not exists idx_time_entries_unpaid
  on time_entries (user_id)
  where clock_out is not null and paid_at is null;
