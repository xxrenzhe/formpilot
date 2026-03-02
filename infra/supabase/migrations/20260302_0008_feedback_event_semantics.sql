-- ADS Scenario migration 0008: introduce draft feedback event semantics while keeping legacy compatibility.

alter table if exists metrics_events
  drop constraint if exists metrics_event_type_check;

do $$
begin
  if not exists (
    select 1
    from metrics_events
    where event_type not in (
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
      'draft_accepted',
      'draft_rejected',
      'appeal_feedback_success',
      'appeal_feedback_fail'
    )
  ) then
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
          'draft_accepted',
          'draft_rejected',
          'appeal_feedback_success',
          'appeal_feedback_fail'
        )
      );
  else
    raise notice 'Skipping metrics_event_type_check update due to legacy rows outside allowed set';
  end if;
end;
$$;

create or replace view metrics_daily_kpis as
select
  date_trunc('day', timestamp) as day,
  count(distinct case when event_type = 'panel_open' then user_id end) as panel_users,
  count(distinct case when event_type = 'generate_success' then user_id end) as generate_users,
  count(distinct case when event_type = 'copy_success' then user_id end) as copy_users,
  count(distinct case when event_type = 'paywall_shown' then user_id end) as paywall_users,
  count(distinct case when event_type in ('draft_accepted', 'appeal_feedback_success') then user_id end) as feedback_success_users,
  count(distinct case when event_type in ('draft_rejected', 'appeal_feedback_fail') then user_id end) as feedback_fail_users
from metrics_events
group by date_trunc('day', timestamp);
