import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { geoContains } from "d3-geo";

const labelData = JSON.parse(
  await readFile(new URL("../app/atlas-label-data.json", import.meta.url), "utf8"),
);
const geoData = JSON.parse(
  await readFile(new URL("../app/atlas-geo-data.json", import.meta.url), "utf8"),
);
const experienceSource = await readFile(
  new URL("../app/AtlasExperience.tsx", import.meta.url),
  "utf8",
);
const globalStylesSource = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const labelGeneratorSource = await readFile(
  new URL("../scripts/generate-atlas-labels.mjs", import.meta.url),
  "utf8",
);
const placeGeneratorSource = await readFile(
  new URL("../scripts/generate-atlas-places.mjs", import.meta.url),
  "utf8",
);
const placesManifest = JSON.parse(
  await readFile(new URL("../public/atlas-geography/places/manifest.json", import.meta.url), "utf8"),
);
const japanPlaces = JSON.parse(
  await readFile(new URL("../public/atlas-geography/places/JPN.json", import.meta.url), "utf8"),
);
const geographyHookSource = await readFile(
  new URL("../hooks/useAtlasGeography.ts", import.meta.url),
  "utf8",
);
const geographyRouteSource = await readFile(
  new URL("../app/api/atlas/v1/geography/route.ts", import.meta.url),
  "utf8",
);
const cityBoundaryRouteSource = await readFile(
  new URL("../app/api/atlas/v1/city-boundaries/route.ts", import.meta.url),
  "utf8",
);
const worldHookSource = await readFile(
  new URL("../hooks/useAtlasWorld.ts", import.meta.url),
  "utf8",
);
const liveHistoryMigrationSource = await readFile(
  new URL("../supabase/migrations/202607140003_phase_4_live_agent_history.sql", import.meta.url),
  "utf8",
);
const seedSource = await readFile(
  new URL("../supabase/seed.sql", import.meta.url),
  "utf8",
);
const readmeSource = await readFile(new URL("../README.md", import.meta.url), "utf8");
const phaseFiveSource = await readFile(new URL("../docs/phase-5.md", import.meta.url), "utf8");
const phaseSixSource = await readFile(new URL("../docs/phase-6.md", import.meta.url), "utf8");

test("world map labels cover countries, regions, and major cities globally", () => {
  assert.ok(labelData.countries.length >= 170);
  assert.ok(labelData.regions.length >= 290);
  assert.ok(labelData.cities.length >= 240);

  for (const city of ["Singapore", "Tokyo", "Lagos", "London", "São Paulo", "Sydney"]) {
    assert.ok(labelData.cities.some((label) => label.name === city), `Missing ${city}`);
  }

  for (const label of [...labelData.countries, ...labelData.regions, ...labelData.cities]) {
    assert.ok(label.lat >= -90 && label.lat <= 90, `${label.name} has invalid latitude`);
    assert.ok(label.lng >= -180 && label.lng <= 180, `${label.name} has invalid longitude`);
  }

  const russiaLabel = labelData.countries.find((label) => label.name === "Russia");
  assert.deepEqual(
    { lat: russiaLabel?.lat, lng: russiaLabel?.lng },
    { lat: 66.0678, lng: 95.7853 },
  );
  assert.match(labelGeneratorSource, /\["RUS", \{ lat: 66\.0678, lng: 95\.7853 \}\]/);
});

test("dense place catalog covers the world and remains reproducible from GeoNames", () => {
  assert.equal(placesManifest.source.name, "GeoNames");
  assert.equal(placesManifest.source.license, "CC BY 4.0");
  assert.ok(placesManifest.placeCount >= 200_000);
  assert.ok(placesManifest.countryCount >= 240);
  assert.ok(japanPlaces.places.length >= 2_000);
  for (const city of ["Tokyo", "Yokohama", "Osaka", "Kyoto", "Sapporo", "Fukuoka"]) {
    assert.ok(japanPlaces.places.some((place) => place.name === city), `Missing ${city}`);
  }
  assert.match(placeGeneratorSource, /cities500\.zip/);
  assert.match(placeGeneratorSource, /CC BY 4\.0/);
  assert.match(placeGeneratorSource, /columns\[6\] !== "P"/);
});

