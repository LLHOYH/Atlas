create table if not exists public.atlas_agents (
  id text primary key,
  city_id text not null references public.atlas_cities(id) on delete cascade,
  display_name text not null,
  runtime text not null,
  package_name text not null default '@atlas-ai/sdk',
  package_version text not null,
  status text not null check (status in ('online', 'working', 'idle', 'offline')),
  activity text not null,
  topic text not null,
  detail text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  energy smallint not null default 0 check (energy between 0 and 100),
  last_seen_at timestamptz not null default now(),
  display_order smallint not null check (display_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, display_order)
);

create table if not exists public.atlas_agent_events (
  id text primary key,
  agent_id text not null references public.atlas_agents(id) on delete cascade,
  city_id text not null references public.atlas_cities(id) on delete cascade,
  status text not null check (status in ('online', 'working', 'idle', 'offline')),
  activity text not null,
  topic text not null,
  detail text not null default '',
  energy smallint not null default 0 check (energy between 0 and 100),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists atlas_agents_city_status_idx
  on public.atlas_agents (city_id, status, last_seen_at desc);
create index if not exists atlas_agents_last_seen_idx
  on public.atlas_agents (last_seen_at desc);
create index if not exists atlas_agents_topic_idx
  on public.atlas_agents using gin (to_tsvector('simple', topic));
create index if not exists atlas_agent_events_city_time_idx
  on public.atlas_agent_events (city_id, occurred_at desc);
create index if not exists atlas_agent_events_agent_time_idx
  on public.atlas_agent_events (agent_id, occurred_at desc);
create index if not exists atlas_agent_events_topic_idx
  on public.atlas_agent_events using gin (to_tsvector('simple', topic));

alter table public.atlas_agents enable row level security;
alter table public.atlas_agent_events enable row level security;

grant select on public.atlas_agents to anon, authenticated;
grant select on public.atlas_agent_events to anon, authenticated;

create policy "Atlas agent snapshots are publicly visible"
  on public.atlas_agents for select using (true);
create policy "Atlas agent events are publicly visible"
  on public.atlas_agent_events for select using (true);

drop trigger if exists atlas_agents_touch_updated_at on public.atlas_agents;
create trigger atlas_agents_touch_updated_at
  before update on public.atlas_agents
  for each row execute function public.touch_updated_at();

alter table public.atlas_agents replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.atlas_agents;
exception
  when duplicate_object then null;
end;
$$;
