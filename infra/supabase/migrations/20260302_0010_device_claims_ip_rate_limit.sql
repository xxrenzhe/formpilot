-- ADS Scenario migration 0010: add lightweight IP-based anti-abuse columns for device credit claims.

alter table if exists device_credit_claims
  add column if not exists claim_ip text,
  add column if not exists claim_ua text;

create index if not exists device_credit_claims_claim_ip_created_at_idx
  on device_credit_claims (claim_ip, created_at desc);
