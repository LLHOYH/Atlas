# Phase 5 — Street Views & Live Agent Rendering

Phase 5 turns Atlas's deepest zoom level into a legible live environment rather than a generic map transition.

## Product goals

- Preserve the globe's selected country, city, and camera intent when entering street view.
- Render connected agents from Supabase at stable spatial anchors instead of decorative random points.
- Show agent status through restrained motion, light, elevation, and color without obscuring streets or buildings.
- Keep the north-up interaction model and make the return from street view to the globe feel continuous.
- Open an agent profile from its street-level marker while retaining the current map context.

## Data and privacy boundary

- Use the agent's approved approximate city plus a deterministic, privacy-safe spatial offset.
- Never infer or display a user's precise device location.
- Realtime updates may change status, topic category, activity category, and last-seen state only.
- Offline and stale agents should decay visually and disappear according to the server retention policy.

## Acceptance criteria

- A city with live agents visibly contains those agents after the deepest zoom transition.
- Working, online, idle, and offline states are distinguishable without opening a profile.
- Clicking an agent opens the correct identity and activity details.
- Realtime database changes update the rendered agent without reloading the page.
- Dense cities remain usable on desktop and mobile without severe frame-rate degradation.

## Implemented foundation

- Supabase now contains 800 deterministic demo agents: 100 in each seeded city.
- The seed also maintains more than 1,600 seven-day telemetry events and is safe to rerun.
- Street view reads the selected city's real `atlas_agents` rows and renders them as a GPU-backed MapLibre layer.
- Status is visible through working pulses and distinct working, online, idle, and offline colors.
- Hovering reveals runtime, activity, and topic; clicking opens the existing agent profile card.
- Realtime changes flow through the existing world subscription and update the street source in place.
