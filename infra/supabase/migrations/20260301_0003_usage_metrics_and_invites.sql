-- ADS Scenario migration 0003: usage cost extension, metrics compatibility, and invite credits.

create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete cascade,
  timestamp timestamptz default now(),
  request_type text not null,
  credits_cost integer not null default 0,
  cost_tier text,
  prompt_template_id uuid references prompt_templates (id) on delete set null,
  scenario text,
  success boolean default true
);

alter table usage_logs
  add column if not exists credits_cost integer,
  add column if not exists cost_tier text,
  add column if not exists scenario text;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usage_logs'
      and column_name = 'prompt_template_id'
  ) then
    alter table usage_logs
      add column prompt_template_id uuid references prompt_templates (id) on delete set null;
  end if;
end;
$$;

update usage_logs
set credits_cost = 0
where credits_cost is null;

alter table usage_logs alter column credits_cost set default 0;
alter table usage_logs alter column credits_cost set not null;

create table if not exists metrics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete cascade,
  event_type text not null,
  metadata jsonb,
  timestamp timestamptz default now()
);

alter table metrics_events
  drop constraint if exists metrics_event_type_check;

do $$
begin
  if not exists (
    select 1
    from metrics_events
    where event_type not in (
      'panel_open',
      'generate_success',
      'copy_success',
      'paywall_shown',
      'rewrite_click',
      'pii_override',
      'longdoc_open',
      'longdoc_generate_success',
      'longdoc_copy_success',
      'longdoc_download',
      'draft_accepted',
      'draft_rejected',
      'appeal_feedback_success',
      'appeal_feedback_fail'
    )
  ) then
    alter table metrics_events
      add constraint metrics_event_type_check
      check (
        event_type in (
          'panel_open',
          'generate_success',
          'copy_success',
          'paywall_shown',
          'rewrite_click',
          'pii_override',
          'longdoc_open',
          'longdoc_generate_success',
          'longdoc_copy_success',
          'longdoc_download',
          'draft_accepted',
          'draft_rejected',
          'appeal_feedback_success',
          'appeal_feedback_fail'
        )
      );
  else
    raise notice 'Skipping metrics_event_type_check due to legacy rows outside allowed set';
  end if;
end;
$$;

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references users (id),
  action_type text not null,
  target_id text,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  credits integer not null default 20,
  batch_note text,
  created_at timestamptz default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references users (id),
  redeemed_ip text,
  redeemed_ua text
);

alter table invite_codes
  add column if not exists credits integer,
  add column if not exists batch_note text;

update invite_codes
set credits = 20
where credits is null;

alter table invite_codes alter column credits set default 20;
alter table invite_codes alter column credits set not null;

create index if not exists usage_logs_user_id_idx on usage_logs (user_id, timestamp);
create index if not exists usage_logs_template_idx on usage_logs (prompt_template_id);
create index if not exists metrics_events_user_id_idx on metrics_events (user_id, timestamp);
create index if not exists invite_codes_code_idx on invite_codes (code);
create index if not exists invite_codes_redeemed_by_idx on invite_codes (redeemed_by);
create index if not exists invite_codes_batch_note_idx on invite_codes (batch_note);
