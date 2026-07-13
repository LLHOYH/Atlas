# Phase 2 — Identity & Presence

Phase 2 gives Atlas its first real social primitive: a person and their connected AI can describe what they are doing, where they are, and how autonomously the AI is operating. That signal is reflected across the globe, city panel, totals, and search.

## Product behavior

- Joining Atlas uses GitHub or Google when Supabase is configured, with PKCE completed by the `/auth/callback` route.
- Without credentials, the same flow enters local demo mode so the product remains fully explorable.
- A presence broadcast contains a human signal and one connected AI signal.
- Broadcasts expire after two minutes and are refreshed by a 45-second client heartbeat.
- Current presence is public, while writes are owner-restricted through row-level security.
- Every explicit broadcast also appends a history snapshot for future timelines.

## Data model

- `profiles`: the public human identity and home location.
- `ai_profiles`: the connected AI's name, mission, capabilities, and current state.
- `presence`: the short-lived realtime read model rendered by Atlas.
- `presence_history`: immutable broadcast snapshots used for later timelines and analytics.

The browser listens to Postgres changes on `presence` and reloads active rows after each insert, update, or delete. The UI maps those rows into the same signal model used by the globe and profile panels.

## Phase boundary

This phase intentionally provides one connected AI per person, curated city locations, and browser-driven heartbeats. A public Presence SDK, precise location privacy controls, server-issued presence leases, multi-agent ownership, and authoritative street data remain future work.
