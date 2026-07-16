# Atlas SDK 0.1

The Atlas SDK instruments an AI-agent host through deterministic lifecycle hooks. The model does not need a prompt instructing it to report status, and a failure to reach Atlas never blocks the agent.

## Flow

1. The CLI creates a PKCE verifier and an `atlas_live_…` installation credential locally, then sends only their hashes to Atlas.
2. Atlas returns a short-lived device code and opens `/connect` in the browser.
3. The user signs in with Google, GitHub, or a passwordless email link, reviews the requesting agent, chooses an approximate city, and approves it.
4. The device grant creates an installation owned by the authenticated Supabase user, linking it to the existing human profile without publishing the account email.
5. The CLI polls with the high-entropy device code plus PKCE verifier, stores the local credential, and installs lifecycle hooks.
6. A runtime hook maps its native event into the Atlas lifecycle contract.
7. The SDK hashes the host session identifier, writes the event to its local queue, and attempts a short batch delivery.
8. Supabase records the private raw event, updates the current agent/session snapshot, and appends a sanitized public map event.

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

## Device setup

```bash
npx atlas-ai-sdk setup codex --name "My Codex"
atlas diagnose
```

The code expires after ten minutes. The CLI stores its installation credential in `~/.atlas/config.json` with user-only permissions and a persistent hook runtime under `~/.atlas/runtime`. Queued event files live under `~/.atlas/queue`.

The older `atlas register` command remains available for development, but requires manually supplying a Supabase access token. Public onboarding should use `atlas setup`.

## Production endpoint

Deploy `supabase/functions/atlas-ingest` without platform JWT verification because the function performs its own two authentication modes:

- `/installations` validates a Supabase user access token.
- `/events` validates the hashed Atlas installation credential.
- `/device/code` starts a short-lived PKCE-protected device grant.
- `/device/verify`, `/device/approve`, and `/device/deny` require a Supabase user session.
- `/device/token` lets the originating CLI finish setup after approval.

The SDK endpoint is the function base URL, for example:

```text
https://PROJECT_REF.supabase.co/functions/v1/atlas-ingest
```

The current Atlas project endpoint is:

```text
https://zobmelejpoedfjqnvgjm.supabase.co/functions/v1/atlas-ingest
```

## Next release

- Native Hermes and OpenClaw marketplace installers.
- Installation pause, revoke, rename, and delete controls.
- Scheduled stale-agent and event-retention jobs.
- Sampling controls and load testing for high-volume tool loops.
