# Atlas

> A living map of humanity and AI.

Atlas is an interactive product prototype for exploring global attention through a living Earth. The globe—not a feed—is the interface.

## Project status

**Phase 4 — Live Agent Telemetry, Atlas SDK & Regional Intelligence · In progress**

Phase 1 established Atlas's visual foundation. Phase 2 added database-backed identity and presence. Phase 3 completed global geographic detail. Phase 4 connects privacy-safe agent telemetry to the map: regional energy, 24-hour hot topics, live status, and individual agents at deeper zoom levels.

The first `atlas-ai-sdk` implementation now provides a framework-neutral Node.js client, an offline event queue, a CLI, Codex and Claude Code hook installers, normalized Hermes and OpenClaw adapters, account-linked device authorization, and idempotent event ingestion. Its event schema accepts only controlled lifecycle state; prompts, responses, tool arguments, tool output, commands, file paths, URLs, and repository names are outside the protocol.

The world catalog now comes from Supabase. Google/GitHub OAuth, passwordless email sign-in, Postgres persistence, row-level security, presence heartbeats, history, and realtime map updates are enabled once the project credentials and providers are configured.

## What is included

- A fixed-camera, momentum-driven pixel globe
- Zoom-driven country, state/region, city, and street detail levels
- Worldwide labels for 176 countries, 294 first-level regions, and 243 major cities
- Whole-country silhouette hover elevation with complete interior hit detection
- Seamless deep-zoom transition into a global north-up OpenStreetMap vector street view
- Direct continent tabs for North America, South America, Europe, Africa, Asia, and Oceania
- Database-backed agent snapshots with online, working, idle, and offline status
- Privacy-safe `atlas-ai-sdk` lifecycle client with offline delivery
- Automatic Codex, Claude Code, Hermes, and OpenClaw lifecycle normalization
- Hashed installation credentials and authenticated batch ingestion
- Browser-approved device setup that links agents to the signed-in human profile
- A profile collection showing every agent owned by the current account
- Time-series agent events for 24-hour regional topic and energy aggregation
- Zoom-driven individual agent markers with current activity and runtime details
- Country boundary geometry and city-level attention-flow arcs
- Switchable attention, AI, technology, and travel layers
- Natural-language-style search across cities, topics, humans, and AI
- Live city signal panels and entity profiles
- Human and connected-AI presence editor
- Presence-aware globe intensity, city feeds, world totals, and search
- Supabase-ready GitHub/Google authentication and realtime persistence
- Database-backed seeded cities, topics, activity totals, and ambient profiles
- Repeatable seed and database verification scripts
- Responsive layouts for desktop and mobile

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Configure Supabase

1. Create a Supabase project and link the local CLI to it.
2. Enable email plus GitHub and/or Google under Supabase Authentication providers. Add `http://localhost:3000/auth/callback` and the equivalent production URL to the Supabase redirect allow list.
3. Copy `.env.example` to `.env.local` and add the project URL and publishable key.
4. Apply the migrations and idempotent world seed:

```bash
npm run db:seed
```

5. Restart the development server.

The seed creates eight cities, 24 ranked topics, and 17 ambient signals. Catalog tables are public-read and database-owned. Row-level security restricts profile, AI, presence, and history writes to the authenticated owner.

## Atlas SDK development

```bash
npm run sdk:build
npm run sdk:test
```

The package lives in `packages/sdk`. During local development, register agents against `http://localhost:3000/api/atlas/v1`. Production ingestion is also implemented as the `atlas-ingest` Supabase Edge Function so SDK traffic does not depend on the private Atlas dashboard deployment.

Public setup is designed to run as `npx atlas-ai-sdk setup codex --name "My Codex"`. It opens a ten-minute browser approval page, links the device to the authenticated Atlas account, persists a lightweight hook runtime, and never asks the user to paste a Supabase access token.

## Validate

```bash
npm test
npm run test:db
```

The baseline world pulse and ambient profiles are realistic seeded database records. Authenticated presence broadcasts are layered into that world live.

Country geometry and global labels are generated from Natural Earth data. Deep street detail uses OpenFreeMap's OpenMapTiles-compatible vector service with data from OpenStreetMap; attribution is shown in the map.
