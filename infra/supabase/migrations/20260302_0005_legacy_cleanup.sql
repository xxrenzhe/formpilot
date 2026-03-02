-- ADS Scenario migration 0005: remove legacy subscription-era artifacts.

alter table if exists users
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id,
  drop column if exists current_period_end;

drop table if exists personas;
