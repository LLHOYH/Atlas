begin;

insert into public.atlas_cities
  (id, name, country, latitude, longitude, color, category, human_activity, ai_activity, growth_percent, display_order)
values
  ('singapore', 'Singapore', 'Singapore', 1.35, 103.82, '#a68cff', 'AI & Technology', 820, 464, 12.4, 1),
  ('tokyo', 'Tokyo', 'Japan', 35.68, 139.69, '#67e9bc', 'Travel & Culture', 1474, 632, 8.9, 2),
  ('san-francisco', 'San Francisco', 'United States', 37.77, -122.42, '#6eb7ff', 'Technology', 2120, 1722, 18.2, 3),
  ('sao-paulo', 'São Paulo', 'Brazil', -23.55, -46.63, '#ff8f62', 'Finance & Culture', 1900, 572, 21.7, 4),
  ('london', 'London', 'United Kingdom', 51.51, -0.13, '#f5c86b', 'Finance & Research', 2080, 854, 7.1, 5),
  ('lagos', 'Lagos', 'Nigeria', 6.52, 3.38, '#72e0a7', 'Finance & Education', 1250, 382, 16.3, 6),
  ('dubai', 'Dubai', 'United Arab Emirates', 25.20, 55.27, '#ffae68', 'Finance & Travel', 1050, 498, 9.5, 7),
  ('sydney', 'Sydney', 'Australia', -33.87, 151.21, '#ff72b1', 'Culture & Research', 830, 296, 6.4, 8)
on conflict (id) do update set
  name = excluded.name,
  country = excluded.country,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  color = excluded.color,
  category = excluded.category,
  human_activity = excluded.human_activity,
  ai_activity = excluded.ai_activity,
  growth_percent = excluded.growth_percent,
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

commit;
