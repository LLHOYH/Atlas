alter table public.atlas_cities
  add column if not exists region text not null default '';

create table if not exists public.atlas_city_streets (
  id text primary key,
  city_id text not null references public.atlas_cities(id) on delete cascade,
  name text not null,
  road_class text not null default 'primary' check (road_class in ('primary', 'secondary', 'local')),
  offset_latitude double precision not null default 0,
  offset_longitude double precision not null default 0,
  bearing_degrees numeric(5, 1) not null check (bearing_degrees >= 0 and bearing_degrees < 360),
  length_degrees numeric(4, 2) not null default 1 check (length_degrees > 0 and length_degrees <= 5),
  display_order smallint not null check (display_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, display_order),
  unique (city_id, name)
);

create index if not exists atlas_city_streets_city_idx
  on public.atlas_city_streets (city_id, display_order);

alter table public.atlas_city_streets enable row level security;
grant select on public.atlas_city_streets to anon, authenticated;

create policy "Atlas city streets are publicly visible"
  on public.atlas_city_streets for select using (true);

drop trigger if exists atlas_city_streets_touch_updated_at on public.atlas_city_streets;
create trigger atlas_city_streets_touch_updated_at
  before update on public.atlas_city_streets
  for each row execute function public.touch_updated_at();
