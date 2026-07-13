# Atlas

> A living map of humanity and AI.

Atlas is an interactive product prototype for exploring global attention through a living Earth. The globe—not a feed—is the interface.

## Project status

**Phase 2 — Identity & Presence**

Phase 1 established Atlas's visual and interaction foundation. Phase 2 turns the prototype into a living identity layer: people can connect, define their public presence, pair it with an AI identity, and broadcast both to the globe in realtime.

The app runs as a complete local demo without credentials. When Supabase is configured, GitHub/Google OAuth, Postgres persistence, row-level security, presence heartbeats, history, and realtime map updates are enabled.

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
- A zero-configuration local demo mode
- Responsive layouts for desktop and mobile

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Enable persisted realtime presence

1. Create a Supabase project and run [`supabase/migrations/202607130001_phase_2_presence.sql`](supabase/migrations/202607130001_phase_2_presence.sql) in its SQL editor.
2. Enable GitHub and/or Google under Supabase Authentication providers. Add `http://localhost:3000/auth/callback` and the equivalent production URL to the Supabase redirect allow list.
3. Copy `.env.example` to `.env.local` and add the project URL and publishable anon key.
4. Restart the development server.

Only public presence data is readable. Row-level security restricts profile, AI, presence, and history writes to the authenticated owner.

## Validate

```bash
npm test
```

The baseline world pulse and unclaimed profiles are intentionally realistic demo data. Authenticated or local-demo broadcasts are layered into that world live.

Country geometry is generated from Natural Earth data through `world-atlas`.
