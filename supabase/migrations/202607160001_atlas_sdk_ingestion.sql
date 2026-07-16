create table if not exists public.atlas_agent_installations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 80),
  runtime text not null check (runtime in ('codex', 'claude-code', 'hermes', 'openclaw', 'custom')),
  runtime_version text not null default 'unknown',
  sdk_version text not null default '0.1.0',
  city_id text not null references public.atlas_cities(id) on delete restrict,
  token_hash text not null unique check (char_length(token_hash) = 64),
  visibility text not null default 'public' check (visibility in ('public', 'private', 'paused')),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_agent_sessions (
  installation_id uuid not null references public.atlas_agent_installations(id) on delete cascade,
  session_key text not null check (char_length(session_key) between 16 and 128),
  status text not null check (status in ('online', 'working', 'idle', 'offline')),
  activity text not null,
  topic text not null,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  ended_at timestamptz,
  primary key (installation_id, session_key)
);

create table if not exists public.atlas_agent_events_raw (
  event_id text primary key,
  installation_id uuid not null references public.atlas_agent_installations(id) on delete cascade,
  session_key text not null,
  sequence bigint not null check (sequence >= 0),
  event_type text not null,
  status text not null check (status in ('online', 'working', 'idle', 'offline')),
  activity text not null,
  topic text not null,
  runtime text not null,
  runtime_version text not null,
  adapter_version text not null,
  protocol_version text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists atlas_agent_installations_owner_idx
  on public.atlas_agent_installations (owner_id, created_at desc);
create index if not exists atlas_agent_installations_last_seen_idx
  on public.atlas_agent_installations (last_seen_at desc) where revoked_at is null;
create index if not exists atlas_agent_sessions_live_idx
  on public.atlas_agent_sessions (last_seen_at desc) where ended_at is null;
create index if not exists atlas_agent_events_raw_installation_time_idx
  on public.atlas_agent_events_raw (installation_id, occurred_at desc);

alter table public.atlas_agents
  add column if not exists installation_id uuid unique references public.atlas_agent_installations(id) on delete cascade;

alter table public.atlas_agents
  drop constraint if exists atlas_agents_city_id_display_order_key;

alter table public.atlas_agent_installations enable row level security;
alter table public.atlas_agent_sessions enable row level security;
alter table public.atlas_agent_events_raw enable row level security;

grant select, insert, update, delete on public.atlas_agent_installations to authenticated;
grant select on public.atlas_agent_sessions to authenticated;
grant select on public.atlas_agent_events_raw to authenticated;

create policy "People can view their Atlas agent installations"
  on public.atlas_agent_installations for select
  using (auth.uid() = owner_id);
create policy "People can register Atlas agent installations"
  on public.atlas_agent_installations for insert
  with check (auth.uid() = owner_id);
create policy "People can update their Atlas agent installations"
  on public.atlas_agent_installations for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "People can remove their Atlas agent installations"
  on public.atlas_agent_installations for delete
  using (auth.uid() = owner_id);

create policy "People can view sessions for their Atlas agents"
  on public.atlas_agent_sessions for select
  using (exists (
    select 1 from public.atlas_agent_installations as installation
    where installation.id = installation_id and installation.owner_id = auth.uid()
  ));
create policy "People can view raw events for their Atlas agents"
  on public.atlas_agent_events_raw for select
  using (exists (
    select 1 from public.atlas_agent_installations as installation
    where installation.id = installation_id and installation.owner_id = auth.uid()
  ));

drop trigger if exists atlas_agent_installations_touch_updated_at on public.atlas_agent_installations;
create trigger atlas_agent_installations_touch_updated_at
  before update on public.atlas_agent_installations
  for each row execute function public.touch_updated_at();

create or replace function public.atlas_ingest_agent_events(
  p_token_hash text,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_installation public.atlas_agent_installations%rowtype;
  v_city public.atlas_cities%rowtype;
  v_event jsonb;
  v_event_id text;
  v_session_key text;
  v_event_type text;
  v_status text;
  v_activity text;
  v_topic text;
  v_runtime text;
  v_runtime_version text;
  v_adapter_version text;
  v_occurred_at timestamptz;
  v_sequence bigint;
  v_energy smallint;
  v_display_order smallint;
  v_inserted integer;
  v_accepted integer := 0;
begin
  if jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) < 1
    or jsonb_array_length(p_events) > 100 then
    raise exception 'Atlas batches must contain 1-100 events' using errcode = '22023';
  end if;

  select * into v_installation
  from public.atlas_agent_installations
  where token_hash = p_token_hash
    and revoked_at is null
    and visibility <> 'paused'
  for update;
  if not found then
    raise exception 'Invalid or revoked Atlas installation token' using errcode = '28000';
  end if;

  select * into strict v_city from public.atlas_cities where id = v_installation.city_id;
  select (coalesce(max(display_order), 0) + 1)::smallint into v_display_order
  from public.atlas_agents where city_id = v_installation.city_id;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    if v_event ->> 'schema_version' <> '1.0'
      or v_event ->> 'installation_id' <> v_installation.id::text then
      raise exception 'Atlas event identity or protocol version is invalid' using errcode = '22023';
    end if;

    v_event_id := left(coalesce(v_event ->> 'event_id', ''), 100);
    v_session_key := left(coalesce(v_event ->> 'session_id', ''), 128);
    v_event_type := v_event ->> 'event';
    v_status := v_event #>> '{state,status}';
    v_activity := v_event #>> '{state,activity}';
    v_topic := v_event #>> '{state,topic}';
    v_runtime := left(coalesce(v_event #>> '{runtime,name}', v_installation.runtime), 40);
    v_runtime_version := left(coalesce(v_event #>> '{runtime,version}', 'unknown'), 40);
    v_adapter_version := left(coalesce(v_event #>> '{runtime,adapter_version}', 'unknown'), 40);
    v_sequence := coalesce((v_event ->> 'sequence')::bigint, 0);
    v_occurred_at := least(coalesce((v_event ->> 'occurred_at')::timestamptz, now()), now() + interval '5 minutes');

    if v_event_id = '' or char_length(v_session_key) < 16
      or v_event_type not in ('session.started', 'session.heartbeat', 'session.ended', 'turn.started', 'turn.completed', 'tool.started', 'tool.completed', 'status.changed', 'activity.changed', 'topic.changed')
      or v_status not in ('online', 'working', 'idle', 'offline')
      or v_activity not in ('planning', 'coding', 'testing', 'debugging', 'reviewing', 'searching', 'writing', 'deploying', 'monitoring', 'waiting-for-user', 'working', 'idle')
      or v_topic not in ('software-development', 'research', 'data-analysis', 'writing', 'design', 'operations', 'communication', 'education', 'finance', 'travel', 'creative-work', 'other') then
      raise exception 'Atlas event contains an unsupported lifecycle value' using errcode = '22023';
    end if;

    v_status := case
      when v_event_type in ('turn.started', 'tool.started', 'tool.completed') then 'working'
      when v_event_type = 'turn.completed' then 'online'
      when v_event_type = 'session.ended' then 'offline'
      when v_event_type = 'session.started' then 'online'
      else v_status
    end;
    v_energy := case v_status when 'working' then 100 when 'online' then 70 when 'idle' then 35 else 0 end;

    insert into public.atlas_agent_events_raw (
      event_id, installation_id, session_key, sequence, event_type, status,
      activity, topic, runtime, runtime_version, adapter_version, protocol_version, occurred_at
    ) values (
      v_event_id, v_installation.id, v_session_key, v_sequence, v_event_type, v_status,
      v_activity, v_topic, v_runtime, v_runtime_version, v_adapter_version, '1.0', v_occurred_at
    ) on conflict (event_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      continue;
    end if;

    insert into public.atlas_agent_sessions (
      installation_id, session_key, status, activity, topic, started_at, last_seen_at, ended_at
    ) values (
      v_installation.id, v_session_key, v_status, v_activity, v_topic, v_occurred_at, now(),
      case when v_event_type = 'session.ended' then now() else null end
    ) on conflict (installation_id, session_key) do update set
      status = excluded.status,
      activity = excluded.activity,
      topic = excluded.topic,
      last_seen_at = now(),
      ended_at = case when v_event_type = 'session.ended' then now() else public.atlas_agent_sessions.ended_at end;

    insert into public.atlas_agents (
      id, city_id, display_name, runtime, package_name, package_version, status,
      activity, topic, detail, latitude, longitude, energy, last_seen_at, display_order, installation_id
    ) values (
      v_installation.agent_id, v_installation.city_id, v_installation.display_name, v_runtime,
      '@atlas-ai/sdk', v_adapter_version, v_status, v_activity, v_topic, '',
      v_city.latitude, v_city.longitude, v_energy, now(), v_display_order, v_installation.id
    ) on conflict (id) do update set
      display_name = excluded.display_name,
      runtime = excluded.runtime,
      package_version = excluded.package_version,
      status = excluded.status,
      activity = excluded.activity,
      topic = excluded.topic,
      detail = '',
      energy = excluded.energy,
      last_seen_at = now();

    insert into public.atlas_agent_events (
      id, agent_id, city_id, status, activity, topic, detail, energy, occurred_at
    ) values (
      v_event_id, v_installation.agent_id, v_installation.city_id, v_status,
      v_activity, v_topic, '', v_energy, v_occurred_at
    ) on conflict (id) do nothing;

    v_accepted := v_accepted + 1;
  end loop;

  update public.atlas_agent_installations set
    last_seen_at = now(),
    sdk_version = v_adapter_version,
    runtime_version = v_runtime_version
  where id = v_installation.id;

  return jsonb_build_object('accepted', v_accepted, 'agent_id', v_installation.agent_id);
end;
$$;

revoke all on function public.atlas_ingest_agent_events(text, jsonb) from public;
grant execute on function public.atlas_ingest_agent_events(text, jsonb) to anon, authenticated;

create or replace function public.atlas_mark_stale_agents_offline()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.atlas_agents as agent set
    status = 'offline',
    activity = 'idle',
    energy = 0,
    updated_at = now()
  from public.atlas_agent_installations as installation
  where agent.installation_id = installation.id
    and agent.status <> 'offline'
    and installation.last_seen_at < now() - interval '2 minutes';
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.atlas_mark_stale_agents_offline() from public;
