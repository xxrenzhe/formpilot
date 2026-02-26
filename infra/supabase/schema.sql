-- FormPilot V2.0 Supabase schema

create table if not exists users (
  id uuid primary key,
  email text,
  plan text default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz default now()
);

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

create index if not exists personas_user_id_idx on personas (user_id);
create index if not exists usage_logs_user_id_idx on usage_logs (user_id, timestamp);

alter table users enable row level security;
alter table personas enable row level security;
alter table usage_logs enable row level security;

create policy "Users can view self" on users
  for select using (auth.uid() = id);

create policy "Users can manage personas" on personas
  for all using (auth.uid() = user_id);

create policy "Users can view usage logs" on usage_logs
  for select using (auth.uid() = user_id);
