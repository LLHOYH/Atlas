export type AtlasSignal = {
  id: string;
  name: string;
  type: "Human" | "AI";
  activity: string;
  topic: string;
  status: string;
  detail: string;
};

export type AtlasCity = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  color: string;
  category: string;
  humanActivity: number;
  aiActivity: number;
  growthPercent: number;
  topics: string[];
  signals: AtlasSignal[];
};

export type AtlasCityRow = {
  id: string;
  name: string;
  country: string;
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

export function mapAtlasWorld(
  cityRows: AtlasCityRow[],
  topicRows: AtlasTopicRow[],
  signalRows: AtlasAmbientSignalRow[],
): AtlasCity[] {
  return [...cityRows]
    .sort((left, right) => left.display_order - right.display_order)
    .map((city) => ({
      id: city.id,
      name: city.name,
      country: city.country,
      lat: Number(city.latitude),
      lng: Number(city.longitude),
      color: city.color,
      category: city.category,
      humanActivity: Number(city.human_activity),
      aiActivity: Number(city.ai_activity),
      growthPercent: Number(city.growth_percent),
      topics: topicRows
        .filter((topic) => topic.city_id === city.id)
        .sort((left, right) => left.rank - right.rank)
        .map((topic) => topic.topic),
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
    }));
}
