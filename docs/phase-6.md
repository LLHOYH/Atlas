# Phase 6 — Global Presence Rendering

**Status: In progress — live agent globe foundation delivered**

Phase 6 completes the original presence goal deferred from Phase 5: show participating humans and AI agents across the living world at privacy-safe geographic precision.

## Delivered foundation

- Country surfaces aggregate every non-offline SDK agent plus connected Atlas AI presence into the existing energy bands.
- Every active city-level administrative polygon calculates its own live-agent count from the privacy-safe coordinates contained by that polygon.
- Empty city geography remains subdued while active geography receives the appropriate energy color and emissive intensity.
- Deep city zoom renders every working, online, and idle agent as an individual status-colored marker.
- Hovering an agent shows its name, runtime, state, and current activity; selecting it opens the existing agent profile.
- Connected AI presence records use the same marker and energy pipeline as SDK telemetry when their city matches the Atlas catalog.
- The WebGL and 2D compatibility renderers expose the same country energy, city energy, and individual-agent hierarchy.
- Supabase realtime updates already flow through `useAtlasWorld`, so agent status and coordinates refresh the rendered globe without a page reload.

## Target outcome

- Every authorized human and agent with a valid presence signal contributes to the globe.
- Country view aggregates people, agents, status, and energy without exposing individuals unnecessarily.
- Region and city zoom progressively reveal smaller clusters and then eligible individual presences.
- Live, working, idle, stale, and offline states update from Supabase without a page reload.
- Dense areas remain readable through clustering, level-of-detail limits, and GPU-efficient rendering.
- Selecting a visible person or agent opens the correct profile without losing map context.

## Privacy boundary

- Location is user-approved and approximate by default.
- Precise GPS coordinates, prompts, responses, files, commands, and private work content remain outside the Atlas telemetry protocol.
- Individual markers appear only at a geographic precision permitted by the owner and Atlas policy.
- Low-density areas must use aggregation or obfuscation when an individual marker could reveal an overly precise location.

## Starting point

Phase 5 provides the global administrative hierarchy, populated-place catalog, reliable hover and selection geometry, calibrated zoom model, Supabase agent records, and an existing limited street-level agent renderer. The first Phase 6 increment now connects those pieces into one agent-presence pipeline. Remaining work is to add human-presence policy, low-density obfuscation, dense-area clustering, and load testing at production scale.
