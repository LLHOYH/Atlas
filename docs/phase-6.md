# Phase 6 — Global Presence Rendering

**Status: In progress — live agent globe foundation delivered**

Phase 6 completes the original presence goal deferred from Phase 5: show participating humans and AI agents across the living world at privacy-safe geographic precision.

## Delivered foundation

- Country surfaces aggregate every non-offline SDK agent plus connected Atlas AI presence into the existing energy bands.
- City-level administrative polygons remain neutral geographic context; energy color and moving surface flow are reserved for country view.
- City zoom renders every working, online, and idle agent as a small, crisp status-colored marker at its reported approximate coordinates; decorative macro particles are not used.
- Agent markers have no artificial city-wide display spread, translucent halo, or pulse. A separate invisible interaction target keeps tiny markers easy to hover and select.
- Agent indicators use a fixed 3.25-pixel screen radius at every City and Deep City zoom depth. Zoom changes only the distance between their reported coordinates; it never enlarges or shrinks the indicator itself.
- City zoom continues past the full progress bar into a deep magnification range, allowing nearby agents to separate visually without introducing a new map level; the readout switches to a live magnification factor and drag sensitivity reduces as depth increases.
- Progressive city labels remain visible from the moment the globe enters city level, while denser labels and legitimate city polygons load at deeper bands.
- County or equivalent ADM2 borders remain as the complete geographic context beneath sparse municipal polygons, so entering the city layer never removes the surrounding borders.
- Hovering an agent shows its name, runtime, state, and current activity; selecting it opens the existing agent profile.
- Connected AI presence records use the same marker and energy pipeline as SDK telemetry when their city matches the Atlas catalog.
- The WebGL and 2D compatibility renderers expose the same country-energy-to-individual-agent hierarchy.
- Supabase realtime updates already flow through `useAtlasWorld`, so agent status and coordinates refresh the rendered globe without a page reload.

## Target outcome

- Every authorized human and agent with a valid presence signal contributes to the globe.
- Country view aggregates people, agents, status, and energy without exposing individuals unnecessarily.
- City zoom reveals eligible individual presences at their permitted approximate locations.
- Live, working, idle, stale, and offline states update from Supabase without a page reload.
- Dense areas remain readable through restrained marker scale, level-of-detail limits, and GPU-efficient rendering.
- Selecting a visible person or agent opens the correct profile without losing map context.

## Privacy boundary

- Location is user-approved and approximate by default.
- Precise GPS coordinates, prompts, responses, files, commands, and private work content remain outside the Atlas telemetry protocol.
- Individual markers appear only at a geographic precision permitted by the owner and Atlas policy.
- Low-density areas must use aggregation or obfuscation when an individual marker could reveal an overly precise location.

## Starting point

Phase 5 provides the global administrative hierarchy, populated-place catalog, reliable hover and selection geometry, calibrated zoom model, Supabase agent records, and an existing limited street-level agent renderer. The first Phase 6 increment now connects those pieces into one agent-presence pipeline. Remaining work is to add human-presence policy, low-density obfuscation, production-scale marker load testing, and any privacy-driven aggregation required by policy.
