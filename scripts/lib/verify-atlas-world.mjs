export const expectedWorldCounts = Object.freeze({
  cities: 8,
  topics: 24,
  signals: 17,
  streets: 32,
});

async function fetchTable(config, table, select, order) {
  const endpoint = new URL(`/rest/v1/${table}`, config.url);
  endpoint.searchParams.set("select", select);
  endpoint.searchParams.set("order", order);
  const response = await fetch(endpoint, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
  });
  if (!response.ok) {
    throw new Error(`${table} returned HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export async function readAtlasWorld(config) {
  const [cities, topics, signals, streets] = await Promise.all([
    fetchTable(config, "atlas_cities", "id,name,country,region,human_activity,ai_activity,display_order", "display_order.asc"),
    fetchTable(config, "atlas_city_topics", "city_id,rank,topic", "city_id.asc,rank.asc"),
    fetchTable(config, "atlas_ambient_signals", "id,city_id,display_name,entity_kind,display_order", "city_id.asc,display_order.asc"),
    fetchTable(config, "atlas_city_streets", "id,city_id,name,road_class,display_order", "city_id.asc,display_order.asc"),
  ]);
  return { cities, topics, signals, streets };
}

export function verifyAtlasWorld(world) {
  if (world.cities.length !== expectedWorldCounts.cities) {
    throw new Error(`Expected ${expectedWorldCounts.cities} cities, found ${world.cities.length}.`);
  }
  if (world.topics.length !== expectedWorldCounts.topics) {
    throw new Error(`Expected ${expectedWorldCounts.topics} topics, found ${world.topics.length}.`);
  }
  if (world.signals.length !== expectedWorldCounts.signals) {
    throw new Error(`Expected ${expectedWorldCounts.signals} ambient signals, found ${world.signals.length}.`);
  }
  if (world.streets.length !== expectedWorldCounts.streets) {
    throw new Error(`Expected ${expectedWorldCounts.streets} streets, found ${world.streets.length}.`);
  }

  const cityIds = new Set(world.cities.map((city) => city.id));
  if (!cityIds.has("singapore") || !cityIds.has("san-francisco") || !cityIds.has("sao-paulo")) {
    throw new Error("The seeded world is missing one or more anchor cities.");
  }
  for (const city of world.cities) {
    if (Number(city.human_activity) + Number(city.ai_activity) <= 0) {
      throw new Error(`${city.name} has no seeded activity.`);
    }
    const topicCount = world.topics.filter((topic) => topic.city_id === city.id).length;
    const signalCount = world.signals.filter((signal) => signal.city_id === city.id).length;
    const streetCount = world.streets.filter((street) => street.city_id === city.id).length;
    if (topicCount !== 3) throw new Error(`${city.name} should have exactly three topics.`);
    if (signalCount < 2) throw new Error(`${city.name} should have at least two ambient signals.`);
    if (!city.region) throw new Error(`${city.name} should have a region label.`);
    if (streetCount !== 4) throw new Error(`${city.name} should have exactly four named streets.`);
  }

  return {
    cities: world.cities.length,
    topics: world.topics.length,
    signals: world.signals.length,
    streets: world.streets.length,
    humanActivity: world.cities.reduce((sum, city) => sum + Number(city.human_activity), 0),
    aiActivity: world.cities.reduce((sum, city) => sum + Number(city.ai_activity), 0),
  };
}
