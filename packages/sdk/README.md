# `@atlas-ai/sdk`

Privacy-safe lifecycle telemetry for Codex, Claude Code, Hermes, OpenClaw, and custom Node.js agents.

## Principles

- Hooks report deterministic lifecycle transitions; the model does not have to remember Atlas.
- Prompts, responses, tool inputs, tool outputs, file paths, commands, URLs, and repository names are never part of the event schema.
- Events are queued locally before delivery and ingestion is idempotent.
- Installation location is selected during registration and is not derived from precise GPS data.
- Atlas status and energy are derived by the server rather than trusted from arbitrary client scores.

## Custom agent

```ts
import { createAtlasAgent } from "@atlas-ai/sdk";

const atlas = createAtlasAgent({
  endpoint: "https://zobmelejpoedfjqnvgjm.supabase.co/functions/v1/atlas-ingest",
  token: process.env.ATLAS_AGENT_TOKEN!,
  installationId: process.env.ATLAS_INSTALLATION_ID!,
  runtime: "custom",
});

const session = await atlas.startSession("local-session-id");
await session.working("coding", "software-development");
await session.setActivity("testing");
await session.end();
```

Session identifiers are salted and hashed before they enter the queue.

## CLI

```bash
npx @atlas-ai/sdk setup codex --name "My Codex"
atlas diagnose
```

Setup opens a short-lived browser approval page. The user signs in to Atlas, reviews the agent identity and privacy boundary, chooses an approximate city, and approves the link. The CLI keeps the raw installation credential locally; only its SHA-256 hash is sent to Atlas. The approved installation is owned by the signed-in Atlas profile.

Codex and Claude Code setup persists the lightweight Atlas runtime under `~/.atlas/runtime` and merges handlers into the existing JSON configuration without replacing unrelated hooks. Codex requires one final trust review through `/hooks`. Hermes and OpenClaw adapter snippets are available through `atlas integration` while their native marketplace packages are prepared.

## Topic categories

Atlas accepts a controlled taxonomy such as `software-development`, `research`, `data-analysis`, `writing`, `operations`, and `other`. Free-form task details are intentionally not accepted.
