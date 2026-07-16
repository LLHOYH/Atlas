export const ATLAS_PROTOCOL_VERSION = "1.0" as const;
export const ATLAS_SDK_VERSION = "0.1.0" as const;

export const atlasStatuses = ["online", "working", "idle", "offline"] as const;
export const atlasEventTypes = [
  "session.started",
  "session.heartbeat",
  "session.ended",
  "turn.started",
  "turn.completed",
  "tool.started",
  "tool.completed",
  "status.changed",
  "activity.changed",
  "topic.changed",
] as const;
export const atlasActivities = [
  "planning",
  "coding",
  "testing",
  "debugging",
  "reviewing",
  "searching",
  "writing",
  "deploying",
  "monitoring",
  "waiting-for-user",
  "working",
  "idle",
] as const;
export const atlasTopics = [
  "software-development",
  "research",
  "data-analysis",
  "writing",
  "design",
  "operations",
  "communication",
  "education",
  "finance",
  "travel",
  "creative-work",
  "other",
] as const;

export type AtlasStatus = (typeof atlasStatuses)[number];
export type AtlasEventType = (typeof atlasEventTypes)[number];
export type AtlasActivity = (typeof atlasActivities)[number];
export type AtlasTopic = (typeof atlasTopics)[number];

export type AtlasEvent = {
  schema_version: typeof ATLAS_PROTOCOL_VERSION;
  event_id: string;
  installation_id: string;
  session_id: string;
  sequence: number;
  event: AtlasEventType;
  occurred_at: string;
  runtime: {
    name: string;
    version: string;
    adapter_version: string;
  };
  state: {
    status: AtlasStatus;
    activity: AtlasActivity;
    topic: AtlasTopic;
  };
};

export type AtlasEventDraft = {
  event: AtlasEventType;
  sessionId?: string;
  status?: AtlasStatus;
  activity?: AtlasActivity;
  topic?: AtlasTopic;
  occurredAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new TypeError(`Invalid Atlas event field: ${field}`);
  }
  return value.trim();
}

function oneOf<T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new TypeError(`Invalid Atlas event field: ${field}`);
  }
  return value as T[number];
}

export function sanitizeAtlasEvent(input: unknown): AtlasEvent {
  if (!isRecord(input) || !isRecord(input.runtime) || !isRecord(input.state)) {
    throw new TypeError("Invalid Atlas event envelope");
  }
  const occurredAt = requiredString(input.occurred_at, "occurred_at", 40);
  if (!Number.isFinite(Date.parse(occurredAt))) throw new TypeError("Invalid Atlas event timestamp");
  const sequence = Number(input.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new TypeError("Invalid Atlas event sequence");

  return {
    schema_version: oneOf(input.schema_version, [ATLAS_PROTOCOL_VERSION] as const, "schema_version"),
    event_id: requiredString(input.event_id, "event_id", 100),
    installation_id: requiredString(input.installation_id, "installation_id", 100),
    session_id: requiredString(input.session_id, "session_id", 128),
    sequence,
    event: oneOf(input.event, atlasEventTypes, "event"),
    occurred_at: new Date(occurredAt).toISOString(),
    runtime: {
      name: requiredString(input.runtime.name, "runtime.name", 40),
      version: requiredString(input.runtime.version ?? "unknown", "runtime.version", 40),
      adapter_version: requiredString(input.runtime.adapter_version, "runtime.adapter_version", 40),
    },
    state: {
      status: oneOf(input.state.status, atlasStatuses, "state.status"),
      activity: oneOf(input.state.activity, atlasActivities, "state.activity"),
      topic: oneOf(input.state.topic, atlasTopics, "state.topic"),
    },
  };
}

export function sanitizeAtlasEventBatch(input: unknown, maximum = 100): AtlasEvent[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > maximum) {
    throw new TypeError(`Atlas event batches must contain 1-${maximum} events`);
  }
  return input.map(sanitizeAtlasEvent);
}
