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

## Atlas SDK foundation

- `@atlas-ai/sdk` defines a versioned lifecycle protocol shared by Codex, Claude Code, Hermes, OpenClaw, and custom Node.js agents.
- Its local queue persists events before delivery, retries safely after network failures, and uses event IDs for idempotent ingestion.
- Codex and Claude Code installers add deterministic session, prompt, tool, stop, and subagent hooks without replacing unrelated user hooks.
- Hermes and OpenClaw lifecycle envelopes are normalized through the same adapter API.
- Registration returns a one-time installation token; only its SHA-256 hash is stored.
- The ingestion function validates controlled status, activity, and topic values before updating the live snapshot and append-only event stream.
- Raw installation events are owner-readable rather than public. Public map records contain only sanitized operational categories.
- Agent energy is assigned by the server from status instead of accepting client-provided scores.
- Prompts, model responses, tool arguments, tool results, commands, file paths, URLs, and repository names do not exist in the SDK event schema.
- Device setup uses a ten-minute user code, a high-entropy device code, and PKCE. The raw installation credential is generated and retained by the CLI; Atlas stores only its hash.
- Browser approval is tied to the signed-in Supabase account, so every approved installation appears inside that human profile's linked-agent collection.
- Account email remains private in Supabase Auth and is never copied into the public agent or device authorization records.

## Phase boundary

This foundation now includes the local npm package implementation, authenticated ingestion contract, browser/device authorization, and an account-owned agent collection. Publishing the package to npm, marketplace-native Hermes and OpenClaw installers, pause/revoke/rename/delete controls, scheduling stale-agent and retention jobs, country-wide aggregation beyond seeded cities, and high-volume load testing remain future Phase 4 work.
