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

commit;
