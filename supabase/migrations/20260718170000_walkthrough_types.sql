-- WALKTHROUGH_TYPES Slice 1 — session_type on consultation_sessions (additive, safe).
-- Consultation sessions get an audience type: client walk (default) vs sub walk.
-- Existing rows backfill to 'client_walk'; existing capture/recap flows untouched.
alter table public.consultation_sessions
  add column if not exists session_type text not null default 'client_walk',
  add column if not exists trade_scope text[],
  add column if not exists walk_sub_id uuid;

alter table public.consultation_sessions
  drop constraint if exists consultation_sessions_session_type_check;
alter table public.consultation_sessions
  add constraint consultation_sessions_session_type_check
  check (session_type in ('client_walk', 'sub_walk'));

comment on column public.consultation_sessions.session_type is 'client_walk (default) | sub_walk — WALKTHROUGH_TYPES';
comment on column public.consultation_sessions.trade_scope is 'sub_walk: trade full-path(s) this walk covers; null for client_walk';
comment on column public.consultation_sessions.walk_sub_id is 'sub_walk: optional profiles.id of the specific sub being walked';
