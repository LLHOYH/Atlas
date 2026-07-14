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
const labelGeneratorSource = await readFile(
  new URL("../scripts/generate-atlas-labels.mjs", import.meta.url),
  "utf8",
);

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
  assert.match(experienceSource, /focusDistance=\{viewTarget\?\.distance \?\? countryTarget\?\.distance \?\? null\}/);
});

test("phase 4 agent telemetry is visible from country energy through individual agents", () => {
  assert.match(experienceSource, /<CountrySurfaces liveAgentsByCountry=\{liveAgentsByCountry\}/);
  assert.match(experienceSource, /function AgentLight\(/);
  assert.match(experienceSource, /AGENT PULSE · NOW/);
  assert.match(experienceSource, /className="pulseLegend"/);
  assert.doesNotMatch(experienceSource, /className="energyLegend/);
  assert.match(experienceSource, /LIVE AGENTS PER COUNTRY/);
  assert.match(experienceSource, /className="energyMeter"/);
  assert.match(experienceSource, /selectedDensityBarWidth/);
  assert.match(experienceSource, /className="agentRoster"/);
  assert.match(experienceSource, /selectedCity\.hotTopics/);
});

test("country background energy uses six live-agent levels with one top tier above one million", () => {
  for (const range of ["0–100", "101–1K", "1K–10K", "10K–100K", "100K–1M", ">1M"]) {
    assert.match(experienceSource, new RegExp(`label: "${range}"`));
  }
  assert.doesNotMatch(experienceSource, /label: "0"|1M–10M|10M–100M/);
  assert.match(experienceSource, /max: Number\.POSITIVE_INFINITY/);
  assert.match(experienceSource, /agent\.status !== "offline"/);
  assert.match(experienceSource, /mesh\.material\.color\.copy\(densityColor\)/);
  assert.match(experienceSource, /Energy level = agents live now/);
});

test("country selection recenters the globe and opens an aggregated country profile", () => {
  assert.match(experienceSource, /geoCentroid\(country\)/);
  assert.match(experienceSource, /findCountryAtPoint\(event\.point, event\.eventObject\)/);
  assert.match(experienceSource, /hitSurface\.worldToLocal\(worldPoint\.clone\(\)\)/);
  assert.match(experienceSource, /const countryIndex = hoveredCountry\.current \?\? findCountryAtPoint/);
  assert.match(experienceSource, /geoContains\(countryHitAreas\[countryIndex\]/);
  assert.doesNotMatch(experienceSource, /geometry=\{country\.hitGeometry\}/);
  assert.match(experienceSource, /onCountrySelect=\{focusCountry\}/);
  assert.match(experienceSource, /selectedCountryKey=\{countryTarget\?\.key \?\? null\}/);
  assert.match(experienceSource, /COUNTRY PROFILE · LIVE NETWORK/);
  assert.match(experienceSource, /className="citySignal countrySignal glassPanel"/);
  assert.match(experienceSource, /Awaiting Atlas signals/);
});
