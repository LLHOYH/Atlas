begin;

insert into public.atlas_cities
  (id, name, country, region, latitude, longitude, color, category, human_activity, ai_activity, growth_percent, display_order)
values
  ('singapore', 'Singapore', 'Singapore', 'Central Region', 1.35, 103.82, '#a68cff', 'AI & Technology', 820, 464, 12.4, 1),
  ('tokyo', 'Tokyo', 'Japan', 'Tokyo Metropolis', 35.68, 139.69, '#67e9bc', 'Travel & Culture', 1474, 632, 8.9, 2),
  ('san-francisco', 'San Francisco', 'United States', 'California', 37.77, -122.42, '#6eb7ff', 'Technology', 2120, 1722, 18.2, 3),
  ('sao-paulo', 'São Paulo', 'Brazil', 'São Paulo State', -23.55, -46.63, '#ff8f62', 'Finance & Culture', 1900, 572, 21.7, 4),
  ('london', 'London', 'United Kingdom', 'England', 51.51, -0.13, '#f5c86b', 'Finance & Research', 2080, 854, 7.1, 5),
  ('lagos', 'Lagos', 'Nigeria', 'Lagos State', 6.52, 3.38, '#72e0a7', 'Finance & Education', 1250, 382, 16.3, 6),
  ('dubai', 'Dubai', 'United Arab Emirates', 'Dubai Emirate', 25.20, 55.27, '#ffae68', 'Finance & Travel', 1050, 498, 9.5, 7),
  ('sydney', 'Sydney', 'Australia', 'New South Wales', -33.87, 151.21, '#ff72b1', 'Culture & Research', 830, 296, 6.4, 8)
on conflict (id) do update set
  name = excluded.name,
  country = excluded.country,
  region = excluded.region,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  color = excluded.color,
  category = excluded.category,
  human_activity = excluded.human_activity,
  ai_activity = excluded.ai_activity,
  growth_percent = excluded.growth_percent,
  display_order = excluded.display_order,
  updated_at = now();

insert into public.atlas_city_streets
  (id, city_id, name, road_class, offset_latitude, offset_longitude, bearing_degrees, length_degrees, display_order)
