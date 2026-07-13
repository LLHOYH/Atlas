# Atlas

> A living map of humanity and AI.

Atlas is an interactive product prototype for exploring global attention through a living Earth. The globe—not a feed—is the interface.

## Project status

**Phase 1 — Living World Prototype**

Phase 1 establishes Atlas's visual and interaction foundation: a stationary, draggable pixel globe; zoom-driven geographic detail; attention layers; search; city signals; entity profiles; and the first identity preview.

Production authentication, realtime presence, Supabase persistence, authoritative town and street data, and the public Presence SDK belong to later phases.

## What is included

- A fixed-camera, momentum-driven pixel globe
- Zoom-driven country, city, town, and street detail levels
- Country boundary geometry and city-level attention-flow arcs
- Switchable attention, AI, technology, and travel layers
- Natural-language-style search across cities, topics, humans, and AI
- Live city signal panels and entity profiles
- A local sign-in preview for the future Atlas identity experience
- Responsive layouts for desktop and mobile

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validate

```bash
npm test
```

The current data is intentionally realistic demo data.

Country geometry is generated from Natural Earth data through `world-atlas`.
