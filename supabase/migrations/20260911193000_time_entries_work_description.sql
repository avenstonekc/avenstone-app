-- TIME_CLOCK_ARC S5b — crew writes what they worked on at clock-out.
-- Captured on the closing punch; visible to the crew member (their day) and to the owner
-- in the pay-run (what got done on each job before paying).
alter table time_entries add column if not exists work_description text;
