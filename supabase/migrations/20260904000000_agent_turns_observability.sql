-- Aven observability: log every master-agent turn (input -> tools -> cards -> result).
-- Written by the ai-agent edge fn with the service role (bypasses RLS). Pure DB audit,
-- no AI, no cost. Turns Aven from a black box into something debuggable, and gives a
-- hands-off agent an audit trail.
create table if not exists agent_turns (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  user_id        uuid,
  user_role      text,
  turn_type      text,                              -- 'message' | 'card_response' | 'confirmed'
  message        text,                              -- user input (images stripped)
  context_job_id text,                              -- jobs.id is TEXT
  context_screen text,
  assistant_text text,                              -- Aven's reply
  actions        jsonb not null default '[]'::jsonb, -- [{tool, ok, error, requires_override?}]
  pending_action jsonb,                             -- {tool, description} confirm card surfaced
  pending_card   jsonb,                             -- {prompt, questions:[label]} elicitation/gate card
  error          text,
  duration_ms    integer,
  created_at     timestamptz not null default now()
);
create index if not exists idx_agent_turns_tenant_created on agent_turns (tenant_id, created_at desc);
create index if not exists idx_agent_turns_user_created   on agent_turns (user_id, created_at desc);

alter table agent_turns enable row level security;
drop policy if exists agent_turns_owner_select on agent_turns;
create policy agent_turns_owner_select on agent_turns
  for select to authenticated
  using (tenant_id = get_my_tenant_id() and get_my_role() = any (array['owner','project_manager']));
