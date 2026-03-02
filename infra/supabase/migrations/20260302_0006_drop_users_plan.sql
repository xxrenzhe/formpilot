-- ADS Scenario migration 0006: fully retire users.plan in credits-only model.

alter table if exists users
  drop column if exists plan;
