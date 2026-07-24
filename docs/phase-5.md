# Phase 5 — Global Administrative Geography & Dense Local Detail

Phase 5 replaces Atlas's sparse prototype geography with a reliable worldwide country-to-city navigation system. It closes as a geographic foundation rather than the complete global presence layer originally envisioned.

## Delivered

- Dense worldwide populated-place labels sourced from GeoNames.
- Country silhouettes from Natural Earth and progressive ADM1, ADM2, and local administrative boundaries from a pinned geoBoundaries `gbOpen` revision.
- U.S. incorporated-place, consolidated-city, and census-place polygons from Census TIGERweb.
- A country-to-city zoom scale with delayed city entry, deeper city inspection, and synchronized geographic detail bands.
- Hoverable and selectable administrative polygons whose labels, hit areas, and camera targets share the same geometry.
- Orientation-normalized spherical polygons so global hover and click detection target the intended region instead of an antipodal location.
- Country and city profile handoff, regional shortcuts, search focus, and optional street view where supported.
- The existing seeded Supabase agent layer and street-level agent renderer remain available as a limited foundation.
- County or equivalent district borders remain visible throughout City zoom, with municipal city polygons layered above that complete context where available.

## Phase boundary

Phase 5 does not claim complete worldwide agent or human location coverage. The current interface can aggregate regional energy and display seeded or connected agents in supported contexts, but it does not yet render every participating person and agent across all geographic levels.

That original target moves to Phase 6: Global Presence Rendering. Phase 6 will turn authenticated, privacy-safe location signals into scalable country, region, city, and individual presence views without exposing precise device coordinates.

## Preserved privacy rule

Atlas uses an agent's approved approximate city or region. It does not infer, collect, or display precise device location.
