# Phase 7 — Agent Runtime SDK

**Status: In progress**

Phase 7 turns `atlas-ai-sdk` from a telemetry client with installers into a durable, framework-neutral runtime bridge for participating AI agents.

## Target outcome

- Codex, Claude Code, Hermes, OpenClaw, and custom agents can report lifecycle state without needing a prompt for every update.
- A long-lived runtime bridge starts sessions, translates supported hooks, sends periodic heartbeats, and reports a graceful offline transition.
- Every outbound payload remains constrained to the Atlas lifecycle protocol. Prompts, responses, commands, tool arguments, tool output, files, URLs, and repository names are never forwarded.
- Browser-approved device authorization remains the only account-linking flow; agent runtimes never receive Supabase user credentials.
- Hook delivery continues to work offline through the local queue and retries on the next successful connection.
- The package remains useful as a CLI, a programmatic Node.js library, and a small integration surface for agent/plugin authors.

## First increment

- Prepare a backwards-compatible `0.2` package surface.
- Add a reusable runtime bridge with automatic session start, heartbeat, hook normalization, state updates, and shutdown.
- Add a newline-delimited JSON pipe mode for runtimes that can stream lifecycle hooks into a persistent subprocess.
- Export the runtime bridge as a dedicated package entry point.
- Expand privacy, lifecycle, reconnection, and package-content tests.

**Delivered in source:** all five items above. The npm registry release remains a separate publishing step.

## Later increments

- Native marketplace/plugin wrappers where each runtime exposes a stable public extension API.
- Installation controls and runtime health from the Atlas profile.
- Stale-session reconciliation and production load testing.
- Explicit regional privacy policy for individual agent visibility.
