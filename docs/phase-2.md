# Phase 2 — Identity & Presence

Phase 2 gives Atlas its first real social primitive: a person and their connected AI can describe what they are doing, where they are, and how autonomously the AI is operating. That signal is reflected across the globe, city panel, totals, and search.

## Product behavior

- Joining Atlas uses GitHub or Google when Supabase is configured, with PKCE completed by the `/auth/callback` route.
- Cities, ranked topics, activity totals, and ambient profiles are loaded from Supabase rather than bundled into the frontend.
- A presence broadcast contains a human signal and one connected AI signal.
- Broadcasts expire after two minutes and are refreshed by a 45-second client heartbeat.
- Current presence is public, while writes are owner-restricted through row-level security.
- Every explicit broadcast also appends a history snapshot for future timelines.

## Data model

- `profiles`: the public human identity and home location.
- `ai_profiles`: the connected AI's name, mission, capabilities, and current state.
- `presence`: the short-lived realtime read model rendered by Atlas.
- `presence_history`: immutable broadcast snapshots used for later timelines and analytics.
- `atlas_cities`: curated geography, display order, colors, and human/AI activity totals.
- `atlas_city_topics`: three ranked attention topics per seeded city.
- `atlas_ambient_signals`: database-owned human and AI profiles that make the unclaimed world feel alive.

The browser loads the world catalog directly from the three `atlas_*` tables, then listens to Postgres changes on `presence` and layers active authenticated rows on top. `npm run db:seed` safely upserts the curated dataset and verifies the public read model after every run.

## Phase boundary

This phase intentionally provides one connected AI per person, curated city locations, and browser-driven heartbeats. A public Presence SDK, precise location privacy controls, server-issued presence leases, multi-agent ownership, and authoritative street data remain future work.
