-- ADS Scenario migration 0004: RLS, reporting views, credit RPCs, and default prompt templates.

alter table if exists users enable row level security;
alter table if exists compliance_profiles enable row level security;
alter table if exists usage_logs enable row level security;
alter table if exists metrics_events enable row level security;
alter table if exists invite_codes enable row level security;
alter table if exists admin_audit_logs enable row level security;
alter table if exists prompt_feedback enable row level security;
alter table if exists prompt_templates enable row level security;
alter table if exists device_credit_claims enable row level security;

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
