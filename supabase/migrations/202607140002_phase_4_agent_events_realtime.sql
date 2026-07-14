alter table public.atlas_agent_events replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.atlas_agent_events;
exception
  when duplicate_object then null;
end;
$$;