test("globe land is built from complete country silhouettes instead of sampling cells", () => {
  assert.equal("cells" in geoData, false);
  assert.ok(geoData.countries.length >= 175);
  for (const country of geoData.countries) {
    assert.ok(country.name);
    assert.ok(country.polygons.length > 0, `${country.name} has no polygon`);
    for (const polygon of country.polygons) {
      assert.ok(polygon[0].length >= 8, `${country.name} has an invalid outer border`);
      assert.equal(polygon[0].length % 2, 0, `${country.name} has an invalid coordinate pair`);
    }
  }
});

test("Japan's geographic hit area does not overlap Russia at Japan's label center", () => {
  const toGeoJson = (country) => {
    const coordinates = country.polygons.map((polygon) => polygon.map((flatRing) => {
      const ring = [];
      for (let index = 0; index < flatRing.length; index += 2) {
        ring.push([flatRing[index], flatRing[index + 1]]);
      }
      return ring;
    }));
    return coordinates.length === 1
      ? { type: "Polygon", coordinates: coordinates[0] }
      : { type: "MultiPolygon", coordinates };
  };
  const japan = geoData.countries.find((country) => country.name === "Japan");
  const russia = geoData.countries.find((country) => country.name === "Russia");
  const japanLabel = labelData.countries.find((country) => country.name === "Japan");

  assert.ok(japan && russia && japanLabel);
  const japanCenter = [japanLabel.lng, japanLabel.lat];
  assert.equal(geoContains(toGeoJson(japan), japanCenter), true);
  assert.equal(geoContains(toGeoJson(russia), japanCenter), false);
});

test("regional view tabs cover the six continental regions without dropdown-only views", () => {
  for (const region of ["North America", "South America", "Europe", "Africa", "Asia", "Oceania"]) {
    assert.match(experienceSource, new RegExp(`label: "${region}"`));
  }
  assert.doesNotMatch(experienceSource, /id: "world"|Current focus/);
  assert.match(experienceSource, /aria-label="Region views"/);
  assert.match(experienceSource, /aria-pressed=\{regionViewId === view\.id\}/);
  assert.match(experienceSource, /const globeFocusDistance = viewTarget\?\.distance/);
  assert.match(experienceSource, /focusDistance=\{globeFocusDistance\}/);
});