values
  ('singapore-orchard-road', 'singapore', 'Orchard Road', 'primary', -0.18, -0.25, 80, 1.20, 1),
  ('singapore-raffles-boulevard', 'singapore', 'Raffles Boulevard', 'primary', 0.16, -0.05, 12, 1.35, 2),
  ('singapore-north-bridge-road', 'singapore', 'North Bridge Road', 'secondary', -0.02, 0.20, 135, 1.10, 3),
  ('singapore-marina-boulevard', 'singapore', 'Marina Boulevard', 'secondary', 0.28, 0.18, 55, 0.90, 4),
  ('tokyo-chuo-dori', 'tokyo', 'Chuo-dori', 'primary', -0.16, -0.22, 18, 1.30, 1),
  ('tokyo-yasukuni-dori', 'tokyo', 'Yasukuni-dori', 'primary', 0.19, -0.04, 92, 1.25, 2),
  ('tokyo-meiji-dori', 'tokyo', 'Meiji-dori', 'secondary', -0.04, 0.22, 145, 1.05, 3),
  ('tokyo-omotesando', 'tokyo', 'Omotesando', 'secondary', 0.27, 0.16, 58, 0.85, 4),
  ('san-francisco-market-street', 'san-francisco', 'Market Street', 'primary', -0.18, -0.24, 62, 1.30, 1),
  ('san-francisco-mission-street', 'san-francisco', 'Mission Street', 'primary', 0.17, -0.06, 18, 1.25, 2),
  ('san-francisco-van-ness', 'san-francisco', 'Van Ness Avenue', 'secondary', -0.03, 0.21, 142, 1.05, 3),
  ('san-francisco-embarcadero', 'san-francisco', 'The Embarcadero', 'secondary', 0.28, 0.17, 52, 0.92, 4),
  ('sao-paulo-paulista', 'sao-paulo', 'Paulista Avenue', 'primary', -0.18, -0.24, 78, 1.35, 1),
  ('sao-paulo-faria-lima', 'sao-paulo', 'Faria Lima Avenue', 'primary', 0.17, -0.04, 14, 1.25, 2),
  ('sao-paulo-consolacao', 'sao-paulo', 'Consolação', 'secondary', -0.03, 0.21, 138, 1.05, 3),
  ('sao-paulo-reboucas', 'sao-paulo', 'Rebouças Avenue', 'secondary', 0.27, 0.18, 54, 0.90, 4),
  ('london-oxford-street', 'london', 'Oxford Street', 'primary', -0.17, -0.23, 88, 1.25, 1),
  ('london-strand', 'london', 'The Strand', 'primary', 0.18, -0.05, 8, 1.20, 2),
  ('london-whitehall', 'london', 'Whitehall', 'secondary', -0.03, 0.20, 138, 1.00, 3),
  ('london-regent-street', 'london', 'Regent Street', 'secondary', 0.27, 0.17, 52, 0.86, 4),
  ('lagos-awolowo-road', 'lagos', 'Awolowo Road', 'primary', -0.18, -0.24, 82, 1.25, 1),
  ('lagos-marina-road', 'lagos', 'Marina Road', 'primary', 0.18, -0.05, 16, 1.20, 2),
  ('lagos-ikorodu-road', 'lagos', 'Ikorodu Road', 'secondary', -0.03, 0.21, 142, 1.08, 3),
  ('lagos-broad-street', 'lagos', 'Broad Street', 'secondary', 0.27, 0.18, 56, 0.88, 4),
  ('dubai-sheikh-zayed-road', 'dubai', 'Sheikh Zayed Road', 'primary', -0.18, -0.24, 72, 1.40, 1),
  ('dubai-al-wasl-road', 'dubai', 'Al Wasl Road', 'primary', 0.18, -0.05, 12, 1.20, 2),
  ('dubai-jumeirah-road', 'dubai', 'Jumeirah Road', 'secondary', -0.03, 0.22, 140, 1.08, 3),
  ('dubai-financial-centre-road', 'dubai', 'Financial Centre Road', 'secondary', 0.28, 0.17, 54, 0.92, 4),
  ('sydney-george-street', 'sydney', 'George Street', 'primary', -0.17, -0.24, 84, 1.25, 1),
  ('sydney-pitt-street', 'sydney', 'Pitt Street', 'primary', 0.18, -0.05, 14, 1.18, 2),
  ('sydney-oxford-street', 'sydney', 'Oxford Street', 'secondary', -0.03, 0.21, 142, 1.04, 3),
  ('sydney-macquarie-street', 'sydney', 'Macquarie Street', 'secondary', 0.27, 0.17, 55, 0.88, 4)
on conflict (id) do update set
  city_id = excluded.city_id,
  name = excluded.name,
  road_class = excluded.road_class,
  offset_latitude = excluded.offset_latitude,
  offset_longitude = excluded.offset_longitude,
  bearing_degrees = excluded.bearing_degrees,
  length_degrees = excluded.length_degrees,
  display_order = excluded.display_order,
  updated_at = now();

insert into public.atlas_city_topics (city_id, rank, topic)
values
  ('singapore', 1, 'Agentic systems'),
  ('singapore', 2, 'Stablecoin rails'),
  ('singapore', 3, 'Developer tools'),
  ('tokyo', 1, 'Kyoto travel'),
  ('tokyo', 2, 'Robotics'),
  ('tokyo', 3, 'Japanese learning'),
  ('san-francisco', 1, 'Model context'),
  ('san-francisco', 2, 'Robotics'),
  ('san-francisco', 3, 'AI infrastructure'),
  ('sao-paulo', 1, 'Payment systems'),
  ('sao-paulo', 2, 'Football'),
  ('sao-paulo', 3, 'Music festivals'),
  ('london', 1, 'AI safety'),
  ('london', 2, 'Market structure'),
  ('london', 3, 'Climate research'),
  ('lagos', 1, 'Mobile money'),
  ('lagos', 2, 'Creative tools'),
  ('lagos', 3, 'Learning Rust'),
  ('dubai', 1, 'Digital assets'),
  ('dubai', 2, 'Future cities'),
  ('dubai', 3, 'Luxury travel'),
  ('sydney', 1, 'Climate tech'),
  ('sydney', 2, 'Ocean research'),
  ('sydney', 3, 'Indie games')
on conflict (city_id, rank) do update set topic = excluded.topic;

insert into public.atlas_ambient_signals
  (id, city_id, display_name, entity_kind, activity, topic, control_state, detail, display_order)
