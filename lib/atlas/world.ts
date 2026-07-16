export type AtlasSignal = {
  id: string;
  name: string;
  type: "Human" | "AI";
  activity: string;
  topic: string;
  status: string;
  detail: string;
};

export type AtlasStreet = {
  id: string;
  name: string;
  roadClass: "primary" | "secondary" | "local";
  offsetLatitude: number;
  offsetLongitude: number;
  bearingDegrees: number;
  lengthDegrees: number;
};

export type AtlasAgentStatus = "online" | "working" | "idle" | "offline";

export type AtlasAgent = {
  id: string;
  cityId: string;
  name: string;
  runtime: string;
  packageName: string;
  packageVersion: string;
  status: AtlasAgentStatus;
  activity: string;
  topic: string;
  detail: string;
  lat: number;
  lng: number;
  energy: number;
  lastSeenAt: string;
};

export type AtlasHotTopic = {
  topic: string;
  events: number;
  energy: number;
};

export type AtlasDailyLiveAgent = {
  date: string;
  label: string;
  count: number;
};

export type AtlasCity = {
  id: string;
  name: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  color: string;
  category: string;
  humanActivity: number;
  aiActivity: number;
  growthPercent: number;
  topics: string[];
  signals: AtlasSignal[];
  streets: AtlasStreet[];
  agents: AtlasAgent[];
  agentEnergy: number;
  hotTopics: AtlasHotTopic[];
};

export type AtlasCityRow = {
  id: string;
  name: string;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
  color: string;
  category: string;
  human_activity: number;
  ai_activity: number;
  growth_percent: number;
  display_order: number;
};

export type AtlasTopicRow = {
  city_id: string;
  rank: number;
  topic: string;
};

export type AtlasAmbientSignalRow = {
  id: string;
  city_id: string;
  display_name: string;
  entity_kind: "human" | "ai";
  activity: string;
  topic: string;
  control_state: string;
  detail: string;
  display_order: number;
};

export type AtlasStreetRow = {
  id: string;
  city_id: string;
  name: string;
  road_class: "primary" | "secondary" | "local";
  offset_latitude: number;
  offset_longitude: number;
  bearing_degrees: number;
  length_degrees: number;
  display_order: number;
};

export type AtlasAgentRow = {
  id: string;
  city_id: string;
  display_name: string;
  runtime: string;
  package_name: string;
  package_version: string;
  status: AtlasAgentStatus;
  activity: string;
  topic: string;
  detail: string;
  latitude: number;
  longitude: number;
  energy: number;
  last_seen_at: string;
  display_order: number;
  installation_id?: string | null;
};

export type AtlasAgentEventRow = {
  id: string;
  agent_id: string;
  city_id: string;
  status: AtlasAgentStatus;
  activity: string;
  topic: string;
  detail: string;
  energy: number;
  occurred_at: string;
};

export type AtlasDailyLiveAgentRow = {
  activity_date: string;
  live_agents: number | string;
};

export function mapAtlasLiveAgentHistory(rows: AtlasDailyLiveAgentRow[]): AtlasDailyLiveAgent[] {
  return [...rows]
    .sort((left, right) => left.activity_date.localeCompare(right.activity_date))
    .map((row) => ({
      date: row.activity_date,
      label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" })
        .format(new Date(`${row.activity_date}T00:00:00Z`))
        .toUpperCase(),
      count: Number(row.live_agents),
    }));
}

export function mapAtlasWorld(
  cityRows: AtlasCityRow[],
  topicRows: AtlasTopicRow[],
  signalRows: AtlasAmbientSignalRow[],
  streetRows: AtlasStreetRow[],
  agentRows: AtlasAgentRow[],
  agentEventRows: AtlasAgentEventRow[],
): AtlasCity[] {
  return [...cityRows]
    .sort((left, right) => left.display_order - right.display_order)
    .map((city) => {
      const topics = topicRows
        .filter((topic) => topic.city_id === city.id)
        .sort((left, right) => left.rank - right.rank)
        .map((topic) => topic.topic);
      const agents = agentRows
        .filter((agent) => agent.city_id === city.id)
        .sort((left, right) => left.display_order - right.display_order)
        .map((agent) => ({
          id: agent.id,
          cityId: agent.city_id,
          name: agent.display_name,
          runtime: agent.runtime,
          packageName: agent.package_name,
          packageVersion: agent.package_version,
          status: agent.installation_id && Date.now() - new Date(agent.last_seen_at).getTime() > 2 * 60 * 1000
            ? "offline" as const
            : agent.status,
          activity: agent.activity,
          topic: agent.topic,
          detail: agent.detail,
          lat: Number(agent.latitude),
          lng: Number(agent.longitude),
          energy: Number(agent.energy),
          lastSeenAt: agent.last_seen_at,
        }));
      const topicEnergy = new Map<string, AtlasHotTopic>();
      for (const event of agentEventRows.filter((candidate) => candidate.city_id === city.id)) {
        const current = topicEnergy.get(event.topic) ?? { topic: event.topic, events: 0, energy: 0 };
        current.events += 1;
        current.energy += Number(event.energy);
        topicEnergy.set(event.topic, current);
      }

      return {
        id: city.id,
        name: city.name,
        country: city.country,
        region: city.region,
        lat: Number(city.latitude),
        lng: Number(city.longitude),
        color: city.color,
        category: city.category,
        humanActivity: Number(city.human_activity),
        aiActivity: Number(city.ai_activity),
        growthPercent: Number(city.growth_percent),
        topics,
        signals: signalRows
        .filter((signal) => signal.city_id === city.id)
        .sort((left, right) => left.display_order - right.display_order)
        .map((signal) => ({
          id: signal.id,
          name: signal.display_name,
          type: signal.entity_kind === "ai" ? "AI" : "Human",
          activity: signal.activity,
          topic: signal.topic,
          status: signal.control_state,
          detail: signal.detail,
        })),
        streets: streetRows
        .filter((street) => street.city_id === city.id)
        .sort((left, right) => left.display_order - right.display_order)
        .map((street) => ({
          id: street.id,
          name: street.name,
          roadClass: street.road_class,
          offsetLatitude: Number(street.offset_latitude),
          offsetLongitude: Number(street.offset_longitude),
          bearingDegrees: Number(street.bearing_degrees),
          lengthDegrees: Number(street.length_degrees),
        })),
        agents,
        agentEnergy: agents.reduce((sum, agent) => sum + agent.energy, 0),
        hotTopics: [...topicEnergy.values()]
          .sort((left, right) => right.energy - left.energy || right.events - left.events)
          .slice(0, 3),
      };
    });
}
