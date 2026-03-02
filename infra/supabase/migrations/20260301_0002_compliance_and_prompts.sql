-- ADS Scenario migration 0002: compliance profile and prompt feedback data model.

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

create index if not exists compliance_profiles_user_idx on compliance_profiles (user_id);
create index if not exists prompt_templates_scenario_idx on prompt_templates (scenario, active);
create index if not exists prompt_feedback_template_idx on prompt_feedback (prompt_template_id, created_at);
