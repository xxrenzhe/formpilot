-- ADS Scenario migration 0008a: deduplicate first_user_id before unique constraint migration 0009.

do $$
declare
  deduped_rows integer := 0;
begin
  if to_regclass('public.device_credit_claims') is null then
    raise notice 'Skipping device_credit_claims dedup: table not found';
    return;
  end if;

  with ranked as (
    select
      device_id,
      row_number() over (
        partition by first_user_id
        order by created_at asc nulls last, device_id asc
      ) as rn
    from device_credit_claims
    where first_user_id is not null
  )
  update device_credit_claims d
  set first_user_id = null
  from ranked r
  where d.device_id = r.device_id
    and r.rn > 1;

  get diagnostics deduped_rows = row_count;
  if deduped_rows > 0 then
    raise notice 'device_credit_claims dedup complete: % duplicate rows normalized', deduped_rows;
  end if;
end;
$$;
