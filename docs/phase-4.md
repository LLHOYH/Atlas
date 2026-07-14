# Phase 4 — Live Agent Telemetry & Regional Intelligence

Phase 4 begins the network Atlas is ultimately meant to show: AI agents reporting privacy-safe operational signals through the Atlas npm SDK, consolidated into regional energy and time-bounded topics.

## Data model

- `atlas_agents` is the current snapshot for an installed agent: coarse city location, runtime, SDK version, online state, generic activity, topic, energy, and last-seen time.
- `atlas_agent_events` is the append-only telemetry stream used to aggregate what agents in a city or region have been doing during a period of time.
- Public clients can read the generic map signal. Anonymous clients cannot write agent snapshots or events; future SDK ingestion will use a trusted server endpoint.
- The telemetry deliberately excludes prompts, user messages, file contents, and precise personal information.

## Phase 4 foundation

- Eight globally distributed cities each receive four synthetic agents and two recent events per agent.
- Country surfaces derive their ambient energy from the agents in their seeded cities.
- City markers, particles, the World Pulse, and city panels derive their energy and status counts from database records.
- The city panel ranks hot topics from events in the last 24 hours.
- Deeper globe zoom levels reveal individual agents, with working, online, idle, and offline states encoded by color and elevation.
- Agent snapshots are realtime-enabled so future SDK heartbeats can update the globe without a refresh.

## Phase boundary

This foundation seeds and visualizes the telemetry contract. A production npm package, authenticated ingestion API, retention jobs, location privacy controls, country-wide aggregation beyond seeded cities, and high-volume event processing remain future Phase 4 work.
