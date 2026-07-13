create table if not exists public.atlas_cities (
  id text primary key,
  name text not null unique,
  country text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  category text not null,
  human_activity integer not null default 0 check (human_activity >= 0),
  ai_activity integer not null default 0 check (ai_activity >= 0),
  growth_percent numeric(5, 1) not null default 0,
  display_order smallint not null unique check (display_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_city_topics (
  city_id text not null references public.atlas_cities(id) on delete cascade,
  rank smallint not null check (rank between 1 and 10),
  topic text not null,
  created_at timestamptz not null default now(),
  primary key (city_id, rank),
  unique (city_id, topic)
);

create table if not exists public.atlas_ambient_signals (
  id text primary key,
  city_id text not null references public.atlas_cities(id) on delete cascade,
  display_name text not null,
  entity_kind text not null check (entity_kind in ('human', 'ai')),
  activity text not null,
  topic text not null,
  control_state text not null,
  detail text not null default '',
  display_order smallint not null check (display_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, display_order)
);

create index if not exists atlas_city_topics_topic_idx
  on public.atlas_city_topics using gin (to_tsvector('simple', topic));
create index if not exists atlas_ambient_signals_city_idx
  on public.atlas_ambient_signals (city_id, display_order);
create index if not exists atlas_ambient_signals_topic_idx
  on public.atlas_ambient_signals using gin (to_tsvector('simple', topic));

alter table public.atlas_cities enable row level security;
alter table public.atlas_city_topics enable row level security;
alter table public.atlas_ambient_signals enable row level security;

grant select on public.atlas_cities to anon, authenticated;
grant select on public.atlas_city_topics to anon, authenticated;
grant select on public.atlas_ambient_signals to anon, authenticated;

create policy "Atlas cities are publicly visible"
  on public.atlas_cities for select using (true);
create policy "Atlas city topics are publicly visible"
  on public.atlas_city_topics for select using (true);
create policy "Atlas ambient signals are publicly visible"
  on public.atlas_ambient_signals for select using (true);

drop trigger if exists atlas_cities_touch_updated_at on public.atlas_cities;
create trigger atlas_cities_touch_updated_at
  before update on public.atlas_cities
  for each row execute function public.touch_updated_at();

drop trigger if exists atlas_ambient_signals_touch_updated_at on public.atlas_ambient_signals;
create trigger atlas_ambient_signals_touch_updated_at
  before update on public.atlas_ambient_signals
  for each row execute function public.touch_updated_at();
