# Phase 3 — Geographic LOD & Global Street Detail

Phase 3 turns Atlas from a stylized world overview into a navigable geographic interface. The globe now carries worldwide labels, true country silhouettes, zoom-dependent levels of detail, regional shortcuts, and a seamless path into named streets and three-dimensional buildings.

## Product behavior

- The globe remains stationary until the user drags it, with north consistently pointing up.
- Drag direction follows the physical globe: dragging upward rolls the surface upward and reveals more of the southern view.
- Scroll and pinch gestures zoom from countries through regions and cities into street detail.
- Country, state/region, and city labels cover the world rather than a single market.
- Countries render from complete boundary silhouettes. Hovering anywhere inside a country raises and illuminates the whole country shape in gold.
- Deep zoom transitions into a north-up MapLibre street map with named roads and hover-responsive three-dimensional buildings.
- Direct tabs jump to North America, South America, Europe, Africa, Asia, and Oceania without a dropdown or automatic globe spin.

## Geographic pipeline

- `app/atlas-geo-data.json` stores generated country polygon geometry derived from Natural Earth data.
- `app/atlas-label-data.json` stores generated country, first-level region, and major-city labels.
- The globe uses the generated geometry for rendering and full-interior hover detection.
- Deep street detail uses OpenFreeMap's OpenMapTiles-compatible vector service with OpenStreetMap data and visible attribution.
- Automated checks verify global label coverage, valid coordinates, complete country polygons, and the six regional navigation tabs.

## Phase boundary

This phase completes the global navigation and geographic-detail foundation. Country silhouettes are the globe-level extrusion unit; deeper city and street detail is provided through global labels, vector streets, and building features. True state or city polygon extrusion, authoritative real-time geographic feeds, and offline tile ownership remain future work.
