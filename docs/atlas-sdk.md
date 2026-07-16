# Atlas SDK 0.1

The Atlas SDK instruments an AI-agent host through deterministic lifecycle hooks. The model does not need a prompt instructing it to report status, and a failure to reach Atlas never blocks the agent.

## Flow

1. The user signs in to Atlas and registers an installation through the CLI.
2. Atlas returns a one-time `atlas_live_…` credential and stores only its SHA-256 hash.
3. A runtime hook maps its native event into the Atlas lifecycle contract.
4. The SDK hashes the host session identifier, writes the event to its local queue, and attempts a short batch delivery.
5. The ingestion API validates the installation, protocol version, event type, controlled state values, and event identity.
6. Supabase records the private raw event, updates the current agent/session snapshot, and appends a sanitized public map event.

## Lifecycle mapping

| Atlas event | Typical host event | Result |
| --- | --- | --- |
| `session.started` | `SessionStart`, `on_session_start`, `session_start` | Agent becomes online |
| `turn.started` | `UserPromptSubmit`, `pre_llm_call`, `before_agent_run` | Agent becomes working |
| `tool.started` | `PreToolUse`, `pre_tool_call`, `before_tool_call` | Activity derives from the tool category |
| `tool.completed` | `PostToolUse`, `post_tool_call`, `after_tool_call` | Working heartbeat is refreshed |
| `turn.completed` | `Stop`, `post_llm_call`, `agent_end` | Agent returns online |
| `session.ended` | `SessionEnd`, `on_session_end`, `session_end` | Agent becomes offline |

The adapter reads event names, session identifiers, and tool names. It deliberately ignores prompt text, tool arguments, outputs, paths, commands, URLs, and conversation history.

## Local registration

```bash
atlas register \
  --endpoint http://localhost:3000/api/atlas/v1 \
  --access-token "$SUPABASE_ACCESS_TOKEN" \
  --name "My Codex" \
  --runtime codex \
  --city singapore

atlas install codex
atlas diagnose
```

The CLI stores its installation credential in `~/.atlas/config.json` with user-only permissions. Queued event files live under `~/.atlas/queue`.

## Production endpoint

Deploy `supabase/functions/atlas-ingest` without platform JWT verification because the function performs its own two authentication modes:

- `/installations` validates a Supabase user access token.
- `/events` validates the hashed Atlas installation credential.

The SDK endpoint is the function base URL, for example:

```text
https://PROJECT_REF.supabase.co/functions/v1/atlas-ingest
```

The current Atlas project endpoint is:

```text
https://zobmelejpoedfjqnvgjm.supabase.co/functions/v1/atlas-ingest
```

## Next release

- Device/browser login so users never paste a Supabase access token.
- Native Hermes and OpenClaw marketplace installers.
- Installation list, pause, revoke, rename, and delete UI.
- Scheduled stale-agent and event-retention jobs.
- Sampling controls and load testing for high-volume tool loops.
