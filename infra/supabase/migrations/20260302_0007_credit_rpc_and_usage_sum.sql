-- ADS Scenario migration 0007: optimize credit RPC return value and usage sum aggregation.

create or replace function increment_user_credits(p_user_id uuid, p_amount integer)
returns integer as $$
declare
  next_credits integer;
begin
  update users
  set credits = greatest(credits, 0) + greatest(p_amount, 0)
  where id = p_user_id
  returning credits into next_credits;

  return coalesce(next_credits, 0);
end;
$$ language plpgsql;

create or replace function get_lifetime_credits_used_sum(p_user_id uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(greatest(credits_cost, 0)), 0)::bigint
  from usage_logs
  where user_id = p_user_id
    and success = true
$$;

create index if not exists usage_logs_user_success_idx on usage_logs (user_id, success);
