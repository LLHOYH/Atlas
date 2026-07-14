create or replace function public.atlas_live_agent_history(p_days integer default 7)
returns table (
  activity_date date,
  live_agents bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested_window as (
    select least(greatest(coalesce(p_days, 7), 1), 30) as day_count
  ),
  activity_days as (
    select generate_series(
      current_date - ((select day_count from requested_window) - 1),
      current_date,
      interval '1 day'
    )::date as activity_date
  )
  select
    activity_days.activity_date,
    count(distinct events.agent_id) filter (where events.status <> 'offline')::bigint as live_agents
  from activity_days
  left join public.atlas_agent_events as events
    on events.occurred_at >= activity_days.activity_date::timestamptz
    and events.occurred_at < (activity_days.activity_date + 1)::timestamptz
  group by activity_days.activity_date
  order by activity_days.activity_date;
$$;

grant execute on function public.atlas_live_agent_history(integer) to anon, authenticated;