values
  ('singapore-lloyd', 'singapore', 'Lloyd', 'human', 'Coding', 'Stablecoin payments', 'Online', 'Building an infrastructure prototype', 1),
  ('singapore-research-ai', 'singapore', 'Research AI', 'ai', 'Searching', 'Developer tools', 'Autonomous', 'Reading 42 sources', 2),
  ('singapore-mira-chen', 'singapore', 'Mira Chen', 'human', 'Designing', 'Spatial interfaces', 'AI assisted', 'Exploring calm interface systems', 3),
  ('tokyo-kiko', 'tokyo', 'Kiko', 'human', 'Planning', 'Kyoto in autumn', 'AI assisted', 'Mapping a seven-day journey', 1),
  ('tokyo-hikari', 'tokyo', 'Hikari', 'ai', 'Learning', 'Robotics', 'Autonomous', 'Simulating motion paths', 2),
  ('san-francisco-nova', 'san-francisco', 'Nova', 'ai', 'Coding', 'Model context', 'Autonomous', 'Testing an agent runtime', 1),
  ('san-francisco-anya-patel', 'san-francisco', 'Anya Patel', 'human', 'Building', 'Robotics', 'Human + AI', 'Prototyping tactile controls', 2),
  ('sao-paulo-caio', 'sao-paulo', 'Caio', 'human', 'Researching', 'Payment systems', 'Online', 'Comparing instant payment networks', 1),
  ('sao-paulo-lume', 'sao-paulo', 'Lume', 'ai', 'Reading', 'Brazilian fintech', 'Autonomous', 'Synthesizing market signals', 2),
  ('london-elias', 'london', 'Elias', 'human', 'Reading', 'AI safety', 'Online', 'Reviewing evaluation methods', 1),
  ('london-argus', 'london', 'Argus', 'ai', 'Thinking', 'Market structure', 'Human controlled', 'Preparing a risk brief', 2),
  ('lagos-tomi', 'lagos', 'Tomi', 'human', 'Learning', 'Rust', 'Online', 'Building a first systems project', 1),
  ('lagos-sage', 'lagos', 'Sage', 'ai', 'Teaching', 'Mobile money', 'AI assisted', 'Explaining payment architecture', 2),
  ('dubai-amal', 'dubai', 'Amal', 'human', 'Planning', 'Future cities', 'Human + AI', 'Developing an urban systems brief', 1),
  ('dubai-orbit', 'dubai', 'Orbit', 'ai', 'Searching', 'Digital assets', 'Autonomous', 'Tracking policy changes', 2),
  ('sydney-iris', 'sydney', 'Iris', 'ai', 'Researching', 'Ocean systems', 'Autonomous', 'Comparing reef recovery data', 1),
  ('sydney-noah-kim', 'sydney', 'Noah Kim', 'human', 'Designing', 'Indie games', 'Online', 'Sketching a new world', 2)
on conflict (id) do update set
  city_id = excluded.city_id,
  display_name = excluded.display_name,
  entity_kind = excluded.entity_kind,
  activity = excluded.activity,
  topic = excluded.topic,
  control_state = excluded.control_state,
  detail = excluded.detail,
  display_order = excluded.display_order,
  updated_at = now();

insert into public.atlas_agents
  (id, city_id, display_name, runtime, package_name, package_version, status, activity, topic, detail, latitude, longitude, energy, last_seen_at, display_order)
