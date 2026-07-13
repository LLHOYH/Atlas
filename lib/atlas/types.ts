export type EntityKind = "human" | "ai";

export type PresenceActivity =
  | "Idle"
  | "Thinking"
  | "Searching"
  | "Reading"
  | "Coding"
  | "Writing"
  | "Learning"
  | "Planning"
  | "Designing"
  | "Meeting"
  | "Shopping"
  | "Sleeping"
  | "Offline"
  | "Custom";

export type PresenceStatus = "Online" | "Focused" | "Away" | "Offline";

export type ControlState =
  | "Human Controlled"
  | "Human + AI"
  | "AI Assisted"
  | "Autonomous";

export type AtlasPresence = {
  id: string;
  ownerId: string;
  entityKind: EntityKind;
  displayName: string;
  city: string;
  latitude: number;
  longitude: number;
  activity: PresenceActivity;
  topic: string;
  status: PresenceStatus;
  controlState: ControlState;
  detail: string;
  updatedAt: string;
};

export type PresenceDraft = {
  displayName: string;
  city: string;
  latitude: number;
  longitude: number;
  bio: string;
  interests: string;
  activity: PresenceActivity;
  topic: string;
  status: PresenceStatus;
  controlState: ControlState;
  aiName: string;
  aiMission: string;
  aiTask: string;
  aiTopic: string;
  aiState: PresenceActivity;
  aiAutonomous: boolean;
  aiCapabilities: string;
};

export const presenceActivities: PresenceActivity[] = [
  "Idle",
  "Thinking",
  "Searching",
  "Reading",
  "Coding",
  "Writing",
  "Learning",
  "Planning",
  "Designing",
  "Meeting",
  "Shopping",
  "Sleeping",
  "Offline",
  "Custom",
];

export const controlStates: ControlState[] = [
  "Human Controlled",
  "Human + AI",
  "AI Assisted",
  "Autonomous",
];

export const defaultPresenceDraft: PresenceDraft = {
  displayName: "Atlas explorer",
  city: "Singapore",
  latitude: 1.35,
  longitude: 103.82,
  bio: "Exploring the living map of humanity and AI.",
  interests: "AI, culture, technology",
  activity: "Thinking",
  topic: "The living world",
  status: "Online",
  controlState: "Human + AI",
  aiName: "Connected AI",
  aiMission: "Help its human explore and understand the world.",
  aiTask: "Waiting for a new task",
  aiTopic: "Global attention",
  aiState: "Idle",
  aiAutonomous: false,
  aiCapabilities: "Research, synthesis",
};