test("phase 4 agent telemetry is visible from country energy through individual agents", () => {
  assert.match(experienceSource, /<CountrySurfaces liveAgentsByCountry=\{liveAgentsByCountry\}/);
  assert.match(experienceSource, /function CityProfileCard\(/);
  assert.match(experienceSource, /AGENT PULSE · NOW/);
  assert.match(experienceSource, /className="pulseLegend"/);
  assert.doesNotMatch(experienceSource, /className="energyLegend/);
  assert.match(experienceSource, /LIVE AGENTS · COUNTRY ENERGY/);
  assert.match(experienceSource, /className="energyMeter"/);
  assert.match(experienceSource, /densityBarWidth/);
  assert.match(experienceSource, /className="agentRoster"/);
  assert.match(experienceSource, /city\.hotTopics\.length/);
});

test("phase 5 renders dense Supabase agents in a capped street view", () => {
  assert.match(seedSource, /generate_series\(5, 100\)/);
  assert.match(seedSource, /0\.1\.0-dense-seed/);
  assert.match(experienceSource, /streetAgentCollection\(city\.agents\)/);
  assert.match(experienceSource, /atlas-street-agents/);
  assert.match(experienceSource, /atlas-agent-pulse/);
  assert.match(experienceSource, /atlas-agent-core/);
  assert.match(experienceSource, /atlas-agent-labels/);
  assert.match(experienceSource, /onAgentSelect\(selectedCity, agent\)/);
  assert.match(experienceSource, /Click for agent profile/);
  assert.match(globalStylesSource, /\.streetAgentLegend/);
  assert.match(globalStylesSource, /\.streetAgentHover/);
  assert.match(worldHookSource, /range\(from, from \+ pageSize - 1\)/);
  assert.match(experienceSource, /const STREET_MAP_INITIAL_ZOOM = 13\.6/);
  assert.match(experienceSource, /streetViewRequested && streetViewAvailable/);
  assert.match(experienceSource, /cityAreaTarget\?\.cityId === selectedCity\.id/);
  assert.match(experienceSource, /Show Street View/);
  assert.match(experienceSource, /Show Globe/);
  assert.doesNotMatch(experienceSource, /onStreetEnter/);
  assert.doesNotMatch(experienceSource, /function pixelCityCollection\(/);
  assert.doesNotMatch(experienceSource, /atlas-pixel-(?:parcels|buildings)/);
  assert.doesNotMatch(experienceSource, /fill-extrusion/);
  assert.match(experienceSource, /maxZoom: STREET_MAP_MAX_ZOOM/);
  assert.match(experienceSource, /city\?\.agents\.slice\(0, 12\)/);
  assert.doesNotMatch(experienceSource, /requestAnimationFrame\(animatePulse\)/);
  assert.match(experienceSource, /streetRendererActive/);
  assert.match(experienceSource, /showGlobeRenderer/);
  assert.match(experienceSource, /showStreetRenderer/);
  assert.match(experienceSource, /setStreetRendererActive\(false\)/);
  assert.match(experienceSource, /const RENDERER_RELEASE_DELAY_MS = 600/);
  assert.match(experienceSource, /class GlobeRendererBoundary/);
  assert.match(experienceSource, /probe\.getContext\("webgl2"/);
  assert.match(experienceSource, /rendererAvailability === "unavailable"/);
  assert.match(experienceSource, /function CanvasWorldFallback\(/);
  assert.match(experienceSource, /getContext\("2d"\)/);
  assert.match(experienceSource, /geoOrthographic\(\)/);
  assert.match(experienceSource, /2D MAP · COMPATIBILITY MODE/);
  assert.doesNotMatch(experienceSource, /3D renderer is temporarily unavailable|Retry globe/);
  assert.match(globalStylesSource, /\.canvasWorldFallback canvas/);
  assert.match(globalStylesSource, /\.streetMapLoading/);
  assert.match(globalStylesSource, /\.rendererHandoffStatus/);
  assert.match(experienceSource, /dpr=\{\[1, 1\.35\]\}/);
  assert.match(experienceSource, /antialias: false/);
  assert.doesNotMatch(experienceSource, /earthCanvasLayer streetMode/);
});

test("phase 6 begins from phase 5 geography with a live agent rendering foundation", () => {
  assert.match(readmeSource, /Phase 6 — Global Presence Rendering · In progress/);
  assert.match(phaseFiveSource, /does not claim complete worldwide agent or human location coverage/);
  assert.match(phaseSixSource, /live agent globe foundation delivered/);
  assert.match(phaseSixSource, /show participating humans and AI agents across the living world/);
  assert.match(phaseSixSource, /Location is user-approved and approximate by default/);
});

test("phase 6 renders country energy and crisp individual agents at city level", () => {
  assert.match(experienceSource, /function EnergyFlowMaterial\(/);
  assert.match(experienceSource, /atlasFlowTime/);
  assert.doesNotMatch(experienceSource, /function EnergyParticles\(/);
  assert.match(experienceSource, /function LiveAgentMarkers\(/);
  assert.doesNotMatch(experienceSource, /spreadDegrees|displayCoordinates/);
  assert.match(experienceSource, /entries\.map\(\(\{ agent \}\) => latLngToVector3\(agent\.lat, agent\.lng, AGENT_MARKER_RADIUS\)\)/);
  assert.match(experienceSource, /<sphereGeometry args=\{\[0\.001, 10, 10\]\}/);
  assert.match(experienceSource, /<sphereGeometry args=\{\[0\.0005, 8, 8\]\}/);
  assert.match(experienceSource, /<sphereGeometry args=\{\[0\.0032, 8, 8\]\}/);
  assert.match(experienceSource, /colorWrite=\{false\}/);
  assert.doesNotMatch(experienceSource, /haloMaterial|ref=\{halos\}/);
  assert.match(experienceSource, /function AdministrativeBoundaryContext\(/);
  assert.match(experienceSource, /const contextBoundaryPayload = districtBoundaryPayload\?\.available/);
  assert.match(experienceSource, /<AdministrativeBoundaryContext features=\{contextBoundaryFeatures\}/);
  assert.match(experienceSource, /fallbackContextBoundaryFeatures/);
  assert.match(experienceSource, /agent\.status !== "offline"/);
  assert.doesNotMatch(experienceSource, /featureLiveAgentCounts|energyLayers/);
  assert.match(experienceSource, /<LiveAgentMarkers entries=\{focusedLiveAgentEntries\}/);
  assert.match(experienceSource, /labelDetail === 2 && \(\s*<LiveAgentMarkers/);
  assert.match(experienceSource, /labelDetail === 2 && cityLabelBand >= 1 && displayPlaceLabels\.map/);
  assert.match(experienceSource, /globeAgentTooltip/);
  assert.doesNotMatch(experienceSource, /distanceFactor=\{3\.2\}/);
  assert.match(globalStylesSource, /\.globeAgentTooltip \{[\s\S]*?max-width: 172px/);
  assert.match(experienceSource, /onSelect\(entry\.city, entry\.agent\)/);
  assert.doesNotMatch(experienceSource, /fallbackBoundaryAgentCounts/);
  assert.match(experienceSource, /fallbackFocusedAgentEntries/);
  assert.match(experienceSource, /atlasPresenceToAgent/);
  assert.match(globalStylesSource, /\.globeAgentTooltip/);
  assert.match(phaseSixSource, /WebGL and 2D compatibility renderers/);
  assert.match(phaseSixSource, /reported approximate coordinates/);
});

test("zoom progress exposes only country and a deep city range", () => {
  assert.match(experienceSource, /function zoomProgressForDistance\(/);
  assert.match(experienceSource, /role="progressbar"/);
  for (const label of ["Country", "City"]) {
    assert.match(experienceSource, new RegExp(`label: "${label}"`));
  }
  assert.doesNotMatch(experienceSource, /label: "Town"|label: "Streets"/);
  assert.match(experienceSource, /<small>OPEN ZOOM<\/small>/);
  assert.match(experienceSource, /const GLOBE_MAX_DISTANCE = 11/);
  assert.match(experienceSource, /const COUNTRY_DETAIL_DISTANCE = 6\.15/);
  assert.match(experienceSource, /const CITY_MAX_DISTANCE = 3\.28/);
  assert.match(experienceSource, /const CITY_DEEP_ZOOM_DISTANCE = 3\.1085/);
  assert.match(experienceSource, /const DEEP_ZOOM_PROGRESS_PER_DOUBLING = 20/);
  assert.match(experienceSource, /const DEEP_ZOOM_PROGRESS_LIMIT = 220/);
  assert.match(experienceSource, /const CITY_SELECTION_DISTANCE = 3\.85/);
  assert.match(experienceSource, /minDistance=\{CITY_DEEP_ZOOM_DISTANCE\}/);
  assert.match(globalStylesSource, /\.zoomScaleTrack/);
  assert.match(globalStylesSource, /\.zoomScaleBreakpoint/);
  assert.match(globalStylesSource, /\.zoomViewToggle/);
  assert.doesNotMatch(globalStylesSource, /\.lodIndicator/);
  assert.match(experienceSource, /labelDetail === 2 && cityLabelBand >= 1 && displayPlaceLabels\.map/);
  assert.match(experienceSource, /useAtlasPlaces\(focusedIso3/);
  assert.doesNotMatch(experienceSource, /labelDetail === 2 && globalRegionLabels\.map/);
  assert.match(experienceSource, /if \(detail === 2\)/);
  assert.match(experienceSource, /const ZOOM_SPEED_MULTIPLIER = 1\.5/);
  assert.match(experienceSource, /const ZOOM_SCROLLS_PER_LEVEL = 16 \/ ZOOM_SPEED_MULTIPLIER/);
  assert.match(experienceSource, /const COUNTRY_ZOOM_SPEED = 0\.14 \* ZOOM_SPEED_MULTIPLIER/);
  assert.match(experienceSource, /const CITY_ZOOM_SPEED = 0\.075 \* ZOOM_SPEED_MULTIPLIER/);
  assert.match(experienceSource, /const CITY_PROGRESS = 45/);
  assert.match(experienceSource, /function dragSensitivityForProgress\(progress: number\)/);
  assert.match(experienceSource, /return THREE\.MathUtils\.lerp\(0\.72, 0\.12, cityProgress\)/);
  assert.match(experienceSource, /0\.12 \/ Math\.sqrt\(deepCityMagnificationForProgress\(progress\)\)/);
  assert.match(experienceSource, /dx \* 0\.0035 \* dragSensitivity/);
  assert.match(experienceSource, /deltaX \* 0\.22 \* dragSensitivity/);
  assert.match(experienceSource, /cityBandForProgress\(nextZoomProgress\)/);
  assert.match(experienceSource, /\(100 - CITY_PROGRESS\) \/ \(ZOOM_SCROLLS_PER_LEVEL \* 2\)/);
  assert.match(experienceSource, /CITY_PROGRESS \/ ZOOM_SCROLLS_PER_LEVEL/);
  assert.match(experienceSource, /camera=\{\{ position: \[0, 0\.1, GLOBE_MAX_DISTANCE\]/);
  assert.match(experienceSource, /near: 0\.001/);
  assert.match(experienceSource, /enableZoom\s+enableDamping/);
  assert.match(experienceSource, /zoomSpeed=\{sceneDetail >= 2 \? CITY_ZOOM_SPEED : COUNTRY_ZOOM_SPEED\}/);
  assert.doesNotMatch(experienceSource, /addEventListener\("wheel", onWheel, \{ passive: false, capture: true \}\)/);
  assert.doesNotMatch(experienceSource, /STREET_ENTRY_PROGRESS|TOWN_PROGRESS|streetProgressForMapZoom/);
  assert.match(experienceSource, /DEEP CITY · \$\{deepCityMagnification\.toFixed\(1\)\}×/);
  assert.match(experienceSource, /deepCityMagnificationForProgress\(view\.progress\)/);
  assert.match(experienceSource, /aria-valuenow=\{zoomTrackProgress\}/);
  assert.match(experienceSource, /onZoomChange\(100\)/);
  assert.match(experienceSource, /setZoomRate\(1 \/ 600\)/);
  assert.match(experienceSource, /setWheelZoomRate\(1 \/ 1800\)/);
  assert.match(experienceSource, /const completeDeepDetailCountries = new Set\(\["united states"\]\)/);
  assert.match(experienceSource, /hasCompleteDeepDetail\(selectedCityArea\.countryKey\)/);
});

test("city detail unifies municipal polygons, centered labels, hover, and selection", () => {
  assert.match(experienceSource, /function AdministrativeTerritories\(/);
  assert.match(experienceSource, /<AdministrativeTerritories/);
  assert.match(experienceSource, /useAtlasCityBoundaries\(/);
  assert.match(experienceSource, /useAtlasBoundaries\([\s\S]*?"ADM1"/);
  assert.match(experienceSource, /useAtlasBoundaries\([\s\S]*?"ADM2"/);
  assert.match(experienceSource, /useAtlasBoundaries\([\s\S]*?"LOCAL"/);
  assert.match(experienceSource, /cityBoundaryPayload\?\.available[\s\S]*?localBoundaryPayload\?\.available/);
  assert.match(experienceSource, /function AdministrativeBoundaryContext\(/);
  assert.match(experienceSource, /<AdministrativeBoundaryContext features=\{contextBoundaryFeatures\}/);
  assert.match(experienceSource, /const contextBoundaryPayload = districtBoundaryPayload\?\.available/);
  assert.doesNotMatch(experienceSource, /fallbackContextFeatures/);
  assert.match(experienceSource, /fallbackContextBoundaryFeatures/);
  assert.match(experienceSource, /municipalLayer \? 0\.98/);
  assert.match(experienceSource, /if \(progress < CITY_PROGRESS\) return 0/);
  assert.match(experienceSource, /if \(progress < 80\) return 1/);
  assert.match(experienceSource, /geoContains\(features\[index\]/);
  assert.match(experienceSource, /const index = findFeatureAtPoint\(event\.point, event\.eventObject\)/);
  assert.match(experienceSource, /const clickedCenter = vectorToGeoCenter\(event\.eventObject\.worldToLocal\(event\.point\.clone\(\)\)\)/);
  assert.match(experienceSource, /const selectedCenter = boundaryFeatureCenter\(features\[index\], clickedCenter\)/);
  assert.match(experienceSource, /feature\.properties\?\.atlasPlaceId === city\.id/);
  assert.match(experienceSource, /const CITY_LABEL_RADIUS = ADMIN_BASE_RADIUS \+ 0\.006/);
  assert.match(experienceSource, /position: latLngToVector3\(center\.lat, center\.lng, CITY_LABEL_RADIUS\)/);
  assert.match(experienceSource, /detailLevel >= 2 \? \(/);
  assert.match(experienceSource, /<meshBasicMaterial color="#07303a"/);
  assert.match(experienceSource, /color=\{boundaryHovered \? "#ffd36f" : undefined\}/);
  assert.match(experienceSource, /source: "surface" \| "label"/);
  assert.match(experienceSource, /const administrativeLabelHover = useRef/);
  assert.match(experienceSource, /administrativeLabelHover\.current = null;[\s\S]*?setAdministrativeHover\(null\);/);
  assert.match(experienceSource, /activeBoundaryIndexById\.get\(administrativeHover\.featureId\) \?\? null/);
  assert.match(experienceSource, /nextFeatureId === null \|\| nextFeatureId === labelHover\.featureId/);
  assert.doesNotMatch(experienceSource, /const currentLabelStillExists/);
  assert.match(experienceSource, /source: "surface"/);
  assert.match(experienceSource, /source: "label"/);
  assert.match(experienceSource, /onHoverChange=\{boundaryFeature \?/);
  assert.match(globalStylesSource, /\.mapLabel--interactive\.mapLabel--linked:hover/);
  assert.match(experienceSource, /onHoverChange\(null\)/);
  assert.doesNotMatch(experienceSource, /hoveredIndex \?\? findFeatureAtPoint/);
  assert.match(experienceSource, /focus\.current = targetOrientation/);
  assert.match(experienceSource, /center: boundaryFeatureCenter\(fallbackBoundaryFeatures\[index\]\)/);
  assert.match(experienceSource, /ADMIN_HOVER_RADIUS = 3\.078/);
  assert.match(experienceSource, /emissive="#ffd36f"/);
  assert.match(experienceSource, /function normalizeBoundaryOrientation\(/);
  assert.match(experienceSource, /geoArea\(feature\) <= Math\.PI \* 2/);
  assert.match(experienceSource, /activeBoundaryPayload\.features\.map\(normalizeBoundaryOrientation\)/);
  assert.match(experienceSource, /fallbackActiveBoundaryPayload\.features\.map\(normalizeBoundaryOrientation\)/);
  assert.doesNotMatch(experienceSource, /buildCityTerritoryGeometry|clipTerritoryPolygon|CityTerritories|fallbackCityTerritories/);
  assert.match(geographyRouteSource, /www\.geoboundaries\.org\/api\/current\/gbOpen/);
  assert.match(geographyRouteSource, /media\.githubusercontent\.com\/media\/wmgeolab\/geoBoundaries/);
  assert.match(geographyRouteSource, /GEOBOUNDARIES_REVISION/);
  assert.match(geographyRouteSource, /_simplified\.geojson/);
  assert.match(geographyRouteSource, /license: "CC BY 4\.0"/);
  assert.match(geographyRouteSource, /No open administrative boundary is published/);
  assert.match(geographyRouteSource, /const LOCAL_BOUNDARY_LEVELS = \["ADM3", "ADM2", "ADM1"\]/);
  assert.match(geographyRouteSource, /requestedLevel: level/);
  assert.match(geographyRouteSource, /\.map\(normalizeBoundaryOrientation\)/);
  assert.match(geographyHookSource, /atlas-geography\/places/);
  assert.match(geographyHookSource, /\/api\/atlas\/v1\/geography/);
  assert.match(geographyHookSource, /\/api\/atlas\/v1\/city-boundaries/);
  assert.match(cityBoundaryRouteSource, /U\.S\. Census Bureau TIGERweb/);
  assert.match(cityBoundaryRouteSource, /Consolidated Cities/);
  assert.match(cityBoundaryRouteSource, /Incorporated Places/);
  assert.match(cityBoundaryRouteSource, /Census Designated Places/);
  assert.match(cityBoundaryRouteSource, /const TIGERWEB_LAYERS = \[3, 4, 5\]/);
  assert.match(cityBoundaryRouteSource, /seenPlaceIds/);
  assert.doesNotMatch(geographyHookSource, /USA-local-areas/);
  assert.match(cityBoundaryRouteSource, /esriGeometryMultipoint/);
  assert.match(cityBoundaryRouteSource, /function planarRingCentroid/);
  assert.match(cityBoundaryRouteSource, /atlasPlaceId: place\.id/);
  assert.match(experienceSource, /labelDetail === 1 && layer === "Attention"/);
  assert.match(experienceSource, /hitBoundary\(point\.x, point\.y\)/);
  assert.doesNotMatch(experienceSource, /function CityLight\(/);
  assert.match(experienceSource, /onCityAreaSelect\(\{/);
  assert.match(experienceSource, /\{profileKind\} PROFILE · \{selection\.countryName\.toUpperCase\(\)\}/);
  assert.match(experienceSource, /function boundaryKindLabel\(/);
  assert.match(experienceSource, /GLOBAL BORDERS/);
  assert.match(experienceSource, /mapLabel--interactive/);
  assert.match(experienceSource, /function declutterGeographicLabels\(/);
  assert.match(experienceSource, /minimumSeparation: 5\.5/);
  assert.match(experienceSource, /minimumSeparation: 2\.25/);
  assert.doesNotMatch(experienceSource, /kind="town"/);
  assert.match(globalStylesSource, /\.mapLabel--country \{[\s\S]*?color: #d9b76b;[\s\S]*?font-size: 6px;/);
  assert.match(globalStylesSource, /\.mapLabel--city \{[\s\S]*?color: #7fdde7;[\s\S]*?font-size: 3\.25px;/);
  assert.doesNotMatch(globalStylesSource, /\.mapLabel--town/);
  assert.doesNotMatch(globalStylesSource, /\.mapLabel--city::before/);
});

test("Agent Pulse charts seven days of distinct live-agent history", () => {
  assert.match(experienceSource, /7D LIVE AGENTS/);
  assert.match(experienceSource, /past seven days/);
  assert.match(experienceSource, /pulseBars\.map\(\(day\)/);
  assert.match(worldHookSource, /atlas_live_agent_history/);
  assert.match(worldHookSource, /p_days: 7/);
  assert.match(liveHistoryMigrationSource, /generate_series/);
  assert.match(liveHistoryMigrationSource, /count\(distinct events\.agent_id\)/);
  assert.match(liveHistoryMigrationSource, /events\.status <> 'offline'/);
  assert.match(seedSource, /generate_series\(0, 6\)/);
  assert.match(seedSource, /Daily privacy-safe live-agent heartbeat/);
});

test("side cards collapse into independent square icon controls", () => {
  assert.match(experienceSource, /const \[pulseCollapsed, setPulseCollapsed\] = useState\(false\)/);
  assert.match(experienceSource, /const \[networkCollapsed, setNetworkCollapsed\] = useState\(false\)/);
  assert.match(experienceSource, /aria-label="Collapse Agent Pulse"/);
  assert.match(experienceSource, /aria-label="Expand Agent Pulse"/);
  assert.match(experienceSource, /aria-label="Collapse Live Agent Network"/);
  assert.match(experienceSource, /aria-label="Expand Live Agent Network"/);
  assert.match(experienceSource, /sideCardToggle--pulse/);
  assert.match(experienceSource, /sideCardToggle--network/);
});

test("Command-K search indexes countries and focuses geographic results", () => {
  assert.match(experienceSource, /atlasLabelData\.countries/);
  assert.match(experienceSource, /kind: "country"/);
  assert.match(experienceSource, /focusCountry\(result\.country\)/);
  assert.match(experienceSource, /focusCity\(result\.city\)/);
  assert.match(experienceSource, /setRegionViewRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(experienceSource, /event\.key === "Enter"/);
  assert.match(experienceSource, /chooseResult\(result\)/);
  assert.match(experienceSource, /Countries, cities, people, AI or topics/);
});

test("country background energy uses six live-agent levels with one top tier above one million", () => {
  for (const range of ["0–100", "101–1K", "1K–10K", "10K–100K", "100K–1M", ">1M"]) {
    assert.match(experienceSource, new RegExp(`label: "${range}"`));
  }
  assert.doesNotMatch(experienceSource, /label: "0"|1M–10M|10M–100M/);
  assert.match(experienceSource, /max: Number\.POSITIVE_INFINITY/);
  assert.match(experienceSource, /agent\.status !== "offline"/);
  assert.match(experienceSource, /mesh\.material\.color\.copy\(densityColor\)/);
  assert.match(experienceSource, /Area color = agents live now/);
});

test("country selection recenters the globe and opens an aggregated country profile", () => {
  assert.match(experienceSource, /geoCentroid\(country\)/);
  assert.match(experienceSource, /findCountryAtPoint\(event\.point, event\.eventObject\)/);
  assert.match(experienceSource, /hitSurface\.worldToLocal\(worldPoint\.clone\(\)\)/);
  assert.match(experienceSource, /const countryIndex = hoveredCountry\.current \?\? findCountryAtPoint/);
  assert.match(experienceSource, /geoContains\(countryHitAreas\[countryIndex\]/);
  assert.doesNotMatch(experienceSource, /geometry=\{country\.hitGeometry\}/);
  assert.match(experienceSource, /onCountrySelect=\{focusCountry\}/);
  assert.match(experienceSource, /selectedCountryKey=\{focusedCountryKey\}/);
  assert.match(experienceSource, /COUNTRY PROFILE · LIVE NETWORK/);
  assert.match(experienceSource, /className="citySignal countrySignal glassPanel"/);
  assert.match(experienceSource, /Awaiting Atlas signals/);
});
