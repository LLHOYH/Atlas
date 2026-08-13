# Phase 8 — Map Clarity & Interaction Polish

**Status: In progress**

Phase 8 tightens the visual and interaction system around the Phase 5 geography and Phase 6 live-agent renderer.

## First increment: boundary clarity

- Render exactly one administrative hierarchy at a time: ADM1 at broad city entry, ADM2 closer in, then a legitimate municipal or deepest published local layer.
- Stop stacking district context beneath municipal or local-administration polygons.
- Use one crisp cyan base outline instead of a second scaled glow copy.
- Keep hover and selection attached to the active polygon geometry, with gold elevation reserved for the area under the pointer.
- Apply the same single-hierarchy rule to the WebGL globe and the 2D compatibility renderer.

## Next increments

- Continue reducing label collisions in dense metropolitan regions.
- Refine hover arbitration where agent markers, labels, and administrative surfaces overlap.
- Tune boundary opacity and label density independently by country and zoom depth.
- Validate interaction and rendering performance against high-density boundary sets.