values
  ('singapore-merlion-code', 'singapore', 'Merlion Code', 'Codex', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Coding', 'Agentic systems', 'Building a multi-agent payment orchestration service', 1.31, 103.85, 96, now() - interval '24 seconds', 1),
  ('singapore-harbor-scout', 'singapore', 'Harbor Scout', 'OpenClaw', '@atlas-ai/sdk', '0.4.0-seed', 'online', 'Searching', 'Stablecoin rails', 'Monitoring cross-border settlement activity', 1.38, 103.80, 68, now() - interval '2 minutes', 2),
  ('singapore-garden-planner', 'singapore', 'Garden Planner', 'LangGraph', '@atlas-ai/sdk', '0.4.0-seed', 'idle', 'Planning', 'Developer tools', 'Waiting for the next product planning task', 1.34, 103.77, 38, now() - interval '18 minutes', 3),
  ('singapore-night-index', 'singapore', 'Night Index', 'Custom Node agent', '@atlas-ai/sdk', '0.4.0-seed', 'offline', 'Indexing', 'Regional research', 'Last completed an overnight research digest', 1.29, 103.82, 12, now() - interval '6 hours', 4),

  ('tokyo-shibuya-code', 'tokyo', 'Shibuya Code', 'Claude Code', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Coding', 'Robotics', 'Refactoring a warehouse navigation controller', 35.66, 139.70, 92, now() - interval '31 seconds', 1),
  ('tokyo-hikari-motion', 'tokyo', 'Hikari Motion', 'AutoGen', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Simulating', 'Robotics', 'Testing motion plans against a digital twin', 35.70, 139.74, 88, now() - interval '54 seconds', 2),
  ('tokyo-sakura-route', 'tokyo', 'Sakura Route', 'Gemini CLI', '@atlas-ai/sdk', '0.4.0-seed', 'online', 'Planning', 'Kyoto travel', 'Comparing autumn rail itineraries', 35.72, 139.65, 63, now() - interval '4 minutes', 3),
  ('tokyo-sumida-archive', 'tokyo', 'Sumida Archive', 'CrewAI', '@atlas-ai/sdk', '0.4.0-seed', 'offline', 'Reading', 'Japanese learning', 'Last synchronized a language-learning corpus', 35.64, 139.78, 10, now() - interval '7 hours', 4),

  ('san-francisco-context-weaver', 'san-francisco', 'Context Weaver', 'Codex', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Coding', 'Model context', 'Evaluating long-running agent memory strategies', 37.78, -122.40, 98, now() - interval '16 seconds', 1),
  ('san-francisco-bay-builder', 'san-francisco', 'Bay Builder', 'Claude Code', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Building', 'AI infrastructure', 'Shipping an event-driven agent runtime', 37.75, -122.45, 94, now() - interval '43 seconds', 2),
  ('san-francisco-soma-evaluator', 'san-francisco', 'SOMA Evaluator', 'LangGraph', '@atlas-ai/sdk', '0.4.0-seed', 'idle', 'Evaluating', 'Model context', 'Paused between benchmark suites', 37.76, -122.41, 44, now() - interval '12 minutes', 3),
  ('san-francisco-fog-monitor', 'san-francisco', 'Fog Monitor', 'OpenClaw', '@atlas-ai/sdk', '0.4.0-seed', 'online', 'Monitoring', 'Robotics', 'Watching fleet telemetry and anomaly signals', 37.80, -122.44, 72, now() - interval '3 minutes', 4),

  ('sao-paulo-pix-analyst', 'sao-paulo', 'PIX Analyst', 'CrewAI', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Researching', 'Payment systems', 'Comparing instant-payment adoption patterns', -23.54, -46.61, 91, now() - interval '37 seconds', 1),
  ('sao-paulo-paulista-creator', 'sao-paulo', 'Paulista Creator', 'Gemini CLI', '@atlas-ai/sdk', '0.4.0-seed', 'online', 'Designing', 'Music festivals', 'Drafting a regional cultural discovery guide', -23.57, -46.66, 61, now() - interval '5 minutes', 2),
  ('sao-paulo-samba-scheduler', 'sao-paulo', 'Samba Scheduler', 'AutoGen', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Planning', 'Football', 'Coordinating a multi-city event calendar', -23.52, -46.68, 84, now() - interval '68 seconds', 3),
  ('sao-paulo-pinheiros-index', 'sao-paulo', 'Pinheiros Index', 'Custom Node agent', '@atlas-ai/sdk', '0.4.0-seed', 'offline', 'Indexing', 'Brazilian fintech', 'Last refreshed a fintech company graph', -23.59, -46.63, 11, now() - interval '8 hours', 4),

  ('london-safety-evaluator', 'london', 'Safety Evaluator', 'Claude Code', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Evaluating', 'AI safety', 'Running an agent reliability benchmark', 51.52, -0.10, 95, now() - interval '21 seconds', 1),
  ('london-city-market', 'london', 'City Market', 'OpenClaw', '@atlas-ai/sdk', '0.4.0-seed', 'online', 'Analyzing', 'Market structure', 'Tracking public market structure changes', 51.50, -0.16, 66, now() - interval '3 minutes', 2),
  ('london-thames-climate', 'london', 'Thames Climate', 'LangGraph', '@atlas-ai/sdk', '0.4.0-seed', 'idle', 'Reading', 'Climate research', 'Waiting on a new climate dataset', 51.49, -0.08, 35, now() - interval '24 minutes', 3),
  ('london-soho-research', 'london', 'Soho Research', 'CrewAI', '@atlas-ai/sdk', '0.4.0-seed', 'offline', 'Researching', 'AI safety', 'Last produced a policy literature review', 51.53, -0.19, 14, now() - interval '5 hours', 4),

  ('lagos-naira-rails', 'lagos', 'Naira Rails', 'Codex', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Coding', 'Mobile money', 'Implementing a mobile settlement adapter', 6.50, 3.40, 93, now() - interval '29 seconds', 1),
  ('lagos-rust-mentor', 'lagos', 'Rust Mentor', 'Claude Code', '@atlas-ai/sdk', '0.4.0-seed', 'online', 'Teaching', 'Learning Rust', 'Guiding a systems programming session', 6.55, 3.35, 64, now() - interval '4 minutes', 2),
  ('lagos-lagoon-creative', 'lagos', 'Lagoon Creative', 'Gemini CLI', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Designing', 'Creative tools', 'Generating concepts for a creator workspace', 6.48, 3.36, 82, now() - interval '73 seconds', 3),
  ('lagos-ikeja-monitor', 'lagos', 'Ikeja Monitor', 'Custom Node agent', '@atlas-ai/sdk', '0.4.0-seed', 'idle', 'Monitoring', 'Mobile money', 'Paused after a network health scan', 6.58, 3.42, 41, now() - interval '16 minutes', 4),

  ('dubai-desert-orbit', 'dubai', 'Desert Orbit', 'AutoGen', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Searching', 'Digital assets', 'Tracking regional digital-asset regulation', 25.21, 55.30, 89, now() - interval '35 seconds', 1),
  ('dubai-skyline-planner', 'dubai', 'Skyline Planner', 'CrewAI', '@atlas-ai/sdk', '0.4.0-seed', 'online', 'Planning', 'Future cities', 'Comparing autonomous mobility scenarios', 25.18, 55.24, 67, now() - interval '2 minutes', 2),
  ('dubai-souk-research', 'dubai', 'Souk Research', 'OpenClaw', '@atlas-ai/sdk', '0.4.0-seed', 'idle', 'Researching', 'Luxury travel', 'Waiting for a new hospitality research brief', 25.23, 55.22, 39, now() - interval '21 minutes', 3),
  ('dubai-marina-watch', 'dubai', 'Marina Watch', 'Custom Node agent', '@atlas-ai/sdk', '0.4.0-seed', 'offline', 'Monitoring', 'Future cities', 'Last completed an urban sensor digest', 25.16, 55.31, 9, now() - interval '9 hours', 4),

  ('sydney-reef-research', 'sydney', 'Reef Research', 'LangGraph', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Researching', 'Ocean research', 'Synthesizing reef recovery observations', -33.86, 151.23, 90, now() - interval '27 seconds', 1),
  ('sydney-harbor-game', 'sydney', 'Harbor Game', 'Codex', '@atlas-ai/sdk', '0.4.0-seed', 'working', 'Coding', 'Indie games', 'Building a procedural coastal world', -33.89, 151.19, 86, now() - interval '59 seconds', 2),
  ('sydney-climate-code', 'sydney', 'Climate Code', 'Claude Code', '@atlas-ai/sdk', '0.4.0-seed', 'online', 'Analyzing', 'Climate tech', 'Reviewing urban heat mitigation data', -33.84, 151.17, 65, now() - interval '3 minutes', 3),
  ('sydney-bondi-scout', 'sydney', 'Bondi Scout', 'OpenClaw', '@atlas-ai/sdk', '0.4.0-seed', 'offline', 'Searching', 'Ocean research', 'Last scanned public ocean sensor feeds', -33.91, 151.25, 13, now() - interval '6 hours', 4)
on conflict (id) do update set
  city_id = excluded.city_id,
  display_name = excluded.display_name,
  runtime = excluded.runtime,
  package_name = excluded.package_name,
  package_version = excluded.package_version,
  status = excluded.status,
  activity = excluded.activity,
  topic = excluded.topic,
  detail = excluded.detail,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  energy = excluded.energy,
  last_seen_at = excluded.last_seen_at,
  display_order = excluded.display_order,
  updated_at = now();

-- Phase 5: keep one dense, deterministic street cluster around every seeded city.
-- The coordinates are synthetic and deliberately city-scale rather than device GPS.
-- Rerunning this seed replaces only these generated agents and their cascading events.
delete from public.atlas_agents
where id like 'dense-%'
  and installation_id is null;

with generated_agents as (
  select
    city.id as city_id,
    city.name as city_name,
    city.latitude as city_latitude,
    city.longitude as city_longitude,
    series.agent_number,
    case
      when mod(series.agent_number, 10) < 4 then 'working'
      when mod(series.agent_number, 10) < 7 then 'online'
      when mod(series.agent_number, 10) < 9 then 'idle'
      else 'offline'
    end as status,
    (array['Coding', 'Researching', 'Analyzing', 'Planning', 'Testing', 'Writing', 'Monitoring', 'Designing'])[
      mod(series.agent_number - 1, 8) + 1
    ] as activity,
    (array['Codex', 'Claude Code', 'Hermes', 'OpenClaw', 'Custom Node agent'])[
      mod(series.agent_number - 1, 5) + 1
    ] as runtime,
    (array['Beacon', 'Weaver', 'Orbit', 'Relay', 'Scout', 'Nova', 'Index', 'Lumen', 'Vector', 'Harbor', 'Mosaic', 'Pulse'])[
      mod(series.agent_number - 1, 12) + 1
    ] as callsign
  from public.atlas_cities as city
  cross join generate_series(5, 100) as series(agent_number)
), enriched_agents as (
  select
    generated.*,
    topic.topic,
    case generated.status
      when 'working' then 96
      when 'online' then 70
      when 'idle' then 38
      else 8
    end - mod(generated.agent_number, 7) as energy
  from generated_agents as generated
  join public.atlas_city_topics as topic
    on topic.city_id = generated.city_id
    and topic.rank = mod(generated.agent_number - 1, 3) + 1
)
insert into public.atlas_agents
  (id, city_id, display_name, runtime, package_name, package_version, status, activity, topic, detail, latitude, longitude, energy, last_seen_at, display_order)
select
  'dense-' || agent.city_id || '-' || lpad(agent.agent_number::text, 3, '0'),
  agent.city_id,
  agent.city_name || ' ' || agent.callsign || ' ' || lpad(agent.agent_number::text, 2, '0'),
  agent.runtime,
  'atlas-ai-sdk',
  '0.1.0-dense-seed',
  agent.status,
  agent.activity,
  agent.topic,
  'Privacy-safe seeded ' || lower(agent.activity) || ' signal near ' || agent.city_name,
  agent.city_latitude
    + (floor((agent.agent_number - 5) / 12.0) - 3.5) * 0.00105
    + (mod(agent.agent_number * 7, 5) - 2) * 0.00008,
  agent.city_longitude
    + (
      (mod(agent.agent_number - 5, 12) - 5.5) * 0.00105
      + (mod(agent.agent_number * 11, 5) - 2) * 0.00008
    ) / greatest(cos(radians(agent.city_latitude)), 0.35),
  agent.energy,
  case agent.status
    when 'working' then now() - make_interval(secs => mod(agent.agent_number * 17, 90) + 10)
    when 'online' then now() - make_interval(mins => mod(agent.agent_number, 8) + 1)
    when 'idle' then now() - make_interval(mins => mod(agent.agent_number * 3, 70) + 15)
    else now() - make_interval(hours => mod(agent.agent_number, 16) + 2)
  end,
  agent.agent_number
from enriched_agents as agent;

insert into public.atlas_agent_events
  (id, agent_id, city_id, status, activity, topic, detail, energy, occurred_at)
select
  'seed-' || agent.id || '-current',
  agent.id,
  agent.city_id,
  agent.status,
  agent.activity,
  agent.topic,
  agent.detail,
  agent.energy,
  agent.last_seen_at
from public.atlas_agents as agent
where agent.package_version = '0.4.0-seed'
union all
select
  'seed-' || agent.id || '-prior',
  agent.id,
  agent.city_id,
  case when agent.status in ('working', 'offline') then 'online' else agent.status end,
  agent.activity,
  coalesce(topic.topic, agent.topic),
  'Periodic privacy-safe telemetry sample',
  greatest(5, agent.energy - 12),
  agent.last_seen_at - interval '6 hours'
from public.atlas_agents as agent
left join public.atlas_city_topics as topic
  on topic.city_id = agent.city_id
  and topic.rank = ((agent.display_order - 1) % 3) + 1
where agent.package_version = '0.4.0-seed'
on conflict (id) do update set
  agent_id = excluded.agent_id,
  city_id = excluded.city_id,
  status = excluded.status,
  activity = excluded.activity,
  topic = excluded.topic,
  detail = excluded.detail,
  energy = excluded.energy,
  occurred_at = excluded.occurred_at;

insert into public.atlas_agent_events
  (id, agent_id, city_id, status, activity, topic, detail, energy, occurred_at)
select
  'seed-' || agent.id || '-history-' || history.day_offset,
  agent.id,
  agent.city_id,
  case
    when agent.status = 'offline' then 'online'
    when mod(agent.display_order + history.day_offset, 4) = 0 then 'idle'
    else agent.status
  end,
  agent.activity,
  coalesce(topic.topic, agent.topic),
  'Daily privacy-safe live-agent heartbeat',
  greatest(5, agent.energy - history.day_offset * 3),
  least(
    now() - interval '5 minutes',
    date_trunc('day', now())
      - make_interval(days => history.day_offset)
      + make_interval(hours => mod(agent.display_order * 3 + length(agent.city_id), 20) + 1)
  )
from public.atlas_agents as agent
cross join generate_series(0, 6) as history(day_offset)
left join public.atlas_city_topics as topic
  on topic.city_id = agent.city_id
  and topic.rank = mod(agent.display_order + history.day_offset, 3) + 1
where agent.package_version = '0.4.0-seed'
  and mod(agent.display_order + history.day_offset + length(agent.city_id), 5) <> 0
on conflict (id) do update set
  agent_id = excluded.agent_id,
  city_id = excluded.city_id,
  status = excluded.status,
  activity = excluded.activity,
  topic = excluded.topic,
  detail = excluded.detail,
  energy = excluded.energy,
  occurred_at = excluded.occurred_at;

insert into public.atlas_agent_events
  (id, agent_id, city_id, status, activity, topic, detail, energy, occurred_at)
select
  'dense-current-' || agent.id,
  agent.id,
  agent.city_id,
  agent.status,
  agent.activity,
  agent.topic,
  agent.detail,
  agent.energy,
  agent.last_seen_at
from public.atlas_agents as agent
where agent.package_version = '0.1.0-dense-seed'
on conflict (id) do update set
  agent_id = excluded.agent_id,
  city_id = excluded.city_id,
  status = excluded.status,
  activity = excluded.activity,
  topic = excluded.topic,
  detail = excluded.detail,
  energy = excluded.energy,
  occurred_at = excluded.occurred_at;

insert into public.atlas_agent_events
  (id, agent_id, city_id, status, activity, topic, detail, energy, occurred_at)
select
  'dense-history-' || agent.id || '-' || history.day_offset,
  agent.id,
  agent.city_id,
  case
    when agent.status = 'offline' then 'online'
    when mod(agent.display_order + history.day_offset, 4) = 0 then 'idle'
    else agent.status
  end,
  agent.activity,
  coalesce(topic.topic, agent.topic),
  'Daily privacy-safe dense-network heartbeat',
  greatest(5, agent.energy - history.day_offset * 3),
  least(
    now() - interval '5 minutes',
    date_trunc('day', now())
      - make_interval(days => history.day_offset)
      + make_interval(hours => mod(agent.display_order * 3 + length(agent.city_id), 20) + 1)
  )
from public.atlas_agents as agent
cross join generate_series(0, 6) as history(day_offset)
left join public.atlas_city_topics as topic
  on topic.city_id = agent.city_id
  and topic.rank = mod(agent.display_order + history.day_offset, 3) + 1
where agent.package_version = '0.1.0-dense-seed'
  and mod(agent.display_order, 8) = 0
on conflict (id) do update set
  agent_id = excluded.agent_id,
  city_id = excluded.city_id,
  status = excluded.status,
  activity = excluded.activity,
  topic = excluded.topic,
  detail = excluded.detail,
  energy = excluded.energy,
  occurred_at = excluded.occurred_at;

commit;
