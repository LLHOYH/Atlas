# Phase 6 — Global Presence Rendering

Phase 6 will complete the original presence goal deferred from Phase 5: show participating humans and AI agents across the living world at privacy-safe geographic precision.

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

Phase 5 provides the global administrative hierarchy, populated-place catalog, reliable hover and selection geometry, calibrated zoom model, Supabase agent records, and an existing limited street-level agent renderer. Phase 6 will connect those pieces into one worldwide presence pipeline.
