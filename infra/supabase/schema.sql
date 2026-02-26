-- FormPilot V2.0 Supabase schema

create table if not exists users (
  id uuid primary key,
  email text,
  plan text default 'free',
  role text default 'user',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz default now()
);

alter table users
  add column if not exists role text default 'user';

create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete cascade,
  name text not null,
  is_default boolean default false,
  core_identity text not null,
  company_info text not null,
  tone_preference text not null,
  custom_rules text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete cascade,
  timestamp timestamptz default now(),
  request_type text not null,
  tokens integer default 0,
  is_free boolean default true,
  success boolean default true
);

create table if not exists metrics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete cascade,
  event_type text not null,
  metadata jsonb,
  timestamp timestamptz default now()
);

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
  batch_id text,
  created_at timestamptz default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references users (id),
  redeemed_ip text,
  redeemed_ua text
);

alter table metrics_events
  add constraint metrics_event_type_check
  check (event_type in ('panel_open', 'generate_success', 'copy_success', 'paywall_shown', 'rewrite_click'));

create index if not exists personas_user_id_idx on personas (user_id);
create index if not exists usage_logs_user_id_idx on usage_logs (user_id, timestamp);
create index if not exists metrics_events_user_id_idx on metrics_events (user_id, timestamp);
create index if not exists admin_audit_logs_admin_id_idx on admin_audit_logs (admin_id, created_at);
create index if not exists invite_codes_code_idx on invite_codes (code);
create index if not exists invite_codes_redeemed_by_idx on invite_codes (redeemed_by);

alter table users enable row level security;
alter table personas enable row level security;
alter table usage_logs enable row level security;
alter table metrics_events enable row level security;
alter table invite_codes enable row level security;
alter table admin_audit_logs enable row level security;

create policy "Users can view self" on users
  for select using (auth.uid() = id);

create policy "Users can manage personas" on personas
  for all using (auth.uid() = user_id);

create policy "Users can view usage logs" on usage_logs
  for select using (auth.uid() = user_id);

create policy "Users can view metrics" on metrics_events
  for select using (auth.uid() = user_id);

create or replace view metrics_user_funnel as
select
  user_id,
  min(case when event_type = 'generate_success' then timestamp end) as first_generate_at,
  min(case when event_type = 'copy_success' then timestamp end) as first_copy_at,
  min(case when event_type = 'paywall_shown' then timestamp end) as first_paywall_at
from metrics_events
group by user_id;

create or replace view metrics_daily_kpis as
select
  date_trunc('day', timestamp) as day,
  count(distinct case when event_type = 'panel_open' then user_id end) as panel_users,
  count(distinct case when event_type = 'generate_success' then user_id end) as generate_users,
  count(distinct case when event_type = 'copy_success' then user_id end) as copy_users,
  count(distinct case when event_type = 'paywall_shown' then user_id end) as paywall_users
from metrics_events
group by date_trunc('day', timestamp);

create or replace function enforce_single_default_persona()
returns trigger as $$
begin
  if new.is_default then
    update personas
    set is_default = false
    where user_id = new.user_id
      and id <> new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists personas_default_guard on personas;
create trigger personas_default_guard
before insert or update on personas
for each row execute function enforce_single_default_persona();
