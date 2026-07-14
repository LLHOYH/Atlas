import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("regional view tabs cover the six continental regions without dropdown-only views", () => {
  for (const region of ["North America", "South America", "Europe", "Africa", "Asia", "Oceania"]) {
    assert.match(experienceSource, new RegExp(`label: "${region}"`));
  }
  assert.doesNotMatch(experienceSource, /id: "world"|Current focus/);
  assert.match(experienceSource, /aria-label="Region views"/);
  assert.match(experienceSource, /aria-pressed=\{regionViewId === view\.id\}/);
  assert.match(experienceSource, /focusDistance=\{viewTarget\?\.distance \?\? null\}/);
});
