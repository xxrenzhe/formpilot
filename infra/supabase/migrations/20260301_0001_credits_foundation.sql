-- ADS Scenario migration 0001: credits foundation and anti-abuse primitives.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key,
  email text,
  plan text default 'free',
  role text default 'user',
  credits integer not null default 0,
  current_period_end timestamptz,
  created_at timestamptz default now()
);

alter table users
  add column if not exists role text default 'user',
  add column if not exists current_period_end timestamptz,
  add column if not exists credits integer;

update users
set credits = 0
where credits is null;

alter table users alter column credits set default 0;
alter table users alter column credits set not null;

create table if not exists device_credit_claims (
  device_id text primary key,
  first_user_id uuid references users (id) on delete set null,
  claimed_credits integer not null default 20,
  created_at timestamptz default now()
);

create index if not exists users_email_idx on users (email);
create index if not exists device_credit_claims_user_idx on device_credit_claims (first_user_id);
