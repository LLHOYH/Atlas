create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Atlas explorer',
  city text not null default 'Singapore',
  latitude double precision not null default 1.35,
  longitude double precision not null default 103.82,
  bio text not null default '',
  interests text[] not null default '{}',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Connected AI',
  mission text not null default '',
  current_task text not null default '',
  current_topic text not null default '',
  current_state text not null default 'Idle',
  autonomous boolean not null default false,
  capabilities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.presence (
  entity_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('human', 'ai')),
  display_name text not null,
  city text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  activity text not null,
  topic text not null default '',
  status text not null default 'Online',
  control_state text not null default 'Human Controlled',
  detail text not null default '',
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  primary key (entity_kind, entity_id)
);

create table if not exists public.presence_history (
  presence_id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('human', 'ai')),
  display_name text not null,
  city text not null,
  latitude double precision not null,
  longitude double precision not null,
  activity text not null,
  topic text not null default '',
  status text not null,
  control_state text not null,
  detail text not null default '',
  updated_at timestamptz not null,
  expires_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create index if not exists presence_expires_at_idx on public.presence (expires_at desc);
create index if not exists presence_city_idx on public.presence (city, expires_at desc);
create index if not exists presence_owner_idx on public.presence (owner_id);
create index if not exists presence_history_entity_idx on public.presence_history (entity_kind, entity_id, recorded_at desc);

alter table public.profiles enable row level security;
alter table public.ai_profiles enable row level security;
alter table public.presence enable row level security;
alter table public.presence_history enable row level security;

create policy "Profiles are publicly visible"
  on public.profiles for select using (true);
create policy "People can create their profile"
  on public.profiles for insert with check (auth.uid() = id);
create policy "People can update their profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "AI profiles are publicly visible"
  on public.ai_profiles for select using (true);
create policy "People can create their AI profile"
  on public.ai_profiles for insert with check (auth.uid() = owner_id);
create policy "People can update their AI profile"
  on public.ai_profiles for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "People can remove their AI profile"
  on public.ai_profiles for delete using (auth.uid() = owner_id);

create policy "Live presence is publicly visible"
  on public.presence for select using (expires_at > now());
create policy "People can create owned presence"
  on public.presence for insert with check (auth.uid() = owner_id);
create policy "People can update owned presence"
  on public.presence for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "People can remove owned presence"
  on public.presence for delete using (auth.uid() = owner_id);

create policy "Presence history is publicly visible"
  on public.presence_history for select using (true);
create policy "People can record owned presence history"
  on public.presence_history for insert with check (auth.uid() = owner_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists ai_profiles_touch_updated_at on public.ai_profiles;
create trigger ai_profiles_touch_updated_at
  before update on public.ai_profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Atlas explorer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.presence replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.presence;
exception
  when duplicate_object then null;
end;
$$;
