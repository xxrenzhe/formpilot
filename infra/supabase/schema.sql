-- FormPilot ADS Scenario Schema (full snapshot)
-- For production upgrades on existing databases, run files in:
--   infra/supabase/migrations/
-- in lexicographic order.
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key,
  email text,
  role text default 'user',
  credits integer not null default 0,
  created_at timestamptz default now()
);

alter table users
  add column if not exists role text default 'user',
  add column if not exists credits integer not null default 0;

alter table users
  drop column if exists plan,
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id,
  drop column if exists current_period_end;

drop table if exists personas;

create table if not exists device_credit_claims (
  device_id text primary key,
  first_user_id uuid references users (id) on delete set null,
  claimed_credits integer not null default 20,
  created_at timestamptz default now()
);

create table if not exists compliance_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  legal_name text not null default '',
  website text not null default '',
  business_category text not null default '',
  has_own_factory boolean not null default false,
  fulfillment_model text not null default '',
  return_policy_url text not null default '',
  support_email text not null default '',
  support_phone text not null default '',
  additional_evidence text,
  updated_at timestamptz default now()
);

create table if not exists prompt_templates (
  id uuid primary key default gen_random_uuid(),
  scenario text not null,
  name text not null,
  template_body text not null,
  weight numeric(8,2) not null default 1,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists prompt_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  prompt_template_id uuid references prompt_templates (id) on delete set null,
  scenario text not null,
  outcome text not null,
  note text,
  created_at timestamptz default now()
);

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
  add column if not exists credits_cost integer not null default 0,
  add column if not exists cost_tier text,
  add column if not exists prompt_template_id uuid references prompt_templates (id) on delete set null,
  add column if not exists scenario text;

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
  credits integer not null default 20,
  batch_note text,
  created_at timestamptz default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references users (id),
  redeemed_ip text,
  redeemed_ua text
);

alter table invite_codes
  add column if not exists credits integer not null default 20,
  add column if not exists batch_note text;

alter table metrics_events
  drop constraint if exists metrics_event_type_check;

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
      'appeal_feedback_success',
      'appeal_feedback_fail'
    )
  );

create index if not exists users_email_idx on users (email);
create index if not exists compliance_profiles_user_idx on compliance_profiles (user_id);
create index if not exists prompt_templates_scenario_idx on prompt_templates (scenario, active);
create index if not exists prompt_feedback_template_idx on prompt_feedback (prompt_template_id, created_at);
create index if not exists usage_logs_user_id_idx on usage_logs (user_id, timestamp);
create index if not exists usage_logs_template_idx on usage_logs (prompt_template_id);
create index if not exists metrics_events_user_id_idx on metrics_events (user_id, timestamp);
create index if not exists invite_codes_code_idx on invite_codes (code);
create index if not exists invite_codes_redeemed_by_idx on invite_codes (redeemed_by);
create index if not exists invite_codes_batch_note_idx on invite_codes (batch_note);
create index if not exists device_credit_claims_user_idx on device_credit_claims (first_user_id);

alter table users enable row level security;
alter table compliance_profiles enable row level security;
alter table usage_logs enable row level security;
alter table metrics_events enable row level security;
alter table invite_codes enable row level security;
alter table admin_audit_logs enable row level security;
alter table prompt_feedback enable row level security;
alter table prompt_templates enable row level security;
alter table device_credit_claims enable row level security;

drop policy if exists "Users can view self" on users;
create policy "Users can view self" on users
  for select using (auth.uid() = id);

drop policy if exists "Users can manage compliance profile" on compliance_profiles;
create policy "Users can manage compliance profile" on compliance_profiles
  for all using (auth.uid() = user_id);

drop policy if exists "Users can view usage logs" on usage_logs;
create policy "Users can view usage logs" on usage_logs
  for select using (auth.uid() = user_id);

drop policy if exists "Users can view metrics" on metrics_events;
create policy "Users can view metrics" on metrics_events
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own feedback" on prompt_feedback;
create policy "Users can insert own feedback" on prompt_feedback
  for insert with check (auth.uid() = user_id);

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
  count(distinct case when event_type = 'paywall_shown' then user_id end) as paywall_users,
  count(distinct case when event_type = 'appeal_feedback_success' then user_id end) as feedback_success_users,
  count(distinct case when event_type = 'appeal_feedback_fail' then user_id end) as feedback_fail_users
from metrics_events
group by date_trunc('day', timestamp);

create or replace function increment_user_credits(p_user_id uuid, p_amount integer)
returns boolean as $$
begin
  update users
  set credits = greatest(credits, 0) + greatest(p_amount, 0)
  where id = p_user_id;
  return found;
end;
$$ language plpgsql;

create or replace function decrement_user_credits(p_user_id uuid, p_cost integer)
returns boolean as $$
begin
  update users
  set credits = credits - greatest(p_cost, 0)
  where id = p_user_id
    and credits >= greatest(p_cost, 0);
  return found;
end;
$$ language plpgsql;

insert into prompt_templates (scenario, name, template_body, weight, active)
select
  'ads_compliance',
  'Default ADS Compliance v1',
  'You are a Google Ads compliance appeal specialist. Use factual, structured bullets, policy-safe wording, and clear commitments.',
  1,
  true
where not exists (
  select 1 from prompt_templates where scenario = 'ads_compliance' and name = 'Default ADS Compliance v1'
);

insert into prompt_templates (scenario, name, template_body, weight, active)
select
  'general',
  'Default General v1',
  'You are a concise professional writing copilot. Keep output factual and directly usable in forms.',
  1,
  true
where not exists (
  select 1 from prompt_templates where scenario = 'general' and name = 'Default General v1'
);
