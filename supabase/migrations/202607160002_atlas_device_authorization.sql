create table if not exists public.atlas_device_authorizations (
  id uuid primary key default gen_random_uuid(),
  device_code_hash text not null unique check (device_code_hash ~ '^[a-f0-9]{64}$'),
  user_code text not null unique check (user_code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  installation_token_hash text not null unique check (installation_token_hash ~ '^[a-f0-9]{64}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  runtime text not null check (runtime in ('codex', 'claude-code', 'hermes', 'openclaw', 'custom')),
  runtime_version text not null default 'unknown' check (char_length(runtime_version) between 1 and 40),
  sdk_version text not null default '0.1.0' check (char_length(sdk_version) between 1 and 40),
  state text not null default 'pending' check (state in ('pending', 'approved', 'denied', 'consumed', 'expired')),
  owner_id uuid references auth.users(id) on delete cascade,
  city_id text references public.atlas_cities(id) on delete restrict,
  installation_id uuid unique references public.atlas_agent_installations(id) on delete set null,
  approved_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.atlas_agent_installations
  add column if not exists device_authorization_id uuid unique
  references public.atlas_device_authorizations(id) on delete set null;

create index if not exists atlas_device_authorizations_expiry_idx
  on public.atlas_device_authorizations (expires_at)
  where state = 'pending';
create index if not exists atlas_device_authorizations_owner_idx
  on public.atlas_device_authorizations (owner_id, created_at desc)
  where owner_id is not null;

alter table public.atlas_device_authorizations enable row level security;
revoke all on public.atlas_device_authorizations from anon, authenticated;

drop trigger if exists atlas_device_authorizations_touch_updated_at on public.atlas_device_authorizations;
create trigger atlas_device_authorizations_touch_updated_at
  before update on public.atlas_device_authorizations
  for each row execute function public.touch_updated_at();

create or replace function public.atlas_approve_device_authorization(
  p_owner_id uuid,
  p_user_code text,
  p_city_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_authorization public.atlas_device_authorizations%rowtype;
  v_installation public.atlas_agent_installations%rowtype;
begin
  v_code := regexp_replace(upper(trim(coalesce(p_user_code, ''))), '[^A-Z0-9]', '', 'g');
  if char_length(v_code) <> 8 then
    raise exception 'Invalid Atlas device code' using errcode = '22023';
  end if;
  v_code := left(v_code, 4) || '-' || right(v_code, 4);

  perform 1 from auth.users where id = p_owner_id;
  if not found then
    raise exception 'Atlas account is invalid' using errcode = '28000';
  end if;
  perform 1 from public.atlas_cities where id = p_city_id;
  if not found then
    raise exception 'Unknown Atlas city' using errcode = '22023';
  end if;

  select * into v_authorization
  from public.atlas_device_authorizations
  where user_code = v_code
  for update;
  if not found then
    raise exception 'Atlas device code was not found' using errcode = 'P0002';
  end if;
  if v_authorization.expires_at <= now() then
    update public.atlas_device_authorizations set state = 'expired'
    where id = v_authorization.id;
    raise exception 'Atlas device code has expired' using errcode = '22023';
  end if;
  if v_authorization.state in ('denied', 'expired') then
    raise exception 'Atlas device authorization is no longer available' using errcode = '22023';
  end if;
  if v_authorization.owner_id is not null and v_authorization.owner_id <> p_owner_id then
    raise exception 'Atlas device code is already linked to another account' using errcode = '42501';
  end if;

  update public.atlas_device_authorizations set
    owner_id = p_owner_id,
    city_id = p_city_id,
    state = case when state = 'consumed' then state else 'approved' end,
    approved_at = coalesce(approved_at, now())
  where id = v_authorization.id
  returning * into v_authorization;

  select * into v_installation
  from public.atlas_agent_installations
  where device_authorization_id = v_authorization.id;

  if not found then
    insert into public.atlas_agent_installations (
      owner_id, agent_id, display_name, runtime, runtime_version, sdk_version,
      city_id, token_hash, device_authorization_id
    ) values (
      p_owner_id, 'live-' || gen_random_uuid()::text, v_authorization.display_name,
      v_authorization.runtime, v_authorization.runtime_version, v_authorization.sdk_version,
      p_city_id, v_authorization.installation_token_hash, v_authorization.id
    ) returning * into v_installation;
  end if;

  update public.atlas_device_authorizations set installation_id = v_installation.id
  where id = v_authorization.id;

  return jsonb_build_object(
    'installation_id', v_installation.id,
    'agent_id', v_installation.agent_id,
    'display_name', v_installation.display_name,
    'runtime', v_installation.runtime,
    'city_id', v_installation.city_id
  );
end;
$$;

revoke all on function public.atlas_approve_device_authorization(uuid, text, text) from public, anon, authenticated;
grant execute on function public.atlas_approve_device_authorization(uuid, text, text) to service_role;

create or replace function public.atlas_expire_device_authorizations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.atlas_device_authorizations
  set state = 'expired'
  where state = 'pending' and expires_at <= now();
  get diagnostics v_updated = row_count;

  delete from public.atlas_device_authorizations
  where expires_at < now() - interval '1 day';
  return v_updated;
end;
$$;

revoke all on function public.atlas_expire_device_authorizations() from public, anon, authenticated;
grant execute on function public.atlas_expire_device_authorizations() to service_role;

alter table public.atlas_agent_installations replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.atlas_agent_installations;
exception
  when duplicate_object then null;
end;
$$;
