import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { geoBounds, geoContains } from "d3-geo";
import { feature, mesh } from "topojson-client";

const require = createRequire(import.meta.url);
const topology = require("world-atlas/countries-110m.json");
const collection = feature(topology, topology.objects.countries);
const candidates = collection.features.map((country) => ({
  country,
  bounds: geoBounds(country),
  name: country.properties?.name ?? String(country.id ?? "land"),
}));

const cells = [];
for (let lat = -82.5; lat <= 82.5; lat += 5) {
  for (let lng = -177.5; lng < 180; lng += 5) {
    const match = candidates.find(({ country, bounds }) => {
      const [[minLng, minLat], [maxLng, maxLat]] = bounds;
      if (lat < minLat || lat > maxLat) return false;
      const insideLongitude = minLng <= maxLng
        ? lng >= minLng && lng <= maxLng
        : lng >= minLng || lng <= maxLng;
      return insideLongitude && geoContains(country, [lng, lat]);
    });
    if (match) cells.push({ lat, lng, name: match.name });
  }
}

const borderPositions = [];
const borderMesh = mesh(topology, topology.objects.countries);
for (const line of borderMesh.coordinates) {
  for (let index = 1; index < line.length; index += 1) {
    const previous = line[index - 1];
    const current = line[index];
    if (Math.abs(previous[0] - current[0]) > 180) continue;
    borderPositions.push(
      Number(previous[1].toFixed(4)),
      Number(previous[0].toFixed(4)),
      Number(current[1].toFixed(4)),
      Number(current[0].toFixed(4)),
    );
  }
}

const output = new URL("../app/atlas-geo-data.json", import.meta.url);
await writeFile(output, `${JSON.stringify({ cells, borderPositions })}\n`, "utf8");
console.log(`Generated ${cells.length} land cells and ${borderPositions.length / 4} border segments.`);
