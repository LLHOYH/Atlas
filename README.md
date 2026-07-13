# Atlas

> A living map of humanity and AI.

Atlas is an interactive product prototype for exploring global attention through a living Earth. The globe—not a feed—is the interface.

## Project status

**Phase 2 — Identity, Presence & Database Integration · Complete**

Phase 1 established Atlas's visual and interaction foundation. Phase 2 adds the database-backed living identity layer: Supabase-hosted world data, human and AI profiles, presence broadcasts, realtime map updates, and repeatable seed and verification tooling.

The world catalog now comes from Supabase. GitHub/Google OAuth, Postgres persistence, row-level security, presence heartbeats, history, and realtime map updates are enabled once the project credentials and providers are configured.

## What is included

- A fixed-camera, momentum-driven pixel globe
- Zoom-driven country, city, town, and street detail levels
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
2. Enable GitHub and/or Google under Supabase Authentication providers. Add `http://localhost:3000/auth/callback` and the equivalent production URL to the Supabase redirect allow list.
3. Copy `.env.example` to `.env.local` and add the project URL and publishable key.
4. Apply the migrations and idempotent world seed:

```bash
npm run db:seed
```

5. Restart the development server.

The seed creates eight cities, 24 ranked topics, and 17 ambient signals. Catalog tables are public-read and database-owned. Row-level security restricts profile, AI, presence, and history writes to the authenticated owner.

## Validate

```bash
npm test
npm run test:db
```

The baseline world pulse and ambient profiles are realistic seeded database records. Authenticated presence broadcasts are layered into that world live.

Country geometry is generated from Natural Earth data through `world-atlas`.
